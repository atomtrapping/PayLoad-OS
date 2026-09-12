import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertAuthenticated, type AuthenticatedTerminal } from '../terminal/auth';
import { id, refuse } from '../terminal/contracts';
import type { TerminalDatabase, TerminalSql } from '../terminal/database';
import { localRecordDigest, localJson } from '../data-os/local-record';
import { MESSAGE_KINDS, type MessageKind, type Participant, type Acknowledgement } from './types';
import { DOMAIN_IDS, type Domain } from '../domain/types';
import { participantDefinition, persistentMessageDraft } from './contracts';

export const COORDINATION_LIMITS = Object.freeze({ participants: 200, messages: 5000, inbox: 50, definitionBytes: 4096, messageBytes: 16384 });
const identifier = id;
const boardIdentifier = id;
const draftSchema = persistentMessageDraft;
const retainedParticipant = participantDefinition.extend({
  id, scope: id, domains: z.array(z.enum(DOMAIN_IDS)).length(1),
}).strict();
export type PersistentMessageDraft = z.infer<typeof draftSchema>;
export interface PersistentBoardMessage extends PersistentMessageDraft {
  id: string; authorId: string; scope: string; sequence: number; createdAt: string; digest: string;
}
export interface PersistentInboxQuery {
  afterSequence: number; limit: number; includeAcknowledged: boolean; includeBroadcasts: boolean; kind: MessageKind | null;
}
export interface CoordinationBoard { boardId: string; corpusId: string; domain: Domain; purpose: 'internal_research' }
export interface CoordinationMember { principalId: string; participantId: string; kind: 'HUMAN' | 'AGENT' | 'POLICY'; displayName: string }
export interface PersistentInboxPage {
  participantId: string; afterSequence: number; nextSequence: number; highWaterSequence: number;
  hasMore: boolean; messages: PersistentBoardMessage[]; acknowledgements: Acknowledgement[];
}
export interface CoordinationTransaction {
  readonly board: CoordinationBoard; readonly member: CoordinationMember;
  participants(): Promise<Participant[]>;
  participant(id: string): Promise<Participant | undefined>;
  register(definition: Participant): Promise<Participant>;
  message(id: string): Promise<PersistentBoardMessage | undefined>;
  messageByRequest(requestId: string): Promise<PersistentBoardMessage | undefined>;
  appendMessage(draft: PersistentMessageDraft): Promise<PersistentBoardMessage>;
  inbox(query: PersistentInboxQuery): Promise<PersistentInboxPage>;
  acknowledge(messageId: string): Promise<Acknowledgement>;
}
type BoardRow = { board_id: string; corpus_id: string; domain: string; purpose: 'internal_research'; next_sequence: number };
type MemberRow = { principal_id: string; participant_id: string; kind: CoordinationMember['kind']; display_name: string; enabled: boolean };
type MessageRow = { message_id: string; board_id: string; sequence: number; author_id: string; recipient_id: string | null;
  request_id: string; draft: PersistentMessageDraft; digest: string; created_at: Date | string };
