import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from '@/adapter/corpusSource';
import { FIXTURE_CORPORA } from '@/fixtures';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal, type TerminalRegistration } from './auth';
import { commitment, MINING_CAPABILITY, type MiningRequest } from './contracts';
import type { TerminalDatabase } from './database';
import { computeMining, type MiningExecutor, type MiningSnapshot } from './mining';
import { installTerminalSchema } from './schema';
import { TerminalService } from './service';
import { LocalImmutableObjectStore } from '@/data-os/local-immutable-object-store';
import { createPublicationWorker } from './retention';

const METHOD = `sha256:${'a'.repeat(64)}`;
const CORPUS = 'landshark.terminal-parcels';
const FIRST_RELEASE = 'REL-LS-2026.08.20';
const NEXT_RELEASE = 'REL-LS-2026.09.01';

let directory: string;
let dataDir: string;
let client: PGlite;
let database: TerminalDatabase;
let source: FixtureCorpusSource;
let execute: ReturnType<typeof vi.fn<MiningExecutor>>;
let service: TerminalService;
let first: AuthenticatedTerminal;
let second: AuthenticatedTerminal;
let reviewer: AuthenticatedTerminal;
let otherOwner: AuthenticatedTerminal;
let otherCorpus: AuthenticatedTerminal;

