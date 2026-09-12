import { randomUUID } from 'node:crypto';
import type { CorpusSource } from '@/adapter/corpusSource';
import { serveToolCall } from '@/mcp/serve';
import { MCP_TOOLS } from '@/mcp/tools';
import { admitCall, admitCapability } from '@/domain/terminalPlane';
import { capabilityById } from '@/domain/capabilityRegistry';
import { operatingSnapshot } from '@/runtime/policy';
import { canonicalJson } from '@/fixtures/digest';
import type { AuthenticatedTerminal } from './auth';
import { assertAuthenticated } from './auth';
import { recordTerminalRead } from './readLedger';
import { commitment, id, limits, MINING_CAPABILITY, miningRequest, refuse, reviewRequest, terminalCommand, TERMINAL_PROTOCOL, type MiningRequest } from './contracts';
import type { TerminalDatabase, TerminalSql } from './database';
import { pinRelease, recheckPermission, recheckSnapshotSources, snapshotDigest, validateMiningResult, type MiningExecutor, type MiningSnapshot, type MiningWork } from './mining';

interface Job {
  job_id: string; owner_id: string; corpus_id: string; release_id: string; purpose: string;
  state: 'PROPOSED' | 'DENIED' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  request: MiningRequest; request_digest: string; snapshot: MiningSnapshot; snapshot_digest: string;
  method_digest: string; action_digest: string; created_at: string | Date;
  authorization_id: string | null; claim_token: string | null; attempts: number; failure_code: string | null;
  corrects_job_id: string | null;
}
const lock = (sql: TerminalSql) => sql.query('SELECT singleton FROM payload_terminal_control WHERE singleton=true FOR UPDATE');
const rowTime = (value: string | Date) => new Date(value).toISOString();
type JobSummary = Omit<Job, 'snapshot' | 'authorization_id' | 'claim_token'> & { snapshot: Pick<MiningSnapshot, 'fixture_only'> };
const summary = (job: JobSummary) => ({
  jobId: job.job_id, ownerId: job.owner_id, corpusId: job.corpus_id, releaseId: job.release_id,
  state: job.state, request: job.request, requestDigest: job.request_digest, actionDigest: job.action_digest,
  snapshotDigest: job.snapshot_digest, methodDigest: job.method_digest, createdAt: rowTime(job.created_at),
  attempts: job.attempts, failureCode: job.failure_code, correctsJobId: job.corrects_job_id,
  fixture_only: job.snapshot.fixture_only,
});

/** One application service for every terminal. PostgreSQL owns history, identity, review and leases.
 * The worker only computes a fixed pure method; it cannot perform acquisition, delivery or admission. */
export class TerminalService {
  constructor(private readonly db: TerminalDatabase, private readonly source: CorpusSource,
    private readonly methodDigest: () => string, private readonly executor: MiningExecutor) {}

