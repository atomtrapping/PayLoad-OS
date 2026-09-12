import { describe, expect, it, vi } from 'vitest';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal } from '@/terminal/auth';
import { MINING_CAPABILITY, TerminalError } from '@/terminal/contracts';
import type { TerminalDatabase, TerminalSql } from '@/terminal/database';
import type { TerminalService } from '@/terminal/service';
import { localRecordDigest } from '@/data-os/local-record';
import { participantDefinition, persistentMessageDraft } from './contracts';
import { COORDINATION_LIMITS, type PersistentBoardMessage, type PersistentInboxPage } from './database';
import { applyCommand } from './ledger';
import { CoordinationService } from './service';
import type { ValidatedTerminalLink } from './terminalLinks';
import type { Connection, Participant } from './types';

const BOARD = 'response-budget-fixture';
const CORPUS = 'landshark.terminal-parcels';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const AT = '2026-09-12T00:00:00.000Z';
const PARTICIPANT = 'participant-000';
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
type Inspection = { message: PersistentBoardMessage; linkedJob: ValidatedTerminalLink | null };
type Inbox = Omit<PersistentInboxPage, 'messages'> & { messages: Inspection[]; withheld: number };
type Stable = { participants: Participant[]; connections: Connection[]; connectionsTruncated: boolean };
type Job = Awaited<ReturnType<TerminalService['getJob']>>;

function identity(): AuthenticatedTerminal {
  const token = 'synthetic_response_budget_token_0123456789abcdef';
  return authenticateTerminal(new Request('http://127.0.0.1/api/v1/terminal', {
    headers: { authorization: `Bearer ${token}` },
  }), JSON.stringify([{ principalId: 'fixture-reader', terminalId: 'fixture-terminal', displayName: 'Fixture reader',
    kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: [CORPUS],
    canReview: false, tokenSha256: tokenDigest(token), expiresAt: '2099-01-01T00:00:00.000Z' }]));
}

function definition(index: number, maximum = false): Participant {
  const contract = '契'.repeat(180);
  const value: Participant = { id: `participant-${String(index).padStart(3, '0')}`, name: 'Fixture declaration',
    kind: 'AGENT', version: '1', purpose: maximum ? '' : 'Response-budget fixture.', authority: 'coordination',
    runtime: 'JavaScript', status: 'LOCAL', scope: BOARD, domains: ['LANDSHARK'],
    inputs: [contract], outputs: [contract], capabilities: ['fixture.review'], reference: 'Offline synthetic fixture.' };
  if (maximum) {
    const remaining = 4095 - bytes(value);
    value.purpose = '界'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
    expect(bytes(value)).toBe(4095);
  }
  const declaration = Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'scope', 'domains'].includes(key)));
  expect(participantDefinition.parse(declaration)).toEqual(declaration);
  expect(applyCommand({ schema: 'payload.coordination.v1', participants: [], messages: [], acknowledgements: [] },
    BOARD, { operation: 'register', participant: value }, [], AT).participants).toEqual([value]);
  expect(bytes(value)).toBeLessThanOrEqual(COORDINATION_LIMITS.definitionBytes);
  return value;
}

function message(sequence: number): PersistentBoardMessage {
  const number = String(sequence).padStart(3, '0');
  const base = { requestId: `request-${number}`, recipientId: PARTICIPANT, kind: 'REQUEST' as const,
    topic: 'fixture-review', title: 'Large retained Unicode message', body: '界'.repeat(4000), replyTo: null,
    link: { jobId: `job-${number}`, actionDigest: DIGEST }, id: `MSG-${number}`,
    authorId: 'participant-author', scope: BOARD, sequence, createdAt: AT };
  // The text contract allows Unicode controls. Their six-byte JSON escapes,
  // together with three-byte CJK text, exercise the byte cap rather than length.
  const extra = Math.floor((16383 - bytes({ ...base, digest: DIGEST })) / 3);
  base.body = '界'.repeat(4000 - extra) + '\u0001'.repeat(extra);
  const value = { ...base, digest: localRecordDigest(base) };
  const draft = Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'authorId', 'scope', 'sequence', 'createdAt', 'digest'].includes(key)));
  expect(persistentMessageDraft.parse(draft)).toEqual(draft);
  expect(bytes(value)).toBeGreaterThan(16370);
  expect(bytes(value)).toBeLessThanOrEqual(COORDINATION_LIMITS.messageBytes);
  return value;
}

