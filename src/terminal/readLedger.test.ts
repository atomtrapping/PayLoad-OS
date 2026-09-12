import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPABILITIES } from '@/domain/capabilityRegistry';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from '@/db/executionLedger';
import { FIXTURE_CORPORA } from '@/fixtures';
import { serveCapabilityCall, serveToolCall } from '@/mcp/serve';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal, type TerminalRegistration } from './auth';
import type { TerminalDatabase } from './database';
import { recordTerminalRead } from './readLedger';
import { installTerminalSchema, TERMINAL_JOB_DDL, TERMINAL_SCHEMA_VERSION } from './schema';

vi.mock('@/adapter/corpusSource', async importOriginal => {
  const actual = await importOriginal<typeof import('@/adapter/corpusSource')>();
  return { ...actual, getCorpusSource: () => new actual.FixtureCorpusSource() };
});

const corpus = FIXTURE_CORPORA.find(entry => entry.domain === 'CARAVAN')!;
const TOKEN = 'read-ledger-test-token-'.repeat(3);
let client: PGlite;
let db: TerminalDatabase;
let directory: string | undefined;

function connection(pg: PGlite): TerminalDatabase {
  return { transaction: work => pg.transaction(tx => work({
    query: async <T>(sql: string, values?: unknown[]) => values === undefined
      ? { rows: (await tx.exec(sql)).flatMap(result => result.rows as T[]) }
      : { rows: (await tx.query<T>(sql, values)).rows },
  })) };
}
async function open(dataDir?: string) {
  client = new PGlite(dataDir); await client.waitReady;
  db = connection(client);
}
async function seedCorpus() {
  // The migration requires the real corpus/release table names and columns.
  // These rows are explicitly fixture inventory, with no admitted source data.
  await client.exec(`CREATE TABLE corpora(corpus_id text PRIMARY KEY,domain text NOT NULL,title text NOT NULL,description text NOT NULL,data jsonb NOT NULL);
    CREATE TABLE releases(release_id text PRIMARY KEY,corpus_id text NOT NULL REFERENCES corpora(corpus_id),status text NOT NULL,known_at timestamptz NOT NULL,data jsonb NOT NULL);`);
  await client.query('INSERT INTO corpora VALUES($1,$2,$3,$4,$5::jsonb)', [corpus.corpusId, corpus.domain, corpus.title, corpus.description, JSON.stringify({ fixture_only: true, provenance: 'DEMONSTRATION' })]);
  for (const release of corpus.releases) await client.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5::jsonb)',
    [release.releaseId, corpus.corpusId, release.status, release.knownAt, JSON.stringify({ ...release, fixture_only: true, provenance: 'DEMONSTRATION' })]);
}
function identity(change: Partial<TerminalRegistration> = {}): AuthenticatedTerminal {
  const entry: TerminalRegistration = {
    principalId: 'agent:reader', terminalId: 'terminal:reader-one', displayName: 'Read ledger test', kind: 'AGENT',
    terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: [corpus.corpusId], canReview: false,
    tokenSha256: tokenDigest(TOKEN), expiresAt: '2099-01-01T00:00:00.000Z', ...change,
  };
  return authenticateTerminal(new Request('http://localhost/internal', { headers: { authorization: `Bearer ${TOKEN}` } }), JSON.stringify([entry]));
}
const read = (who: AuthenticatedTerminal, named = corpus.corpusId) => serveToolCall(who.session, 'list_releases', { corpus: named }, who.session.openedAt);
async function counts() {
  return (await client.query<{ sessions: number; bindings: number; calls: number; proposals: number; jobs: number; results: number; delivery_receipts: number }>(`SELECT
    (SELECT count(*)::int FROM terminal_session) sessions,(SELECT count(*)::int FROM payload_terminal_session_identity) bindings,
    (SELECT count(*)::int FROM served_call) calls,(SELECT count(*)::int FROM operation_proposal) proposals,
    (SELECT count(*)::int FROM payload_terminal_job) jobs,(SELECT count(*)::int FROM payload_terminal_result) results,
    (SELECT count(*)::int FROM payload_terminal_receipt) delivery_receipts`)).rows[0];
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-12T17:00:00.000Z'));
  await open(); await seedCorpus();
});
afterEach(async () => {
  await client?.close(); vi.useRealTimers();
  if (directory) {
    const within = relative(resolve(tmpdir()), resolve(directory));
    if (!within || within.startsWith('..') || !within.startsWith('payload-terminal-read-')) throw new Error('TEST_TEMP_DIRECTORY_SCOPE');
    rmSync(directory, { recursive: true, force: true }); directory = undefined;
  }
});

