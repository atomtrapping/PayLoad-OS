import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@/fixtures/digest';
import type { ImmutableObjectStore, ObjectCustodyReceipt } from '@/data-os/immutable-object-store';
import { commitment } from './contracts';
import type { TerminalDatabase } from './database';
import { installTerminalSchema } from './schema';
import { enqueuePublication, publicationHasCapacity, PublicationWorker } from './publication';

let client: PGlite;
let db: TerminalDatabase;
let directory: string | undefined;
const DESTINATION = `sha256:${'d'.repeat(64)}`;
const ACTION = `sha256:${'a'.repeat(64)}`;
const pause = (milliseconds: number) => new Promise(resolvePause => setTimeout(resolvePause, milliseconds));
function connection(pg: PGlite): TerminalDatabase {
  return { transaction: work => pg.transaction(tx => work({ query: async <T>(sql: string, values?: unknown[]) => values === undefined
    ? { rows: (await tx.exec(sql)).flatMap(result => result.rows as T[]) } : { rows: (await tx.query<T>(sql, values)).rows } })) };
}
async function open(path?: string) { client = new PGlite(path); await client.waitReady; db = connection(client); }
async function schema() {
  // Real corpus names and execution/result DDL; fixture-only synthetic inventory.
  await client.exec(`CREATE TABLE corpora(corpus_id text PRIMARY KEY,domain text,title text,description text,data jsonb);
    CREATE TABLE releases(release_id text PRIMARY KEY,corpus_id text REFERENCES corpora(corpus_id),status text,known_at timestamptz,data jsonb);
    INSERT INTO corpora VALUES('fixture','CARAVAN','Fixture','DEMONSTRATION','{"fixture_only":true}');
    INSERT INTO releases VALUES('fixture-v1','fixture','DEMONSTRATION',now(),'{"fixture_only":true}');`);
  await installTerminalSchema(db);
  await client.exec("INSERT INTO principal VALUES('fixture-agent','AGENT','Fixture only',now())");
}
async function result(jobId = 'JOB-one', corrects?: string, abort = false) {
  const value = { jobId, fixture_only: true, validation: 'NOT_VALIDATED', observed: jobId, ...(corrects ? { correctsJobId: corrects } : {}) };
  await client.query(`INSERT INTO operation_proposal(proposal_id,operation_kind,counterparty,authored_by_kind,authored_by,proposed_at)
    VALUES($1,'discovery.run-workload','fixture-agent','AGENT','fixture-agent',now())`, [jobId]);
  await client.query(`INSERT INTO decision_packet(packet_id,proposal_id,action_kind,action,action_digest,doing_nothing,against,prepared_by_kind,prepared_by,prepared_at)
    VALUES($1,$2,'discovery.run-workload','{}',$3,'No retained candidate','Fixture only','AGENT','fixture-agent',now())`, [`PACKET-${jobId}`, jobId, ACTION]);
  await client.query(`INSERT INTO payload_terminal_job(job_id,owner_id,corpus_id,release_id,purpose,idempotency_key,request_digest,snapshot_digest,method_digest,state,request,snapshot,action_digest,corrects_job_id)
    VALUES($1,'fixture-agent','fixture','fixture-v1','internal_research',$1,$2,$2,$2,'RUNNING','{}','{}',$2,$3)`, [jobId, ACTION, corrects ?? null]);
  const input = { jobId, resultDigest: commitment(value), bytes: Buffer.from(canonicalJson(value)), destination: DESTINATION };
  const publication = await db.transaction(async sql => {
    await sql.query('INSERT INTO payload_terminal_result(job_id,result_digest,result) VALUES($1,$2,$3::jsonb)', [jobId, input.resultDigest, JSON.stringify(value)]);
    const outbox = await enqueuePublication(sql, input);
    await sql.query("UPDATE payload_terminal_job SET state='SUCCEEDED' WHERE job_id=$1", [jobId]);
    if (abort) throw new Error('TEST_ABORT');
    return outbox;
  });
  return { publication, input, value };
}
class MemoryStore implements ImmutableObjectStore {
  readonly destination = DESTINATION;
  readonly objects = new Map<string, Buffer>();
  readonly ensure = vi.fn(async (key: string, bytes: Uint8Array, _signal: AbortSignal): Promise<ObjectCustodyReceipt> => {
    expect(_signal).toBeInstanceOf(AbortSignal);
    const prior = this.objects.get(key);
    if (prior && !prior.equals(Buffer.from(bytes))) throw new Error('OBJECT_IMMUTABLE_CONFLICT');
    if (!prior) this.objects.set(key, Buffer.from(bytes));
    return { schema: 'payload.object-custody.v1', provider: 'local', destination: this.destination, key,
      contentDigest: commitment(JSON.parse(Buffer.from(bytes).toString())), byteLength: bytes.length, versionId: null };
  });
  readonly get = vi.fn(async (key: string, max: number, signal: AbortSignal) => {
    expect(signal).toBeInstanceOf(AbortSignal); const bytes = this.objects.get(key) ?? null;
    if (bytes && bytes.length > max) throw new Error('OBJECT_TOO_LARGE'); return bytes;
  });
  readonly readReceipt = vi.fn(async (receipt: ObjectCustodyReceipt, _signal: AbortSignal) => {
    expect(_signal).toBeInstanceOf(AbortSignal);
    const bytes = this.objects.get(receipt.key); if (!bytes) throw new Error('OBJECT_MISSING'); return Buffer.from(bytes);
  });
}
const worker = (store = new MemoryStore(), customDb = db, leaseMs = 30_000, permit = vi.fn(async (jobId: string) => { expect(jobId).toMatch(/^JOB-/); })) =>
  new PublicationWorker(customDb, store, { permit, leaseMs });
