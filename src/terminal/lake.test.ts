import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from '@/adapter/corpusSource';
import { FIXTURE_CORPORA } from '@/fixtures';
import { canonicalJson } from '@/fixtures/digest';
import { objectDigest, type ImmutableObjectStore, type ObjectCustodyReceipt } from '@/data-os/immutable-object-store';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal } from './auth';
import { commitment, MINING_CAPABILITY } from './contracts';
import type { TerminalDatabase } from './database';
import { computeMining } from './mining';
import { createPublicationWorker } from './retention';
import { installTerminalSchema } from './schema';
import { TerminalService } from './service';
import { publishTerminalLake, type TerminalLakeManifest, type TerminalLakeReceipt, type TerminalLakeRun } from './lake';

const CORPUS = 'landshark.terminal-parcels';
const RELEASE = 'REL-LS-2026.08.20';
const METHOD = `sha256:${'a'.repeat(64)}`;
const DESTINATION = `sha256:${'b'.repeat(64)}`;
const LAKE = `sha256:${'c'.repeat(64)}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let client: PGlite, db: TerminalDatabase, source: FixtureCorpusSource, store: MemoryStore, service: TerminalService;
let principal: AuthenticatedTerminal, reviewer: AuthenticatedTerminal, publicationId: string;
class MemoryStore implements ImmutableObjectStore {
  readonly destination = DESTINATION;
  provider: 'local' | 'exoscale-sos' = 'local';
  readonly objects = new Map<string, Buffer>();
  async ensure(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<ObjectCustodyReceipt> {
    expect(signal.aborted).toBe(false);
    const old = this.objects.get(key); if (old && !old.equals(Buffer.from(bytes))) throw new Error('IMMUTABLE_CONFLICT');
    this.objects.set(key, Buffer.from(bytes));
    return { schema: 'payload.object-custody.v1', provider: this.provider, destination: DESTINATION, key, byteLength: bytes.length, contentDigest: objectDigest(bytes),
      versionId: this.provider === 'local' ? null : 'fixture-exact-sos-version' };
  }
  async get(key: string, max: number, signal: AbortSignal) {
    expect(signal.aborted).toBe(false); const bytes = this.objects.get(key);
    if (bytes && bytes.length > max) throw new Error('OBJECT_LIMIT'); return bytes ?? null;
  }
  readonly readReceipt = vi.fn(async (receipt: ObjectCustodyReceipt, signal: AbortSignal) => {
    const bytes = await this.get(receipt.key, receipt.byteLength, signal);
    if (!bytes || objectDigest(bytes) !== receipt.contentDigest) throw new Error('OBJECT_INTEGRITY_FAILED'); return Buffer.from(bytes);
  });
}
function fakeExecutor() {
  const publications = new Map<string, TerminalLakeReceipt>();
  return vi.fn<TerminalLakeRun>(async (mode, input) => {
    if (mode === 'publish') {
      const manifest = clone(input as TerminalLakeManifest), saved = publications.get(manifest.publication_id);
      if (saved) return clone(saved);
      const receipt: TerminalLakeReceipt = { schema: 'payload.terminal-lake-receipt.v1', table: 'terminal.result_publications',
        table_uuid: '00000000-0000-4000-8000-000000000001', snapshot_id: '9223372036854775807',
        publication_id: manifest.publication_id, input_digest: manifest.input_digest, record_count: 1, snapshot_record_count: publications.size + 1,
        manifest, fixture_only: true, canonical_admission: false, source_permissions_verified: false, artifact_bytes_verified_by_python: false };
      publications.set(manifest.publication_id, receipt); return clone(receipt);
    }
    const saved = publications.get(input.publication_id); if (!saved) throw new Error('TEST_PUBLICATION_MISSING'); return clone(saved);
  });
}
async function prepare(releaseId = RELEASE, correction?: { jobId: string; reason: string }) {
  const pin = await service.command(principal, { command: 'pin', releaseId }) as { snapshotDigest: string };
  const job = await service.submit(principal, { capability: MINING_CAPABILITY, releaseId, snapshotDigest: pin.snapshotDigest, methodDigest: METHOD,
    retentionDestination: DESTINATION, parameters: { minRecords: 1 }, idempotencyKey: `key-${releaseId}`, ...(correction ? { correction } : {}),
    budget: { maxRows: 1000, maxInputBytes: 1_048_576, maxOutputBytes: 1_048_576, timeoutMs: 5000 } });
  await service.review(reviewer, { jobId: job.jobId, actionDigest: job.actionDigest, response: 'APPROVE', reason: 'Fixture-only exact action review.' });
  await service.runNext();
  const entries = (await createPublicationWorker(db, source, store).list()).publications;
  return { job, publicationId: entries.find(entry => entry.jobId === job.jobId)!.publicationId };
}
async function publishObject() { await createPublicationWorker(db, source, store).runNext(); store.readReceipt.mockClear(); }
const project = (run: TerminalLakeRun, database = db, destination = LAKE) => publishTerminalLake(database, source, store, publicationId, destination, run);
const acknowledgements = async () => (await client.query<{ publication_id: string; receipt: unknown }>('SELECT * FROM payload_terminal_lake_receipt ORDER BY publication_id')).rows;
beforeEach(async () => {
  client = new PGlite(); await client.waitReady;
  db = { transaction: work => client.transaction(tx => work({ query: async <T>(sql: string, values?: unknown[]) => values === undefined
    ? { rows: (await tx.exec(sql)).flatMap(result => result.rows as T[]) } : { rows: (await tx.query<T>(sql, values)).rows } })) };
  await client.exec(`CREATE TABLE corpora(corpus_id text PRIMARY KEY,domain text,title text,description text,data jsonb);
    CREATE TABLE releases(release_id text PRIMARY KEY,corpus_id text REFERENCES corpora(corpus_id),status text,known_at timestamptz,data jsonb);`);
  const corpus = FIXTURE_CORPORA.find(item => item.corpusId === CORPUS)!;
  expect(corpus.fixture_only).toBe(true);
  await client.query('INSERT INTO corpora VALUES($1,$2,$3,$4,$5::jsonb)', [CORPUS, corpus.domain, corpus.title, corpus.description, JSON.stringify(corpus)]);
  for (const release of corpus.releases) await client.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5::jsonb)', [release.releaseId, CORPUS, release.status, release.knownAt, JSON.stringify(release)]);
  await installTerminalSchema(db); source = new FixtureCorpusSource(); store = new MemoryStore();
  service = new TerminalService(db, source, () => METHOD, async work => computeMining(work), DESTINATION);
  const entries = [
    { principalId: 'lake-agent', terminalId: 'lake-terminal', displayName: 'Fixture agent', kind: 'AGENT', canReview: false, tokenSha256: tokenDigest('a'.repeat(48)) },
    { principalId: 'lake-human', terminalId: 'lake-review', displayName: 'Fixture reviewer', kind: 'HUMAN', canReview: true, tokenSha256: tokenDigest('r'.repeat(48)) },
  ].map(entry => ({ ...entry, terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: [CORPUS], expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
  const identity = (token: string) => authenticateTerminal(new Request('http://localhost/internal', { headers: { authorization: `Bearer ${token.repeat(48)}` } }), JSON.stringify(entries));
  principal = identity('a'); reviewer = identity('r'); publicationId = (await prepare()).publicationId;
});
afterEach(async () => { await client?.close(); vi.restoreAllMocks(); });

describe('fixture lake projection acknowledgement over verified immutable artifacts', () => {
  it.each(['local','exoscale-sos'] as const)('builds a closed manifest from exact %s version bytes and performs independent publish/read calls before acknowledgement', async provider => {
    store.provider = provider; await publishObject(); const run = fakeExecutor();
    const answer = await project(run);
    expect(run.mock.calls.map(call => call[0])).toEqual(['publish', 'read']); expect(store.readReceipt).toHaveBeenCalledTimes(1);
    expect(store.readReceipt.mock.calls[0][0]).toMatchObject({ provider, versionId: provider === 'local' ? null : 'fixture-exact-sos-version' });
    const manifest = run.mock.calls[0][1] as TerminalLakeManifest;
    expect(Object.keys(manifest).sort()).toEqual(['input_digest','publication_id','records','schema']);
    expect(Object.keys(manifest.records[0]).sort()).toEqual(['artifact_digest','corpus_id','corrects_job_id','fixture_only','job_id','known_at','object_key','release_id','result_digest']);
    expect(manifest.input_digest).toBe(commitment({ schema: manifest.schema, publication_id: publicationId, records: manifest.records }));
    expect(manifest.records[0]).toMatchObject({ corpus_id: CORPUS, release_id: RELEASE, known_at: '2026-08-20T09:00:00.000Z', fixture_only: true, corrects_job_id: null });
    expect(answer.receipt.snapshot_id).toBe('9223372036854775807'); expect(typeof answer.receipt.snapshot_id).toBe('string');
    expect(answer.receiptDigest).toBe(commitment(answer.receipt)); expect(await acknowledgements()).toHaveLength(1);
    expect((await client.query('SELECT * FROM execution_attempt')).rows).toHaveLength(1);
    expect((await client.query('SELECT * FROM payload_terminal_receipt')).rows).toHaveLength(0);
  });
  it('requires a published outbox and actual matching bytes before any Python invocation', async () => {
    const run = fakeExecutor();
    await expect(project(run)).rejects.toThrow('LAKE_PUBLICATION_REQUIRED'); expect(run).not.toHaveBeenCalled();
    await publishObject(); store.readReceipt.mockResolvedValueOnce(Buffer.from('tampered'));
    await expect(project(run)).rejects.toThrow('LAKE_OBJECT_INTEGRITY'); expect(run).not.toHaveBeenCalled(); expect(await acknowledgements()).toHaveLength(0);
  });
  it('refuses unavailable current permission before storage access or Python work', async () => {
    await publishObject(); const run = fakeExecutor(); vi.spyOn(source, 'getRelease').mockResolvedValue(undefined);
    await expect(project(run)).rejects.toThrow('LAKE_PERMISSION_UNAVAILABLE');
    expect(store.readReceipt).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(await acknowledgements()).toHaveLength(0);
  });
  it('refuses permission lost after Python publication and never acknowledges that projection', async () => {
    await publishObject(); const run = fakeExecutor(), execute = run.getMockImplementation()!;
    run.mockImplementationOnce(async (...args) => { const response = await execute(...args); vi.spyOn(source, 'getRelease').mockResolvedValue(undefined); return response; });
    await expect(project(run)).rejects.toThrow('LAKE_PERMISSION_UNAVAILABLE');
    expect(run.mock.calls.map(call => call[0])).toEqual(['publish']); expect(await acknowledgements()).toHaveLength(0);
  });
  it('refuses a nonfixture retained result rather than relabelling real data as a fixture', async () => {
    await publishObject(); const run = fakeExecutor();
    const changed: TerminalDatabase = { transaction: work => db.transaction(sql => work({ query: async <T>(statement: string, values?: unknown[]) => {
      const response = await sql.query<T>(statement, values);
      if (statement.startsWith('SELECT j.job_id')) for (const row of response.rows as Array<{ result: Record<string, unknown> }>) row.result.fixture_only = false;
      return response;
    } })) };
    await expect(project(run, changed)).rejects.toThrow('LAKE_FIXTURE_ONLY'); expect(run).not.toHaveBeenCalled(); expect(store.readReceipt).not.toHaveBeenCalled();
  });
  it.each([{ extra: true }, { table_uuid: 'not-a-uuid' }, { snapshot_id: 9223372036854775807 }, { snapshot_id: '9223372036854775808' },
    { snapshot_id: 'not-a-number' }, { record_count: 2 }, { snapshot_record_count: 10_001 }, { canonical_admission: true }, { artifact_bytes_verified_by_python: true }])
  ('rejects a malformed or promoted closed Python response: %j', async change => {
    await publishObject(); const run = fakeExecutor(), execute = run.getMockImplementation()!;
    run.mockImplementationOnce(async (...args) => ({ ...await execute(...args) as TerminalLakeReceipt, ...change }));
    await expect(project(run)).rejects.toThrow('LAKE_RESPONSE_INVALID'); expect(await acknowledgements()).toHaveLength(0);
  });
  it('refuses changed original manifest and differing fresh snapshot readback', async () => {
    await publishObject(); const run = fakeExecutor(), execute = run.getMockImplementation()!;
    run.mockImplementationOnce(async (...args) => {
      const response = await execute(...args) as TerminalLakeReceipt; response.manifest.records[0].corpus_id = 'wrong'; return response;
    });
    await expect(project(run)).rejects.toThrow('LAKE_RESPONSE_BINDING'); expect(await acknowledgements()).toHaveLength(0);
    const different = fakeExecutor(), actual = different.getMockImplementation()!;
    different.mockImplementation(async (...args) => { const response = await actual(...args) as TerminalLakeReceipt; if (args[0] === 'read') response.snapshot_id = '1'; return response; });
    await expect(project(different)).rejects.toThrow('LAKE_READBACK_MISMATCH'); expect(await acknowledgements()).toHaveLength(0);
  });
  it('never allows an executor to mutate the expected manifest while returning an altered echo', async () => {
    await publishObject(); const run = fakeExecutor(), actual = run.getMockImplementation()!;
    run.mockImplementationOnce(async (mode, input) => {
      const manifest = input as TerminalLakeManifest; manifest.records[0].corpus_id = 'mutated';
      manifest.input_digest = commitment({ schema: manifest.schema, publication_id: manifest.publication_id, records: manifest.records });
      return actual(mode, manifest);
    });
    await expect(project(run)).rejects.toThrow('LAKE_RESPONSE_BINDING'); expect(await acknowledgements()).toHaveLength(0);
  });
  it('retries existing acknowledgements by fresh read only and refuses any changed receipt', async () => {
    await publishObject(); const run = fakeExecutor(), first = await project(run);
    const second = await project(run); expect(second).toEqual(first); expect(run.mock.calls.map(call => call[0])).toEqual(['publish','read','read']);
    const actual = run.getMockImplementation()!;
    run.mockImplementationOnce(async (...args) => ({ ...await actual(...args) as TerminalLakeReceipt, table_uuid: '00000000-0000-4000-8000-000000000099' }));
    await expect(project(run)).rejects.toThrow('LAKE_READBACK_MISMATCH'); expect(await acknowledgements()).toHaveLength(1);
  });
  it('recovers a lost SQL COMMIT response through durable equality without republishing', async () => {
    await publishObject(); const run = fakeExecutor(); let lost = false;
    const ambiguous: TerminalDatabase = { transaction: async work => {
      let writes = false;
      const value = await db.transaction(sql => work({ query: async <T>(statement: string, values?: unknown[]) => {
        if (statement.startsWith('INSERT INTO payload_terminal_lake_receipt')) writes = true;
        return sql.query<T>(statement, values);
      } }));
      if (writes && !lost) { lost = true; throw new Error('COMMIT_RESPONSE_LOST secret'); } return value;
    } };
    await expect(project(run, ambiguous)).rejects.toThrow(/^LAKE_UNAVAILABLE$/); expect(await acknowledgements()).toHaveLength(1);
    await project(run); expect(run.mock.calls.map(call => call[0])).toEqual(['publish','read','read']); expect(await acknowledgements()).toHaveLength(1);
  });
  it('keeps acknowledged rows immutable and prior correction snapshots exact', async () => {
    await publishObject(); const run = fakeExecutor(), old = await project(run), originalId = publicationId;
    const previousJob = old.receipt.manifest.records[0].job_id;
    const next = await prepare('REL-LS-2026.09.01', { jobId: previousJob, reason: 'Later fixture vintage; prior candidate remains retained.' });
    publicationId = next.publicationId; await publishObject(); const correction = await project(run);
    expect(correction.receipt.manifest.records[0]).toMatchObject({ corrects_job_id: previousJob, known_at: '2026-09-01T12:00:00.000Z' });
    publicationId = originalId; expect(await project(run)).toEqual(old);
    await expect(client.query("UPDATE payload_terminal_lake_receipt SET receipt='{}'")).rejects.toThrow('terminal_lake_receipt_immutable');
    await expect(client.query('DELETE FROM payload_terminal_lake_receipt')).rejects.toThrow('terminal_lake_receipt_immutable');
    expect(await acknowledgements()).toHaveLength(2);
    expect(canonicalJson((await acknowledgements()).map(row => row.receipt))).not.toContain('"canonical_admission":true');
  });
});