function job(jobId: string, who: AuthenticatedTerminal): Job {
  return { jobId, ownerId: who.principalId, corpusId: CORPUS, releaseId: 'REL-fixture', state: 'SUCCEEDED',
    actionDigest: DIGEST, snapshotDigest: DIGEST, requestDigest: DIGEST, methodDigest: DIGEST,
    createdAt: AT, attempts: 1, failureCode: null, correctsJobId: null, fixture_only: true, retention: [],
    request: { capability: MINING_CAPABILITY, releaseId: 'REL-fixture', snapshotDigest: DIGEST, methodDigest: DIGEST,
      parameters: { minRecords: 1 }, budget: { maxRows: 1, maxInputBytes: 1024, maxOutputBytes: 1024, timeoutMs: 1000 },
      idempotencyKey: 'fixture-request' },
    corrections: Array.from({ length: 100 }, (_, index) => ({
      jobId: `correction-${String(index).padStart(3, '0')}-${'x'.repeat(113)}`, state: 'SUCCEEDED',
    })),
  };
}

/** Only the SQL data source is synthetic. The real repository still authenticates,
 * checks scope/membership, parses retained records, verifies digests and paginates.
 * No writes, service mocks or link-validation mocks are used. */
function fixture(roster: Participant[], messages: PersistentBoardMessage[] = []) {
  const who = identity();
  let memberChecks = 0;
  const acknowledgements = messages.map(value => ({ messageId: value.id, participantId: PARTICIPANT, scope: BOARD, createdAt: AT }));
  const sql: TerminalSql = { async query<T>(statement: string, values: unknown[] = []) {
    expect(statement.trim()).toMatch(/^SELECT /);
    expect(values[0]).toBe(BOARD);
    let rows: unknown[];
    if (statement.startsWith('SELECT b.*,c.domain')) {
      rows = [{ board_id: BOARD, corpus_id: CORPUS, domain: 'LANDSHARK', purpose: 'internal_research', next_sequence: messages.length + 1 }];
    } else if (statement.startsWith('SELECT * FROM payload_coordination_member')) {
      expect(values[1]).toBe(who.principalId); memberChecks++;
      rows = [{ principal_id: who.principalId, participant_id: PARTICIPANT, kind: who.kind, display_name: who.displayName, enabled: true }];
    } else if (statement.startsWith('SELECT participant_id,definition,digest')) {
      rows = roster.map(value => ({ participant_id: value.id, definition: value, digest: localRecordDigest(value) }));
    } else if (statement.startsWith('SELECT definition,digest')) {
      rows = roster.filter(value => value.id === values[1]).map(value => ({ definition: value, digest: localRecordDigest(value) }));
    } else if (statement.startsWith('SELECT m.* FROM payload_coordination_message')) {
      expect(values[2]).toBe(PARTICIPANT);
      rows = messages.filter(value => value.sequence > Number(values[1]) && value.authorId !== values[2]
        && (value.recipientId === values[2] || (values[3] && value.recipientId === null))
        && (values[4] === null || value.kind === values[4])
        && (values[5] || !acknowledgements.some(ack => ack.messageId === value.id)))
        .slice(0, Number(values[6])).map(value => {
          const { id, authorId, scope, sequence, createdAt, digest, ...draft } = value;
          return { message_id: id, board_id: scope, sequence, author_id: authorId, recipient_id: draft.recipientId,
            request_id: draft.requestId, draft, digest, created_at: createdAt };
        });
    } else if (statement.startsWith('SELECT * FROM payload_coordination_ack')) {
      expect(values[1]).toBe(PARTICIPANT);
      rows = acknowledgements.filter(value => (values[2] as string[]).includes(value.messageId)).map(value => ({
        board_id: value.scope, message_id: value.messageId, participant_id: value.participantId,
        created_at: value.createdAt, digest: localRecordDigest(value),
      }));
    } else throw new Error(`Unexpected SQL in response-budget fixture: ${statement}`);
    return { rows: rows as T[] };
  } };
  const db: TerminalDatabase = { transaction: work => work(sql) };
  const refused = new Map<string, number>();
  const terminal = {
    getJob: vi.fn(async (reader: AuthenticatedTerminal, jobId: string) => {
      expect(reader).toBe(who);
      const status = refused.get(jobId);
      if (status) throw new TerminalError('RESOURCE_NOT_AVAILABLE', status);
      return job(jobId, who);
    }),
    result: vi.fn(async () => { throw new Error('Job-only links must not request result bytes or receipts.'); }),
  };
  const service = new CoordinationService(db, terminal);
  return { who, terminal, refused, memberChecks: () => memberChecks,
    stable: () => service.command(who, { operation: 'stable', boardId: BOARD }) as Promise<Stable>,
    inbox: (afterSequence = 0) => service.command(who, { operation: 'inbox', boardId: BOARD,
      afterSequence, limit: 50, includeAcknowledged: true }) as Promise<Inbox> };
}

