import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from '@/adapter/corpusSource';
import { FIXTURE_CORPORA } from '@/fixtures';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal, type TerminalRegistration } from '@/terminal/auth';
import { MINING_CAPABILITY, TerminalError, type MiningRequest } from '@/terminal/contracts';
import type { TerminalDatabase } from '@/terminal/database';
import { computeMining } from '@/terminal/mining';
import { installTerminalSchema } from '@/terminal/schema';
import { TerminalService } from '@/terminal/service';
import { bootstrapBoard, grantMember, revokeMember, type PersistentBoardMessage, type PersistentInboxPage, type PersistentMessageDraft } from './database';
import { installCoordinationSchema } from './schema';
import type { ValidatedTerminalLink } from './terminalLinks';
import type { Acknowledgement, Participant } from './types';

const CORPUS = 'landshark.terminal-parcels';
const METHOD = `sha256:${'a'.repeat(64)}`;
const AUDIT = { actor: 'fixture-test-operator', reason: 'Explicit synthetic integration-test membership.' };
const definition = { name: 'Local declaration', kind: 'AGENT', version: '1.0.0', purpose: 'Exchange bounded fixture review notes.',
  authority: 'coordination', runtime: 'JavaScript', status: 'LOCAL', inputs: ['ReviewRequest/v1'], outputs: ['ReviewResult/v1'],
  capabilities: ['fixture.review'], reference: 'Synthetic integration test; no worker launch.' } as const;
type Inspection = { message: PersistentBoardMessage; linkedJob: ValidatedTerminalLink | null };
type Inbox = Omit<PersistentInboxPage, 'messages'> & { messages: Inspection[]; withheld: number };

let directory: string;
let pg: PGlite;
let db: TerminalDatabase;
let terminal: TerminalService;
let source: FixtureCorpusSource;
let boardId: string;
let sequence = 0;
let alice: AuthenticatedTerminal;
let bob: AuthenticatedTerminal;
let third: AuthenticatedTerminal;
let reviewer: AuthenticatedTerminal;