  private async principal(sql: TerminalSql, who: AuthenticatedTerminal) {
    assertAuthenticated(who);
    await sql.query('INSERT INTO principal(principal_id,kind,display_name,registered_at) VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT(principal_id) DO NOTHING', [who.principalId, who.kind, who.displayName]);
    const { rows } = await sql.query<{ kind: string }>('SELECT kind FROM principal WHERE principal_id=$1', [who.principalId]);
    if (rows[0]?.kind !== who.kind) refuse('PRINCIPAL_REGISTRATION_CONFLICT');
  }
  private async visibleJob(sql: TerminalSql, who: AuthenticatedTerminal, jobId: string): Promise<Job> {
    assertAuthenticated(who); id.parse(jobId);
    const { rows } = await sql.query<Job>('SELECT * FROM payload_terminal_job WHERE job_id=$1 AND corpus_id=ANY($2::text[]) AND (owner_id=$3 OR $4::boolean)', [jobId, [...who.corpusScope], who.principalId, who.canReview]);
    if (!rows[0] || rows[0].purpose !== who.purpose) refuse('RESOURCE_NOT_AVAILABLE', 404);
    const job = rows[0];
    if (commitment(job.request) !== job.request_digest || snapshotDigest(job.snapshot) !== job.snapshot_digest
      || commitment({ request: job.request, snapshotDigest: job.snapshot_digest }) !== job.action_digest) refuse('JOB_BINDING_INVALID');
    return job;
  }
  async command(who: AuthenticatedTerminal, input: unknown): Promise<unknown> {
    assertAuthenticated(who);
    const parsed = terminalCommand.parse(input);
    switch (parsed.command) {
      case 'discover': return { protocol: TERMINAL_PROTOCOL, identity: { principalId: who.principalId, terminalId: who.terminalId, purpose: who.purpose, corpusScope: who.corpusScope, canReview: who.canReview },
        reads: MCP_TOOLS.filter(t => admitCall(who.session, t.name, new Date().toISOString()).admitted).map(t => t.name), mining: who.terminalClass === 'FIRM_INTERNAL' && who.purpose === 'internal_research'
          ? { capability: MINING_CAPABILITY, methodDigest: this.methodDigest(), limits, reviewRequired: true, output: 'NOT_VALIDATED', sideEffects: ['retain exact request', 'retain computed candidate and receipt'] } : null,
        operating: who.terminalClass === 'FIRM_INTERNAL' ? operatingSnapshot() : undefined };
      case 'read': {
        const served = await serveToolCall(who.session, parsed.tool, parsed.args, new Date().toISOString());
        const recording = await recordTerminalRead(this.db, who, served);
        // Unknown tools may refuse without a registered READ event. Actual reads
        // never release a payload when their durable audit write fails.
        if (recording.status !== 'RECORDED' && !(recording.code === 'READ_RECEIPT_UNSUPPORTED' && !served.admission.admitted)) refuse('READ_RECEIPT_UNAVAILABLE', 503);
        return { ...served, recording };
      }
      case 'pin': {
        const snapshot = await pinRelease(this.source, who, parsed.releaseId);
        return { protocol: TERMINAL_PROTOCOL, snapshotDigest: snapshotDigest(snapshot), snapshot };
      }
      case 'submit': return this.submit(who, parsed.request);
      case 'review': return this.review(who, parsed.review);
      case 'job': return this.getJob(who, parsed.jobId);
      case 'result': return this.result(who, parsed.jobId);
      case 'jobs': return this.db.transaction(async sql => {
        // Listing jobs must not hydrate up to 51 retained, one-megabyte input snapshots.
        const { rows } = await sql.query<JobSummary>(`SELECT job_id,owner_id,corpus_id,release_id,purpose,state,request,request_digest,snapshot_digest,
          method_digest,action_digest,created_at,attempts,failure_code,corrects_job_id,jsonb_build_object('fixture_only',snapshot->'fixture_only') AS snapshot
          FROM payload_terminal_job WHERE corpus_id=ANY($1::text[]) AND (owner_id=$2 OR $3::boolean) AND purpose=$4 AND ($5::text IS NULL OR job_id>$5) ORDER BY job_id LIMIT $6`,
          [[...who.corpusScope], who.principalId, who.canReview, who.purpose, parsed.after ?? null, parsed.limit + 1]);
        return { jobs: rows.slice(0, parsed.limit).map(summary), nextCursor: rows.length > parsed.limit ? rows[parsed.limit - 1].job_id : null };
      });
    }
  }
  async submit(who: AuthenticatedTerminal, input: unknown) {
    assertAuthenticated(who);
    const request = miningRequest.parse(input), requestDigest = commitment(request);
    // An exact retry reads retained bytes before asking a source which may since have changed.
    const prior = await this.db.transaction(async sql => (await sql.query<{ job_id: string; request_digest: string }>('SELECT job_id,request_digest FROM payload_terminal_job WHERE owner_id=$1 AND idempotency_key=$2', [who.principalId, request.idempotencyKey])).rows[0]);
    if (prior) { if (prior.request_digest !== requestDigest) refuse('IDEMPOTENCY_CONFLICT'); return this.getJob(who, prior.job_id); }
    if (request.methodDigest !== this.methodDigest()) refuse('MINING_METHOD_CHANGED');
    const snapshot = await pinRelease(this.source, who, request.releaseId), retainedDigest = snapshotDigest(snapshot);
    if (admitCapability(who.session, capabilityById(MINING_CAPABILITY), new Date().toISOString(), snapshot.corpusId).outcome !== 'PROPOSAL_REQUIRED') refuse('MINING_CAPABILITY_REFUSED', 403);
    if (retainedDigest !== request.snapshotDigest) refuse('SNAPSHOT_CHANGED');
    if (snapshot.records.length > request.budget.maxRows || Buffer.byteLength(JSON.stringify({ snapshot, request, jobId: 'x'.repeat(64), computedAt: new Date().toISOString() })) > request.budget.maxInputBytes) refuse('MINING_INPUT_LIMIT');
    const action = { request, snapshotDigest: retainedDigest }, actionDigest = commitment(action);
    const jobId = await this.db.transaction(async sql => {
      await lock(sql); await this.principal(sql, who);
      const raced = (await sql.query<Job>('SELECT * FROM payload_terminal_job WHERE owner_id=$1 AND idempotency_key=$2', [who.principalId, request.idempotencyKey])).rows[0];
      if (raced) { if (raced.request_digest !== requestDigest) refuse('IDEMPOTENCY_CONFLICT'); return raced.job_id; }
      if ((await sql.query('SELECT job_id FROM payload_terminal_job WHERE state IN (\'PROPOSED\',\'QUEUED\',\'RUNNING\') LIMIT $1', [limits.backlog])).rows.length >= limits.backlog) refuse('MINING_BACKLOG_FULL', 429);
      let corrected: Job | undefined;
      if (request.correction) {
        corrected = await this.visibleJob(sql, who, request.correction.jobId);
        if (corrected.owner_id !== who.principalId || corrected.corpus_id !== snapshot.corpusId || corrected.state !== 'SUCCEEDED'
          || corrected.snapshot_digest === retainedDigest || Date.parse(snapshot.knownAt) <= Date.parse(corrected.snapshot.knownAt)) refuse('CORRECTION_BINDING_INVALID');
      }
      const job = `JOB-${randomUUID()}`;
      await sql.query(`INSERT INTO operation_proposal(proposal_id,operation_kind,counterparty,authored_by_kind,authored_by,proposed_at,declared_side_effects,data,corrects_operation_id,correction_reason)
        VALUES($1,$2,$3,$4,$3,clock_timestamp(),$5::jsonb,$6::jsonb,$7,$8)`,
        [job, MINING_CAPABILITY, who.principalId, who.kind, JSON.stringify(['retain computed candidate; no source writes or delivery']), JSON.stringify(request), corrected ? `OP-${corrected.job_id}` : null, request.correction?.reason ?? null]);
      await sql.query(`INSERT INTO decision_packet(packet_id,proposal_id,action_kind,action,action_digest,doing_nothing,against,prepared_by_kind,prepared_by,prepared_at)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,clock_timestamp())`,
        [`PACKET-${job}`, job, MINING_CAPABILITY, canonicalJson(action), actionDigest, 'No candidate is computed or retained.', 'Concentration counts registered sources, not independent sources; output is NOT_VALIDATED. Review exact snapshot, method and budget.', who.kind, who.principalId]);
      await sql.query(`INSERT INTO payload_terminal_job(job_id,owner_id,corpus_id,release_id,purpose,idempotency_key,request_digest,snapshot_digest,method_digest,state,request,snapshot,action_digest,corrects_job_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PROPOSED',$10::jsonb,$11::jsonb,$12,$13)`,
        [job, who.principalId, snapshot.corpusId, request.releaseId, who.purpose, request.idempotencyKey, requestDigest, retainedDigest, request.methodDigest, JSON.stringify(request), JSON.stringify(snapshot), actionDigest, request.correction?.jobId ?? null]);
      return job;
    });
    return this.getJob(who, jobId);
  }
  async review(who: AuthenticatedTerminal, input: unknown) {
    assertAuthenticated(who);
    if (!who.canReview || who.kind === 'AGENT') refuse('REVIEW_AUTHORITY_REQUIRED', 403);
    const review = reviewRequest.parse(input);
    const retained = await this.db.transaction(sql => this.visibleJob(sql, who, review.jobId));
    if (review.response === 'APPROVE') await recheckPermission(this.source, who, retained.snapshot);
    await this.db.transaction(async sql => {
      await lock(sql); await this.principal(sql, who);
      const job = await this.visibleJob(sql, who, review.jobId);
      if (job.state !== 'PROPOSED') refuse('PROPOSAL_ALREADY_REVIEWED');
      if (review.actionDigest !== job.action_digest || (review.response === 'APPROVE' && job.method_digest !== this.methodDigest())) refuse('REVIEW_DIGEST_MISMATCH');
      await sql.query(`INSERT INTO proposal_review(review_id,proposal_id,reviewed_action_digest,response,reviewer_kind,reviewer,reasoning,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`,
        [`REVIEW-${job.job_id}`, job.job_id, review.actionDigest, review.response, who.kind, who.principalId, review.reason]);
      if (review.response === 'DENY') { await sql.query("UPDATE payload_terminal_job SET state='DENIED' WHERE job_id=$1", [job.job_id]); return; }
      const authorization = `AUTH-${job.job_id}`;
      await sql.query(`INSERT INTO execution_authorization(authorization_id,proposal_id,envelope_class,granted_by_kind,granted_by,corpus_release_id,state_revision,policy_version,granted_at,expires_at,action_digest,review_response)
        VALUES($1,$2,'NARROW_ACTION',$3,$4,$5,1,'payload.terminal.v1',clock_timestamp(),LEAST(clock_timestamp()+interval '1 hour',$7::timestamptz),$6,'APPROVE')`,
        [authorization, job.job_id, who.kind, who.principalId, job.release_id, job.action_digest, who.expiresAt]);
      await sql.query('INSERT INTO execution_operation(operation_id,authorization_id,idempotency_key,opened_at) VALUES($1,$2,$3,clock_timestamp())', [`OP-${job.job_id}`, authorization, job.job_id]);
      await sql.query("UPDATE payload_terminal_job SET state='QUEUED',authorization_id=$2 WHERE job_id=$1", [job.job_id, authorization]);
    });
    return this.getJob(who, review.jobId);
  }
  async getJob(who: AuthenticatedTerminal, jobId: string) {
    return this.db.transaction(async sql => {
      const job = await this.visibleJob(sql, who, jobId);
      const corrections = await sql.query<{ job_id: string; state: string }>('SELECT job_id,state FROM payload_terminal_job WHERE corrects_job_id=$1 AND owner_id=$2 ORDER BY created_at,job_id LIMIT 100', [job.job_id, job.owner_id]);
      return { ...summary(job), corrections: corrections.rows.map(r => ({ jobId: r.job_id, state: r.state })) };
    });
  }
  async result(who: AuthenticatedTerminal, jobId: string) {
    const retained = await this.db.transaction(sql => this.visibleJob(sql, who, jobId));
    await recheckPermission(this.source, who, retained.snapshot);
    return this.db.transaction(async sql => {
      const job = await this.visibleJob(sql, who, jobId);
      if (job.state !== 'SUCCEEDED') refuse('RESULT_NOT_AVAILABLE');
      const row = (await sql.query<{ result: unknown; result_digest: string }>('SELECT result,result_digest FROM payload_terminal_result WHERE job_id=$1', [jobId])).rows[0];
      if (!row || commitment(row.result) !== row.result_digest) refuse('RESULT_INTEGRITY_FAILURE');
      await this.principal(sql, who);
      const receipt = { protocol: TERMINAL_PROTOCOL, jobId, resultDigest: row.result_digest, snapshotDigest: job.snapshot_digest, actionDigest: job.action_digest,
        principalId: who.principalId, terminalId: who.terminalId, retrievedAt: new Date().toISOString(), permittedUse: who.purpose, fixture_only: job.snapshot.fixture_only };
      await sql.query('INSERT INTO payload_terminal_receipt(job_id,terminal_id,principal_id,receipt_digest,receipt) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(job_id,terminal_id) DO NOTHING', [jobId, who.terminalId, who.principalId, commitment(receipt), JSON.stringify(receipt)]);
      const saved = (await sql.query<{ receipt: unknown; receipt_digest: string }>('SELECT receipt,receipt_digest FROM payload_terminal_receipt WHERE job_id=$1 AND terminal_id=$2 AND principal_id=$3', [jobId, who.terminalId, who.principalId])).rows[0];
      if (!saved || commitment(saved.receipt) !== saved.receipt_digest) refuse('RECEIPT_INTEGRITY_FAILURE');
      return { result: row.result, resultDigest: row.result_digest, receipt: saved.receipt, receiptDigest: saved.receipt_digest };
    });
  }