function connection(pg: PGlite): TerminalDatabase {
  return { transaction: work => pg.transaction(tx => work({
    query: async <T>(sql: string, values?: unknown[]) => {
      // pg permits a parameterless multi-statement schema migration; PGlite's
      // equivalent is exec, with all statements still in this same transaction.
      if (values !== undefined) return { rows: (await tx.query<T>(sql, values)).rows };
      return { rows: (await tx.exec(sql)).flatMap(result => result.rows as T[]) };
    },
  })) };
}
async function open() {
  client = new PGlite(dataDir); await client.waitReady;
  database = connection(client);
  service = new TerminalService(database, source, () => METHOD, execute);
}
async function restart() {
  const previous = client;
  await client.close();
  await open();
  expect(client).not.toBe(previous);
  await installTerminalSchema(database);
}
async function counts() {
  return (await client.query<{ proposals: number; reviews: number; jobs: number; results: number; receipts: number; attempts: number; reconciliations: number }>(`SELECT
    (SELECT count(*)::int FROM operation_proposal) proposals,
    (SELECT count(*)::int FROM proposal_review) reviews,
    (SELECT count(*)::int FROM payload_terminal_job) jobs,
    (SELECT count(*)::int FROM payload_terminal_result) results,
    (SELECT count(*)::int FROM payload_terminal_receipt) receipts,
    (SELECT count(*)::int FROM execution_attempt) attempts,
    (SELECT count(*)::int FROM attempt_reconciliation) reconciliations`)).rows[0];
}
async function pin(releaseId = FIRST_RELEASE) {
  return await service.command(first, { command: 'pin', releaseId }) as { snapshotDigest: string; snapshot: MiningSnapshot };
}
async function prepare(key = 'qualification-one', releaseId = FIRST_RELEASE, correction?: MiningRequest['correction']) {
  const pinned = await pin(releaseId);
  const request: MiningRequest = {
    capability: MINING_CAPABILITY, releaseId, snapshotDigest: pinned.snapshotDigest, methodDigest: METHOD,
    parameters: { minRecords: 1 }, budget: { maxRows: 1000, maxInputBytes: 1_048_576, maxOutputBytes: 1_048_576, timeoutMs: 5000 },
    idempotencyKey: key, ...(correction ? { correction } : {}),
  };
  return { pinned, request };
}
async function proposal(key = 'qualification-one', releaseId = FIRST_RELEASE, correction?: MiningRequest['correction']) {
  const { pinned, request } = await prepare(key, releaseId, correction);
  const job = await service.submit(first, request);
  return { pinned, request, job };
}
async function approve(job: Awaited<ReturnType<TerminalService['submit']>>) {
  return service.review(reviewer, { jobId: job.jobId, actionDigest: job.actionDigest, response: 'APPROVE', reason: 'Fixture-only deterministic computation; exact digest, source scope and bounded budget inspected.' });
}
function authenticate() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const base = { principalId: 'PRINCIPAL-MINER', displayName: 'Fixture mining principal', kind: 'AGENT', terminalClass: 'FIRM_INTERNAL',
    purpose: 'internal_research', corpusScope: [CORPUS], canReview: false, expiresAt } as const;
  const registrations: TerminalRegistration[] = [
    { ...base, corpusScope: [...base.corpusScope], terminalId: 'TERMINAL-A', tokenSha256: tokenDigest('a'.repeat(48)) },
    { ...base, corpusScope: [...base.corpusScope], terminalId: 'TERMINAL-B', tokenSha256: tokenDigest('b'.repeat(48)) },
    { ...base, corpusScope: [...base.corpusScope], principalId: 'PRINCIPAL-REVIEWER', displayName: 'Fixture human reviewer', kind: 'HUMAN', canReview: true, terminalId: 'TERMINAL-R', tokenSha256: tokenDigest('r'.repeat(48)) },
    { ...base, corpusScope: [...base.corpusScope], principalId: 'PRINCIPAL-OTHER', terminalId: 'TERMINAL-O', tokenSha256: tokenDigest('o'.repeat(48)) },
    { ...base, corpusScope: ['caravan.specialty-cargo'], principalId: 'PRINCIPAL-OTHER-CORPUS', terminalId: 'TERMINAL-X', tokenSha256: tokenDigest('x'.repeat(48)) },
  ];
  const config = JSON.stringify(registrations);
  const minted = (token: string) => authenticateTerminal(new Request('http://localhost/api/terminal', { headers: { authorization: `Bearer ${token.repeat(48)}` } }), config);
  first = minted('a'); second = minted('b'); reviewer = minted('r'); otherOwner = minted('o'); otherCorpus = minted('x');
}

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'payload-terminal-durable-test-'));
  dataDir = join(directory, 'postgres');
  source = new FixtureCorpusSource();
  execute = vi.fn<MiningExecutor>(async work => computeMining(work));
  vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'normal');
  vi.stubEnv('PAYLOAD_MAX_CHILD_PROCESSES', '4');
  vi.stubEnv('PAYLOAD_DB_POOL_MAX', '10');
  authenticate(); await open();
  // Exact existing corpus/release table names and fixture rows back the ledger's
  // real foreign keys. No alternate canonical corpus_record table is introduced.
  await client.exec(`CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, title text NOT NULL, description text NOT NULL, data jsonb NOT NULL);
    CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);`);
  for (const corpus of FIXTURE_CORPORA) {
    expect(corpus.fixture_only).toBe(true);
    await client.query('INSERT INTO corpora VALUES($1,$2,$3,$4,$5::jsonb)', [corpus.corpusId, corpus.domain, corpus.title, corpus.description, JSON.stringify(corpus)]);
    for (const release of corpus.releases) {
      expect(release.fixture_only).toBe(true);
      await client.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5::jsonb)', [release.releaseId, corpus.corpusId, release.status, release.knownAt, JSON.stringify(release)]);
    }
  }
  await installTerminalSchema(database);
}, 30_000);
afterEach(async () => {
  await client?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs();
  const insideTemp = relative(resolve(tmpdir()), resolve(directory));
  expect(insideTemp.startsWith('..')).toBe(false);
  expect(insideTemp).toMatch(/^payload-terminal-durable-test-/);
  rmSync(directory, { recursive: true, force: true });
}, 30_000);

