'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { AUTHORITIES, DOMAINS, MESSAGE_KINDS } from '@/coordination/types';
import { Section } from '@/components/primitives/Section';
import { canonicalJson } from '@/fixtures/digest';

const id = z.string().min(1).max(256);
const text = z.string().max(16000);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sequence = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const participantSchema = z.object({
  id, name: text, kind: z.enum(['AGENT', 'APPARATUS']), version: text, purpose: text,
  authority: z.enum(AUTHORITIES), runtime: z.enum(['Rust', 'C++', 'Python', 'JavaScript', 'Unassigned']),
  status: z.enum(['REFERENCE', 'PLANNED', 'LOCAL']), scope: id, domains: z.array(z.enum(DOMAINS)).max(DOMAINS.length),
  inputs: z.array(text).max(64), outputs: z.array(text).max(64), capabilities: z.array(text).max(64), reference: text,
}).strict();
const connectionSchema = z.object({
  sourceId: id, targetId: id, contracts: z.array(text).max(64), missingInputs: z.array(text).max(64),
  domains: z.array(z.enum(DOMAINS)).max(DOMAINS.length), status: z.enum(['MATCH', 'PARTIAL']),
}).strict();
const identitySchema = z.object({
  schema: z.literal('payload.coordination.identity.v1'), mode: z.literal('AUTHENTICATED'),
  board: z.object({ boardId: id, corpusId: id, purpose: id, domain: z.enum(DOMAINS) }).strict(),
  identity: z.object({ principalId: id, terminalId: id, participantId: id }).strict(),
  participant: participantSchema.nullable(),
}).strict();
const stableSchema = z.object({
  schema: z.literal('payload.coordination.stable.v1'), participants: z.array(participantSchema).max(256),
  connections: z.array(connectionSchema).max(4096), connectionsTruncated: z.boolean(),
}).strict();
const jobState = z.enum(['PROPOSED', 'DENIED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
const linkSchema = z.object({ jobId: id, actionDigest: hash, resultDigest: hash.optional() }).strict();
const linkedJobSchema = z.object({
  jobId: id, actionDigest: hash, corpusId: id, purpose: id, releaseId: id, state: jobState,
  correctsJobId: id.nullable(), corrections: z.array(z.object({ jobId: id, state: jobState }).strict()).max(100),
  fixture_only: z.boolean(), resultDigest: hash.optional(), receiptDigest: hash.optional(),
}).strict();
const messageSchema = z.object({
  requestId: id, recipientId: id.nullable(), kind: z.enum(MESSAGE_KINDS), topic: text, title: text, body: text,
  replyTo: id.nullable(), link: linkSchema.nullable(), authorId: id, scope: id, id,
  sequence: sequence.positive(), createdAt: text, digest: hash,
}).strict();
const entrySchema = z.object({ message: messageSchema, linkedJob: linkedJobSchema.nullable() }).strict();
const acknowledgementSchema = z.object({ messageId: id, participantId: id, scope: id, createdAt: text }).strict();
const inboxSchema = z.object({
  schema: z.literal('payload.coordination.inbox.v1'), participantId: id, afterSequence: sequence,
  nextSequence: sequence, highWaterSequence: sequence, hasMore: z.boolean(),
  messages: z.array(entrySchema).max(20), acknowledgements: z.array(acknowledgementSchema).max(20),
  withheld: sequence.max(20),
}).strict();
// The existing job command can carry a larger execution record. Draw only these
// fields; board messages and arbitrary text are never parsed into job commands.
const jobSchema = z.object({ jobId: id, actionDigest: hash, releaseId: id, state: jobState,
  failureCode: z.string().nullable().optional(), correctsJobId: id.nullable().optional() });

type Identity = z.infer<typeof identitySchema>;
type Entry = z.infer<typeof entrySchema>;
type Inbox = z.infer<typeof inboxSchema>;
type Job = z.infer<typeof jobSchema>;
type Draft = { recipientId: string; kind: typeof MESSAGE_KINDS[number]; topic: string; title: string; body: string;
  replyTo: string; jobId: string; actionDigest: string; resultDigest: string };
const blankDraft = (): Draft => ({ recipientId: '', kind: 'NOTE', topic: '', title: '', body: '', replyTo: '', jobId: '', actionDigest: '', resultDigest: '' });
const secondary = { color: 'var(--text-secondary)' };
const fieldClass = 'surface-inset w-full min-w-0 px-2 py-1.5 text-[12px]';
const codes = /^[A-Z][A-Z0-9_]{0,79}$/;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="min-w-0 flex flex-col gap-1 text-[12px]" style={secondary}><span>{label}</span>{children}</label>;
}

async function boundedReply(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('TERMINAL_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1100000) throw new Error('TERMINAL_RESPONSE_LIMIT');
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new Error('TERMINAL_RESPONSE_INVALID'); }
    if (!body || typeof body !== 'object') throw new Error('TERMINAL_RESPONSE_INVALID');
    const envelope = body as { protocol?: unknown; result?: unknown; error?: unknown };
    if (!response.ok || envelope.error !== undefined) {
      throw new Error(typeof envelope.error === 'string' && codes.test(envelope.error) ? envelope.error : 'TERMINAL_REQUEST_FAILED');
    }
    if (envelope.protocol !== 'payload.terminal.v1' || !Object.hasOwn(envelope, 'result')) throw new Error('TERMINAL_RESPONSE_INVALID');
    return envelope.result;
  } finally {
    signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock();
  }
}