function identity(name: string, overrides: Partial<TerminalRegistration> = {}): AuthenticatedTerminal {
  const registration: TerminalRegistration = { principalId: `PRINCIPAL-${name}`, terminalId: `TERMINAL-${name}`,
    displayName: `Fixture ${name}`, kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research',
    corpusScope: [CORPUS, 'caravan.specialty-cargo'], canReview: false,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), tokenSha256: tokenDigest('a'.repeat(48)), ...overrides };
  return authenticateTerminal(new Request('http://localhost/api/v1/terminal', { headers: { authorization: `Bearer ${'a'.repeat(48)}` } }), JSON.stringify([registration]));
}
const participantId = (who: AuthenticatedTerminal) => `agent.${who.principalId}`;
async function open() {
  pg = new PGlite(join(directory, 'postgres')); await pg.waitReady;
  db = { transaction: work => pg.transaction(tx => work({
    query: async <T>(sql: string, values?: unknown[]) => ({ rows: values === undefined
      ? (await tx.exec(sql)).flatMap(result => result.rows as T[]) : (await tx.query<T>(sql, values)).rows }),
  })) };
  terminal = new TerminalService(db, source, () => METHOD, async work => computeMining(work), undefined, true);
}
async function restart() { await pg.close(); await open(); await installTerminalSchema(db); await installCoordinationSchema(db); }
function call(who: AuthenticatedTerminal, request: Record<string, unknown>) {
  return terminal.command(who, { command: 'coordination', request: { boardId, ...request } });
}
async function register(who: AuthenticatedTerminal, target = boardId) {
  return call(who, { operation: 'register', boardId: target, definition }) as Promise<{ participant: Participant }>;
}
async function grant(who: AuthenticatedTerminal, target = boardId) {
  await grantMember(db, target, { principalId: who.principalId, participantId: participantId(who), kind: who.kind, displayName: who.displayName }, AUDIT);
  await register(who, target);
}
const draft = (requestId: string, recipientId: string | null, overrides: Partial<PersistentMessageDraft> = {}): PersistentMessageDraft => ({
  requestId, recipientId, kind: 'REQUEST', topic: 'fixture-review', title: 'Fixture request', body: 'Fixture body', replyTo: null, link: null, ...overrides,
});
async function post(who: AuthenticatedTerminal, message: PersistentMessageDraft, target = boardId) {
  return call(who, { operation: 'post', boardId: target, message }) as Promise<Inspection>;
}
async function inbox(who: AuthenticatedTerminal, options: Record<string, unknown> = {}) {
  return call(who, { operation: 'inbox', ...options }) as Promise<Inbox>;
}
async function acknowledge(who: AuthenticatedTerminal, message: PersistentBoardMessage) {
  return call(who, { operation: 'acknowledge', messageId: message.id, expectedDigest: message.digest }) as Promise<{ acknowledgement: Acknowledgement }>;
}
async function count(table: 'payload_coordination_message' | 'payload_coordination_ack' | 'payload_terminal_job') {
  return (await pg.query<{ total: number }>(`SELECT count(*)::int total FROM ${table}`)).rows[0].total;
}
async function miningJob() {
  const releaseId = 'REL-LS-2026.08.20';
  const pinned = await terminal.command(alice, { command: 'pin', releaseId }) as { snapshotDigest: string };
  const request: MiningRequest = { capability: MINING_CAPABILITY, releaseId, snapshotDigest: pinned.snapshotDigest, methodDigest: METHOD,
    parameters: { minRecords: 1 }, budget: { maxRows: 1000, maxInputBytes: 1_048_576, maxOutputBytes: 1_048_576, timeoutMs: 5000 }, idempotencyKey: boardId };
  return terminal.submit(alice, request);
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'payload-coordination-service-'));
  source = new FixtureCorpusSource(); await open();
  await pg.exec(`CREATE TABLE corpora (corpus_id text PRIMARY KEY,domain text NOT NULL,title text NOT NULL,description text NOT NULL,data jsonb NOT NULL);
    CREATE TABLE releases (release_id text PRIMARY KEY,corpus_id text NOT NULL REFERENCES corpora(corpus_id),status text NOT NULL,known_at timestamptz NOT NULL,data jsonb NOT NULL);`);
  for (const corpus of FIXTURE_CORPORA) {
    expect(corpus.fixture_only).toBe(true);
    await pg.query('INSERT INTO corpora VALUES($1,$2,$3,$4,$5::jsonb)', [corpus.corpusId, corpus.domain, corpus.title, corpus.description, JSON.stringify(corpus)]);
    for (const release of corpus.releases) await pg.query('INSERT INTO releases VALUES($1,$2,$3,$4,$5::jsonb)', [release.releaseId, corpus.corpusId, release.status, release.knownAt, JSON.stringify(release)]);
  }
  await installTerminalSchema(db); await installCoordinationSchema(db);
}, 30_000);
beforeEach(async () => {
  vi.stubEnv('PAYLOAD_EXECUTION_PROFILE', 'normal'); vi.stubEnv('PAYLOAD_MAX_CHILD_PROCESSES', '4'); vi.stubEnv('PAYLOAD_DB_POOL_MAX', '10');
  boardId = `BOARD-integration-${++sequence}`;
  alice = identity('ALICE'); bob = identity('BOB'); third = identity('THIRD');
  reviewer = identity('REVIEWER', { kind: 'HUMAN', canReview: true });
  await bootstrapBoard(db, { boardId, corpusId: CORPUS }, AUDIT);
  for (const who of [alice, bob, third, reviewer]) await grant(who);
}, 20_000);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
  await pg?.close();
  const contained = relative(resolve(tmpdir()), resolve(directory));
  expect(contained.startsWith('..')).toBe(false); expect(contained).toMatch(/^payload-coordination-service-/);
  rmSync(directory, { recursive: true, force: true });
}, 30_000);

