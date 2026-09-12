import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '@/fixtures/digest';
import type { ImmutableObjectStore, ObjectCustodyReceipt } from '@/data-os/immutable-object-store';
import { executionPolicy } from '@/runtime/policy';
import { commitment } from './contracts';
import type { TerminalDatabase, TerminalSql } from './database';
export { PUBLICATION_DDL, PUBLICATION_GUARDS } from './publicationSchema';

export const PUBLICATION_MAX_BACKLOG = 1000;
export const PUBLICATION_MAX_BYTES = 1_048_576;
export const PUBLICATION_MAX_ATTEMPTS = 10;
const destinationPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export type PublicationState = 'PENDING' | 'LEASED' | 'RECONCILE' | 'PUBLISHED' | 'BLOCKED';
export class PublicationError extends Error { constructor(readonly code: string) { super(code); } }
function fail(code: string): never { throw new PublicationError(code); }
function validDestination(destination: string) { if (typeof destination !== 'string' || !destinationPattern.test(destination)) fail('PUBLICATION_DESTINATION_INVALID'); }
interface Row {
  publication_id: string; job_id: string; result_digest: string; destination: string; byte_digest: string; byte_length: number;
  object_key: string; state: PublicationState; attempts: number; claim_token: string | null; lease_until: string | Date | null;
  available_at: string | Date; failure_code: string | null; receipt: ObjectCustodyReceipt | null; receipt_digest: string | null;
}
export interface Publication {
  publicationId: string; jobId: string; resultDigest: string; destination: string; byteDigest: string; byteLength: number;
  objectKey: string; state: PublicationState; attempts: number; failureCode: string | null;
  receipt: ObjectCustodyReceipt | null; receiptDigest: string | null;
}
const publicRow = (row: Row): Publication => ({ publicationId: row.publication_id, jobId: row.job_id, resultDigest: row.result_digest,
  destination: row.destination, byteDigest: row.byte_digest, byteLength: row.byte_length, objectKey: row.object_key,
  state: row.state, attempts: row.attempts, failureCode: row.failure_code, receipt: row.receipt, receiptDigest: row.receipt_digest });
async function gate(sql: TerminalSql) {
  if (!(await sql.query('SELECT singleton FROM payload_terminal_publication_gate WHERE singleton=true FOR UPDATE')).rows.length) fail('PUBLICATION_GATE_MISSING');
}

/** Caller holds the terminal control lock first when reserving RUNNING work.
 * Reserve room before computation; never drop an outbox event after a result commit. */
export async function publicationHasCapacity(sql: TerminalSql, reservations = 0): Promise<boolean> {
  if (!Number.isInteger(reservations) || reservations < 0 || reservations > PUBLICATION_MAX_BACKLOG) fail('PUBLICATION_LIMIT_INVALID');
  await gate(sql);
  const pending = await sql.query("SELECT publication_id FROM payload_terminal_publication WHERE state<>'PUBLISHED' LIMIT $1", [PUBLICATION_MAX_BACKLOG]);
  return pending.rows.length + reservations < PUBLICATION_MAX_BACKLOG;
}

/** Called inside the SAME transaction as the immutable result insert. No BEGIN/COMMIT, no payload copy retained. */
export async function enqueuePublication(sql: TerminalSql, request: { jobId: string; resultDigest: string; bytes: Uint8Array; destination: string }): Promise<Publication> {
  try { return await enqueue(sql, request); }
  catch (error) { if (error instanceof PublicationError) throw error; throw new PublicationError('PUBLICATION_UNAVAILABLE'); }
}
async function enqueue(sql: TerminalSql, request: { jobId: string; resultDigest: string; bytes: Uint8Array; destination: string }): Promise<Publication> {
  const { jobId, resultDigest, destination } = request;
  validDestination(destination);
  if (!idPattern.test(jobId) || !digestPattern.test(resultDigest) || !(request.bytes instanceof Uint8Array)
    || request.bytes.byteLength < 1 || request.bytes.byteLength > PUBLICATION_MAX_BYTES) fail('PUBLICATION_INPUT_INVALID');
  const bytes = Buffer.from(request.bytes);
  if (hash(bytes) !== resultDigest) fail('PUBLICATION_INTEGRITY_FAILURE');
  await gate(sql);
  const retained = (await sql.query<{ result: unknown; result_digest: string }>('SELECT result,result_digest FROM payload_terminal_result WHERE job_id=$1', [jobId])).rows[0];
  if (!retained || retained.result_digest !== resultDigest || commitment(retained.result) !== resultDigest
    || !bytes.equals(Buffer.from(canonicalJson(retained.result)))) fail('PUBLICATION_RESULT_BINDING');
  const prior = (await sql.query<Row>('SELECT * FROM payload_terminal_publication WHERE job_id=$1 AND destination=$2', [jobId, destination])).rows[0];
  if (prior) {
    if (prior.result_digest !== resultDigest || prior.byte_length !== bytes.length) fail('PUBLICATION_INPUT_CONFLICT');
    return publicRow(prior);
  }
  if (!(await publicationHasCapacity(sql))) fail('PUBLICATION_BACKLOG_FULL');
  const row = (await sql.query<Row>(`INSERT INTO payload_terminal_publication(publication_id,job_id,result_digest,destination,byte_digest,byte_length,object_key)
    VALUES($1,$2,$3,$4,$3,$5,$6) RETURNING *`, [`PUB-${randomUUID()}`, jobId, resultDigest, destination, bytes.length, `sha256/${resultDigest.slice(7)}.json`])).rows[0];
  return publicRow(row);
}