/** Explicit browser client of the SAME authenticated terminal command boundary.
 * No Basic/cookie identity, local ledger access, scheduler, admission or execution. */
export function AuthenticatedBoard({ view }: { view: 'stable' | 'board' }) {
  const [token, setToken] = useState('');
  const [boardId, setBoardId] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [stable, setStable] = useState<z.infer<typeof stableSchema> | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [posted, setPosted] = useState<Entry | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [requestId, setRequestId] = useState('');
  const [includeAcknowledged, setIncludeAcknowledged] = useState(false);
  const [includeBroadcasts, setIncludeBroadcasts] = useState(true);
  const [kind, setKind] = useState('');
  const [profile, setProfile] = useState({ name: '', kind: 'AGENT', version: '0.1.0', purpose: '',
    authority: 'derived', runtime: 'Unassigned', inputs: '', outputs: '', capabilities: '', reference: '' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Enter a terminal Bearer token and board ID, then connect.');
  const [error, setError] = useState('');
  const epoch = useRef(0); const working = useRef(false); const active = useRef<AbortController | null>(null);
  useEffect(() => () => { epoch.current++; active.current?.abort(); }, []);

  function clearSession(nextToken: string, nextBoard: string) {
    epoch.current++; active.current?.abort(); active.current = null; working.current = false;
    setToken(nextToken); setBoardId(nextBoard); setIdentity(null); setStable(null); setInbox(null); setPosted(null);
    setJob(null); setDraft(blankDraft()); setRequestId(''); setBusy(false); setError('');
    setProfile({ name: '', kind: 'AGENT', version: '0.1.0', purpose: '', authority: 'derived', runtime: 'Unassigned',
      inputs: '', outputs: '', capabilities: '', reference: '' });
    setStatus('Disconnected. Connect to establish the server-bound identity.');
  }
  async function command(input: unknown, accept: (value: unknown) => void) {
    if (working.current || !token.trim() || !boardId.trim()) return;
    working.current = true; setBusy(true); setError('');
    const generation = epoch.current; const controller = new AbortController(); active.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const body = JSON.stringify(input);
      if (new TextEncoder().encode(body).byteLength > 65536) throw new Error('TERMINAL_REQUEST_LIMIT');
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        timedOut = true; controller.abort(); reject(new Error('TERMINAL_TIMEOUT_UNCONFIRMED'));
      }, 10000); });
      const work = fetch('/api/v1/terminal', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      }).then(response => boundedReply(response, controller.signal));
      const result = await Promise.race([work, timeout]);
      if (generation === epoch.current) accept(result);
    } catch (failure) {
      if (generation === epoch.current) {
        const code = timedOut ? 'TERMINAL_TIMEOUT_UNCONFIRMED' : failure instanceof z.ZodError ? 'TERMINAL_RESPONSE_INVALID'
          : failure instanceof Error && codes.test(failure.message) ? failure.message : 'TERMINAL_CONNECTION_FAILED';
        setError(code); setStatus('No completion confirmed. An unchanged post keeps the same request key; refresh before assuming a write failed.');
      }
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      if (generation === epoch.current) { working.current = false; setBusy(false); active.current = null; }
    }
  }
  const request = (operation: string, fields: Record<string, unknown>, accept: (value: unknown) => void) =>
    command({ command: 'coordination', request: { operation, boardId: boardId.trim(), ...fields } }, accept);
  function connect() {
    setIdentity(null); setStable(null); setInbox(null); setPosted(null); setJob(null);
    void request('identity', {}, value => {
      const found = identitySchema.parse(value);
      if (found.board.boardId !== boardId.trim() || found.participant && (found.participant.id !== found.identity.participantId
        || found.participant.scope !== found.board.boardId || found.participant.domains.length !== 1
        || found.participant.domains[0] !== found.board.domain)) throw new Error('TERMINAL_RESPONSE_INVALID');
      setIdentity(found); setStatus('Connected as ' + found.identity.participantId + '. Registration declares a definition; it does not launch an agent.');
    });
  }
  function fetchStable() {
    void request('stable', {}, value => {
      const found = stableSchema.parse(value);
      const ids = new Set(found.participants.map(participant => participant.id));
      if (ids.size !== found.participants.length || found.participants.some(participant => participant.scope !== identity?.board.boardId
        || participant.domains.length !== 1 || participant.domains[0] !== identity.board.domain)
        || found.connections.some(connection => !ids.has(connection.sourceId) || !ids.has(connection.targetId))) throw new Error('TERMINAL_RESPONSE_INVALID');
      setStable(found); setStatus('Registered definitions fetched. Contract compatibility is declared, not execution authority.');
    });
  }
  function fetchInbox(afterSequence = 0) {
    void request('inbox', { afterSequence, limit: 20, includeAcknowledged, includeBroadcasts, kind: kind || null }, value => {
      const found = inboxSchema.parse(value);
      if (found.participantId !== identity?.identity.participantId || found.afterSequence !== afterSequence
        || found.nextSequence < afterSequence || found.highWaterSequence < found.nextSequence
        || found.hasMore && found.nextSequence <= afterSequence || found.messages.length + found.withheld > 20)
        throw new Error('TERMINAL_RESPONSE_INVALID');
      const messageIds = new Set<string>(); let previousSequence = afterSequence;
      for (const { message } of found.messages) {
        if (messageIds.has(message.id) || message.sequence <= previousSequence || message.sequence > found.nextSequence
          || message.authorId === identity.identity.participantId
          || (message.recipientId !== identity.identity.participantId && !(includeBroadcasts && message.recipientId === null))
          || (kind && message.kind !== kind)) throw new Error('TERMINAL_RESPONSE_INVALID');
        messageIds.add(message.id); previousSequence = message.sequence;
      }
      found.messages.forEach(assertEntry);
      if (found.acknowledgements.some(item => item.scope !== identity?.board.boardId
        || item.participantId !== identity.identity.participantId || !includeAcknowledged
        || !messageIds.has(item.messageId))) throw new Error('TERMINAL_RESPONSE_INVALID');
      setInbox(found); setStatus('My inbox fetched: ' + found.messages.length + ' visible messages; ' + found.withheld + ' withheld.');
    });
  }
  function updateDraft(update: Partial<Draft>) { setDraft(previous => ({ ...previous, ...update })); setRequestId(''); setPosted(null); }
  function post() {
    const key = requestId || 'REQ-' + crypto.randomUUID(); setRequestId(key);
    const link = draft.jobId.trim() ? { jobId: draft.jobId.trim(), actionDigest: draft.actionDigest.trim(),
      ...(draft.resultDigest.trim() ? { resultDigest: draft.resultDigest.trim() } : {}) } : null;
    const submitted = { requestId: key, recipientId: draft.recipientId.trim() || null, kind: draft.kind,
      topic: draft.topic.trim(), title: draft.title.trim(), body: draft.body.trim(), replyTo: draft.replyTo.trim() || null, link };
    void request('post', { message: submitted }, value => {
      const found = entrySchema.parse(value);
      assertEntry(found);
      if (found.message.authorId !== identity?.identity.participantId || Object.entries(submitted).some(([key, expected]) =>
        canonicalJson(found.message[key as keyof typeof submitted]) !== canonicalJson(expected))) throw new Error('TERMINAL_RESPONSE_INVALID');
      setPosted(found); setStatus('Message ' + found.message.id + ' confirmed. A message is not a job or permission to run one.');
    });
  }
  function inspectJob(entry: Entry) {
    if (!entry.linkedJob || !entry.message.link) return;
    const expected = entry.message.link;
    setJob(null);
    void command({ command: 'job', jobId: expected.jobId }, value => {
      const found = jobSchema.parse(value);
      if (found.jobId !== expected.jobId || found.actionDigest !== expected.actionDigest) throw new Error('TERMINAL_RESPONSE_INVALID');
      setJob(found); setStatus('Job status fetched through the existing terminal permission boundary.');
    });
  }
  function assertEntry(entry: Entry) {
    const linked = entry.linkedJob; const link = entry.message.link;
    if (entry.message.scope !== identity?.board.boardId || Boolean(linked) !== Boolean(link)
      || linked && link && (linked.jobId !== link.jobId || linked.actionDigest !== link.actionDigest
        || linked.corpusId !== identity.board.corpusId || linked.purpose !== identity.board.purpose
        || link.resultDigest !== undefined && linked.resultDigest !== link.resultDigest)) throw new Error('TERMINAL_RESPONSE_INVALID');
  }
  function register() {
    const labels = (value: string) => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
    void request('register', { definition: { ...profile, name: profile.name.trim(), purpose: profile.purpose.trim(),
      version: profile.version.trim(), reference: profile.reference.trim(), status: 'LOCAL',
      inputs: labels(profile.inputs), outputs: labels(profile.outputs), capabilities: labels(profile.capabilities) } }, value => {
      const found = z.object({ participant: participantSchema }).strict().parse(value);
      if (found.participant.id !== identity?.identity.participantId || found.participant.scope !== identity.board.boardId
        || found.participant.domains.length !== 1 || found.participant.domains[0] !== identity.board.domain) throw new Error('TERMINAL_RESPONSE_INVALID');
      setIdentity(previous => previous && { ...previous, participant: found.participant });
      setStatus('Your server-bound participant definition is registered. No worker was launched.');
    });
  }
  function acknowledge(entry: Entry) {
    void request('acknowledge', { messageId: entry.message.id, expectedDigest: entry.message.digest }, value => {
      const { acknowledgement } = z.object({ acknowledgement: acknowledgementSchema }).strict().parse(value);
      if (acknowledgement.messageId !== entry.message.id || acknowledgement.participantId !== identity?.identity.participantId
        || acknowledgement.scope !== identity.board.boardId) throw new Error('TERMINAL_RESPONSE_INVALID');
      setInbox(previous => previous && { ...previous, acknowledgements: [...previous.acknowledgements.filter(
        item => !(item.messageId === acknowledgement.messageId && item.participantId === acknowledgement.participantId)), acknowledgement] });
      setStatus('Acknowledgement recorded for ' + acknowledgement.messageId + '. It does not complete or authorize a job.');
    });
  }
  function drawEntry(entry: Entry, canAcknowledge: boolean) {
    const acknowledged = inbox?.acknowledgements.some(item => item.messageId === entry.message.id && item.participantId === identity?.identity.participantId);
    return <article className="surface-inset p-3 flex flex-col gap-2 min-w-0" key={entry.message.id} data-testid={'board-message-' + entry.message.id}>
      <h3 className="m-0 text-[13px] break-words">{entry.message.title} <span className="pill">{entry.message.kind}</span></h3>
      <p className="m-0 text-[11px] mono break-words">{entry.message.id} · #{entry.message.sequence} · {entry.message.topic}</p>
      <p className="m-0 text-[12px]" style={secondary}>From {entry.message.authorId} → {entry.message.recipientId ?? 'board broadcast'} · {entry.message.createdAt}</p>
      <p className="m-0 whitespace-pre-wrap break-words">{entry.message.body}</p>
      <p className="m-0 text-[11px] mono break-all">Message digest: {entry.message.digest}</p>
      {entry.message.replyTo && <p className="m-0 text-[11px]">Reply to: {entry.message.replyTo}</p>}
      {entry.linkedJob && <div className="flex flex-col gap-1 text-[12px]" data-testid={'board-link-' + entry.message.id}>
        <span>Linked job: <span className="mono">{entry.linkedJob.jobId}</span> · {entry.linkedJob.state}</span>
        <span>Release: {entry.linkedJob.releaseId} · {entry.linkedJob.fixture_only ? 'Fixture-only result' : 'Nonfixture job'} · {entry.linkedJob.purpose}</span>
        <span className="mono break-all">Action digest: {entry.linkedJob.actionDigest}</span>
        {entry.linkedJob.resultDigest && <span className="mono break-all">Result digest: {entry.linkedJob.resultDigest}</span>}
        {entry.linkedJob.correctsJobId && <span>Corrects: {entry.linkedJob.correctsJobId}</span>}
        {entry.linkedJob.corrections.length > 0 && <span>Later corrections: {entry.linkedJob.corrections.map(item => item.jobId + ' (' + item.state + ')').join(', ')}</span>}
        <button type="button" className="btn btn-sm self-start" disabled={busy} onClick={() => inspectJob(entry)}>Fetch linked job status</button>
      </div>}
      {canAcknowledge && <button type="button" className="btn btn-sm self-start" disabled={busy || acknowledged || entry.message.authorId === identity?.identity.participantId}
        onClick={() => acknowledge(entry)}>{acknowledged ? 'Acknowledged by me' : 'Acknowledge as me'}</button>}
    </article>;
  }
  const connected = identity !== null;
  const linkValid = !draft.jobId.trim() ? !draft.actionDigest.trim() && !draft.resultDigest.trim()
    : hash.safeParse(draft.actionDigest.trim()).success && (!draft.resultDigest.trim() || hash.safeParse(draft.resultDigest.trim()).success);
  const canPost = connected && !!identity.participant && !!draft.topic.trim() && !!draft.title.trim() && !!draft.body.trim() && linkValid;
  const canRegister = connected && !identity.participant && [profile.name, profile.purpose, profile.version, profile.reference].every(value => value.trim());

  return <div className="p-3 sm:p-4 max-w-[1600px] mx-auto w-full flex flex-col gap-3 text-[12.5px]" aria-busy={busy}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>{view === 'stable' ? 'Authenticated agent stable' : 'Authenticated message board'}</h1>
        <p className="m-0 mt-1" style={secondary}>One terminal boundary. Server-bound identity, durable definitions and messages; no agents are launched here.</p></div>
      <nav className="flex flex-wrap gap-3" aria-label="Coordination modes">
        <Link href={view === 'stable' ? '/board?mode=authenticated' : '/agents?mode=authenticated'}>{view === 'stable' ? 'Authenticated board' : 'Authenticated stable'}</Link>
        <Link href={view === 'stable' ? '/agents' : '/board'}>Legacy fixture / local view</Link>
      </nav>
    </header>
    <Section title="Terminal connection" id="authenticated-board-connection">
      <div className="surface p-3 flex flex-col gap-2">
        <div className="grid sm:grid-cols-2 gap-2">
          <Field label="Board terminal token"><input type="password" value={token} maxLength={256} autoComplete="off" spellCheck={false}
            onChange={event => clearSession(event.target.value, boardId)} className={fieldClass} aria-describedby="board-token-note" /></Field>
          <Field label="Board ID"><input value={boardId} maxLength={128} spellCheck={false} onChange={event => clearSession(token, event.target.value)} className={fieldClass} /></Field>
        </div>
        <p id="board-token-note" className="m-0 text-[11.5px]" style={secondary}>Token stays only in this widget’s memory; changing page, board or token clears responses. Browser Basic access is not an agent identity. No cookies or stored credentials are sent.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || !/^[A-Za-z0-9_-]{32,256}$/.test(token) || !boardId.trim()} onClick={connect}>Connect to board</button>
          <button type="button" className="btn" disabled={!token && !identity} onClick={() => clearSession('', boardId)}>Forget board token</button>
        </div>
        <p role="status" className="m-0" style={secondary}>{busy ? 'Waiting for the terminal response…' : status}</p>
        {error && <p role="alert" className="m-0" style={{ color: 'var(--status-refused)' }}>Board refused or unavailable: <span className="mono">{error}</span>. No success has been assumed.</p>}
        {identity && <div className="surface-inset p-2 flex flex-col gap-1" data-testid="authenticated-board-identity">
          <span>Participant: <span className="mono">{identity.identity.participantId}</span> · Principal: {identity.identity.principalId} · Terminal: {identity.identity.terminalId}</span>
          <span>Board: {identity.board.boardId} · Corpus: {identity.board.corpusId} · Purpose: {identity.board.purpose}</span>
          <span>{identity.participant ? 'Registered definition: ' + identity.participant.name : 'No participant definition registered for this identity yet.'}</span>
        </div>}
      </div>
    </Section>
    {connected && <>
      {view === 'stable' && <Section title="Registered definitions" id="authenticated-stable">
        <div className="surface p-3 flex flex-col gap-3">
          <p className="m-0" style={secondary}>Declared authority and compatible contracts describe a participant; they do not grant permissions or prove a running worker.</p>
          <button type="button" className="btn self-start" disabled={busy} onClick={fetchStable}>Fetch registered stable</button>
          {stable && <><p className="m-0">{stable.participants.length} registered definitions · {stable.connections.length} declared connections{stable.connectionsTruncated ? ' (connection listing truncated)' : ''}</p>
            <ul className="list-none m-0 p-0 flex flex-col gap-2" aria-label="Authenticated participants">{stable.participants.map(participant => <li key={participant.id} className="surface-inset p-2">
              <strong>{participant.name}</strong> · {participant.kind} · {participant.status} · {participant.runtime}<br />
              <span className="mono break-words">{participant.id}</span> · declared {participant.authority}<br />{participant.purpose}
            </li>)}</ul>
            <details><summary>Declared contract connections</summary><ul>{stable.connections.map((connection, index) => <li key={index}>
              {connection.sourceId} → {connection.targetId}: {connection.status}; contracts {connection.contracts.join(', ') || 'none'}; missing {connection.missingInputs.join(', ') || 'none'}
            </li>)}</ul></details></>}
          {!identity.participant && <form aria-label="Register my participant" className="flex flex-col gap-2" onSubmit={event => { event.preventDefault(); if (canRegister && !busy) register(); }}>
            <p className="m-0">Register only your bound participant. Its ID, scope and domains are set by the server.</p>
            <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-2 border-0 m-0 p-0">
              <Field label="Definition name"><input className={fieldClass} value={profile.name} maxLength={180} onChange={event => setProfile({ ...profile, name: event.target.value })} /></Field>
              <Field label="Definition version"><input className={fieldClass} value={profile.version} maxLength={40} onChange={event => setProfile({ ...profile, version: event.target.value })} /></Field>
              <Field label="Definition kind"><select className={fieldClass} value={profile.kind} onChange={event => setProfile({ ...profile, kind: event.target.value })}><option>AGENT</option><option>APPARATUS</option></select></Field>
              <Field label="Definition runtime"><select className={fieldClass} value={profile.runtime} onChange={event => setProfile({ ...profile, runtime: event.target.value })}>{['Rust', 'C++', 'Python', 'JavaScript', 'Unassigned'].map(value => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Declared authority"><select className={fieldClass} value={profile.authority} onChange={event => setProfile({ ...profile, authority: event.target.value })}>{AUTHORITIES.map(value => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Definition reference"><input className={fieldClass} value={profile.reference} maxLength={500} onChange={event => setProfile({ ...profile, reference: event.target.value })} /></Field>
              <Field label="Definition purpose"><textarea className={fieldClass} value={profile.purpose} maxLength={1200} rows={2} onChange={event => setProfile({ ...profile, purpose: event.target.value })} /></Field>
              {(['inputs', 'outputs', 'capabilities'] as const).map(key => <Field key={key} label={'Declared ' + key + ' (comma-separated)'}><input className={fieldClass} value={profile[key]} maxLength={1200} onChange={event => setProfile({ ...profile, [key]: event.target.value })} /></Field>)}
            </fieldset>
            <button className="btn btn-primary self-start" type="submit" disabled={busy || !canRegister}>Register my definition</button>
          </form>}
        </div>
      </Section>}
      {view === 'board' && <>
        <Section title="My inbox" id="authenticated-inbox">
          <div className="surface p-3 flex flex-col gap-3">
            <div className="flex flex-wrap gap-3 items-end">
              <label><input type="checkbox" disabled={busy} checked={includeAcknowledged} onChange={event => { setIncludeAcknowledged(event.target.checked); setInbox(null); }} /> Include acknowledged</label>
              <label><input type="checkbox" disabled={busy} checked={includeBroadcasts} onChange={event => { setIncludeBroadcasts(event.target.checked); setInbox(null); }} /> Include broadcasts</label>
              <Field label="Inbox message kind"><select className={fieldClass} disabled={busy} value={kind} onChange={event => { setKind(event.target.value); setInbox(null); }}><option value="">All kinds</option>{MESSAGE_KINDS.map(value => <option key={value}>{value}</option>)}</select></Field>
              <button type="button" className="btn" disabled={busy || !identity.participant} onClick={() => fetchInbox()}>Fetch my inbox</button>
              {inbox?.hasMore && <button type="button" className="btn" disabled={busy} onClick={() => fetchInbox(inbox.nextSequence)}>Fetch next inbox page</button>}
            </div>
            {!identity.participant && <p className="m-0">Register your definition in the authenticated stable before posting or reading your inbox.</p>}
            {inbox && <><p className="m-0" style={secondary}>Cursor {inbox.afterSequence} → {inbox.nextSequence}; high-water sequence {inbox.highWaterSequence}. Withheld: {inbox.withheld}. An empty visible page does not prove there are no messages.</p>
              <div className="flex flex-col gap-2" aria-label="My visible messages">{inbox.messages.map(entry => drawEntry(entry, true))}</div></>}
          </div>
        </Section>
        <Section title="Post a coordination message" id="authenticated-compose">
          <form className="surface p-3 flex flex-col gap-3" aria-label="Post authenticated message" onSubmit={event => { event.preventDefault(); if (canPost && !busy) post(); }}>
            <p className="m-0" style={secondary}>Author is bound to {identity.identity.participantId}. A handoff coordinates work; it does not submit, approve, execute or complete a job.</p>
            <fieldset disabled={busy || !identity.participant} className="grid sm:grid-cols-2 gap-2 border-0 m-0 p-0">
              <Field label="Recipient participant ID (blank broadcasts)"><input className={fieldClass} value={draft.recipientId} maxLength={128} onChange={event => updateDraft({ recipientId: event.target.value })} /></Field>
              <Field label="Message kind"><select className={fieldClass} value={draft.kind} onChange={event => updateDraft({ kind: event.target.value as Draft['kind'] })}>{MESSAGE_KINDS.map(value => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Message topic"><input className={fieldClass} value={draft.topic} maxLength={80} onChange={event => updateDraft({ topic: event.target.value })} /></Field>
              <Field label="Message title"><input className={fieldClass} value={draft.title} maxLength={180} onChange={event => updateDraft({ title: event.target.value })} /></Field>
              <Field label="Message body"><textarea className={fieldClass} value={draft.body} maxLength={4000} rows={4} onChange={event => updateDraft({ body: event.target.value })} /></Field>
              <Field label="Reply to message ID (optional)"><input className={fieldClass} value={draft.replyTo} maxLength={128} onChange={event => updateDraft({ replyTo: event.target.value })} /></Field>
              <Field label="Linked job ID (optional)"><input className={fieldClass} value={draft.jobId} maxLength={128} onChange={event => updateDraft({ jobId: event.target.value })} /></Field>
              <Field label="Linked job action digest"><input className={fieldClass} value={draft.actionDigest} maxLength={71} onChange={event => updateDraft({ actionDigest: event.target.value })} /></Field>
              <Field label="Linked result digest (optional)"><input className={fieldClass} value={draft.resultDigest} maxLength={71} onChange={event => updateDraft({ resultDigest: event.target.value })} /></Field>
            </fieldset>
            {requestId && <p className="m-0 mono text-[11px] break-all" data-testid="authenticated-post-key">Request key: {requestId}</p>}
            <button type="submit" className="btn btn-primary self-start" disabled={busy || !canPost}>Post as me</button>
            {posted && <div data-testid="authenticated-posted">{drawEntry(posted, false)}</div>}
          </form>
        </Section>
      </>}
      {job && <Section title="Current linked job status" id="authenticated-job-status"><div className="surface p-3" data-testid="authenticated-job">
        <p className="m-0">{job.jobId} · {job.state} · {job.releaseId}{job.failureCode ? ' · ' + job.failureCode : ''}</p>
        <p className="m-0 mono break-all">Action digest: {job.actionDigest}</p>
        <p className="m-0" style={secondary}>Read only. Board acknowledgements do not change this execution state.</p>
      </div></Section>}
    </>}
  </div>;
}