describe('versioned durable read ledger migration', () => {
  it('installs and verifies version 2 repeatedly without duplicating the registry', async () => {
    await installTerminalSchema(db); await installTerminalSchema(db);
    expect((await client.query('SELECT schema_version FROM payload_terminal_control')).rows).toEqual([{ schema_version: TERMINAL_SCHEMA_VERSION }]);
    expect((await client.query('SELECT capability_id FROM terminal_capability')).rows).toHaveLength(CAPABILITIES.length);
    expect(await counts()).toEqual({ sessions: 0, bindings: 0, calls: 0, proposals: 0, jobs: 0, results: 0, delivery_receipts: 0 });
  });

  it('upgrades version 1 without replacing existing execution history or corpus rows', async () => {
    await client.exec(EXECUTION_LEDGER_DDL + EXECUTION_LEDGER_GUARDS + TERMINAL_JOB_DDL);
    await client.exec(`INSERT INTO principal VALUES('existing-agent','AGENT','Existing author',now());
      INSERT INTO operation_proposal(proposal_id,operation_kind,counterparty,authored_by_kind,authored_by,proposed_at)
      VALUES('existing-proposal','discovery.run-workload','existing-owner','AGENT','existing-agent',now());`);
    const prior = (await client.query('SELECT * FROM operation_proposal')).rows;
    const releases = (await client.query('SELECT * FROM releases ORDER BY release_id')).rows;
    await installTerminalSchema(db); await installTerminalSchema(db);
    expect((await client.query('SELECT * FROM operation_proposal')).rows).toEqual(prior);
    expect((await client.query('SELECT * FROM releases ORDER BY release_id')).rows).toEqual(releases);
    expect((await client.query('SELECT schema_version FROM payload_terminal_control')).rows).toEqual([{ schema_version: 2 }]);
  });

  it('refuses registry drift instead of treating a stale capability row as verified', async () => {
    await installTerminalSchema(db);
    await client.query("UPDATE terminal_capability SET serves='AGGREGATE' WHERE capability_id='corpus.list-releases'");
    await expect(installTerminalSchema(db)).rejects.toThrow('TERMINAL_CAPABILITY_REGISTRY_MISMATCH');
  });
});

