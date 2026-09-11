/**
 * One embedded PostgreSQL for the governance demonstration.
 *
 * The four ledgers this repository already has — execution, discovery,
 * dossier, editorial — were each proven against PGlite in their own test
 * files and never stacked in one schema by anything but a test. This opens
 * them together, seeds the demonstration corpus their foreign keys point at,
 * and offers three verbs: write, refuse, read.
 *
 * REFUSE IS A VERB
 *
 * A demonstration that only writes rows shows that the happy path exists. The
 * point of these ledgers is what they will not accept, so `refuse` runs a
 * statement that is expected to fail, records which constraint refused it,
 * and throws if the statement went in. A refusal that was not observed is
 * not in the receipt, and a receipt row that says "refused by
 * release_scope_accepted" was written because the database said so.
 *
 * THE CORPUS TABLES ARE THE SHAPE THE KEYS NEED
 *
 * The real `records` table has a wider shape than the ledgers' keys require,
 * and the ledger tests have always used a narrow stub of `corpora`, `releases`
 * and `corpus_record`. This uses the same stub, seeded from the committed
 * demonstration corpus: the Caravan release the mining engine actually ran
 * over, and its standing records with their knowledge times. Every
 * authorization below binds to that release and says so.
 */
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import { sqlArray, sqlText } from '@/db/ddl';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from '@/db/discoveryLedger';
import { DOSSIER_LEDGER_DDL } from '@/db/dossierLedger';
import { EDITORIAL_LEDGER_DDL } from '@/db/editorialLedger';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS, type PrincipalKind } from '@/db/executionLedger';
import type { ReviewResponse } from '@/domain/executionEnvelope';
import { currentRelease, standingRecords } from '@/domain/corpus';
import type { Corpus } from '@/domain/corpus';