function asBoard(row: BoardRow): CoordinationBoard {
  if (!DOMAIN_IDS.includes(row.domain as Domain)) refuse('COORDINATION_BOARD_BINDING_INVALID');
  return { boardId: row.board_id, corpusId: row.corpus_id, domain: row.domain as Domain, purpose: row.purpose };
}
async function boardWithDomain(sql: TerminalSql, boardId: string): Promise<BoardRow | undefined> {
  return (await sql.query<BoardRow>('SELECT b.*,c.domain FROM payload_coordination_board b JOIN corpora c ON c.corpus_id=b.corpus_id WHERE b.board_id=$1 FOR UPDATE OF b', [boardId])).rows[0];
}
const asMember = (row: MemberRow): CoordinationMember => ({ principalId: row.principal_id, participantId: row.participant_id, kind: row.kind, displayName: row.display_name });
const iso = (value: string | Date) => new Date(value).toISOString();
const sized = (value: unknown, max: number) => { if (Buffer.byteLength(localJson(value)) > max) refuse('COORDINATION_RECORD_LIMIT', 413); };
async function now(sql: TerminalSql) { return iso((await sql.query<{ at: string | Date }>('SELECT clock_timestamp() at')).rows[0].at); }
function readMessage(row: MessageRow): PersistentBoardMessage {
  const draft = draftSchema.parse(row.draft);
  // New inputs may normalize; retained drafts must already be exactly normalized.
  if (localJson(draft) !== localJson(row.draft) || draft.requestId !== row.request_id || draft.recipientId !== row.recipient_id) refuse('COORDINATION_BINDING_INVALID');
  const value = { ...draft, id: row.message_id, authorId: row.author_id, scope: row.board_id, sequence: row.sequence, createdAt: iso(row.created_at) };
  if (localRecordDigest(value) !== row.digest) refuse('COORDINATION_BINDING_INVALID');
  sized({ ...value, digest: row.digest }, COORDINATION_LIMITS.messageBytes);
  return { ...value, digest: row.digest };
}
function parseParticipant(value: unknown): Participant {
  const parsed = retainedParticipant.safeParse(value);
  // A digest proves byte commitment, not declaration validity. Never silently
  // trim/repair retained values or discard fields and expose a different record.
  if (!parsed.success || localJson(parsed.data) !== localJson(value)) refuse('COORDINATION_BINDING_INVALID');
  sized(parsed.data, COORDINATION_LIMITS.definitionBytes);
  return parsed.data;
}
function readParticipant(row: { definition: unknown; digest: string }, board: CoordinationBoard, participantId: string): Participant {
  const definition = parseParticipant(row.definition);
  if (definition.scope !== board.boardId || definition.id !== participantId || definition.domains[0] !== board.domain
    || localRecordDigest(definition) !== row.digest) refuse('COORDINATION_BINDING_INVALID');
  return definition;
}
function readAck(row: { board_id: string; message_id: string; participant_id: string; created_at: string | Date; digest: string }): Acknowledgement {
  const value = { messageId: row.message_id, participantId: row.participant_id, scope: row.board_id, createdAt: iso(row.created_at) };
  if (localRecordDigest(value) !== row.digest) refuse('COORDINATION_BINDING_INVALID');
  return value;
}
function eligible(who: AuthenticatedTerminal) {
  assertAuthenticated(who);
  if (who.terminalClass !== 'FIRM_INTERNAL' || who.purpose !== 'internal_research') refuse('COORDINATION_MEMBERSHIP_REQUIRED', 403);
}
class BoardTransaction implements CoordinationTransaction {
  readonly board: CoordinationBoard;
  readonly member: CoordinationMember;
  constructor(private sql: TerminalSql, private row: BoardRow, member: MemberRow) {
    this.board = Object.freeze(asBoard(row)); this.member = Object.freeze(asMember(member));
  }
  async participants() {
    const rows = (await this.sql.query<{ participant_id: string; definition: Participant; digest: string }>(
      'SELECT participant_id,definition,digest FROM payload_coordination_participant WHERE board_id=$1 ORDER BY participant_id LIMIT 201', [this.board.boardId])).rows;
    if (rows.length > COORDINATION_LIMITS.participants) refuse('COORDINATION_CAPACITY');
    return rows.map(row => readParticipant(row, this.board, row.participant_id));
  }
  async participant(id: string) {
    identifier.parse(id);
    const row = (await this.sql.query<{ definition: Participant; digest: string }>(
      'SELECT definition,digest FROM payload_coordination_participant WHERE board_id=$1 AND participant_id=$2', [this.board.boardId, id])).rows[0];
    return row ? readParticipant(row, this.board, id) : undefined;
  }
  async register(definition: Participant) {
    const validated = parseParticipant(definition);
    if (validated.id !== this.member.participantId || validated.scope !== this.board.boardId) refuse('COORDINATION_IDENTITY_MISMATCH', 403);
    if (validated.domains[0] !== this.board.domain) refuse('COORDINATION_BINDING_INVALID');
    const prior = await this.participant(validated.id);
    if (prior) { if (localJson(prior) !== localJson(validated)) refuse('COORDINATION_REGISTRATION_CONFLICT'); return prior; }
    if ((await this.participants()).length >= COORDINATION_LIMITS.participants) refuse('COORDINATION_CAPACITY');
    await this.sql.query('INSERT INTO payload_coordination_participant(board_id,participant_id,definition,digest) VALUES($1,$2,$3::jsonb,$4)',
      [this.board.boardId, validated.id, JSON.stringify(validated), localRecordDigest(validated)]);
    return (await this.participant(validated.id))!;
  }
  async message(id: string) {
    identifier.parse(id);
    const row = (await this.sql.query<MessageRow>(`SELECT * FROM payload_coordination_message WHERE board_id=$1 AND message_id=$2
      AND (author_id=$3 OR recipient_id=$3 OR recipient_id IS NULL)`, [this.board.boardId,id,this.member.participantId])).rows[0];
    return row ? readMessage(row) : undefined;
  }
  async messageByRequest(requestId: string) {
    identifier.parse(requestId);
    const row = (await this.sql.query<MessageRow>('SELECT * FROM payload_coordination_message WHERE board_id=$1 AND author_id=$2 AND request_id=$3',
      [this.board.boardId,this.member.participantId,requestId])).rows[0];
    return row ? readMessage(row) : undefined;
  }
  async appendMessage(value: PersistentMessageDraft) {
    const draft = draftSchema.parse(value);
    const prior = await this.messageByRequest(draft.requestId);
    if (prior) {
      const retained = Object.fromEntries(Object.keys(draft).map(key => [key, prior[key as keyof PersistentBoardMessage]]));
      if (localJson(retained) !== localJson(draft)) refuse('COORDINATION_IDEMPOTENCY_CONFLICT');
      return prior;
    }
    if (!await this.participant(this.member.participantId)) refuse('COORDINATION_PARTICIPANT_REQUIRED', 409);
    if (draft.recipientId) {
      const recipient = (await this.sql.query('SELECT participant_id FROM payload_coordination_member WHERE board_id=$1 AND participant_id=$2 AND enabled=true',
        [this.board.boardId,draft.recipientId])).rows[0];
      if (!recipient || !await this.participant(draft.recipientId)) refuse('COORDINATION_RECIPIENT_UNAVAILABLE', 404);
    }
    if (draft.kind === 'HANDOFF' && (!draft.recipientId || draft.recipientId === this.member.participantId)) refuse('COORDINATION_INVALID_HANDOFF');
    if (draft.replyTo) {
      const parent = await this.message(draft.replyTo);
      if (!parent) refuse('COORDINATION_MESSAGE_UNAVAILABLE', 404);
      if (parent.topic !== draft.topic || localJson(parent.link) !== localJson(draft.link)) refuse('COORDINATION_THREAD_MISMATCH');
      if (parent.recipientId !== null && draft.recipientId !== (parent.authorId === this.member.participantId ? parent.recipientId : parent.authorId))
        refuse('COORDINATION_THREAD_VISIBILITY', 403);
    }
    if (this.row.next_sequence > COORDINATION_LIMITS.messages) refuse('COORDINATION_CAPACITY');
    const message = { ...draft, id: 'MSG-' + randomUUID(), authorId: this.member.participantId, scope: this.board.boardId,
      sequence: this.row.next_sequence, createdAt: await now(this.sql) };
    const result = { ...message, digest: localRecordDigest(message) }; sized(result, COORDINATION_LIMITS.messageBytes);
    await this.sql.query(`INSERT INTO payload_coordination_message(message_id,board_id,sequence,author_id,recipient_id,request_id,draft,digest,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [message.id,message.scope,message.sequence,message.authorId,message.recipientId,message.requestId,JSON.stringify(draft),result.digest,message.createdAt]);
    await this.sql.query('UPDATE payload_coordination_board SET next_sequence=next_sequence+1 WHERE board_id=$1', [this.board.boardId]);
    this.row.next_sequence++;
    return (await this.message(message.id))!;
  }
  async inbox(query: PersistentInboxQuery): Promise<PersistentInboxPage> {
    if (!Number.isSafeInteger(query.afterSequence) || query.afterSequence < 0 || !Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > COORDINATION_LIMITS.inbox
      || typeof query.includeAcknowledged !== 'boolean' || typeof query.includeBroadcasts !== 'boolean' || (query.kind !== null && !MESSAGE_KINDS.includes(query.kind)))
      refuse('COORDINATION_INBOX_INVALID', 400);
    if (!await this.participant(this.member.participantId)) refuse('COORDINATION_PARTICIPANT_REQUIRED');
    const highWaterSequence = this.row.next_sequence - 1;
    if (query.afterSequence > highWaterSequence) refuse('COORDINATION_CURSOR_AHEAD');
    const rows = (await this.sql.query<MessageRow>(`SELECT m.* FROM payload_coordination_message m
      WHERE m.board_id=$1 AND m.sequence>$2 AND m.author_id<>$3 AND (m.recipient_id=$3 OR ($4 AND m.recipient_id IS NULL))
      AND ($5::text IS NULL OR m.draft->>'kind'=$5)
      AND ($6 OR NOT EXISTS(SELECT 1 FROM payload_coordination_ack a WHERE a.board_id=m.board_id AND a.message_id=m.message_id AND a.participant_id=$3))
      ORDER BY m.sequence LIMIT $7`,
    [this.board.boardId,query.afterSequence,this.member.participantId,query.includeBroadcasts,query.kind,query.includeAcknowledged,query.limit+1])).rows;
    const messages = rows.slice(0,query.limit).map(readMessage), hasMore = rows.length > query.limit;
    const acknowledgements = messages.length ? (await this.sql.query<Parameters<typeof readAck>[0]>(
      'SELECT * FROM payload_coordination_ack WHERE board_id=$1 AND participant_id=$2 AND message_id=ANY($3::text[]) ORDER BY message_id',
      [this.board.boardId,this.member.participantId,messages.map(message => message.id)])).rows.map(readAck) : [];
    return { participantId: this.member.participantId, afterSequence: query.afterSequence, highWaterSequence, hasMore,
      nextSequence: hasMore ? messages[messages.length-1].sequence : highWaterSequence, messages, acknowledgements };
  }
  async acknowledge(messageId: string) {
    const message = await this.message(messageId);
    if (!message) refuse('COORDINATION_MESSAGE_UNAVAILABLE', 404);
    if (!await this.participant(this.member.participantId) || message.authorId === this.member.participantId
      || (message.recipientId !== null && message.recipientId !== this.member.participantId)) refuse('COORDINATION_ACK_REFUSED', 403);
    const prior = (await this.sql.query<Parameters<typeof readAck>[0]>(
      'SELECT * FROM payload_coordination_ack WHERE board_id=$1 AND message_id=$2 AND participant_id=$3',
      [this.board.boardId,messageId,this.member.participantId])).rows[0];
    if (prior) return readAck(prior);
    const value = { messageId, participantId: this.member.participantId, scope: this.board.boardId, createdAt: await now(this.sql) };
    await this.sql.query('INSERT INTO payload_coordination_ack(board_id,message_id,participant_id,created_at,digest) VALUES($1,$2,$3,$4,$5)',
      [value.scope,value.messageId,value.participantId,value.createdAt,localRecordDigest(value)]);
    return value;
  }
}

/** Same board lock serializes membership changes, sequence reservation and writes.
 * No request may manufacture a principal, membership, or another member's author ID. */
export async function withCoordinationBoard<T>(db: TerminalDatabase, who: AuthenticatedTerminal, boardId: string,
  work: (tx: CoordinationTransaction) => Promise<T>): Promise<T> {
  eligible(who); boardIdentifier.parse(boardId);
  return db.transaction(async sql => {
    const board = await boardWithDomain(sql,boardId);
    if (!board || !who.corpusScope.includes(board.corpus_id)) refuse('COORDINATION_MEMBERSHIP_REQUIRED', 403);
    const member = (await sql.query<MemberRow>('SELECT * FROM payload_coordination_member WHERE board_id=$1 AND principal_id=$2 AND enabled=true FOR UPDATE',
      [boardId,who.principalId])).rows[0];
    if (!member || member.kind !== who.kind || member.display_name !== who.displayName) refuse('COORDINATION_MEMBERSHIP_REQUIRED', 403);
    const result = await work(new BoardTransaction(sql,board,member));
    eligible(who); return result;
  });
}

export interface OperatorConfigurationAudit { actor: string; reason: string }
function auditInput(value: OperatorConfigurationAudit) {
  return z.object({ actor: z.string().trim().min(1).max(180), reason: z.string().trim().min(1).max(1000) }).strict().parse(value);
}
async function event(sql: TerminalSql, boardId: string, kind: string, principalId: string | null, details: unknown, audit: OperatorConfigurationAudit) {
  const payload = { eventId: 'CFG-' + randomUUID(), boardId, kind, principalId, ...audit, details, createdAt: await now(sql) };
  await sql.query(`INSERT INTO payload_coordination_configuration_event(event_id,board_id,kind,principal_id,actor,reason,details,created_at,digest)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
  [payload.eventId,boardId,kind,principalId,audit.actor,audit.reason,JSON.stringify(details),payload.createdAt,localRecordDigest(payload)]);
}
/** Explicit operator CLI configuration only. These are not terminal request commands. */
export async function bootstrapBoard(db: TerminalDatabase, input: { boardId: string; corpusId: string }, declaration: OperatorConfigurationAudit): Promise<CoordinationBoard> {
  boardIdentifier.parse(input.boardId); boardIdentifier.parse(input.corpusId); const audit = auditInput(declaration);
  return db.transaction(async sql => {
    await sql.query('LOCK TABLE payload_coordination_board IN SHARE ROW EXCLUSIVE MODE');
    const prior = await boardWithDomain(sql,input.boardId);
    if (prior) { if (prior.corpus_id !== input.corpusId || prior.purpose !== 'internal_research') refuse('COORDINATION_BOARD_CONFLICT'); return asBoard(prior); }
    await sql.query("INSERT INTO payload_coordination_board(board_id,corpus_id,purpose) VALUES($1,$2,'internal_research')", [input.boardId,input.corpusId]);
    await event(sql,input.boardId,'BOARD_CREATED',null,{ corpusId: input.corpusId },audit);
    return asBoard((await boardWithDomain(sql,input.boardId))!);
  });
}
export async function grantMember(db: TerminalDatabase, boardId: string, input: CoordinationMember, declaration: OperatorConfigurationAudit): Promise<CoordinationMember> {
  boardIdentifier.parse(boardId); const audit = auditInput(declaration);
  const member = z.object({ principalId: boardIdentifier, participantId: identifier, kind: z.enum(['HUMAN','AGENT','POLICY']),
    displayName: z.string().min(1).max(128) }).strict().parse(input);
  return db.transaction(async sql => {
    if (!(await sql.query('SELECT board_id FROM payload_coordination_board WHERE board_id=$1 FOR UPDATE',[boardId])).rows[0]) refuse('COORDINATION_BOARD_UNAVAILABLE',404);
    const prior = (await sql.query<MemberRow>('SELECT * FROM payload_coordination_member WHERE board_id=$1 AND principal_id=$2',[boardId,member.principalId])).rows[0];
    if (prior && localJson(asMember(prior)) !== localJson(member)) refuse('COORDINATION_MEMBER_CONFLICT');
    await sql.query('INSERT INTO principal(principal_id,kind,display_name,registered_at) VALUES($1,$2,$3,clock_timestamp()) ON CONFLICT(principal_id) DO NOTHING',
      [member.principalId,member.kind,member.displayName]);
    const identity = (await sql.query<{ kind: string; display_name: string }>('SELECT kind,display_name FROM principal WHERE principal_id=$1',[member.principalId])).rows[0];
    if (identity.kind !== member.kind || identity.display_name !== member.displayName) refuse('COORDINATION_MEMBER_CONFLICT');
    if (prior?.enabled) return member;
    if (!prior) {
      if ((await sql.query('SELECT principal_id FROM payload_coordination_member WHERE board_id=$1 LIMIT 201',[boardId])).rows.length >= COORDINATION_LIMITS.participants) refuse('COORDINATION_CAPACITY');
      if ((await sql.query('SELECT principal_id FROM payload_coordination_member WHERE board_id=$1 AND participant_id=$2',[boardId,member.participantId])).rows[0]) refuse('COORDINATION_MEMBER_CONFLICT');
      await sql.query('INSERT INTO payload_coordination_member(board_id,principal_id,participant_id,kind,display_name) VALUES($1,$2,$3,$4,$5)',
        [boardId,member.principalId,member.participantId,member.kind,member.displayName]);
    } else await sql.query('UPDATE payload_coordination_member SET enabled=true WHERE board_id=$1 AND principal_id=$2',[boardId,member.principalId]);
    await event(sql,boardId,'MEMBER_GRANTED',member.principalId,member,audit); return member;
  });
}
export async function revokeMember(db: TerminalDatabase, boardId: string, principalId: string, declaration: OperatorConfigurationAudit): Promise<void> {
  boardIdentifier.parse(boardId); boardIdentifier.parse(principalId); const audit = auditInput(declaration);
  await db.transaction(async sql => {
    if (!(await sql.query('SELECT board_id FROM payload_coordination_board WHERE board_id=$1 FOR UPDATE',[boardId])).rows[0]) refuse('COORDINATION_BOARD_UNAVAILABLE',404);
    const prior = (await sql.query<MemberRow>('SELECT * FROM payload_coordination_member WHERE board_id=$1 AND principal_id=$2',[boardId,principalId])).rows[0];
    if (!prior) refuse('COORDINATION_MEMBER_UNAVAILABLE',404);
    if (!prior.enabled) return;
    await sql.query('UPDATE payload_coordination_member SET enabled=false WHERE board_id=$1 AND principal_id=$2',[boardId,principalId]);
    await event(sql,boardId,'MEMBER_REVOKED',principalId,asMember(prior),audit);
  });
}