  /** Called only by the backend worker loop, never by a terminal command. */
  async runNext(): Promise<boolean> {
    const claim = await this.db.transaction(async sql => {
      await lock(sql);
      // This retry policy applies ONLY to pure computation + a single atomic SQL result commit.
      // No object-store write, money movement or external side effect may use it.
      const expired = await sql.query<Job>("SELECT * FROM payload_terminal_job WHERE state='RUNNING' AND lease_until<=clock_timestamp() LIMIT 100");
      for (const job of expired.rows) {
        await sql.query(`INSERT INTO attempt_reconciliation(reconciliation_id,attempt_id,reconciled_at,found,basis) VALUES($1,$2,clock_timestamp(),'DID_NOT_HAPPEN',$3)`,
          [`RECON-${job.job_id}-${job.attempts}`, `TRY-${job.job_id}-${job.attempts}`, 'Expired pure-computation lease: no atomic result commit exists; stale claim is fenced. No external side effects are supported.']);
        await sql.query("UPDATE payload_terminal_job SET state=$2,claim_token=NULL,lease_until=NULL,failure_code=$3 WHERE job_id=$1", [job.job_id, job.attempts >= limits.attempts ? 'FAILED' : 'QUEUED', job.attempts >= limits.attempts ? 'ATTEMPTS_EXHAUSTED' : null]);
      }
      const cap = operatingSnapshot().limits?.productionWorkers;
      if (!cap) refuse('EXECUTION_POLICY_INVALID', 503);
      if ((await sql.query("SELECT job_id FROM payload_terminal_job WHERE state='RUNNING' LIMIT $1", [cap])).rows.length >= cap) return undefined;
      const job = (await sql.query<Job>("SELECT * FROM payload_terminal_job WHERE state='QUEUED' ORDER BY created_at,job_id LIMIT 1 FOR UPDATE")).rows[0];
      if (!job) return undefined;
      const authority = (await sql.query<{ granted_at: string; expires_at: string; action_digest: string }>(`SELECT granted_at,expires_at,action_digest FROM execution_authorization a WHERE authorization_id=$1 AND expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM authorization_revocation r WHERE r.authorization_id=a.authorization_id AND r.revoked_at<=clock_timestamp())`, [job.authorization_id])).rows[0];
      if (!authority || authority.action_digest !== job.action_digest || job.method_digest !== this.methodDigest()) {
        await sql.query("UPDATE payload_terminal_job SET state='FAILED',failure_code='AUTHORITY_OR_METHOD_UNAVAILABLE' WHERE job_id=$1", [job.job_id]); return undefined;
      }
      const token = randomUUID();
      const updated = (await sql.query<Job>("UPDATE payload_terminal_job SET state='RUNNING',claim_token=$2,lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1 WHERE job_id=$1 RETURNING *", [job.job_id, token])).rows[0];
      await sql.query(`INSERT INTO execution_attempt(attempt_id,operation_id,authorization_id,authorization_state_revision,authorization_granted_at,authorization_expires_at,ran_at_state_revision,attempted_at,outcome)
        VALUES($1,$2,$3,1,$4,$5,1,clock_timestamp(),'OUTCOME_UNKNOWN')`, [`TRY-${job.job_id}-${updated.attempts}`, `OP-${job.job_id}`, job.authorization_id, authority.granted_at, authority.expires_at]);
      return updated;
    });
    if (!claim) return false;
    const work: MiningWork = { jobId: claim.job_id, request: claim.request, snapshot: claim.snapshot, computedAt: new Date().toISOString() };
    try {
      if (commitment(claim.request) !== claim.request_digest || snapshotDigest(claim.snapshot) !== claim.snapshot_digest) refuse('JOB_BINDING_INVALID');
      await recheckSnapshotSources(this.source, claim.snapshot);
      const run = await this.executor(work);
      validateMiningResult(work, run);
      if (run.status !== 'SUCCEEDED') refuse(run.failureIdentity ?? 'MINING_FAILED');
      const result = { protocol: TERMINAL_PROTOCOL, jobId: claim.job_id, releaseId: claim.release_id, snapshotDigest: claim.snapshot_digest, methodDigest: claim.method_digest,
        fixture_only: claim.snapshot.fixture_only, validation: 'NOT_VALIDATED', run,
        selection: claim.snapshot.selection, coverage: claim.snapshot.coverage,
        limitation: 'Only standing records permitted for internal research and derivation were analyzed. Registered sources are not necessarily independent. This is not a complete-release finding, admission or customer delivery.',
        citations: claim.snapshot.records.map(record => ({ recordId: record.recordId, knownAt: record.knownAt, sourceId: record.provenance.sourceId, recordDigest: commitment(record) })) };
      if (Buffer.byteLength(JSON.stringify(result)) > claim.request.budget.maxOutputBytes) refuse('MINING_OUTPUT_LIMIT');
      await recheckSnapshotSources(this.source, claim.snapshot);
      await this.db.transaction(async sql => {
        await lock(sql);
        const current = (await sql.query<Job>("SELECT * FROM payload_terminal_job WHERE job_id=$1 AND state='RUNNING' AND claim_token=$2 AND lease_until>clock_timestamp() FOR UPDATE", [claim.job_id, claim.claim_token])).rows[0];
        if (!current) refuse('MINING_CLAIM_LOST');
        const authorized = await sql.query(`SELECT authorization_id FROM execution_authorization a WHERE authorization_id=$1 AND expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM authorization_revocation r WHERE r.authorization_id=a.authorization_id AND r.revoked_at<=clock_timestamp())`, [claim.authorization_id]);
        if (!authorized.rows.length) refuse('AUTHORITY_UNAVAILABLE');
        const receipt = commitment(result);
        await sql.query('INSERT INTO payload_terminal_result(job_id,result_digest,result) VALUES($1,$2,$3::jsonb)', [claim.job_id, receipt, JSON.stringify(result)]);
        await sql.query(`INSERT INTO attempt_reconciliation(reconciliation_id,attempt_id,reconciled_at,found,basis) VALUES($1,$2,clock_timestamp(),'DID_HAPPEN',$3)`, [`RECON-${claim.job_id}-${claim.attempts}`, `TRY-${claim.job_id}-${claim.attempts}`, `Atomic result committed: ${receipt}`]);
        await sql.query("UPDATE payload_terminal_job SET state='SUCCEEDED',claim_token=NULL,lease_until=NULL WHERE job_id=$1", [claim.job_id]);
      });
    } catch {
      await this.db.transaction(async sql => {
        await lock(sql);
        const current = (await sql.query("SELECT job_id FROM payload_terminal_job WHERE job_id=$1 AND state='RUNNING' AND claim_token=$2", [claim.job_id, claim.claim_token])).rows[0];
        if (!current) return;
        await sql.query(`INSERT INTO attempt_reconciliation(reconciliation_id,attempt_id,reconciled_at,found,basis) VALUES($1,$2,clock_timestamp(),'DID_NOT_HAPPEN','Worker refused or failed before atomic result commit; no external side effects')`, [`RECON-${claim.job_id}-${claim.attempts}`, `TRY-${claim.job_id}-${claim.attempts}`]);
        await sql.query("UPDATE payload_terminal_job SET state='FAILED',failure_code='MINING_EXECUTION_FAILED',claim_token=NULL,lease_until=NULL WHERE job_id=$1", [claim.job_id]);
      });
    }
    return true;
  }
}
