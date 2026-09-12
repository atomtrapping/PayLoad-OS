import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from '@/adapter/corpusSource';
import { FIXTURE_CORPORA } from '@/fixtures';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal, type TerminalRegistration } from '@/terminal/auth';
import { commitment, MINING_CAPABILITY, TerminalError, TERMINAL_PROTOCOL, type MiningRequest } from '@/terminal/contracts';
import type { TerminalDatabase } from '@/terminal/database';
import { computeMining } from '@/terminal/mining';
import { installTerminalSchema } from '@/terminal/schema';
import { TerminalService } from '@/terminal/service';
import { validateTerminalLink, type TerminalLink, type TerminalLinkReader } from './terminalLinks';

const CORPUS = 'landshark.terminal-parcels';
const METHOD = `sha256:${'a'.repeat(64)}`;
const ACTION = `sha256:${'b'.repeat(64)}`;
const RESULT = `sha256:${'c'.repeat(64)}`;
const SNAPSHOT = `sha256:${'d'.repeat(64)}`;
const board = { corpusId: CORPUS, purpose: 'internal_research' } as const;

function identity(overrides: Partial<TerminalRegistration> = {}): AuthenticatedTerminal {
  const entry: TerminalRegistration = {
    principalId: 'LINK-MINER', terminalId: 'LINK-TERMINAL', displayName: 'Link qualification principal',
    kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: [CORPUS],
    canReview: false, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), tokenSha256: tokenDigest('a'.repeat(48)), ...overrides,
  };
  return authenticateTerminal(new Request('http://localhost/api/v1/terminal', {
    headers: { authorization: `Bearer ${'a'.repeat(48)}` },
  }), JSON.stringify([entry]));
}
function miningRequest(snapshotDigest = SNAPSHOT): MiningRequest {
  return { capability: MINING_CAPABILITY, releaseId: 'REL-LS-2026.08.20', snapshotDigest, methodDigest: METHOD,
    parameters: { minRecords: 1 }, budget: { maxRows: 1000, maxInputBytes: 1_048_576, maxOutputBytes: 1_048_576, timeoutMs: 5000 },
    idempotencyKey: 'link-test' };
}
function reader(who = identity()) {
  const job: Awaited<ReturnType<TerminalService['getJob']>> = {
    jobId: 'JOB-link', ownerId: who.principalId, corpusId: CORPUS, releaseId: 'REL-LS-2026.08.20', state: 'SUCCEEDED',
    request: miningRequest(), requestDigest: METHOD, actionDigest: ACTION, snapshotDigest: SNAPSHOT,
    methodDigest: METHOD, createdAt: new Date().toISOString(), attempts: 1, failureCode: null,
    correctsJobId: 'JOB-prior', fixture_only: true, corrections: [{ jobId: 'JOB-correction', state: 'PROPOSED' }],
    retention: [{ destination: 'PRIVATE-OBJECT-DESTINATION' }],
  };
  const receipt = { protocol: TERMINAL_PROTOCOL, jobId: job.jobId, resultDigest: RESULT, snapshotDigest: SNAPSHOT,
    actionDigest: ACTION, principalId: who.principalId, terminalId: who.terminalId, retrievedAt: new Date().toISOString(),
    permittedUse: who.purpose, fixture_only: true };
  const delivery = { result: { private: 'RAW-RESULT-MUST-NOT-LEAVE' }, resultDigest: RESULT, receipt, receiptDigest: commitment(receipt) };
  const terminal = { getJob: vi.fn(async () => job), result: vi.fn(async () => delivery) } satisfies TerminalLinkReader;
  const link: TerminalLink = { jobId: job.jobId, actionDigest: ACTION };
  return { who, job, terminal, delivery, link };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('terminal references are reader-scoped projections, not board grants', () => {
  it('returns only a closed current job summary and never retrieves results for a job-only reference', async () => {
    const { who, job, terminal, link } = reader();
    expect(await validateTerminalLink(terminal, who, board, link)).toEqual({
      jobId: job.jobId, actionDigest: ACTION, corpusId: CORPUS, purpose: who.purpose, releaseId: job.releaseId,
      state: 'SUCCEEDED', correctsJobId: 'JOB-prior', corrections: [{ jobId: 'JOB-correction', state: 'PROPOSED' }], fixture_only: true,
    });
    expect(terminal.getJob).toHaveBeenCalledTimes(1);
    expect(terminal.getJob).toHaveBeenCalledWith(who, job.jobId);
    expect(terminal.result).not.toHaveBeenCalled();
    job.state = 'FAILED';
    expect((await validateTerminalLink(terminal, who, board, link)).state).toBe('FAILED');
    expect(terminal.getJob).toHaveBeenCalledTimes(2);
  });

  it('uses the existing result permission/receipt path and excludes raw results, receipts and request metadata', async () => {
    const { who, terminal, link, delivery } = reader();
    const view = await validateTerminalLink(terminal, who, board, { ...link, resultDigest: RESULT });
    expect(view).toMatchObject({ resultDigest: RESULT, receiptDigest: delivery.receiptDigest });
    expect(terminal.result).toHaveBeenCalledTimes(1);
    expect(terminal.result).toHaveBeenCalledWith(who, link.jobId);
    expect(Object.keys(view).sort()).toEqual(['actionDigest', 'corpusId', 'corrections', 'correctsJobId', 'fixture_only', 'jobId', 'purpose', 'receiptDigest', 'releaseId', 'resultDigest', 'state'].sort());
    expect(JSON.stringify(view)).not.toMatch(/RAW-RESULT|PRIVATE-OBJECT|retrievedAt|principalId|terminalId|snapshotDigest|request/);
  });

  it.each([
    null, {}, { jobId: '../wrong', actionDigest: ACTION }, { jobId: 'JOB-link', actionDigest: 'bad' },
    { jobId: 'JOB-link', actionDigest: ACTION, resultDigest: 'bad' },
    { jobId: 'JOB-link', actionDigest: ACTION, ownerId: 'pretend-owner' },
  ])('refuses malformed or authority-bearing references before job access: %j', async input => {
    const { who, terminal } = reader();
    await expect(validateTerminalLink(terminal, who, board, input as TerminalLink)).rejects.toMatchObject({ code: 'TERMINAL_LINK_INVALID' });
    expect(terminal.getJob).not.toHaveBeenCalled();
  });

  it('requires a genuinely authenticated, still-current caller', async () => {
    const { who, terminal, link } = reader();
    await expect(validateTerminalLink(terminal, { ...who }, board, link)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    terminal.getJob.mockImplementationOnce(async () => {
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse(who.expiresAt) + 1);
      return reader().job;
    });
    await expect(validateTerminalLink(terminal, who, board, link)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    expect(terminal.result).not.toHaveBeenCalled();
  });

  it('refuses board/caller corpus or purpose mismatch before touching the job service', async () => {
    const { who, terminal, link } = reader();
    for (const scope of [{ ...board, corpusId: 'caravan.specialty-cargo' }, { ...board, purpose: 'normalization' as const }]) {
      await expect(validateTerminalLink(terminal, who, scope, link)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
    }
    expect(terminal.getJob).not.toHaveBeenCalled();
  });

  it('refuses a returned job from another board corpus and refuses an exact-action mismatch', async () => {
    const { who, terminal, link, job } = reader();
    job.corpusId = 'caravan.specialty-cargo';
    await expect(validateTerminalLink(terminal, who, board, link)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    job.corpusId = CORPUS;
    await expect(validateTerminalLink(terminal, who, board, { ...link, actionDigest: METHOD })).rejects.toMatchObject({ code: 'TERMINAL_LINK_INVALID' });
    expect(terminal.result).not.toHaveBeenCalled();
  });

  it('keeps terminal ownership and current source-use refusals authoritative', async () => {
    const { who, terminal, link } = reader();
    terminal.getJob.mockRejectedValueOnce(new TerminalError('RESOURCE_NOT_AVAILABLE', 404));
    await expect(validateTerminalLink(terminal, who, board, link)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
    terminal.result.mockRejectedValueOnce(new TerminalError('MINING_SOURCE_USE_REFUSED', 403));
    await expect(validateTerminalLink(terminal, who, board, { ...link, resultDigest: RESULT })).rejects.toMatchObject({ code: 'MINING_SOURCE_USE_REFUSED', status: 403 });
  });

  it.each(['resultDigest', 'jobId', 'actionDigest', 'snapshotDigest', 'principalId', 'terminalId', 'permittedUse', 'fixture_only', 'receiptDigest'] as const)(
    'refuses a mismatched result or durable receipt binding: %s', async field => {
      const { who, terminal, link, delivery } = reader();
      if (field === 'receiptDigest') delivery.receiptDigest = METHOD;
      else {
        const changed = field === 'fixture_only' ? false : field.endsWith('Digest') ? METHOD : 'OTHER';
        Object.assign(delivery.receipt, { [field]: changed });
        delivery.receiptDigest = commitment(delivery.receipt);
        if (field === 'resultDigest') delivery.resultDigest = METHOD;
      }
      await expect(validateTerminalLink(terminal, who, board, { ...link, resultDigest: RESULT })).rejects.toMatchObject({ code: 'TERMINAL_LINK_INVALID' });
    },
  );

  it('refuses oversized or unknown-state correction summaries instead of silently truncating them', async () => {
    const { who, terminal, link, job } = reader();
    job.corrections = Array.from({ length: 101 }, (_, index) => ({ jobId: `JOB-${index}`, state: 'PROPOSED' }));
    await expect(validateTerminalLink(terminal, who, board, link)).rejects.toMatchObject({ code: 'TERMINAL_LINK_INVALID' });
    job.corrections = [{ jobId: 'JOB-correction', state: 'COMPLETE-BY-ACK' }];
    await expect(validateTerminalLink(terminal, who, board, link)).rejects.toMatchObject({ code: 'TERMINAL_LINK_INVALID' });
  });

  it('redacts unexpected backend errors from either service method', async () => {
    const { who, terminal, link } = reader();
    terminal.getJob.mockRejectedValueOnce(new Error('postgres://private-secret'));
    await expect(validateTerminalLink(terminal, who, board, link)).rejects.toEqual(new TerminalError('TERMINAL_LINK_UNAVAILABLE', 503));
    terminal.result.mockRejectedValueOnce(new Error('source-token-private-secret'));
    await expect(validateTerminalLink(terminal, who, board, { ...link, resultDigest: RESULT })).rejects.toEqual(new TerminalError('TERMINAL_LINK_UNAVAILABLE', 503));
  });
});

it('reuses real terminal ownership, review, corrections, result receipts and current permission in PostgreSQL', async () => {
  const pg = new PGlite();
  await pg.waitReady;
  const db: TerminalDatabase = { transaction: work => pg.transaction(tx => work({
    query: async <T>(sql: string, values?: unknown[]) => ({ rows: values === undefined
      ? (await tx.exec(sql)).flatMap(result => result.rows as T[]) : (await tx.query<T>(sql, values)).rows }),
  })) };
  const source = new FixtureCorpusSource();
  const terminal = new TerminalService(db, source, () => METHOD, async work => computeMining(work));
  const who = identity();
  const reviewer = identity({ principalId: 'LINK-REVIEWER', terminalId: 'LINK-REVIEW-TERMINAL', kind: 'HUMAN', canReview: true });
  vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'normal');
  vi.stubEnv('PAYLOAD_MAX_CHILD_PROCESSES', '4');
  vi.stubEnv('PAYLOAD_DB_POOL_MAX', '10');
  try {
    await pg.exec(`CREATE TABLE corpora (corpus_id text PRIMARY KEY);
      CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id));`);
    for (const corpus of FIXTURE_CORPORA) {
      await pg.query('INSERT INTO corpora VALUES($1)', [corpus.corpusId]);
      for (const release of corpus.releases) await pg.query('INSERT INTO releases VALUES($1,$2)', [release.releaseId, corpus.corpusId]);
    }
    await installTerminalSchema(db);
    const propose = async (releaseId: string, key: string, correction?: MiningRequest['correction']) => {
      const pinned = await terminal.command(who, { command: 'pin', releaseId }) as { snapshotDigest: string };
      return terminal.submit(who, { ...miningRequest(pinned.snapshotDigest), releaseId, idempotencyKey: key, ...(correction ? { correction } : {}) });
    };
    const first = await propose('REL-LS-2026.08.20', 'link-first');
    const link = { jobId: first.jobId, actionDigest: first.actionDigest };
    expect((await validateTerminalLink(terminal, who, board, link)).state).toBe('PROPOSED');
    await expect(validateTerminalLink(terminal, identity({ principalId: 'OTHER-OWNER', terminalId: 'OTHER-TERMINAL' }), board, link)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    await expect(validateTerminalLink(terminal, identity({ corpusScope: ['caravan.specialty-cargo'] }), board, link)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    expect((await validateTerminalLink(terminal, reviewer, board, link)).state).toBe('PROPOSED');
    await expect(validateTerminalLink(terminal, identity({ purpose: 'normalization' }), { ...board, purpose: 'normalization' }, link))
      .rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE' });
    await terminal.review(reviewer, { ...link, response: 'APPROVE', reason: 'Exact fixture-only test action inspected.' });
    expect(await terminal.runNext()).toBe(true);
    const delivered = await terminal.result(who, first.jobId);
    const resultLink = { ...link, resultDigest: delivered.resultDigest };
    const observed = await validateTerminalLink(terminal, who, board, resultLink);
    expect(observed).toMatchObject({ state: 'SUCCEEDED', resultDigest: delivered.resultDigest, receiptDigest: delivered.receiptDigest });
    expect(observed).not.toHaveProperty('result');
    expect((await pg.query<{ count: number }>('SELECT count(*)::int count FROM payload_terminal_receipt')).rows[0].count).toBe(1);
    const later = await propose('REL-LS-2026.09.01', 'link-correction', { jobId: first.jobId, reason: 'Later fixture vintage.' });
    expect((await validateTerminalLink(terminal, who, board, resultLink)).corrections).toEqual([{ jobId: later.jobId, state: 'PROPOSED' }]);
    expect((await terminal.result(who, first.jobId))).toEqual(delivered);
    const originalGet = source.getRelease.bind(source);
    vi.spyOn(source, 'getRelease').mockImplementation(async releaseId => {
      const hit = await originalGet(releaseId);
      return hit ? { ...hit, release: { ...hit.release, sources: [] } } : hit;
    });
    await expect(validateTerminalLink(terminal, who, board, resultLink)).rejects.toMatchObject({ code: 'MINING_SOURCE_USE_REFUSED', status: 403 });
    expect((await validateTerminalLink(terminal, who, board, link)).state).toBe('SUCCEEDED');
    expect((await pg.query<{ count: number }>('SELECT count(*)::int count FROM payload_terminal_job')).rows[0].count).toBe(2);
  } finally { await pg.close(); }
}, 30_000);