export const CORPUS_STUB_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE TABLE corpus_record (record_id text PRIMARY KEY, release_id text NOT NULL, subject_id text NOT NULL, predicate text NOT NULL, known_at timestamptz NOT NULL, UNIQUE (record_id, known_at));
`;

export const digestOf = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

export interface Refusal {
  /** What was attempted, in words a reader can check against the row that would have gone in. */
  label: string;
  /** The constraint, index, key or trigger that refused it, as the database named it. */
  refusedBy: string;
}

/** The name PostgreSQL gave for what refused a statement, or its first clause. */
export function constraintOf(message: string): string {
  const quoted = message.match(/constraint "([^"]+)"/) ?? message.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  const raised = message.match(/(?:error: )?([a-z_]+(?::[^\s]+)?)/i);
  return raised ? raised[1] : message.slice(0, 80);
}

export interface Principal { principalId: string; kind: PrincipalKind; displayName: string }

/** A governed act in the kernel: what was proposed, shown, said and granted, of one digest. */
export interface GovernedAct {
  proposalId: string;
  operationKind: string;
  packetId: string;
  actionDigest: string;
  reviewId: string;
  reviewer: string;
  response: ReviewResponse;
  /** Present only when the review approved. A denial produces no authorization, and that absence is the point. */
  authorizationId: string | null;
  grantedBy: string | null;
  grantedAt: string;
  expiresAt: string;
  revisesProposalId: string | null;
  correctsOperationId: string | null;
}

export class GovernanceLedger {
  private constructor(private client: PGlite, readonly schema: string) {}
  readonly refusals: Refusal[] = [];

  static async open(schema = 'gov'): Promise<GovernanceLedger> {
    const client = new PGlite();
    await client.waitReady;
    await client.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      ${CORPUS_STUB_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}
      ${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${DOSSIER_LEDGER_DDL}${EDITORIAL_LEDGER_DDL}`);
    return new GovernanceLedger(client, schema);
  }

  async close() { await this.client.close(); }

  /** Write. Inside a transaction, so the deferred guards are checked and a failure leaves nothing half-written. */
  async write(statement: string): Promise<void> {
    try {
      await this.client.exec(`SET search_path TO ${this.schema}; BEGIN; ${statement}; COMMIT;`);
    } catch (error) {
      await this.client.exec('ROLLBACK').catch(() => { /* an aborted block is ended by the next statement */ });
      throw error;
    }
  }

  /** Attempt something the ledger must not accept, and record what refused it. */
  async refuse(label: string, statement: string): Promise<Refusal> {
    try {
      await this.write(statement);
    } catch (error) {
      const refusal = { label, refusedBy: constraintOf(error instanceof Error ? error.message : String(error)) };
      this.refusals.push(refusal);
      return refusal;
    }
    throw new Error(`Expected the ledger to refuse: ${label}`);
  }

  async rows<T = Record<string, unknown>>(query: string): Promise<T[]> {
    await this.client.query(`SET search_path TO ${this.schema}`);
    return (await this.client.query(query)).rows as T[];
  }

  async count(table: string, where = 'TRUE'): Promise<number> {
    const [row] = await this.rows<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`);
    return row.n;
  }

  async principals(list: readonly Principal[], at: string) {
    await this.write(list.map((p) => `INSERT INTO principal VALUES (${sqlText(p.principalId)}, '${p.kind}', ${sqlText(p.displayName)}, '${at}')`).join(';\n'));
  }

  /** The demonstration corpus, as the keys need it: its current release and its standing records at an instant. */
  async seedCorpus(corpus: Corpus, at: string): Promise<{ releaseId: string; records: number }> {
    const release = currentRelease(corpus);
    const standing = standingRecords(corpus, at);
    await this.write([
      `INSERT INTO corpora VALUES (${sqlText(corpus.corpusId)}, '${corpus.domain}', '{"fixture_only":true}'::jsonb)`,
      `INSERT INTO releases VALUES (${sqlText(release.releaseId)}, ${sqlText(corpus.corpusId)}, 'CURRENT', '${release.knownAt ?? at}', '{"fixture_only":true}'::jsonb)`,
      ...standing.map((record) => `INSERT INTO corpus_record VALUES (${sqlText(record.recordId)}, ${sqlText(release.releaseId)}, ${sqlText(record.subjectId)}, ${sqlText(record.predicate)}, '${record.knownAt}')`),
    ].join(';\n'));
    return { releaseId: release.releaseId, records: standing.length };
  }

  /**
   * Put a proposal through the kernel: propose, prepare the packet, review,
   * and — only if the review approved — authorize. The digest is computed here
   * over the exact action, so what the reviewer saw is what the authorization
   * is of, and the caller cannot pass one and bind the other.
   */
  async govern(act: {
    tag: string; operationKind: string; counterparty: string; action: unknown;
    doingNothing: string; against: string; sections?: readonly string[];
    authoredBy: Principal; preparedBy: Principal; reviewer: Principal; response: ReviewResponse; reasoning: string;
    grantor?: Principal; releaseId: string; stateRevision?: number; policyVersion: string;
    proposedAt: string; reviewedAt: string; grantedAt: string; expiresAt: string;
    revises?: { proposalId: string; reason: string }; corrects?: { operationId: string; reason: string };
    declaredSideEffects?: readonly string[];
  }): Promise<GovernedAct> {
    const actionDigest = digestOf(act.action);
    const proposalId = `P-${act.tag}`, packetId = `K-${act.tag}`, reviewId = `RV-${act.tag}`, authorizationId = `AU-${act.tag}`;
    const grantor = act.grantor ?? act.reviewer;
    await this.write([
      `INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at, declared_side_effects, data,
        revises_proposal_id, revision_reason, corrects_operation_id, correction_reason)
       VALUES (${sqlText(proposalId)}, ${sqlText(act.operationKind)}, ${sqlText(act.counterparty)}, '${act.authoredBy.kind}', ${sqlText(act.authoredBy.principalId)}, '${act.proposedAt}',
        ${sqlText(JSON.stringify(act.declaredSideEffects ?? []))}::jsonb, '{}'::jsonb,
        ${act.revises ? `${sqlText(act.revises.proposalId)}, ${sqlText(act.revises.reason)}` : 'NULL, NULL'},
        ${act.corrects ? `${sqlText(act.corrects.operationId)}, ${sqlText(act.corrects.reason)}` : 'NULL, NULL'})`,
      `INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against, sections, prepared_by_kind, prepared_by, prepared_at)
       VALUES (${sqlText(packetId)}, ${sqlText(proposalId)}, ${sqlText(act.operationKind)}, ${sqlText(canonicalJson(act.action))}::jsonb, '${actionDigest}',
        ${sqlText(act.doingNothing)}, ${sqlText(act.against)}, ${sqlText(JSON.stringify(act.sections ?? []))}::jsonb, '${act.preparedBy.kind}', ${sqlText(act.preparedBy.principalId)}, '${act.proposedAt}')`,
      `INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
       VALUES (${sqlText(reviewId)}, ${sqlText(proposalId)}, '${actionDigest}', '${act.response}', '${act.reviewer.kind}', ${sqlText(act.reviewer.principalId)}, ${sqlText(act.reasoning)}, '${act.reviewedAt}')`,
      ...(act.response === 'APPROVE' ? [
        `INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by, corpus_release_id, state_revision, policy_version,
          granted_at, expires_at, action_digest, review_response)
         VALUES (${sqlText(authorizationId)}, ${sqlText(proposalId)}, 'NARROW_ACTION', '${grantor.kind}', ${sqlText(grantor.principalId)}, ${sqlText(act.releaseId)}, ${act.stateRevision ?? 1},
          ${sqlText(act.policyVersion)}, '${act.grantedAt}', '${act.expiresAt}', '${actionDigest}', 'APPROVE')`,
      ] : []),
    ].join(';\n'));
    return {
      proposalId, operationKind: act.operationKind, packetId, actionDigest, reviewId, reviewer: act.reviewer.principalId, response: act.response,
      authorizationId: act.response === 'APPROVE' ? authorizationId : null,
      grantedBy: act.response === 'APPROVE' ? grantor.principalId : null,
      grantedAt: act.grantedAt, expiresAt: act.expiresAt,
      revisesProposalId: act.revises?.proposalId ?? null, correctsOperationId: act.corrects?.operationId ?? null,
    };
  }

  /** Open an operation under an authorization and try it once. The outcome is what the caller says the venue said. */
  async dispatch(act: { tag: string; authorizationId: string; idempotencyKey: string; grantedAt: string; expiresAt: string; stateRevision?: number; openedAt: string; attemptedAt: string; outcome: 'CONFIRMED' | 'REJECTED' | 'OUTCOME_UNKNOWN'; venueReceipt?: string }) {
    const operationId = `O-${act.tag}`, attemptId = `T-${act.tag}`;
    await this.write([
      `INSERT INTO execution_operation VALUES (${sqlText(operationId)}, ${sqlText(act.authorizationId)}, ${sqlText(act.idempotencyKey)}, '${act.openedAt}')`,
      `INSERT INTO execution_attempt (attempt_id, operation_id, authorization_id, authorization_state_revision, authorization_granted_at, authorization_expires_at,
        ran_at_state_revision, attempted_at, outcome, venue_receipt)
       VALUES (${sqlText(attemptId)}, ${sqlText(operationId)}, ${sqlText(act.authorizationId)}, ${act.stateRevision ?? 1}, '${act.grantedAt}', '${act.expiresAt}',
        ${act.stateRevision ?? 1}, '${act.attemptedAt}', '${act.outcome}', ${act.venueReceipt ? sqlText(act.venueReceipt) : 'NULL'})`,
    ].join(';\n'));
    return { operationId, attemptId, outcome: act.outcome, venueReceipt: act.venueReceipt ?? null };
  }

  async reconcile(act: { attemptId: string; found: 'DID_HAPPEN' | 'DID_NOT_HAPPEN' | 'STILL_UNKNOWN'; basis: string; at: string }) {
    const reconciliationId = `RC-${act.attemptId}`;
    await this.write(`INSERT INTO attempt_reconciliation VALUES (${sqlText(reconciliationId)}, ${sqlText(act.attemptId)}, '${act.at}', '${act.found}', ${sqlText(act.basis)})`);
    return { reconciliationId, found: act.found, basis: act.basis };
  }

  async revoke(act: { authorizationId: string; grantedAt: string; expiresAt: string; by: Principal; reason: string; at: string }) {
    const revocationId = `X-${act.authorizationId}`;
    await this.write(`INSERT INTO authorization_revocation VALUES (${sqlText(revocationId)}, ${sqlText(act.authorizationId)}, '${act.grantedAt}', '${act.expiresAt}',
      '${act.by.kind}', ${sqlText(act.by.principalId)}, ${sqlText(act.reason)}, '${act.at}')`);
    return { revocationId, revokedBy: act.by.principalId, revokedAt: act.at, reason: act.reason };
  }

  /** A workload spec, one run and its artifacts, as the discovery ledger holds them. */
  async recordWorkload(w: {
    spec: { workloadId: string; miningKind: string; producesClass: string; method: string; parameters: Readonly<Record<string, unknown>>; implementation: { id: string; version: string }; outputSchema: string; arithmetic: string; specFingerprint: string };
    run: { runId: string; startedAt: string; completedAt: string; status: 'SUCCEEDED'; inputFingerprint: string; outputFingerprint: string };
    releaseId: string;
    artifacts: ReadonlyArray<{ artifactId: string; claimClass: string; subject: string; claim: string; computedAt: string; validation: string; confidence: number | null; modelId: string | null; horizonEndsAt: string | null; rights: readonly string[]; inputs: ReadonlyArray<{ recordId: string; knownAt: string; rights: readonly string[] }> }>;
  }) {
    await this.write([
      `INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters, implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
       VALUES (${sqlText(w.spec.workloadId)}, '${w.spec.miningKind}', '${w.spec.producesClass}', '{}'::jsonb, ${sqlText(w.spec.method)}, ${sqlText(canonicalJson(w.spec.parameters))}::jsonb,
        ${sqlText(w.spec.implementation.id)}, ${sqlText(w.spec.implementation.version)}, ${sqlText(w.spec.outputSchema)}, '${w.spec.arithmetic}', '${w.spec.specFingerprint}')
       ON CONFLICT (spec_fingerprint) DO NOTHING`,
      `INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
       VALUES (${sqlText(w.run.runId)}, ${sqlText(w.spec.workloadId)}, '${w.spec.producesClass}', ${sqlText(w.releaseId)}, '${w.run.startedAt}', '${w.run.completedAt}', 'SUCCEEDED', '${w.run.inputFingerprint}', '${w.run.outputFingerprint}')`,
      ...w.artifacts.flatMap((a) => [
        `INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, model_id, confidence, horizon_ends_at, rights, validation)
         VALUES (${sqlText(a.artifactId)}, ${sqlText(w.run.runId)}, 'SUCCEEDED', '${a.claimClass}', ${sqlText(a.subject)}, ${sqlText(a.claim)}, '${a.computedAt}',
          ${a.modelId ? sqlText(a.modelId) : 'NULL'}, ${a.confidence ?? 'NULL'}, ${a.horizonEndsAt ? `'${a.horizonEndsAt}'` : 'NULL'}, ${sqlArray(a.rights)}, '${a.validation}')`,
        ...a.inputs.map((input, index) =>
          `INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
           VALUES (${sqlText(`I-${a.artifactId}-${index}`)}, ${sqlText(a.artifactId)}, '${a.computedAt}', 'SOURCE_RECORD', ${sqlText(input.recordId)}, '${input.knownAt}', ${sqlArray(input.rights)})`),
      ]),
    ].join(';\n'));
  }
}
