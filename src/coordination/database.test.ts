import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authenticateTerminal, tokenDigest, type AuthenticatedTerminal } from '../terminal/auth';
import type { TerminalDatabase } from '../terminal/database';
import { installTerminalSchema } from '../terminal/schema';
import { localRecordDigest } from '../data-os/local-record';
import type { Participant } from './types';
import { installCoordinationSchema } from './schema';
import { bootstrapBoard, grantMember, revokeMember, withCoordinationBoard, type PersistentMessageDraft, type PersistentInboxQuery } from './database';

const boardId = 'firm-research';
const corpusId = 'landshark.terminal-parcels';
const audit = { actor: 'synthetic-operator', reason: 'Offline test configuration only' };
let directory: string, pg: PGlite, db: TerminalDatabase;
let first: AuthenticatedTerminal, secondTerminal: AuthenticatedTerminal, receiver: AuthenticatedTerminal, outsider: AuthenticatedTerminal;
function adapter(client: PGlite): TerminalDatabase {
  return { transaction: work => client.transaction(tx => work({
    query: async <T>(sql: string, values?: unknown[]) => values !== undefined
      ? { rows: (await tx.query<T>(sql,values)).rows }
      : { rows: (await tx.exec(sql)).flatMap(result => result.rows as T[]) },
  })) };
}
function who(name: string, terminal = name, scopes = [corpusId], changes: Record<string, unknown> = {}): AuthenticatedTerminal {
  const token = 'synthetic_token_0123456789abcdef_' + terminal;
  const config = JSON.stringify([{ principalId: name, terminalId: terminal, displayName: name, kind: 'AGENT',
    terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: scopes, canReview: false,
    expiresAt: '2099-01-01T00:00:00.000Z', tokenSha256: tokenDigest(token), ...changes }]);
  return authenticateTerminal(new Request('http://127.0.0.1/api/v1/terminal', { headers: { authorization: 'Bearer ' + token } }), config);
}
function definition(id: string): Participant {
  return { id, name: id, kind: 'AGENT', version: '1', purpose: 'Synthetic testing', authority: 'derived',
    runtime: 'JavaScript', status: 'LOCAL', scope: boardId, domains: ['LANDSHARK'], inputs: [], outputs: [], capabilities: [], reference: 'offline' };
}
const invalidDefinitions: { name: string; change: (value: Participant) => unknown }[] = [
  { name: 'missing declaration fields', change: value => ({ id: value.id, scope: value.scope }) },
  { name: 'undeclared authority field', change: value => ({ ...value, canReview: true }) },
  { name: 'invalid authority', change: value => ({ ...value, authority: 'administrator' }) },
  { name: 'non-local status', change: value => ({ ...value, status: 'REFERENCE' }) },
  { name: 'wrong domain', change: value => ({ ...value, domains: ['CARAVAN'] }) },
  { name: 'extra domain', change: value => ({ ...value, domains: ['LANDSHARK', 'CARAVAN'] }) },
  { name: 'duplicate domain', change: value => ({ ...value, domains: ['LANDSHARK', 'LANDSHARK'] }) },
  { name: 'missing domain', change: value => ({ ...value, domains: [] }) },
  { name: 'unknown domain', change: value => ({ ...value, domains: ['UNKNOWN'] }) },
  { name: 'non-normalized text', change: value => ({ ...value, name: ' padded ' }) },
  { name: 'non-normalized contract', change: value => ({ ...value, inputs: [' Request/v1 '] }) },
  { name: 'duplicate contracts', change: value => ({ ...value, outputs: ['Result/v1', 'Result/v1'] }) },
  { name: 'non-array contracts', change: value => ({ ...value, outputs: 'Result/v1' }) },
  { name: 'oversized label', change: value => ({ ...value, inputs: ['x'.repeat(181)] }) },
  { name: 'wrong bound id', change: value => ({ ...value, id: 'somebody-else' }) },
  { name: 'wrong bound board', change: value => ({ ...value, scope: 'another-board' }) },
];
async function member(principal: AuthenticatedTerminal) {
  await grantMember(db,boardId,{ principalId: principal.principalId, participantId: principal.principalId + '-participant',
    kind: principal.kind, displayName: principal.displayName },audit);
  await withCoordinationBoard(db,principal,boardId,tx => tx.register(definition(tx.member.participantId)));
}
function draft(key: string, overrides: Partial<PersistentMessageDraft> = {}): PersistentMessageDraft {
  return { requestId: key, recipientId: 'receiver-participant', kind: 'REQUEST', topic: 'offline-review', title: 'Synthetic request',
    body: 'Review retained evidence only.', replyTo: null, link: null, ...overrides };
}
const inbox: PersistentInboxQuery = { afterSequence: 0, limit: 50, includeAcknowledged: false, includeBroadcasts: false, kind: null };
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(),'coordination-pg-'));
  pg = new PGlite(join(directory,'database')); await pg.waitReady; db = adapter(pg);
  // Actual corpus table names and the real terminal migration, with synthetic fixture rows.
  await pg.exec(`CREATE TABLE corpora(corpus_id text PRIMARY KEY,domain text NOT NULL,title text NOT NULL,description text NOT NULL,data jsonb NOT NULL);
    CREATE TABLE releases(release_id text PRIMARY KEY,corpus_id text NOT NULL REFERENCES corpora(corpus_id),status text NOT NULL,known_at timestamptz NOT NULL,data jsonb NOT NULL);
    INSERT INTO corpora VALUES('landshark.terminal-parcels','LANDSHARK','Fixture','Fixture','{"fixture_only":true}'),('caravan.freight','CARAVAN','Fixture','Fixture','{"fixture_only":true}');`);
  await installTerminalSchema(db);
  await installCoordinationSchema(db);
  await bootstrapBoard(db,{ boardId,corpusId },audit);
  first = who('first'); secondTerminal = who('first','first-second-terminal'); receiver = who('receiver'); outsider = who('outsider');
  await member(first); await member(receiver); await member(outsider);
});
afterEach(async () => {
  await pg?.close();
  if (directory) {
    expect(dirname(resolve(directory))).toBe(resolve(tmpdir())); expect(basename(directory)).toMatch(/^coordination-pg-/);
    rmSync(directory,{recursive:true,force:true});
  }
});