describe('file-backed terminal service qualification, not production admission', () => {
  it('persists scoped read receipts without minting proposals and withholds delivery when the audit write fails', async () => {
    const served = await service.command(first, { command: 'read', tool: 'list_releases', args: {} }) as { recording: { status: string }; result: unknown };
    expect(served.recording.status).toBe('RECORDED');
    expect(JSON.stringify(served.result)).not.toContain('REL-CAR-');
    expect((await client.query<{ count: number }>('SELECT count(*)::int count FROM served_call')).rows[0].count).toBe(1);
    expect(await counts()).toMatchObject({ proposals: 0, jobs: 0, results: 0 });
    const unavailable = new TerminalService({ transaction: async () => { throw new Error('secret database connection detail'); } }, source, () => METHOD, execute);
    await expect(unavailable.command(first, { command: 'read', tool: 'list_releases', args: {} })).rejects.toThrow('READ_RECEIPT_UNAVAILABLE');
    expect((await service.command(first, { command: 'read', tool: 'unknown_tool', args: {} }) as { recording: { code: string } }).recording.code).toBe('READ_RECEIPT_UNSUPPORTED');
  });

  it('can deny exact proposals after worker rebuild or source disappearance, without permitting execution', async () => {
    const a = await proposal('deny-after-build');
    const b = await proposal('deny-after-source');
    const rebuilt = new TerminalService(database, source, () => `sha256:${'b'.repeat(64)}`, execute);
    await expect(rebuilt.review(reviewer, { jobId: a.job.jobId, actionDigest: a.job.actionDigest, response: 'APPROVE', reason: 'Wrong binary' })).rejects.toThrow('REVIEW_DIGEST_MISMATCH');
    expect((await rebuilt.review(reviewer, { jobId: a.job.jobId, actionDigest: a.job.actionDigest, response: 'DENY', reason: 'Binary changed' })).state).toBe('DENIED');
    vi.spyOn(source, 'getRelease').mockRejectedValue(new Error('SOURCE_UNAVAILABLE'));
    expect((await service.review(reviewer, { jobId: b.job.jobId, actionDigest: b.job.actionDigest, response: 'DENY', reason: 'Source unavailable' })).state).toBe('DENIED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('retains proposal across an actual database close/reopen, then returns the same cited result to two authenticated clients', async () => {
    const { pinned, request, job } = await proposal();
    expect(job).toMatchObject({ state: 'PROPOSED', ownerId: first.principalId, fixture_only: true, attempts: 0 });
    expect(pinned.snapshot.records.length).toBeGreaterThan(0);
    expect(pinned.snapshot.records.every(record => record.provenance.sourceId === 'cadastral-registry')).toBe(true);
    expect(pinned.snapshot.selection).toBe('PERMITTED_STANDING_RECORDS');
    expect(pinned.snapshot.coverage).toEqual({ standingRecords: 5, selectedRecords: 3, withheldByPermission: 2 });
    expect(pinned.snapshot.sources.map(used => used.sourceId)).toEqual(['cadastral-registry']);
    expect(pinned.snapshot.records.map(record => record.recordId)).not.toContain('LS-0102');
    expect(pinned.snapshot.records.map(record => record.recordId)).not.toContain('LS-0112');
    expect(await counts()).toMatchObject({ proposals: 1, jobs: 1, reviews: 0, results: 0, attempts: 0 });
    expect(await service.runNext()).toBe(false); expect(execute).not.toHaveBeenCalled();
    await restart();
    expect(await service.getJob(second, job.jobId)).toEqual(job);
    expect(await service.submit(second, request)).toEqual(job);
    expect((await approve(job)).state).toBe('QUEUED');
    expect(await service.runNext()).toBe(true);
    expect((await service.getJob(first, job.jobId)).state).toBe('SUCCEEDED');
    const a = await service.result(first, job.jobId), b = await service.result(second, job.jobId);
    expect(a.result).toEqual(b.result); expect(a.resultDigest).toBe(b.resultDigest);
    expect(commitment(a.result)).toBe(a.resultDigest);
    expect(a.result).toMatchObject({ validation: 'NOT_VALIDATED', fixture_only: true, snapshotDigest: pinned.snapshotDigest, methodDigest: METHOD,
      citations: pinned.snapshot.records.map(record => ({ recordId: record.recordId, knownAt: record.knownAt, sourceId: record.provenance.sourceId, recordDigest: commitment(record) })) });
    expect(a.receipt).toMatchObject({ principalId: first.principalId, terminalId: first.terminalId, fixture_only: true });
    expect(b.receipt).toMatchObject({ principalId: second.principalId, terminalId: second.terminalId, fixture_only: true });
    expect(a.receiptDigest).not.toBe(b.receiptDigest);
    expect(await counts()).toEqual({ proposals: 1, jobs: 1, reviews: 1, results: 1, receipts: 2, attempts: 1, reconciliations: 1 });
    await restart();
    expect(await service.result(first, job.jobId)).toEqual(a);
    expect(await service.result(second, job.jobId)).toEqual(b);
    expect(await service.runNext()).toBe(false); expect(execute).toHaveBeenCalledOnce();
    expect((await client.query<{ table: string | null }>("SELECT to_regclass('public.corpus_record')::text AS table")).rows[0].table).toBeNull();
  }, 30_000);

  it('creates one durable job for concurrent exact idempotent submissions and refuses changed payload under the same key', async () => {
    const { request } = await prepare();
    expect(await counts()).toMatchObject({ proposals: 0, jobs: 0 });
    const repeats = await Promise.all([service.submit(first, request), service.submit(second, request), service.submit(first, request)]);
    const job = repeats[0];
    expect(repeats.every(repeated => repeated.jobId === job.jobId)).toBe(true);
    await expect(service.submit(second, { ...request, parameters: { minRecords: 2 } })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(await counts()).toMatchObject({ jobs: 1, proposals: 1, reviews: 0, attempts: 0 });
    expect(execute).not.toHaveBeenCalled();
    await restart(); expect(await service.submit(first, request)).toEqual(job);
  });

  it('requires a human review of the exact action digest and permits denial without execution', async () => {
    const { job } = await proposal();
    const review = { jobId: job.jobId, actionDigest: job.actionDigest, response: 'APPROVE', reason: 'Fixture qualification review.' };
    await expect(service.review(first, review)).rejects.toMatchObject({ code: 'REVIEW_AUTHORITY_REQUIRED', status: 403 });
    await expect(service.review(reviewer, { ...review, actionDigest: `sha256:${'b'.repeat(64)}` })).rejects.toMatchObject({ code: 'REVIEW_DIGEST_MISMATCH' });
    expect(await counts()).toMatchObject({ reviews: 0, attempts: 0, results: 0 });
    expect((await service.review(reviewer, { ...review, response: 'DENY' })).state).toBe('DENIED');
    await expect(service.review(reviewer, review)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_REVIEWED' });
    expect(await service.runNext()).toBe(false); expect(execute).not.toHaveBeenCalled();
    expect(await counts()).toMatchObject({ reviews: 1, attempts: 0, results: 0 });
  });

  it('refuses another owner and a different corpus scope without disclosing jobs or results', async () => {
    const { job } = await proposal(); await approve(job); await service.runNext();
    const before = await counts();
    for (const who of [otherOwner, otherCorpus]) {
      await expect(service.getJob(who, job.jobId)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
      await expect(service.result(who, job.jobId)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
      expect(await service.command(who, { command: 'jobs' })).toEqual({ jobs: [], nextCursor: null });
    }
    await expect(service.command(otherCorpus, { command: 'pin', releaseId: FIRST_RELEASE })).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    expect(await counts()).toEqual(before);
  });

  it('reconciles an expired pure-computation lease and fences the stale worker from an extra result commit', async () => {
    const { job } = await proposal(); await approve(job);
    let releaseHeld!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolveStarted => { started = resolveStarted; });
    const held = new Promise<void>(resolveHeld => { releaseHeld = resolveHeld; });
    execute.mockImplementationOnce(async work => { started(); await held; return computeMining(work); });
    const staleWorker = service.runNext();
    await entered;
    try {
      const running = await service.getJob(first, job.jobId);
      expect(running).toMatchObject({ state: 'RUNNING', attempts: 1 });
      expect(await counts()).toMatchObject({ attempts: 1, reconciliations: 0, results: 0 });
      // Test-only simulated lapse. No production API can edit a lease or claim.
      await client.query("UPDATE payload_terminal_job SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1", [job.jobId]);
      const recovery = new TerminalService(connection(client), source, () => METHOD, execute);
      expect(await recovery.runNext()).toBe(true);
      expect(await recovery.getJob(first, job.jobId)).toMatchObject({ state: 'SUCCEEDED', attempts: 2 });
      const committed = await recovery.result(first, job.jobId);
      releaseHeld(); await staleWorker;
      expect(await service.result(first, job.jobId)).toEqual(committed);
      expect(await counts()).toMatchObject({ attempts: 2, reconciliations: 2, results: 1, receipts: 1 });
      expect((await client.query<{ found: string }>('SELECT found FROM attempt_reconciliation ORDER BY reconciliation_id')).rows.map(row => row.found).sort()).toEqual(['DID_HAPPEN', 'DID_NOT_HAPPEN']);
      expect(execute).toHaveBeenCalledTimes(2);
    } finally { releaseHeld(); await staleWorker; }
    await restart(); expect(await service.getJob(first, job.jobId)).toMatchObject({ state: 'SUCCEEDED', attempts: 2 });
  }, 30_000);

  it('records a newer fixture vintage as a reviewed correction while preserving the old result and both retrieval receipts', async () => {
    const original = await proposal(); await approve(original.job); await service.runNext();
    const oldA = await service.result(first, original.job.jobId), oldB = await service.result(second, original.job.jobId);
    const correction = await proposal('qualification-correction', NEXT_RELEASE, { jobId: original.job.jobId, reason: 'Later fixture vintage changes retained cadastral evidence; the earlier candidate remains available.' });
    expect(correction.job).toMatchObject({ state: 'PROPOSED', correctsJobId: original.job.jobId, fixture_only: true });
    expect(correction.pinned.snapshotDigest).not.toBe(original.pinned.snapshotDigest);
    expect(Date.parse(correction.pinned.snapshot.knownAt)).toBeGreaterThan(Date.parse(original.pinned.snapshot.knownAt));
    await restart(); await approve(correction.job); await service.runNext();
    const newResult = await service.result(second, correction.job.jobId);
    expect(newResult.resultDigest).not.toBe(oldB.resultDigest);
    expect(await service.result(first, original.job.jobId)).toEqual(oldA);
    expect(await service.result(second, original.job.jobId)).toEqual(oldB);
    expect((await service.getJob(first, original.job.jobId)).corrections).toEqual([{ jobId: correction.job.jobId, state: 'SUCCEEDED' }]);
    expect((await client.query<{ corrected: string; reason: string }>('SELECT corrects_operation_id corrected,correction_reason reason FROM operation_proposal WHERE proposal_id=$1', [correction.job.jobId])).rows[0])
      .toEqual({ corrected: `OP-${original.job.jobId}`, reason: correction.request.correction!.reason });
    expect(await counts()).toMatchObject({ proposals: 2, reviews: 2, jobs: 2, results: 2, receipts: 3, attempts: 2 });
  }, 30_000);

  it('refuses a release when no source grants the requested purpose, without changing its rights', async () => {
    const corpus = FIXTURE_CORPORA.find(corpus => corpus.domain === 'TRADEWIND')!;
    const who = authenticateTerminal(new Request('http://localhost/api/terminal', { headers: { authorization: `Bearer ${'t'.repeat(48)}` } }), JSON.stringify([{
      principalId: 'PRINCIPAL-TRADEWIND', terminalId: 'TERMINAL-T', displayName: 'Fixture scope qualification', kind: 'AGENT',
      terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: [corpus.corpusId], canReview: false,
      tokenSha256: tokenDigest('t'.repeat(48)), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }]));
    const rightsBefore = commitment(corpus.releases.map(release => release.sources));
    await expect(service.command(who, { command: 'pin', releaseId: corpus.releases[0].releaseId })).rejects.toMatchObject({ code: 'MINING_INPUT_LIMIT' });
    expect(commitment(corpus.releases.map(release => release.sources))).toBe(rightsBefore);
    expect(await counts()).toMatchObject({ proposals: 0, jobs: 0, attempts: 0, results: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps database guards against rewriting retained candidates, receipts and immutable job bindings', async () => {
    const { job } = await proposal();
    await expect(client.query("UPDATE payload_terminal_job SET snapshot_digest=$2 WHERE job_id=$1", [job.jobId, `sha256:${'b'.repeat(64)}`])).rejects.toThrow('terminal_job_binding_immutable');
    await approve(job); await service.runNext(); const result = await service.result(first, job.jobId);
    await expect(client.query('DELETE FROM payload_terminal_result WHERE job_id=$1', [job.jobId])).rejects.toThrow('terminal_immutable');
    await expect(client.query("UPDATE payload_terminal_receipt SET receipt='{}'::jsonb WHERE job_id=$1", [job.jobId])).rejects.toThrow('terminal_immutable');
    await expect(client.query("UPDATE payload_terminal_job SET state='QUEUED' WHERE job_id=$1", [job.jobId])).rejects.toThrow('terminal_job_terminal');
    expect(await service.result(first, job.jobId)).toEqual(result);
  });
});

describe('internal retention attaches to the reviewed terminal action', () => {
  it('keeps an incompatible queued destination intact without blocking later eligible work', async () => {
    const a = `sha256:${'a'.repeat(64)}`, b = `sha256:${'b'.repeat(64)}`;
    service = new TerminalService(database, source, () => METHOD, execute, a);
    const prepared = await prepare('old-destination');
    const old = await service.submit(first, { ...prepared.request, retentionDestination: a }); await approve(old);
    service = new TerminalService(database, source, () => METHOD, execute, b);
    const next = await service.submit(first, { ...prepared.request, idempotencyKey: 'current-destination', retentionDestination: b }); await approve(next);
    await service.runNext();
    expect((await service.getJob(first, old.jobId)).state).toBe('QUEUED');
    expect((await service.getJob(first, next.jobId)).state).toBe('SUCCEEDED');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('withholds object IO when current source permission cannot be established after computation', async () => {
    const store = new LocalImmutableObjectStore(join(directory, 'objects'));
    service = new TerminalService(database, source, () => METHOD, execute, store.destination);
    const prepared = await prepare();
    const job = await service.submit(first, { ...prepared.request, retentionDestination: store.destination }); await approve(job); await service.runNext();
    const ensure = vi.spyOn(store, 'ensure'), readback = vi.spyOn(store, 'readReceipt');
    vi.spyOn(source, 'getRelease').mockResolvedValue(undefined);
    const publisher = createPublicationWorker(database, source, store); await publisher.runNext();
    expect(ensure).not.toHaveBeenCalled(); expect(readback).not.toHaveBeenCalled();
    expect((await publisher.list()).publications[0]).toMatchObject({ state: 'RECONCILE', failureCode: 'PUBLICATION_PERMISSION_UNAVAILABLE' });
  });

  it('atomically enqueues a successful result, pins its destination and preserves it through correction', async () => {
    const store = new LocalImmutableObjectStore(join(directory, 'objects'));
    service = new TerminalService(database, source, () => METHOD, execute, store.destination);
    const { request } = await prepare();
    await expect(service.submit(first, request)).rejects.toMatchObject({ code: 'RETENTION_DESTINATION_CHANGED' });
    const reviewed = { ...request, retentionDestination: store.destination };
    const job = await service.submit(first, reviewed); await approve(job); await service.runNext();
    const result = await service.result(first, job.jobId);
    const publisher = createPublicationWorker(database, source, store);
    const pending = (await publisher.list()).publications;
    expect(pending).toHaveLength(1); expect(pending[0]).toMatchObject({ state: 'PENDING', resultDigest: result.resultDigest });
    await publisher.runNext();
    const old = await publisher.read(pending[0].publicationId);
    expect(old?.state).toBe('PUBLISHED');
    expect(await publisher.runNext()).toBe(false);
    const bytes = await store.readReceipt(old!.receipt!, AbortSignal.timeout(1000));
    expect(commitment(JSON.parse(Buffer.from(bytes).toString('utf8')))).toBe(result.resultDigest);
    const secondRequest = await prepare('correction-retained', NEXT_RELEASE, { jobId: job.jobId, reason: 'Declared fixture correction.' });
    const correction = await service.submit(first, { ...secondRequest.request, retentionDestination: store.destination });
    await approve(correction); await service.runNext(); await publisher.runNext();
    expect((await publisher.list()).publications).toHaveLength(2);
    expect(await publisher.read(old!.publicationId)).toEqual(old);
    expect(await service.result(first, job.jobId)).toEqual(result);
    expect(await store.readReceipt(old!.receipt!, AbortSignal.timeout(1000))).toEqual(bytes);
    await restart();
    expect((await service.getJob(first, job.jobId)).retention).toMatchObject([{ state: 'PUBLISHED' }]);
  }, 30_000);

  it('refuses destination drift at approval but permits denial and exact submit replay', async () => {
    const destination = `sha256:${'c'.repeat(64)}`;
    service = new TerminalService(database, source, () => METHOD, execute, destination);
    const { request } = await prepare();
    const pinned = { ...request, retentionDestination: destination };
    const job = await service.submit(first, pinned);
    service = new TerminalService(database, source, () => METHOD, execute, `sha256:${'d'.repeat(64)}`);
    expect(await service.submit(first, pinned)).toEqual(job);
    await expect(approve(job)).rejects.toMatchObject({ code: 'RETENTION_DESTINATION_CHANGED' });
    expect((await service.review(reviewer, { jobId: job.jobId, actionDigest: job.actionDigest, response: 'DENY', reason: 'Destination changed.' })).state).toBe('DENIED');
  });

  it('does not backfill old SQL-only actions when retention is enabled', async () => {
    const { job } = await proposal(); await approve(job);
    service = new TerminalService(database, source, () => METHOD, execute, `sha256:${'c'.repeat(64)}`);
    await service.runNext();
    expect((await service.getJob(first, job.jobId)).state).toBe('SUCCEEDED');
    expect((await client.query('SELECT * FROM payload_terminal_publication')).rows).toHaveLength(0);
  });
});

describe('retention honors the lifetime of its exact reviewed action', () => {
  async function retainedJob(key: string) {
    const store = new LocalImmutableObjectStore(join(directory, 'authority-objects'));
    service = new TerminalService(database, source, () => METHOD, execute, store.destination);
    const { request } = await prepare(key);
    const job = await service.submit(first, { ...request, retentionDestination: store.destination });
    await approve(job); await service.runNext();
    expect((await service.getJob(first, job.jobId)).state).toBe('SUCCEEDED');
    return { job, store, publisher: createPublicationWorker(database, source, store) };
  }

  it('allows an active grant, then refuses publication after revocation without hiding historical SQL results', async () => {
    const { publicationPermission } = await import('./retention');
    const { job, store, publisher } = await retainedJob('retention-revoked');
    const permitted = publicationPermission(database, source, store.destination);
    await expect(permitted(job.jobId)).resolves.toBeUndefined();
    const historical = await service.result(first, job.jobId);
    const ensure = vi.spyOn(store, 'ensure'), read = vi.spyOn(store, 'readReceipt');
    await client.query(`INSERT INTO authorization_revocation(revocation_id,authorization_id,authorization_granted_at,
      authorization_expires_at,revoked_by_kind,revoked_by,reason,revoked_at)
      SELECT $1,authorization_id,granted_at,expires_at,'HUMAN',$2,'Stop the uncompleted retained-object effect',clock_timestamp()
      FROM execution_authorization WHERE proposal_id=$3`, [`REVOKE-${job.jobId}`, reviewer.principalId, job.jobId]);
    await expect(permitted(job.jobId)).rejects.toMatchObject({ code: 'PUBLICATION_AUTHORITY_UNAVAILABLE' });
    expect(await publisher.runNext()).toBe(true);
    expect(ensure).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    expect((await publisher.list()).publications).toMatchObject([{ state: 'RECONCILE', failureCode: 'PUBLICATION_PERMISSION_UNAVAILABLE' }]);
    expect(await service.result(first, job.jobId)).toEqual(historical);
  }, 30_000);

  it('refuses an expired grant before any object IO while preserving already-computed SQL results', async () => {
    const { publicationPermission } = await import('./retention');
    const { session: _session, ...identity } = reviewer; void _session;
    const token = 'expiry-fixture-token-'.repeat(3);
    reviewer = authenticateTerminal(new Request('http://localhost/api/terminal', { headers: { authorization: `Bearer ${token}` } }),
      JSON.stringify([{ ...identity, tokenSha256: tokenDigest(token), expiresAt: new Date(Date.now() + 2500).toISOString() }]));
    const { job, store, publisher } = await retainedJob('retention-expired');
    const permitted = publicationPermission(database, source, store.destination);
    await expect(permitted(job.jobId)).resolves.toBeUndefined();
    const historical = await service.result(first, job.jobId);
    const ensure = vi.spyOn(store, 'ensure'), read = vi.spyOn(store, 'readReceipt');
    const expires = (await client.query<{ expires_at: Date }>('SELECT expires_at FROM execution_authorization WHERE proposal_id=$1', [job.jobId])).rows[0].expires_at;
    // Let the real short grant expire; do not rewrite its immutable history.
    await new Promise(resolvePause => setTimeout(resolvePause, Math.max(0, new Date(expires).getTime() - Date.now() + 100)));
    await expect(permitted(job.jobId)).rejects.toMatchObject({ code: 'PUBLICATION_AUTHORITY_UNAVAILABLE' });
    await publisher.runNext(); expect(ensure).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    expect(await service.result(first, job.jobId)).toEqual(historical);
  }, 30_000);

  it('rechecks action and grant digests before using source permissions or storage', async () => {
    const { publicationPermission } = await import('./retention');
    const { job, store } = await retainedJob('retention-action-binding');
    const currentSource = vi.spyOn(source, 'getRelease');
    for (const field of ['authorization_action_digest', 'action_digest']) {
      const corruptedResponse: TerminalDatabase = { transaction: work => database.transaction(sql => work({
        query: async <T>(query: string, values?: unknown[]) => {
          const result = await sql.query<T>(query, values);
          return { rows: result.rows.map(row => ({ ...row, [field]: `sha256:${'f'.repeat(64)}` })) };
        },
      })) };
      await expect(publicationPermission(corruptedResponse, source, store.destination)(job.jobId)).rejects.toMatchObject({ code: 'PUBLICATION_BINDING_INVALID' });
    }
    expect(currentSource).not.toHaveBeenCalled();
  }, 30_000);

  it('refuses a grant revoked while asynchronous source permission lookup is in progress', async () => {
    const { job, store, publisher } = await retainedJob('retention-revoked-during-rights');
    const ensure = vi.spyOn(store, 'ensure'), read = vi.spyOn(store, 'readReceipt');
    const actualGet = source.getRelease.bind(source);
    vi.spyOn(source, 'getRelease').mockImplementationOnce(async releaseId => {
      const release = await actualGet(releaseId);
      await client.query(`INSERT INTO authorization_revocation(revocation_id,authorization_id,authorization_granted_at,
        authorization_expires_at,revoked_by_kind,revoked_by,reason,revoked_at)
        SELECT $1,authorization_id,granted_at,expires_at,'HUMAN',$2,'Revoked during source permission lookup',clock_timestamp()
        FROM execution_authorization WHERE proposal_id=$3`, [`REVOKE-${job.jobId}`, reviewer.principalId, job.jobId]);
      return release;
    });
    expect(await publisher.runNext()).toBe(true);
    expect(ensure).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    expect((await publisher.list()).publications).toMatchObject([{ state: 'RECONCILE', failureCode: 'PUBLICATION_PERMISSION_UNAVAILABLE' }]);
  }, 30_000);
});