describe('read decisions are durable events, not mining delivery receipts', () => {
  it('records admitted reads and scope refusals without creating a proposal, job or delivery receipt', async () => {
    await installTerminalSchema(db);
    const who = identity();
    const allowed = await recordTerminalRead(db, who, await read(who));
    const denied = await recordTerminalRead(db, who, await read(who, 'tradewind.freight-rates'));
    expect(allowed).toMatchObject({ status: 'RECORDED', sessionId: who.session.sessionId, callId: expect.stringMatching(/^CALL-[0-9a-f-]{36}$/) });
    expect(denied.status).toBe('RECORDED');
    expect(await counts()).toEqual({ sessions: 1, bindings: 1, calls: 2, proposals: 0, jobs: 0, results: 0, delivery_receipts: 0 });
    expect((await client.query('SELECT decision,refusal,corpus,proposal_id FROM served_call ORDER BY decision')).rows).toEqual([
      { decision: 'ADMITTED', refusal: null, corpus: corpus.corpusId, proposal_id: null },
      { decision: 'REFUSED', refusal: 'CORPUS_OUTSIDE_SCOPE', corpus: 'tradewind.freight-rates', proposal_id: null },
    ]);
    const stored = JSON.stringify((await client.query('SELECT identity FROM payload_terminal_session_identity')).rows);
    expect(stored).not.toContain(TOKEN); expect(stored).not.toContain(tokenDigest(TOKEN));
  });

  it('records concurrent calls once each against one exact durable session', async () => {
    await installTerminalSchema(db);
    const who = identity(), served = await read(who);
    const receipts = await Promise.all(Array.from({ length: 4 }, () => recordTerminalRead(db, who, served)));
    expect(receipts.every(receipt => receipt.status === 'RECORDED')).toBe(true);
    expect(new Set(receipts.map(receipt => receipt.status === 'RECORDED' ? receipt.callId : '')).size).toBe(4);
    expect(await counts()).toMatchObject({ sessions: 1, bindings: 1, calls: 4 });
  });

  it('survives file-backed database close/reopen without restarting a call counter or forgetting the session', async () => {
    await client.close();
    directory = mkdtempSync(join(tmpdir(), 'payload-terminal-read-'));
    const dataDir = join(directory, 'postgres');
    await open(dataDir); await seedCorpus(); await installTerminalSchema(db);
    const who = identity(), served = await read(who);
    const first = await recordTerminalRead(db, who, served);
    const before = (await client.query('SELECT * FROM served_call')).rows;
    await client.close(); await open(dataDir); await installTerminalSchema(db);
    expect((await client.query('SELECT * FROM served_call')).rows).toEqual(before);
    const second = await recordTerminalRead(db, who, served);
    expect(first.status).toBe('RECORDED'); expect(second.status).toBe('RECORDED'); expect(second).not.toEqual(first);
    expect(await counts()).toMatchObject({ sessions: 1, bindings: 1, calls: 2, proposals: 0, delivery_receipts: 0 });
  });

  it('keeps different terminals of one principal distinct', async () => {
    await installTerminalSchema(db);
    const first = identity(), second = identity({ terminalId: 'terminal:reader-two' });
    expect((await recordTerminalRead(db, first, await read(first))).status).toBe('RECORDED');
    expect((await recordTerminalRead(db, second, await read(second))).status).toBe('RECORDED');
    expect(await counts()).toMatchObject({ sessions: 2, bindings: 2, calls: 2 });
    expect((await client.query('SELECT DISTINCT principal_id FROM payload_terminal_session_identity')).rows).toEqual([{ principal_id: first.principalId }]);
  });

  it.each([{ purpose: 'normalization' as const }, { principalId: 'agent:different-owner' }])('refuses changed identity under an existing session without changing history: %j', async change => {
    await installTerminalSchema(db);
    const original = identity(), changed = identity(change);
    expect(changed.session.sessionId).toBe(original.session.sessionId);
    await recordTerminalRead(db, original, await read(original));
    const prior = await counts();
    expect(await recordTerminalRead(db, changed, await read(changed))).toEqual({ status: 'NOT_RECORDED', code: 'READ_RECEIPT_BINDING_CONFLICT' });
    expect(await counts()).toEqual(prior);
    expect((await client.query('SELECT principal_id FROM principal')).rows).toEqual([{ principal_id: original.principalId }]);
  });

  it('preserves immutable session, identity and call rows', async () => {
    await installTerminalSchema(db);
    const who = identity(); await recordTerminalRead(db, who, await read(who));
    await expect(client.query("UPDATE terminal_session SET purpose='normalization'")).rejects.toThrow('session_is_written_once');
    await expect(client.query('DELETE FROM served_call')).rejects.toThrow('call_is_written_once');
    await expect(client.query("UPDATE payload_terminal_session_identity SET identity='{}'")).rejects.toThrow('terminal_immutable');
  });

  it('distinguishes unsupported asks from a failed write and never makes a generic proposal', async () => {
    await installTerminalSchema(db);
    const who = identity();
    const unknown = await serveToolCall(who.session, 'unknown-tool', {}, who.session.openedAt);
    const operate = await serveCapabilityCall(who.session, 'discovery.run-workload', { corpus: corpus.corpusId }, who.session.openedAt);
    const transaction = vi.spyOn(db, 'transaction');
    expect(await recordTerminalRead(db, who, unknown)).toEqual({ status: 'NOT_RECORDED', code: 'READ_RECEIPT_UNSUPPORTED' });
    expect(await recordTerminalRead(db, who, operate)).toEqual({ status: 'NOT_RECORDED', code: 'READ_RECEIPT_UNSUPPORTED' });
    expect(transaction).not.toHaveBeenCalled();
    expect(await counts()).toMatchObject({ sessions: 0, calls: 0, proposals: 0 });
  });

  it('rejects receipt/session disagreement and non-authenticated identities before writing', async () => {
    await installTerminalSchema(db);
    const who = identity(), served = await read(who);
    expect(await recordTerminalRead(db, who, { ...served, receipt: { ...served.receipt, terminalId: 'terminal:forged' } }))
      .toEqual({ status: 'NOT_RECORDED', code: 'READ_RECEIPT_INVALID' });
    await expect(recordTerminalRead(db, { ...who }, served)).rejects.toThrow('AUTHENTICATION_REQUIRED');
    expect(await counts()).toMatchObject({ sessions: 0, bindings: 0, calls: 0 });
  });

  it('rolls back all writes and returns only a safe code if event insertion fails', async () => {
    await installTerminalSchema(db);
    const who = identity();
    const broken: TerminalDatabase = { transaction: work => db.transaction(sql => work({ query: async <T>(statement: string, values?: unknown[]) => {
      if (statement.startsWith('INSERT INTO served_call')) throw new Error('password=secret /private/database/path');
      return sql.query<T>(statement, values);
    } })) };
    expect(await recordTerminalRead(broken, who, await read(who))).toEqual({ status: 'NOT_RECORDED', code: 'READ_RECEIPT_UNAVAILABLE' });
    expect(await counts()).toMatchObject({ sessions: 0, bindings: 0, calls: 0 });
    expect((await client.query('SELECT * FROM principal')).rows).toEqual([]);
  });
});
