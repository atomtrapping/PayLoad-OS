import { z } from 'zod';
import type { CorpusSource } from '@/adapter/corpusSource';
import { canonicalJson } from '@/fixtures/digest';
import { objectDigest, type ImmutableObjectStore } from '@/data-os/immutable-object-store';
import { commitment } from './contracts';
import type { TerminalDatabase } from './database';
import { publicationPermission } from './retention';
import { PUBLICATION_MAX_BYTES, PublicationWorker } from './publication';
import type { MiningSnapshot } from './mining';
export { LAKE_RECEIPT_DDL, LAKE_RECEIPT_GUARDS } from './lakeSchema';

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const time = Date.parse(value); return Number.isFinite(time) && new Date(time).toISOString() === value;
});
const objectKey = z.string().min(1).max(512).regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/)
  .refine(value => !value.split('/').some(part => part === '.' || part === '..'));
const record = z.object({
  job_id: identifier, result_digest: digest, artifact_digest: digest, object_key: objectKey,
  corpus_id: identifier, release_id: identifier, known_at: instant, corrects_job_id: identifier.nullable(), fixture_only: z.literal(true),
}).strict();
const manifestSchema = z.object({ schema: z.literal('payload.terminal-lake-publication.v1'), publication_id: identifier,
  records: z.array(record).length(1), input_digest: digest }).strict();
const readSchema = z.object({ schema: z.literal('payload.terminal-lake-read.v1'), publication_id: identifier, input_digest: digest }).strict();
const receiptSchema = z.object({
  schema: z.literal('payload.terminal-lake-receipt.v1'), table: z.literal('terminal.result_publications'),
  table_uuid: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  snapshot_id: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n),
  publication_id: identifier, input_digest: digest, record_count: z.literal(1), snapshot_record_count: z.number().int().min(1).max(10_000),
  manifest: manifestSchema, fixture_only: z.literal(true), canonical_admission: z.literal(false),
  source_permissions_verified: z.literal(false), artifact_bytes_verified_by_python: z.literal(false),
}).strict();
const custodySchema = z.object({ schema: z.literal('payload.object-custody.v1'), provider: z.enum(['local','exoscale-sos']),
  destination: digest, key: objectKey, contentDigest: digest, byteLength: z.number().int().min(1).max(PUBLICATION_MAX_BYTES),
  versionId: z.string().min(1).max(1024).nullable(),
}).strict().refine(value => value.provider === 'local' ? value.versionId === null
  : value.versionId !== null && value.versionId !== 'null' && value.versionId !== 'undefined');

export type TerminalLakeManifest = z.infer<typeof manifestSchema>;
export type TerminalLakeRead = z.infer<typeof readSchema>;
export type TerminalLakeReceipt = z.infer<typeof receiptSchema>;
/** Each call MUST start a fresh bounded process running only tools.terminal_lake.
 * The executor owns stdin/stdout byte ceilings, process kill and an explicit local root. */
export type TerminalLakeRun = (mode: 'publish' | 'read', input: TerminalLakeManifest | TerminalLakeRead) => Promise<unknown>;
export interface TerminalLakeAcknowledgement { publicationId: string; destination: string; receipt: TerminalLakeReceipt; receiptDigest: string }
export class TerminalLakeError extends Error { constructor(readonly code: string) { super(code); } }
function fail(code: string): never { throw new TerminalLakeError(code); }
function parsed<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const result = schema.safeParse(value); if (!result.success) fail(code); return result.data;
}
function checkedReceipt(value: unknown, expected: TerminalLakeManifest): TerminalLakeReceipt {
  const result = parsed(receiptSchema, value, 'LAKE_RESPONSE_INVALID');
  if (Buffer.byteLength(canonicalJson(result)) > 131_072 || result.publication_id !== expected.publication_id
    || result.input_digest !== expected.input_digest || canonicalJson(result.manifest) !== canonicalJson(expected)) fail('LAKE_RESPONSE_BINDING');
  return result;
}
interface JobResult {
  job_id: string; corpus_id: string; release_id: string; corrects_job_id: string | null;
  snapshot: MiningSnapshot; snapshot_digest: string; method_digest: string; result: Record<string, unknown>; result_digest: string;
}

/** Fixture-only derived index qualification. It cannot acquire sources, publish real data,
 * grant rights, admit records, create jobs or replace earlier result/custody receipts. */