describe('authenticated coordination through the same terminal command and durable PostgreSQL history', () => {
  it('is opt-in, binds definitions to operator membership and refuses registration/author/ACK impersonation', async () => {
    const disabled = new TerminalService(db, source, () => METHOD, async work => computeMining(work));
    await expect(disabled.command(alice, { command: 'coordination', request: { operation: 'identity', boardId } })).rejects.toMatchObject({ code: 'COORDINATION_NOT_ENABLED', status: 503 });
    const identityView = await call(alice, { operation: 'identity' });
    expect(identityView).toMatchObject({ mode: 'AUTHENTICATED', board: { boardId, corpusId: CORPUS, purpose: 'internal_research' },
      identity: { principalId: alice.principalId, terminalId: alice.terminalId, participantId: participantId(alice) },
      participant: { id: participantId(alice), scope: boardId, domains: ['LANDSHARK'] } });
    expect(await register(alice)).toEqual({ participant: (identityView as { participant: Participant }).participant });
    const before = await count('payload_coordination_message');
    for (const extra of [{ id: participantId(bob) }, { scope: 'BOARD-other' }, { domains: ['CARAVAN'] }]) {
      await expect(call(alice, { operation: 'register', definition: { ...definition, ...extra } })).rejects.toMatchObject({ name: 'ZodError' });
    }
    await expect(call(alice, { operation: 'post', message: { ...draft('spoof', participantId(bob)), authorId: participantId(bob) } })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(call(alice, { operation: 'acknowledge', messageId: 'MSG-pretend', expectedDigest: METHOD, participantId: participantId(bob) })).rejects.toMatchObject({ name: 'ZodError' });
    await expect(call(alice, { operation: 'grant', principalId: third.principalId })).rejects.toMatchObject({ name: 'ZodError' });
    expect(await count('payload_coordination_message')).toBe(before);
  });

  it('serializes exact concurrent posts and refuses changed retries without changing identity, sequence or time', async () => {
    const message = draft('same-key', participantId(bob));
    const before = await count('payload_coordination_message');
    const results = await Promise.all(Array.from({ length: 4 }, () => post(alice, message)));
    for (const result of results) expect(result).toEqual(results[0]);
    expect(results[0].message).toMatchObject({ authorId: participantId(alice), scope: boardId, sequence: 1 });
    expect(await count('payload_coordination_message')).toBe(before + 1);
    await expect(post(alice, { ...message, body: 'Different under the same key' })).rejects.toMatchObject({ code: 'COORDINATION_IDEMPOTENCY_CONFLICT' });
    expect(await post(alice, message)).toEqual(results[0]);
    const otherAuthor = await post(bob, draft('same-key', participantId(alice)));
    expect(otherAuthor.message.id).not.toBe(results[0].message.id);
    expect(otherAuthor.message.sequence).toBe(2);
  });

  it('keeps direct messages private, broadcasts scoped, and directed replies between their original participants', async () => {
    const direct = await post(alice, draft('direct', participantId(bob)));
    const broadcast = await post(alice, draft('broadcast', null));
    expect((await inbox(bob)).messages.map(item => item.message.id)).toEqual([direct.message.id, broadcast.message.id]);
    expect((await inbox(third)).messages.map(item => item.message.id)).toEqual([broadcast.message.id]);
    expect((await inbox(third, { includeBroadcasts: false })).messages).toEqual([]);
    await expect(call(third, { operation: 'message', messageId: direct.message.id })).rejects.toMatchObject({ status: 404 });
    await expect(post(third, draft('third-reply', participantId(alice), { replyTo: direct.message.id }))).rejects.toMatchObject({ status: 404 });
    await expect(post(bob, draft('leak-third', participantId(third), { replyTo: direct.message.id }))).rejects.toMatchObject({ status: 403 });
    await expect(post(bob, draft('leak-broadcast', null, { replyTo: direct.message.id }))).rejects.toMatchObject({ status: 403 });
    const reply = await post(bob, draft('proper-reply', participantId(alice), { kind: 'RESULT', replyTo: direct.message.id }));
    expect((await inbox(alice)).messages.map(item => item.message.id)).toEqual([reply.message.id]);
    const other = `${boardId}-other`;
    await bootstrapBoard(db, { boardId: other, corpusId: CORPUS }, AUDIT); await grant(third, other);
    expect((await inbox(third, { boardId: other })).messages).toEqual([]);
    await expect(call(third, { operation: 'message', boardId: other, messageId: broadcast.message.id })).rejects.toMatchObject({ status: 404 });
    const firstPage = await inbox(bob, { limit: 1 });
    expect(firstPage).toMatchObject({ hasMore: true, nextSequence: 1 });
    expect((await inbox(bob, { limit: 1, afterSequence: firstPage.nextSequence })).messages.map(item => item.message.id)).toEqual([broadcast.message.id]);
  });

  it('binds an ACK to the exact inspected message and recipient; receipt is not a claim or terminal completion', async () => {
    const posted = await post(alice, draft('ack-me', participantId(bob), { kind: 'RESULT' }));
    const jobsBefore = await count('payload_terminal_job');
    await expect(acknowledge(alice, posted.message)).rejects.toMatchObject({ status: 403 });
    await expect(acknowledge(third, posted.message)).rejects.toMatchObject({ status: 404 });
    await expect(call(bob, { operation: 'acknowledge', messageId: posted.message.id, expectedDigest: METHOD })).rejects.toMatchObject({ code: 'COORDINATION_MESSAGE_DIGEST_MISMATCH' });
    const receipt = await acknowledge(bob, posted.message);
    expect(receipt.acknowledgement).toMatchObject({ participantId: participantId(bob), messageId: posted.message.id, scope: boardId });
    expect(await acknowledge(bob, posted.message)).toEqual(receipt);
    expect((await inbox(bob)).messages).toEqual([]);
    const history = await inbox(bob, { includeAcknowledged: true });
    expect(history.messages.map(item => item.message.id)).toEqual([posted.message.id]);
    expect(history.acknowledgements).toEqual([receipt.acknowledgement]);
    expect(await count('payload_terminal_job')).toBe(jobsBefore);
  });

  it('reopens a file-backed database after result commit before ACK and recovers exact events without duplicate work history', async () => {
    const request = await post(alice, draft('request-before-crash', participantId(bob)));
    const resultDraft = draft('deterministic-result-key', participantId(alice), { kind: 'RESULT', replyTo: request.message.id, body: 'Exact original observation.' });
    const saved = await post(bob, resultDraft); // The worker loses its response before acknowledging the request.
    const before = await count('payload_coordination_message');
    await restart();
    expect((await inbox(bob)).messages.map(item => item.message.id)).toEqual([request.message.id]);
    expect(await post(bob, resultDraft)).toEqual(saved);
    expect(await count('payload_coordination_message')).toBe(before);
    const acknowledged = await acknowledge(bob, request.message);
    await restart();
    expect(await acknowledge(bob, request.message)).toEqual(acknowledged);
    expect(await post(bob, resultDraft)).toEqual(saved);
    expect((await inbox(alice)).messages).toEqual([saved]);
    expect((await inbox(bob)).messages).toEqual([]);
  });

  it('refuses missing/revoked membership, changed corpus/purpose and expired or manufactured identities', async () => {
    const outsider = identity('OUTSIDER');
    await expect(inbox(outsider)).rejects.toMatchObject({ code: 'COORDINATION_MEMBERSHIP_REQUIRED', status: 403 });
    await expect(inbox({ ...alice })).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    await expect(inbox(identity('ALICE', { corpusScope: ['caravan.specialty-cargo'] }))).rejects.toMatchObject({ code: 'COORDINATION_MEMBERSHIP_REQUIRED', status: 403 });
    await expect(inbox(identity('ALICE', { purpose: 'normalization' }))).rejects.toMatchObject({ code: 'COORDINATION_MEMBERSHIP_REQUIRED', status: 403 });
    await revokeMember(db, boardId, alice.principalId, AUDIT);
    await expect(inbox(alice)).rejects.toMatchObject({ code: 'COORDINATION_MEMBERSHIP_REQUIRED', status: 403 });
    await expect(post(alice, draft('revoked-write', participantId(bob)))).rejects.toMatchObject({ status: 403 });
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(bob.expiresAt) + 1);
    await expect(inbox(bob)).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
  });

  it('withholds another owner\'s linked message, preserves reviewer access, and leaves execution review/leases authoritative', async () => {
    const job = await miningJob();
    const link = { jobId: job.jobId, actionDigest: job.actionDigest };
    const protectedMessage = await post(alice, draft('private-job', participantId(bob), { link, body: 'OWNER-ONLY-JOB-CONTEXT' }));
    const hidden = await inbox(bob);
    expect(hidden).toMatchObject({ messages: [], withheld: 1, acknowledgements: [] });
    expect(JSON.stringify(hidden)).not.toContain(job.jobId); expect(JSON.stringify(hidden)).not.toContain('OWNER-ONLY-JOB-CONTEXT');
    await expect(call(bob, { operation: 'message', messageId: protectedMessage.message.id })).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
    await expect(acknowledge(bob, protectedMessage.message)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
    await expect(post(bob, draft('borrowed-job', participantId(alice), { link }))).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
    const reviewNotice = await post(alice, draft('review-job', participantId(reviewer), { link }));
    expect((await inbox(reviewer)).messages[0].linkedJob).toMatchObject({ jobId: job.jobId, state: 'PROPOSED' });
    await acknowledge(reviewer, reviewNotice.message);
    expect((await terminal.getJob(alice, job.jobId)).state).toBe('PROPOSED');
    await expect(terminal.review(bob, { ...link, response: 'APPROVE', reason: 'A board message is not review authority.' })).rejects.toMatchObject({ code: 'REVIEW_AUTHORITY_REQUIRED' });
    await terminal.review(reviewer, { ...link, response: 'APPROVE', reason: 'Exact fixture-only action and bounded budget inspected.' });
    expect(await terminal.runNext()).toBe(true);
    const retained = await terminal.result(alice, job.jobId);
    await post(alice, draft('retained-result', null, { kind: 'RESULT', link: { ...link, resultDigest: retained.resultDigest } }));
    const visible = await inbox(reviewer);
    expect(visible.messages).toHaveLength(1);
    expect(visible.messages[0].linkedJob).toMatchObject({ state: 'SUCCEEDED', resultDigest: retained.resultDigest, receiptDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
    expect(visible.messages[0].linkedJob).not.toHaveProperty('result');
    expect((await inbox(bob)).withheld).toBe(2);
    await expect(post(alice, draft('wrong-action', null, { link: { ...link, actionDigest: METHOD } }))).rejects.toMatchObject({ code: 'TERMINAL_LINK_INVALID' });
    const otherCorpusBoard = `${boardId}-caravan`;
    await bootstrapBoard(db, { boardId: otherCorpusBoard, corpusId: 'caravan.specialty-cargo' }, AUDIT); await grant(alice, otherCorpusBoard);
    await expect(post(alice, draft('wrong-corpus', null, { link }), otherCorpusBoard)).rejects.toMatchObject({ code: 'RESOURCE_NOT_AVAILABLE', status: 404 });
    const original = source.getRelease.bind(source);
    const lookup = vi.spyOn(source, 'getRelease').mockImplementation(async releaseId => {
      const hit = await original(releaseId);
      return hit ? { ...hit, release: { ...hit.release, sources: [] } } : hit;
    });
    expect(await inbox(reviewer)).toMatchObject({ messages: [], withheld: 1 });
    lookup.mockRejectedValueOnce(new Error('private upstream connection detail'));
    await expect(inbox(reviewer)).rejects.toEqual(new TerminalError('TERMINAL_LINK_UNAVAILABLE', 503));
  });

  it('rechecks membership after current result permission lookup, without nesting board and terminal transactions', async () => {
    const job = await miningJob();
    const link = { jobId: job.jobId, actionDigest: job.actionDigest };
    await terminal.review(reviewer, { ...link, response: 'APPROVE', reason: 'Exact fixture-only action inspected.' });
    await terminal.runNext();
    const result = await terminal.result(alice, job.jobId);
    await post(alice, draft('result-for-reviewer', participantId(reviewer), { kind: 'RESULT', link: { ...link, resultDigest: result.resultDigest } }));
    const original = source.getRelease.bind(source);
    vi.spyOn(source, 'getRelease').mockImplementation(async releaseId => {
      const hit = await original(releaseId);
      await revokeMember(db, boardId, reviewer.principalId, AUDIT);
      return hit;
    });
    await expect(inbox(reviewer)).rejects.toMatchObject({ code: 'COORDINATION_MEMBERSHIP_REQUIRED', status: 403 });
    expect((await terminal.getJob(alice, job.jobId)).state).toBe('SUCCEEDED');
  });
});