describe('explicit shared coordination storage', () => {
  it('migrates idempotently and binds the board to authoritative corpus domain without admitting corpus data', async () => {
    await installCoordinationSchema(db);
    expect(await bootstrapBoard(db,{boardId,corpusId},audit)).toEqual({boardId,corpusId,domain:'LANDSHARK',purpose:'internal_research'});
    await expect(bootstrapBoard(db,{boardId,corpusId:'caravan.freight'},audit)).rejects.toMatchObject({code:'COORDINATION_BOARD_CONFLICT'});
    await expect(bootstrapBoard(db,{boardId:'missing-corpus',corpusId:'absent'},audit)).rejects.toThrow();
    expect((await pg.query('SELECT * FROM corpora')).rows).toHaveLength(2);
  });
  it('binds registration to configured member and refuses definition changes', async () => {
    await withCoordinationBoard(db,first,boardId,async tx => {
      expect(await tx.register(definition(tx.member.participantId))).toEqual(definition(tx.member.participantId));
      await expect(tx.register({...definition(tx.member.participantId), purpose:'changed'})).rejects.toMatchObject({code:'COORDINATION_REGISTRATION_CONFLICT'});
      await expect(tx.register(definition('outsider-participant'))).rejects.toMatchObject({code:'COORDINATION_IDENTITY_MISMATCH'});
      expect(await tx.participants()).toHaveLength(3);
    });
    await expect(grantMember(db,boardId,{principalId:'first',participantId:'replacement',kind:'AGENT',displayName:'first'},audit)).rejects.toMatchObject({code:'COORDINATION_MEMBER_CONFLICT'});
  });
  it('accepts only complete normalized declarations and the exact server-bound identity and domain on registration', async () => {
    const newcomer = who('newcomer');
    const participantId = 'newcomer-participant';
    await grantMember(db,boardId,{principalId:newcomer.principalId,participantId,kind:newcomer.kind,displayName:newcomer.displayName},audit);
    for (const variant of invalidDefinitions) {
      const malformed = variant.change(definition(participantId));
      const identityMismatch = ['wrong bound id', 'wrong bound board'].includes(variant.name);
      await expect(withCoordinationBoard(db,newcomer,boardId,tx=>tx.register(malformed as Participant)), variant.name)
        .rejects.toMatchObject({code:identityMismatch ? 'COORDINATION_IDENTITY_MISMATCH' : 'COORDINATION_BINDING_INVALID'});
      expect((await pg.query('SELECT participant_id FROM payload_coordination_participant WHERE participant_id=$1',[participantId])).rows, variant.name).toEqual([]);
    }
    const saved = await withCoordinationBoard(db,newcomer,boardId,tx=>tx.register(definition(participantId)));
    expect(saved).toEqual(definition(participantId));
    saved.inputs.push('Caller mutation');
    expect(await withCoordinationBoard(db,newcomer,boardId,tx=>tx.participant(participantId))).toEqual(definition(participantId));
  });
  it('refuses rehashed malformed declarations inserted by a non-superuser before participant or roster exposure', async () => {
    // INSERT is a normal DML privilege: no superuser, trigger bypass, update or
    // delete authority is needed to create a structurally valid but bad JSON row.
    await pg.exec('CREATE ROLE coordination_fixture_writer NOLOGIN; GRANT INSERT ON payload_coordination_participant TO coordination_fixture_writer');
    await expect(pg.transaction(async tx => {
      await tx.exec('SET LOCAL ROLE coordination_fixture_writer');
      await tx.exec('DELETE FROM payload_coordination_participant');
    })).rejects.toThrow(/permission denied/);
    for (const [index, variant] of invalidDefinitions.entries()) {
      const principal = who(`raw-${index}`), participantId = `raw-${index}-participant`;
      await grantMember(db,boardId,{principalId:principal.principalId,participantId,kind:principal.kind,displayName:principal.displayName},audit);
      const malformed = variant.change(definition(participantId));
      const digest = localRecordDigest(malformed);
      await pg.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE coordination_fixture_writer');
        expect((await tx.query<{rolsuper:boolean}>('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper).toBe(false);
        await tx.query('INSERT INTO payload_coordination_participant(board_id,participant_id,definition,digest) VALUES($1,$2,$3::jsonb,$4)',
          [boardId,participantId,JSON.stringify(malformed),digest]);
      });
      await expect(withCoordinationBoard(db,first,boardId,tx=>tx.participant(participantId)), variant.name)
        .rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
      await expect(withCoordinationBoard(db,first,boardId,tx=>tx.participants()), variant.name)
        .rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
      await expect(withCoordinationBoard(db,principal,boardId,tx=>tx.register(definition(participantId))), variant.name)
        .rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
      expect((await pg.query<{definition:unknown;digest:string}>('SELECT definition,digest FROM payload_coordination_participant WHERE board_id=$1 AND participant_id=$2',
        [boardId,participantId])).rows[0], variant.name).toEqual({definition:malformed,digest});
    }
  });
  it('rechecks a retained declaration against the current authoritative corpus domain', async () => {
    await pg.query('UPDATE corpora SET domain=$1 WHERE corpus_id=$2',['CARAVAN',corpusId]);
    await expect(withCoordinationBoard(db,first,boardId,tx=>tx.participant('first-participant'))).rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
    await expect(withCoordinationBoard(db,first,boardId,tx=>tx.participants())).rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
    expect((await pg.query<{definition:Participant}>('SELECT definition FROM payload_coordination_participant WHERE participant_id=$1',['first-participant'])).rows[0].definition)
      .toEqual(definition('first-participant'));
  });
  it('lets two terminals of one principal reopen exactly the same durable message across a database restart', async () => {
    const posted = await withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('durable')));
    await pg.close(); pg = new PGlite(join(directory,'database')); await pg.waitReady; db = adapter(pg);
    await installCoordinationSchema(db);
    const retained = await withCoordinationBoard(db,secondTerminal,boardId,tx => tx.messageByRequest('durable'));
    expect(retained).toEqual(posted);
    const {digest,...payload} = retained!; expect(localRecordDigest(payload)).toBe(digest);
  });
  it('serializes duplicate requests to one message and refuses changed-payload key reuse', async () => {
    const results = await Promise.all([
      withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('same'))),
      withCoordinationBoard(db,secondTerminal,boardId,tx => tx.appendMessage(draft('same'))),
    ]);
    expect(results[0]).toEqual(results[1]);
    await expect(withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('same',{body:'changed'})))).rejects.toMatchObject({code:'COORDINATION_IDEMPOTENCY_CONFLICT'});
    expect((await pg.query('SELECT * FROM payload_coordination_message')).rows).toHaveLength(1);
  });
  it('keeps directed messages private to author and recipient across direct reads, requests and inboxes', async () => {
    const posted = await withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('private')));
    expect(await withCoordinationBoard(db,receiver,boardId,tx => tx.message(posted.id))).toEqual(posted);
    expect(await withCoordinationBoard(db,outsider,boardId,tx => tx.message(posted.id))).toBeUndefined();
    expect(await withCoordinationBoard(db,outsider,boardId,tx => tx.messageByRequest('private'))).toBeUndefined();
    expect((await withCoordinationBoard(db,outsider,boardId,tx => tx.inbox({...inbox,includeBroadcasts:true}))).messages).toEqual([]);
    await expect(withCoordinationBoard(db,receiver,boardId,tx => tx.appendMessage(draft('leak',{recipientId:null,replyTo:posted.id})))).rejects.toMatchObject({code:'COORDINATION_THREAD_VISIBILITY'});
  });
  it('pages incoming messages, explicitly includes broadcasts, and retains exact ACKs without author acknowledgement', async () => {
    const a = await withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('one')));
    await withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('two',{recipientId:null})));
    await withCoordinationBoard(db,receiver,boardId,tx => tx.appendMessage(draft('outgoing',{recipientId:'first-participant'})));
    const page = await withCoordinationBoard(db,receiver,boardId,tx => tx.inbox({...inbox,limit:1,includeBroadcasts:true}));
    expect(page.messages.map(m=>m.requestId)).toEqual(['one']); expect(page.hasMore).toBe(true);
    const next = await withCoordinationBoard(db,receiver,boardId,tx => tx.inbox({...inbox,afterSequence:page.nextSequence,includeBroadcasts:true}));
    expect(next.messages.map(m=>m.requestId)).toEqual(['two']); expect(next.nextSequence).toBe(3);
    await expect(withCoordinationBoard(db,first,boardId,tx => tx.acknowledge(a.id))).rejects.toMatchObject({code:'COORDINATION_ACK_REFUSED'});
    const ack = await withCoordinationBoard(db,receiver,boardId,tx => tx.acknowledge(a.id));
    expect(await withCoordinationBoard(db,receiver,boardId,tx => tx.acknowledge(a.id))).toEqual(ack);
    expect((await withCoordinationBoard(db,receiver,boardId,tx => tx.inbox(inbox))).messages).toEqual([]);
    expect((await withCoordinationBoard(db,receiver,boardId,tx => tx.inbox({...inbox,includeAcknowledged:true}))).acknowledgements).toEqual([ack]);
    await expect(withCoordinationBoard(db,receiver,boardId,tx => tx.inbox({...inbox,afterSequence:4}))).rejects.toMatchObject({code:'COORDINATION_CURSOR_AHEAD'});
    await expect(withCoordinationBoard(db,receiver,boardId,tx => tx.inbox({...inbox,limit:51}))).rejects.toMatchObject({code:'COORDINATION_INBOX_INVALID'});
  });
  it('refuses revoked membership on every request and new delivery to disabled recipients, retaining immutable history', async () => {
    const posted = await withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('before-revocation')));
    await revokeMember(db,boardId,'receiver',audit);
    await expect(withCoordinationBoard(db,receiver,boardId,tx => tx.acknowledge(posted.id))).rejects.toMatchObject({code:'COORDINATION_MEMBERSHIP_REQUIRED'});
    await expect(withCoordinationBoard(db,first,boardId,tx => tx.appendMessage(draft('after-revocation')))).rejects.toMatchObject({code:'COORDINATION_RECIPIENT_UNAVAILABLE'});
    expect(await withCoordinationBoard(db,first,boardId,tx => tx.messageByRequest('before-revocation'))).toEqual(posted);
    expect(await withCoordinationBoard(db,first,boardId,tx => tx.participant('receiver-participant'))).toEqual(definition('receiver-participant'));
    await member(receiver);
    expect(await withCoordinationBoard(db,receiver,boardId,tx => tx.message(posted.id))).toEqual(posted);
    const events = (await pg.query<{kind:string}>('SELECT kind FROM payload_coordination_configuration_event WHERE principal_id=$1 ORDER BY created_at',['receiver'])).rows;
    expect(events.map(event=>event.kind)).toEqual(['MEMBER_GRANTED','MEMBER_REVOKED','MEMBER_GRANTED']);
  });
  it('refuses unregistered, cross-corpus, differently identified and forged terminal callers', async () => {
    for (const candidate of [who('unregistered'),who('first','wrong-corpus',['caravan.freight']),who('first','changed-name',[corpusId],{displayName:'changed'})]) {
      await expect(withCoordinationBoard(db,candidate,boardId,tx=>tx.participants())).rejects.toMatchObject({code:'COORDINATION_MEMBERSHIP_REQUIRED'});
    }
    await expect(withCoordinationBoard(db,{...first} as AuthenticatedTerminal,boardId,tx=>tx.participants())).rejects.toMatchObject({code:'AUTHENTICATION_REQUIRED'});
  });
  it('rolls back sequence allocation and stored messages when callback completion fails', async () => {
    await expect(withCoordinationBoard(db,first,boardId,async tx=>{await tx.appendMessage(draft('rolled-back'));throw new Error('synthetic failure');})).rejects.toThrow('synthetic failure');
    const result = await withCoordinationBoard(db,first,boardId,tx=>tx.appendMessage(draft('successful')));
    expect(result.sequence).toBe(1);
  });
  it('uses immutable database guards for definitions, messages, acknowledgements, board identity and audit events', async () => {
    const message = await withCoordinationBoard(db,first,boardId,tx=>tx.appendMessage(draft('immutable')));
    await withCoordinationBoard(db,receiver,boardId,tx=>tx.acknowledge(message.id));
    for (const sql of [
      "UPDATE payload_coordination_participant SET definition='{}'::jsonb",
      "UPDATE payload_coordination_message SET draft='{}'::jsonb",
      'DELETE FROM payload_coordination_message','DELETE FROM payload_coordination_ack',
      "UPDATE payload_coordination_member SET participant_id='hijacked'",
      "UPDATE payload_coordination_board SET corpus_id='caravan.freight'",
      'DELETE FROM payload_coordination_configuration_event',
    ]) await expect(pg.exec(sql)).rejects.toThrow(/coordination_/);
  });
  it('detects changed message digests on readback even if database guards were bypassed by an administrator', async () => {
    const message = await withCoordinationBoard(db,first,boardId,tx=>tx.appendMessage(draft('tampered')));
    await pg.exec('ALTER TABLE payload_coordination_message DISABLE TRIGGER coordination_message_immutable');
    await pg.query("UPDATE payload_coordination_message SET draft=jsonb_set(draft,'{body}','\"changed\"') WHERE message_id=$1",[message.id]);
    await expect(withCoordinationBoard(db,receiver,boardId,tx=>tx.message(message.id))).rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
  });
  it('normalizes new post text but refuses added stored whitespace with the old digest without repairing message or inbox reads', async () => {
    await pg.exec('ALTER TABLE payload_coordination_message DISABLE TRIGGER coordination_message_immutable');
    for (const field of ['topic','title','body'] as const) {
      const input = draft(`whitespace-${field}`);
      const padded = ` \n${input[field]}\t `;
      const message = await withCoordinationBoard(db,first,boardId,tx=>tx.appendMessage({...input,[field]:padded}));
      expect(message[field],field).toBe(input[field]);
      const readStored = async () => (await pg.query<{draft:PersistentMessageDraft;digest:string}>(
        'SELECT draft,digest FROM payload_coordination_message WHERE message_id=$1',[message.id])).rows[0];
      const before = await readStored();
      expect(before.draft,field).toEqual(input);
      await pg.query('UPDATE payload_coordination_message SET draft=jsonb_set(draft,$1::text[],$2::jsonb) WHERE message_id=$3',
        [[field],JSON.stringify(padded),message.id]);
      const altered = {draft:{...before.draft,[field]:padded},digest:before.digest};
      expect(await readStored(),field).toEqual(altered);
      await expect(withCoordinationBoard(db,receiver,boardId,tx=>tx.message(message.id)),field)
        .rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
      await expect(withCoordinationBoard(db,receiver,boardId,tx=>tx.inbox({...inbox,afterSequence:message.sequence-1,limit:1})),field)
        .rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
      await expect(withCoordinationBoard(db,first,boardId,tx=>tx.appendMessage(input)),field)
        .rejects.toMatchObject({code:'COORDINATION_BINDING_INVALID'});
      expect(await readStored(),field).toEqual(altered);
    }
    expect((await pg.query('SELECT message_id FROM payload_coordination_message')).rows).toHaveLength(3);
  });
});