export async function publishTerminalLake(db: TerminalDatabase, source: CorpusSource, store: ImmutableObjectStore,
  publicationId: string, lakeDestination: string, run: TerminalLakeRun): Promise<TerminalLakeAcknowledgement> {
  try { return await publish(db, source, store, publicationId, lakeDestination, run); }
  catch (error) { if (error instanceof TerminalLakeError) throw error; throw new TerminalLakeError('LAKE_UNAVAILABLE'); }
}
async function publish(db: TerminalDatabase, source: CorpusSource, store: ImmutableObjectStore,
  publicationId: string, lakeDestination: string, run: TerminalLakeRun): Promise<TerminalLakeAcknowledgement> {
  parsed(identifier, publicationId, 'LAKE_INPUT_INVALID'); parsed(digest, lakeDestination, 'LAKE_INPUT_INVALID');
  const destination = parsed(digest, store.destination, 'LAKE_INPUT_INVALID');
  if (typeof run !== 'function') fail('LAKE_INPUT_INVALID');
  const permit = publicationPermission(db, source, destination);
  const publication = await new PublicationWorker(db, store, { permit }).read(publicationId);
  if (!publication || publication.state !== 'PUBLISHED' || !publication.receipt || publication.destination !== destination) fail('LAKE_PUBLICATION_REQUIRED');
  const custody = parsed(custodySchema, publication.receipt, 'LAKE_CUSTODY_INVALID');
  if (commitment(custody) !== publication.receiptDigest || custody.destination !== destination || custody.key !== publication.objectKey
    || custody.contentDigest !== publication.byteDigest || custody.byteLength !== publication.byteLength
    || publication.resultDigest !== publication.byteDigest) fail('LAKE_CUSTODY_INVALID');
  const job = await db.transaction(async sql => (await sql.query<JobResult>(`SELECT j.job_id,j.corpus_id,j.release_id,j.corrects_job_id,j.snapshot,j.snapshot_digest,j.method_digest,r.result,r.result_digest
    FROM payload_terminal_job j JOIN payload_terminal_result r ON r.job_id=j.job_id WHERE j.job_id=$1 AND j.state='SUCCEEDED'`, [publication.jobId])).rows[0]);
  if (!job || !job.result || job.snapshot.fixture_only !== true || job.result.fixture_only !== true) fail('LAKE_FIXTURE_ONLY');
  if (job.job_id !== publication.jobId || job.result_digest !== publication.resultDigest || commitment(job.result) !== publication.resultDigest
    || job.snapshot.corpusId !== job.corpus_id || job.snapshot.releaseId !== job.release_id || commitment(job.snapshot) !== job.snapshot_digest
    || job.result.jobId !== job.job_id || job.result.releaseId !== job.release_id || job.result.snapshotDigest !== job.snapshot_digest
    || job.result.methodDigest !== job.method_digest || job.result.validation !== 'NOT_VALIDATED') fail('LAKE_RESULT_BINDING');
  const bytes = Buffer.from(canonicalJson(job.result));
  if (bytes.length !== publication.byteLength || bytes.length > PUBLICATION_MAX_BYTES || objectDigest(bytes) !== publication.byteDigest) fail('LAKE_RESULT_BINDING');
  async function permitted() {
    if (store.destination !== destination) fail('LAKE_CUSTODY_INVALID');
    try { await permit(publication!.jobId); } catch { fail('LAKE_PERMISSION_UNAVAILABLE'); }
  }
  await permitted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const actual = await Promise.race([store.readReceipt(Object.freeze({ ...custody }), controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new TerminalLakeError('LAKE_OBJECT_TIMEOUT')); }, 10_000); })]);
    if (!(actual instanceof Uint8Array) || actual.byteLength !== bytes.length || !bytes.equals(Buffer.from(actual))
      || objectDigest(actual) !== publication.byteDigest) fail('LAKE_OBJECT_INTEGRITY');
  } finally { if (timer) clearTimeout(timer); controller.abort(); }
  await permitted();
  // Preserve the source instant while adding only the protocol's explicit zero milliseconds.
  const knownAt = typeof job.snapshot.knownAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(job.snapshot.knownAt)
    ? job.snapshot.knownAt.slice(0, -1) + '.000Z' : job.snapshot.knownAt;
  const body = { schema: 'payload.terminal-lake-publication.v1' as const, publication_id: publicationId, records: [{
    job_id: job.job_id, result_digest: publication.resultDigest, artifact_digest: publication.byteDigest, object_key: publication.objectKey,
    corpus_id: job.corpus_id, release_id: job.release_id, known_at: knownAt, corrects_job_id: job.corrects_job_id, fixture_only: true as const,
  }] };
  const manifest = parsed(manifestSchema, { ...body, input_digest: commitment(body) }, 'LAKE_MANIFEST_INVALID');
  if (Buffer.byteLength(canonicalJson(manifest)) > 65_536 || job.corrects_job_id === job.job_id) fail('LAKE_MANIFEST_INVALID');
  // Retain private manifest/receipt copies. An executor cannot mutate expected values across awaits.
  const clone = <T>(value: T): T => JSON.parse(canonicalJson(value)) as T;
  const saved = await db.transaction(async sql => (await sql.query<{ receipt: unknown; digest: string }>(
    'SELECT receipt,digest FROM payload_terminal_lake_receipt WHERE publication_id=$1 AND destination=$2', [publicationId, lakeDestination])).rows[0]);
  let expected: TerminalLakeReceipt;
  if (saved) {
    expected = checkedReceipt(saved.receipt, manifest);
    if (commitment(expected) !== saved.digest) fail('LAKE_ACK_INTEGRITY');
  } else {
    expected = checkedReceipt(await run('publish', clone(manifest)), manifest);
  }
  await permitted();
  const read = parsed(readSchema, { schema: 'payload.terminal-lake-read.v1', publication_id: publicationId, input_digest: manifest.input_digest }, 'LAKE_INPUT_INVALID');
  const fresh = checkedReceipt(await run('read', read), manifest);
  if (canonicalJson(fresh) !== canonicalJson(expected)) fail('LAKE_READBACK_MISMATCH');
  await permitted();
  const receiptDigest = commitment(fresh);
  return db.transaction(async sql => {
    await sql.query(`INSERT INTO payload_terminal_lake_receipt(publication_id,destination,receipt,digest) VALUES($1,$2,$3::jsonb,$4)
      ON CONFLICT(publication_id,destination) DO NOTHING`, [publicationId, lakeDestination, canonicalJson(fresh), receiptDigest]);
    const retained = (await sql.query<{ receipt: unknown; digest: string }>(
      'SELECT receipt,digest FROM payload_terminal_lake_receipt WHERE publication_id=$1 AND destination=$2', [publicationId, lakeDestination])).rows[0];
    if (!retained || retained.digest !== receiptDigest || canonicalJson(retained.receipt) !== canonicalJson(fresh)) fail('LAKE_ACK_CONFLICT');
    return { publicationId, destination: lakeDestination, receipt: fresh, receiptDigest };
  });
}