beforeEach(async () => { await open(); await schema(); });
afterEach(async () => {
  await client?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  if (directory) {
    const within = relative(resolve(tmpdir()), resolve(directory));
    if (!within.startsWith('payload-publication-test-') || within.startsWith('..')) throw new Error('TEST_DIRECTORY_SCOPE');
    rmSync(directory, { recursive: true, force: true }); directory = undefined;
  }
});

describe('internal immutable result outbox, not another authorization system', () => {
  it('atomically binds exact canonical bytes, retains no payload copy, and makes retries idempotent', async () => {
    const saved = await result();
    expect(await db.transaction(sql => enqueuePublication(sql, saved.input))).toEqual(saved.publication);
    const row = (await client.query('SELECT * FROM payload_terminal_publication')).rows[0];
    expect(row).not.toHaveProperty('result'); expect(row).not.toHaveProperty('bytes');
    expect((await client.query('SELECT * FROM operation_proposal')).rows).toHaveLength(1);
    await expect(db.transaction(sql => enqueuePublication(sql, { ...saved.input, bytes: Buffer.from('changed') }))).rejects.toThrow('PUBLICATION_INTEGRITY_FAILURE');
    await expect(db.transaction(sql => enqueuePublication(sql, { ...saved.input, jobId: 'missing' }))).rejects.toThrow('PUBLICATION_RESULT_BINDING');
    await expect(db.transaction(sql => enqueuePublication(sql, { ...saved.input, resultDigest: `sha256:${'c'.repeat(64)}` }))).rejects.toThrow('PUBLICATION_INTEGRITY_FAILURE');
  });
  it('rolls back insertion of both result and publication if the parent transaction fails', async () => {
    await result();
    const before = (await client.query('SELECT * FROM payload_terminal_result')).rows;
    await expect(result('JOB-rollback', undefined, true)).rejects.toThrow('TEST_ABORT');
    expect((await client.query('SELECT * FROM payload_terminal_publication')).rows).toHaveLength(1);
    expect((await client.query('SELECT * FROM payload_terminal_result')).rows).toEqual(before);
    expect((await client.query("SELECT state FROM payload_terminal_job WHERE job_id='JOB-rollback'")).rows[0]).toEqual({ state: 'RUNNING' });
  });
  it('persists independently verified custody and exact replay without changing mining retrieval receipts', async () => {
    const saved = await result(), store = new MemoryStore(), run = worker(store);
    expect(await run.runNext()).toBe(true); expect(await run.runNext()).toBe(false);
    const published = await run.read(saved.publication.publicationId);
    expect(published).toMatchObject({ state: 'PUBLISHED', attempts: 1, byteDigest: saved.input.resultDigest });
    expect(published?.receiptDigest).toBe(commitment(published?.receipt));
    expect(store.readReceipt).toHaveBeenCalledTimes(1);
    expect(await db.transaction(sql => enqueuePublication(sql, saved.input))).toEqual(published);
    expect((await client.query('SELECT * FROM payload_terminal_receipt')).rows).toHaveLength(0);
    expect((await client.query('SELECT * FROM execution_attempt')).rows).toHaveLength(0);
  });
  it('allows concurrent workers to claim a pending row only once', async () => {
    await result(); const store = new MemoryStore();
    expect((await Promise.all([worker(store).runNext(), worker(store).runNext(), worker(store).runNext()])).sort()).toEqual([false, false, true]);
    expect(store.ensure).toHaveBeenCalledTimes(1);
  });
  it('enforces the configured database claim cap across different destinations', async () => {
    vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'conserve');
    await result(); const second = await result('JOB-two');
    await db.transaction(sql => enqueuePublication(sql, { ...second.input, destination: 'another:v1' }));
    const firstStore = new MemoryStore(), secondStore = new MemoryStore();
    Object.defineProperty(secondStore, 'destination', { value: 'another:v1' });
    let started!: () => void, resume!: () => void;
    const reached = new Promise<void>(resolveReached => { started = resolveReached; });
    const hold = new Promise<void>(resolveHold => { resume = resolveHold; });
    const ensure = firstStore.ensure.getMockImplementation()!;
    firstStore.ensure.mockImplementationOnce(async (...args) => { started(); await hold; return ensure(...args); });
    const active = worker(firstStore).runNext(); await reached;
    try { expect(await worker(secondStore).runNext()).toBe(false); expect(secondStore.ensure).not.toHaveBeenCalled(); }
    finally { resume(); await active; }
    expect(await worker(secondStore).runNext()).toBe(true);
  });
  it('recovers an unknown immutable write after file-backed close/reopen without duplicate objects', async () => {
    await client.close(); directory = mkdtempSync(join(tmpdir(), 'payload-publication-test-'));
    const path = join(directory, 'postgres'); await open(path); await schema();
    const saved = await result(), store = new MemoryStore(), ensure = store.ensure.getMockImplementation()!;
    store.ensure.mockImplementationOnce(async (...args) => { await ensure(...args); throw new Error('lost upload response password=secret'); });
    await worker(store).runNext();
    expect((await worker(store).read(saved.publication.publicationId))?.state).toBe('RECONCILE');
    await client.close(); await open(path); await installTerminalSchema(db);
    expect((await worker(store).list({ state: 'RECONCILE' })).publications).toHaveLength(1);
    await pause(1050); await worker(store).runNext();
    expect((await worker(store).read(saved.publication.publicationId))?.state).toBe('PUBLISHED');
    expect(store.objects.size).toBe(1); expect(store.ensure).toHaveBeenCalledTimes(2);
    expect(JSON.stringify((await client.query('SELECT * FROM payload_terminal_publication')).rows)).not.toContain('password');
  }, 30_000);
  it('handles an acknowledgement COMMIT response lost after commit without undoing a publication', async () => {
    const saved = await result(); let lost = false;
    const ambiguous: TerminalDatabase = { transaction: async work => {
      let acknowledgement = false;
      const value = await db.transaction(sql => work({ query: async <T>(statement: string, values?: unknown[]) => {
        if (statement.includes("SET state='PUBLISHED'")) acknowledgement = true;
        return sql.query<T>(statement, values);
      } }));
      if (acknowledgement && !lost) { lost = true; throw new Error('COMMIT_RESPONSE_LOST'); }
      return value;
    } };
    const store = new MemoryStore(); await worker(store, ambiguous).runNext();
    expect((await worker(store).read(saved.publication.publicationId))?.state).toBe('PUBLISHED');
    expect(await worker(store).runNext()).toBe(false); expect(store.ensure).toHaveBeenCalledTimes(1);
  });
  it('recovers when the acknowledgement transaction fails before committing', async () => {
    const saved = await result(); let failAck = true;
    const broken: TerminalDatabase = { transaction: work => db.transaction(sql => work({ query: async <T>(statement: string, values?: unknown[]) => {
      if (statement.includes("SET state='PUBLISHED'") && failAck) { failAck = false; throw new Error('private database failure'); }
      return sql.query<T>(statement, values);
    } })) };
    const store = new MemoryStore(); await worker(store, broken).runNext();
    expect((await worker(store).read(saved.publication.publicationId))?.state).toBe('RECONCILE');
    await pause(1050); await worker(store).runNext();
    expect((await worker(store).read(saved.publication.publicationId))?.state).toBe('PUBLISHED');
    expect(store.objects.size).toBe(1);
  });
  it('aborts a stalled adapter at a finite deadline and retains a discoverable unknown outcome', async () => {
    const saved = await result(), store = new MemoryStore(); let signal: AbortSignal | undefined;
    store.ensure.mockImplementationOnce(async (_key, _bytes, observed) => { signal = observed; return new Promise(() => {}); });
    await worker(store, db, 100).runNext();
    expect(signal?.aborted).toBe(true); expect(store.readReceipt).not.toHaveBeenCalled();
    expect(await worker(store).read(saved.publication.publicationId)).toMatchObject({ state: 'RECONCILE', receipt: null, failureCode: 'PUBLICATION_UNAVAILABLE' });
  });
  it('rediscoverably expires a crashed lease and fences its late acknowledgement', async () => {
    const saved = await result(), store = new MemoryStore();
    let entered!: () => void, resume!: () => void;
    const reached = new Promise<void>(resolveReached => { entered = resolveReached; });
    const held = new Promise<void>(resolveHeld => { resume = resolveHeld; });
    // Hold outside the database transaction, as a crashed worker would leave no SQL lock held.
    let calls = 0;
    const frozen: TerminalDatabase = { transaction: async work => {
      calls++; if (calls === 3) { entered(); await held; }
      return db.transaction(work);
    } };
    const stale = worker(store, frozen, 150).runNext(); await reached; await pause(180);
    const fresh = worker(store); expect(await fresh.runNext()).toBe(true);
    const prior = await fresh.read(saved.publication.publicationId); expect(prior?.attempts).toBe(2);
    resume(); await stale;
    expect(await fresh.read(saved.publication.publicationId)).toEqual(prior); expect(store.objects.size).toBe(1);
  });
  it('blocks tampered actual bytes rather than acknowledging a matching claimed digest', async () => {
    const saved = await result(), store = new MemoryStore();
    store.readReceipt.mockResolvedValueOnce(Buffer.from('tampered'));
    await worker(store).runNext();
    expect(await worker(store).read(saved.publication.publicationId)).toMatchObject({ state: 'BLOCKED', failureCode: 'PUBLICATION_INTEGRITY_FAILURE', receipt: null });
  });
  it.each(['null', 'undefined', ''])('refuses unversioned SOS custody receipt %j before readback', async versionId => {
    const saved = await result(), store = new MemoryStore(), ensure = store.ensure.getMockImplementation()!;
    store.ensure.mockImplementationOnce(async (...args) => ({ ...await ensure(...args), provider: 'exoscale-sos', versionId }));
    await worker(store).runNext();
    expect(store.readReceipt).not.toHaveBeenCalled();
    expect(await worker(store).read(saved.publication.publicationId)).toMatchObject({ state: 'BLOCKED', failureCode: 'PUBLICATION_INTEGRITY_FAILURE' });
  });
  it('does not expose raw database failures from claim, read, list or enqueue', async () => {
    const saved = await result();
    const unavailable: TerminalDatabase = { transaction: async () => { throw new Error('password=private /database/path'); } };
    const run = worker(new MemoryStore(), unavailable);
    await expect(run.runNext()).rejects.toThrow(/^PUBLICATION_UNAVAILABLE$/);
    await expect(run.read(saved.publication.publicationId)).rejects.toThrow(/^PUBLICATION_UNAVAILABLE$/);
    await expect(run.list()).rejects.toThrow(/^PUBLICATION_UNAVAILABLE$/);
    await expect(enqueuePublication({ query: async () => { throw new Error('private sql'); } }, saved.input)).rejects.toThrow(/^PUBLICATION_UNAVAILABLE$/);
  });
  it('rechecks retention before each storage operation and refuses before any write when unavailable', async () => {
    const saved = await result(), store = new MemoryStore(), permit = vi.fn(async () => { throw new Error('private licence details'); });
    await worker(store, db, 30_000, permit).runNext();
    expect(store.ensure).not.toHaveBeenCalled(); expect(store.readReceipt).not.toHaveBeenCalled();
    expect(await worker(store).read(saved.publication.publicationId)).toMatchObject({ state: 'RECONCILE', failureCode: 'PUBLICATION_PERMISSION_UNAVAILABLE' });
  });
  it('preserves old results, objects and receipts when a correction produces new bytes', async () => {
    const first = await result(), store = new MemoryStore(), run = worker(store); await run.runNext();
    const old = await run.read(first.publication.publicationId), bytes = Buffer.from(store.objects.get(first.publication.objectKey)!);
    const next = await result('JOB-correction', 'JOB-one'); await run.runNext();
    expect(next.publication.objectKey).not.toBe(first.publication.objectKey);
    expect(await run.read(first.publication.publicationId)).toEqual(old);
    expect(store.objects.get(first.publication.objectKey)).toEqual(bytes); expect(store.objects.size).toBe(2);
    expect((await client.query('SELECT result FROM payload_terminal_result WHERE job_id=$1', ['JOB-one'])).rows[0]).toEqual({ result: first.value });
  });
  it('enforces database immutable bindings, terminal receipts, state order and no-delete guards', async () => {
    const saved = await result(), run = worker();
    await expect(client.query("UPDATE payload_terminal_publication SET destination='changed'")).rejects.toThrow('publication_binding_immutable');
    await expect(client.query("UPDATE payload_terminal_publication SET state='RECONCILE'")).rejects.toThrow('publication_transition_invalid');
    await expect(client.query('DELETE FROM payload_terminal_publication')).rejects.toThrow('publication_immutable');
    await run.runNext();
    await expect(client.query("UPDATE payload_terminal_publication SET receipt='{}'")).rejects.toThrow('publication_immutable');
    await expect(client.query('UPDATE payload_terminal_publication SET attempts=0')).rejects.toThrow('publication_immutable');
    await expect(client.query('DELETE FROM payload_terminal_result WHERE job_id=$1', [saved.input.jobId])).rejects.toThrow('terminal_immutable');
  });
  it('bounds queue reservation and discovery and isolates destinations', async () => {
    await result(); const run = worker();
    expect(await db.transaction(sql => publicationHasCapacity(sql, 998))).toBe(true);
    expect(await db.transaction(sql => publicationHasCapacity(sql, 999))).toBe(false);
    await expect(db.transaction(sql => publicationHasCapacity(sql, 1001))).rejects.toThrow('PUBLICATION_LIMIT_INVALID');
    await expect(run.list({ limit: 101 })).rejects.toThrow('PUBLICATION_LIMIT_INVALID');
    await result('JOB-two');
    const page = await run.list({ limit: 1 }); expect(page.publications).toHaveLength(1); expect(page.nextCursor).not.toBeNull();
    expect((await run.list({ after: page.nextCursor!, limit: 1 })).publications).toHaveLength(1);
    const store = new MemoryStore(); Object.defineProperty(store, 'destination', { value: 'other:v1' });
    expect((await worker(store).list()).publications).toHaveLength(0); expect(await worker(store).runNext()).toBe(false);
  });
});