function assertBoundedPage(page: Inbox) {
  expect(bytes(page)).toBeLessThan(1_100_000);
  expect(page.messages.length).toBeLessThanOrEqual(50);
  expect(page.acknowledgements.map(value => value.messageId)).toEqual(page.messages.map(value => value.message.id));
  for (const entry of page.messages) {
    expect(entry.linkedJob?.corrections).toHaveLength(100);
    expect(entry.linkedJob?.purpose).toBe('internal_research');
    expect(entry.linkedJob?.resultDigest).toBeUndefined();
  }
}

describe('coordination response byte budgets with valid maximum-size retained records', () => {
  it('preserves all 200 near-4-KiB definitions and truncates connections before the response ceiling', async () => {
    const roster = Array.from({ length: 200 }, (_, index) => definition(index, true));
    const sample = fixture(roster);
    const result = await sample.stable();
    expect(result.participants).toEqual(roster);
    expect(result.connectionsTruncated).toBe(true);
    expect(result.connections.length).toBeGreaterThan(0);
    expect(result.connections.length).toBeLessThan(200); // Byte budget, not just the connection-count cap.
    expect(bytes(result)).toBeLessThan(950_000);
    expect(bytes(result)).toBeLessThan(1_100_000);
    expect(sample.memberChecks()).toBe(1);
    expect(sample.terminal.getJob).not.toHaveBeenCalled();
  });

  it('pages 50 near-16-KiB Unicode messages with 100 corrections each without skipping or duplicating messages', async () => {
    const retained = Array.from({ length: 50 }, (_, index) => message(index + 1));
    const sample = fixture([definition(0)], retained);
    const first = await sample.inbox();
    assertBoundedPage(first);
    expect(first.messages.length).toBeGreaterThan(0);
    expect(first.messages.length).toBeLessThan(50);
    expect(first.hasMore).toBe(true);
    expect(first.nextSequence).toBe(first.messages.at(-1)!.message.sequence);
    expect(first.withheld).toBe(0);
    const second = await sample.inbox(first.nextSequence);
    assertBoundedPage(second);
    expect(second.messages[0].message.sequence).toBe(first.nextSequence + 1);
    expect(second.hasMore).toBe(false);
    expect(second.nextSequence).toBe(50);
    expect([...first.messages, ...second.messages].map(value => value.message)).toEqual(retained);
    expect(sample.memberChecks()).toBe(4); // Initial access and post-link freshness for each page.
    expect(sample.terminal.result).not.toHaveBeenCalled();
  });

  it.each([403, 404])('advances past a withheld %i link before a byte cutoff without losing the next visible message', async status => {
    const retained = Array.from({ length: 50 }, (_, index) => message(index + 1));
    const sample = fixture([definition(0)], retained);
    const baseline = await sample.inbox();
    const withheldSequence = baseline.nextSequence + 1;
    sample.refused.set(retained[withheldSequence - 1].link!.jobId, status);
    const first = await sample.inbox();
    assertBoundedPage(first);
    expect(first.withheld).toBe(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextSequence).toBe(withheldSequence);
    expect(first.messages.at(-1)!.message.sequence).toBe(withheldSequence - 1);
    const second = await sample.inbox(first.nextSequence);
    assertBoundedPage(second);
    expect(second.messages[0].message.sequence).toBe(withheldSequence + 1);
    expect(second.nextSequence).toBe(50);
    expect(second.hasMore).toBe(false);
    expect([...first.messages, ...second.messages].map(value => value.message))
      .toEqual(retained.filter(value => value.sequence !== withheldSequence));
    expect(sample.terminal.result).not.toHaveBeenCalled();
  });
});