export interface PublicationWorkerOptions {
  /** Required fresh source/retention check. Must refuse on expired or unavailable rights. */
  permit: (jobId: string) => Promise<void>;
  /** Backend-only tuning. Database time, not this clock, controls leases. */
  leaseMs?: number;
}

/** Only qualified create-only immutable-object stores belong here. Never catalog append, delivery or admission. */
export class PublicationWorker {
  private readonly destination: string;
  private readonly leaseMs: number;
  constructor(private readonly db: TerminalDatabase, private readonly store: ImmutableObjectStore, private readonly options: PublicationWorkerOptions) {
    validDestination(store.destination); this.destination = store.destination;
    this.leaseMs = options?.leaseMs ?? 30_000;
    if (typeof options?.permit !== 'function' || !Number.isInteger(this.leaseMs) || this.leaseMs < 100 || this.leaseMs > 30_000) fail('PUBLICATION_OPTIONS_INVALID');
  }
  private async transaction<T>(work: (sql: TerminalSql) => Promise<T>): Promise<T> {
    try { return await this.db.transaction(work); }
    catch (error) { if (error instanceof PublicationError) throw error; throw new PublicationError('PUBLICATION_UNAVAILABLE'); }
  }
  async read(publicationId: string): Promise<Publication | null> {
    if (!idPattern.test(publicationId)) fail('PUBLICATION_ID_INVALID');
    return this.transaction(async sql => {
      const row = (await sql.query<Row>('SELECT * FROM payload_terminal_publication WHERE publication_id=$1 AND destination=$2', [publicationId, this.destination])).rows[0];
      return row ? publicRow(row) : null;
    });
  }
  async list(options: { after?: string; limit?: number; state?: PublicationState } = {}): Promise<{ publications: Publication[]; nextCursor: string | null }> {
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (options.after !== undefined && !idPattern.test(options.after))
      || (options.state !== undefined && !['PENDING','LEASED','RECONCILE','PUBLISHED','BLOCKED'].includes(options.state))) fail('PUBLICATION_LIMIT_INVALID');
    return this.transaction(async sql => {
      const { rows } = await sql.query<Row>(`SELECT * FROM payload_terminal_publication WHERE destination=$1 AND ($2::text IS NULL OR publication_id>$2)
        AND ($3::text IS NULL OR state=$3) ORDER BY publication_id LIMIT $4`, [this.destination, options.after ?? null, options.state ?? null, limit + 1]);
      return { publications: rows.slice(0, limit).map(publicRow), nextCursor: rows.length > limit ? rows[limit - 1].publication_id : null };
    });
  }
  private async claim(): Promise<Row | null> {
    return this.transaction(async sql => {
      await gate(sql);
      await sql.query(`UPDATE payload_terminal_publication SET state=CASE WHEN attempts>=10 THEN 'BLOCKED' ELSE 'RECONCILE' END,
        claim_token=NULL,lease_until=NULL,available_at=clock_timestamp(),failure_code=CASE WHEN attempts>=10 THEN 'PUBLICATION_ATTEMPTS_EXHAUSTED' ELSE 'PUBLICATION_UNAVAILABLE' END
        WHERE publication_id IN (SELECT publication_id FROM payload_terminal_publication WHERE state='LEASED' AND lease_until<=clock_timestamp()
          ORDER BY lease_until,publication_id LIMIT 100 FOR UPDATE SKIP LOCKED)`);
      const cap = executionPolicy().productionWorkers;
      if (!Number.isInteger(cap) || cap < 1) fail('PUBLICATION_POLICY_INVALID');
      if ((await sql.query("SELECT publication_id FROM payload_terminal_publication WHERE state='LEASED' AND lease_until>clock_timestamp() LIMIT $1", [cap])).rows.length >= cap) return null;
      const candidate = (await sql.query<Row>(`SELECT * FROM payload_terminal_publication WHERE destination=$1 AND state IN ('PENDING','RECONCILE')
        AND available_at<=clock_timestamp() AND attempts<10 ORDER BY available_at,publication_id LIMIT 1 FOR UPDATE SKIP LOCKED`, [this.destination])).rows[0];
      if (!candidate) return null;
      return (await sql.query<Row>(`UPDATE payload_terminal_publication SET state='LEASED',attempts=attempts+1,claim_token=$2,
        lease_until=clock_timestamp()+($3::integer * interval '1 millisecond'),failure_code=NULL WHERE publication_id=$1 RETURNING *`,
      [candidate.publication_id, randomUUID(), this.leaseMs])).rows[0];
    });
  }
  private async permitted(claim: Row) {
    if (this.store.destination !== this.destination) fail('PUBLICATION_INTEGRITY_FAILURE');
    try { await this.options.permit(claim.job_id); } catch { fail('PUBLICATION_PERMISSION_UNAVAILABLE'); }
  }
  private receipt(value: ObjectCustodyReceipt, claim: Row): ObjectCustodyReceipt {
    if (!value || value.schema !== 'payload.object-custody.v1' || !['local','exoscale-sos'].includes(value.provider) || value.destination !== claim.destination || value.key !== claim.object_key
      || value.contentDigest !== claim.byte_digest || value.byteLength !== claim.byte_length
      || (value.provider === 'local' && value.versionId !== null)
      || (value.provider === 'exoscale-sos' && (typeof value.versionId !== 'string' || value.versionId.length < 1 || value.versionId.length > 1024
        || value.versionId === 'null' || value.versionId === 'undefined'))) fail('PUBLICATION_INTEGRITY_FAILURE');
    return Object.freeze({ schema: value.schema, provider: value.provider, destination: value.destination, key: value.key, contentDigest: value.contentDigest,
      byteLength: value.byteLength, versionId: value.versionId });
  }
  async runNext(): Promise<boolean> {
    const claim = await this.claim();
    if (!claim) return false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const receipt = await Promise.race([
        (async () => {
          const bytes = await this.transaction(async sql => {
            const row = (await sql.query<{ result: unknown; result_digest: string }>('SELECT result,result_digest FROM payload_terminal_result WHERE job_id=$1', [claim.job_id])).rows[0];
            if (!row || row.result_digest !== claim.result_digest) fail('PUBLICATION_INTEGRITY_FAILURE');
            const retained = Buffer.from(canonicalJson(row.result));
            if (retained.length !== claim.byte_length || retained.length > PUBLICATION_MAX_BYTES || hash(retained) !== claim.byte_digest) fail('PUBLICATION_INTEGRITY_FAILURE');
            return retained;
          });
          await this.permitted(claim);
          if (controller.signal.aborted) fail('PUBLICATION_UNAVAILABLE');
          // ensure may safely repeat only because the destination contract is immutable conditional create.
          const observed = this.receipt(await this.store.ensure(claim.object_key, bytes, controller.signal), claim);
          await this.permitted(claim);
          if (controller.signal.aborted) fail('PUBLICATION_UNAVAILABLE');
          const readback = await this.store.readReceipt(observed, controller.signal);
          if (!(readback instanceof Uint8Array) || readback.length !== bytes.length || hash(readback) !== claim.byte_digest
            || !bytes.equals(Buffer.from(readback))) fail('PUBLICATION_INTEGRITY_FAILURE');
          await this.permitted(claim);
          return observed;
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new PublicationError('PUBLICATION_UNAVAILABLE')); }, Math.min(this.leaseMs, 10_000)); }),
      ]);
      await this.transaction(async sql => {
        await gate(sql);
        const saved = await sql.query(`UPDATE payload_terminal_publication SET state='PUBLISHED',claim_token=NULL,lease_until=NULL,
          receipt=$3::jsonb,receipt_digest=$4,failure_code=NULL WHERE publication_id=$1 AND state='LEASED' AND claim_token=$2 AND lease_until>clock_timestamp() RETURNING publication_id`,
        [claim.publication_id, claim.claim_token, canonicalJson(receipt), commitment(receipt)]);
        if (!saved.rows.length) fail('PUBLICATION_CLAIM_FENCED');
      });
    } catch (error) {
      const code = error instanceof PublicationError && ['PUBLICATION_INTEGRITY_FAILURE','PUBLICATION_PERMISSION_UNAVAILABLE'].includes(error.code) ? error.code : 'PUBLICATION_UNAVAILABLE';
      // COMMIT may have succeeded despite a lost response. Conditional update then
      // leaves a published or newly fenced row untouched; it never declares absence.
      try {
        await this.transaction(async sql => {
          await gate(sql);
          await sql.query(`UPDATE payload_terminal_publication SET state=$3,claim_token=NULL,lease_until=NULL,failure_code=$4,
            available_at=clock_timestamp()+interval '1 second' WHERE publication_id=$1 AND state='LEASED' AND claim_token=$2`,
          [claim.publication_id, claim.claim_token, code === 'PUBLICATION_INTEGRITY_FAILURE' || claim.attempts >= PUBLICATION_MAX_ATTEMPTS ? 'BLOCKED' : 'RECONCILE',
            claim.attempts >= PUBLICATION_MAX_ATTEMPTS ? 'PUBLICATION_ATTEMPTS_EXHAUSTED' : code]);
        });
      } catch { throw new PublicationError('PUBLICATION_UNAVAILABLE'); }
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
    return true;
  }
}
