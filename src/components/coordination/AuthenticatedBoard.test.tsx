import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthenticatedBoard } from './AuthenticatedBoard';
import { getCoordinationSnapshot } from '@/coordination/store';

vi.mock('@/coordination/store', () => ({ getCoordinationSnapshot: vi.fn() }));

const TOKEN = 'a'.repeat(48);
const BOARD = 'research-board';
const actionDigest = 'sha256:' + 'a'.repeat(64);
const messageDigest = 'sha256:' + 'b'.repeat(64);
const resultDigest = 'sha256:' + 'c'.repeat(64);
const participant = { id: 'bound-agent', name: 'Registered research definition', kind: 'AGENT', version: '0.1.0',
  purpose: 'Bounded internal research', authority: 'derived', runtime: 'JavaScript', status: 'LOCAL', scope: BOARD,
  domains: ['LANDSHARK'], inputs: [], outputs: [], capabilities: [], reference: 'operator:definition' };
const identity = { schema: 'payload.coordination.identity.v1', mode: 'AUTHENTICATED',
  board: { boardId: BOARD, corpusId: 'landshark.terminal-parcels', purpose: 'internal_research', domain: 'LANDSHARK' },
  identity: { principalId: 'principal-agent', terminalId: 'browser-agent', participantId: participant.id }, participant };
const link = { jobId: 'JOB-read-only', actionDigest, resultDigest };
const linkedJob = { ...link, corpusId: identity.board.corpusId, purpose: identity.board.purpose,
  releaseId: 'REL-LS-fixture', state: 'SUCCEEDED', correctsJobId: 'JOB-earlier', corrections: [{ jobId: 'JOB-later', state: 'PROPOSED' }], fixture_only: true };
const message = { requestId: 'REQ-peer', recipientId: participant.id, kind: 'HANDOFF', topic: 'research',
  title: 'Inspect retained result', body: 'A request is not execution authority.', replyTo: null, link,
  authorId: 'peer-agent', scope: BOARD, id: 'MSG-peer', sequence: 1, createdAt: '2026-09-12T12:00:00.000Z', digest: messageDigest };
const entry = { message, linkedJob };
const inbox = { schema: 'payload.coordination.inbox.v1', participantId: participant.id, afterSequence: 0,
  nextSequence: 1, highWaterSequence: 1, hasMore: false, messages: [entry], acknowledgements: [], withheld: 0 };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify({ protocol: 'payload.terminal.v1',
  ...(status < 400 ? { result: value } : { error: value }) }), { status, headers: { 'content-type': 'application/json' } });
type Command = { command: string; jobId?: string; request?: Record<string, unknown> };
type Handler = (input: Command) => Response | Promise<Response>;

function server(overrides: Record<string, Handler> = {}) {
  const commands: Command[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)) as Command; commands.push(input);
    const operation = input.command === 'coordination' ? String(input.request?.operation) : input.command;
    if (overrides[operation]) return overrides[operation](input);
    switch (operation) {
      case 'identity': return reply(identity);
      case 'stable': return reply({ schema: 'payload.coordination.stable.v1', participants: [participant], connections: [], connectionsTruncated: false });
      case 'inbox': return reply({ ...inbox, afterSequence: input.request?.afterSequence });
      case 'register': return reply({ participant: { ...(input.request?.definition as object), id: participant.id, scope: BOARD, domains: participant.domains } });
      case 'post': return reply({ message: { ...(input.request?.message as object), authorId: participant.id, scope: BOARD,
        id: 'MSG-saved', sequence: 2, createdAt: message.createdAt, digest: messageDigest }, linkedJob: null });
      case 'acknowledge': return reply({ acknowledgement: { messageId: input.request?.messageId, participantId: participant.id, scope: BOARD, createdAt: message.createdAt } });
      case 'job': return reply({ jobId: link.jobId, actionDigest, releaseId: linkedJob.releaseId, state: 'SUCCEEDED', failureCode: null });
      default: return reply('COMMAND_INVALID', 400);
    }
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, commands };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function connect(user: ReturnType<typeof userEvent.setup>) {
  change('Board terminal token', TOKEN); change('Board ID', BOARD);
  await user.click(screen.getByRole('button', { name: 'Connect to board' }));
  await screen.findByTestId('authenticated-board-identity');
}
function compose() {
  change('Message topic', 'research'); change('Message title', 'A bounded request'); change('Message body', 'Please inspect; do not launch anything.');
}

describe('AuthenticatedBoard terminal client', () => {
  it('selects authenticated pages before reading local snapshots and retains explicit legacy fallbacks', async () => {
    const [{ default: AgentsPage }, { default: BoardPage }] = await Promise.all([
      import('@/app/agents/page'), import('@/app/board/page'),
    ]);
    const snapshot = vi.mocked(getCoordinationSnapshot);
    snapshot.mockRejectedValue(new Error('LOCAL_SNAPSHOT_SELECTED'));
    for (const [page, view] of [[AgentsPage, 'stable'], [BoardPage, 'board']] as const) {
      const element = await page({ searchParams: Promise.resolve({ mode: 'authenticated' }) });
      expect(element.type).toBe(AuthenticatedBoard);
      expect(element.props).toEqual({ view });
    }
    expect(snapshot).not.toHaveBeenCalled();
    await expect(AgentsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('LOCAL_SNAPSHOT_SELECTED');
    await expect(BoardPage({ searchParams: Promise.resolve({ mode: ['authenticated'] }) })).rejects.toThrow('LOCAL_SNAPSHOT_SELECTED');
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it('is opt-in, keeps tokens in memory, and uses the shared Bearer endpoint without Basic/cookies', async () => {
    const user = userEvent.setup(); const { fetch, commands } = server();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<AuthenticatedBoard view="board" />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Board terminal token')).toHaveAttribute('type', 'password');
    change('Board ID', BOARD); change('Board terminal token', 'Basic operator-password');
    expect(screen.getByRole('button', { name: 'Connect to board' })).toBeDisabled();
    await connect(user);
    expect(commands).toEqual([{ command: 'coordination', request: { operation: 'identity', boardId: BOARD } }]);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/terminal');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' } });
    expect(storage).not.toHaveBeenCalled();
    expect(screen.getByTestId('authenticated-board-identity')).toHaveTextContent('bound-agent');
    await user.click(screen.getByRole('button', { name: 'Forget board token' }));
    expect(screen.getByLabelText('Board terminal token')).toHaveValue('');
    expect(screen.queryByTestId('authenticated-board-identity')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('registers only the bound definition and preserves declared-vs-executing distinctions', async () => {
    const user = userEvent.setup(); const { commands } = server({ identity: () => reply({ ...identity, participant: null }) });
    render(<AuthenticatedBoard view="stable" />); await connect(user);
    await user.click(screen.getByRole('button', { name: 'Fetch registered stable' }));
    expect(await screen.findByRole('list', { name: 'Authenticated participants' })).toHaveTextContent(participant.name);
    change('Definition name', 'My bounded adapter'); change('Definition purpose', 'Review declared information only.');
    change('Definition reference', 'operator:review'); change('Declared inputs (comma-separated)', 'Input/v1, Input/v1');
    expect(screen.queryByLabelText('Participant ID')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Register my definition' }));
    await waitFor(() => expect(screen.getByTestId('authenticated-board-identity')).toHaveTextContent('My bounded adapter'));
    const submitted = commands.find(command => command.request?.operation === 'register')!.request!.definition as Record<string, unknown>;
    expect(submitted).toMatchObject({ name: 'My bounded adapter', kind: 'AGENT', authority: 'derived', status: 'LOCAL', inputs: ['Input/v1'] });
    for (const field of ['id', 'scope', 'domains', 'principalId']) expect(submitted).not.toHaveProperty(field);
    expect(screen.getByRole('status')).toHaveTextContent('No worker was launched.');
    expect(commands.every(command => command.command === 'coordination')).toBe(true);
  });

  it('fetches my inbox, binds acknowledgement to its digest, and reads typed job status separately', async () => {
    const user = userEvent.setup(); const { commands } = server();
    render(<AuthenticatedBoard view="board" />); await connect(user);
    await user.click(screen.getByRole('button', { name: 'Fetch my inbox' }));
    const shown = await screen.findByTestId('board-message-MSG-peer');
    expect(shown).toHaveTextContent(message.authorId);
    expect(shown).toHaveTextContent('JOB-earlier'); expect(shown).toHaveTextContent('JOB-later');
    const query = commands.find(command => command.request?.operation === 'inbox')!.request;
    expect(query).toEqual({ operation: 'inbox', boardId: BOARD, afterSequence: 0, limit: 20, includeAcknowledged: false, includeBroadcasts: true, kind: null });
    expect(query).not.toHaveProperty('participantId');
    await user.click(within(shown).getByRole('button', { name: 'Acknowledge as me' }));
    await waitFor(() => expect(within(shown).getByRole('button', { name: 'Acknowledged by me' })).toBeDisabled());
    expect(commands.find(command => command.request?.operation === 'acknowledge')?.request)
      .toEqual({ operation: 'acknowledge', boardId: BOARD, messageId: message.id, expectedDigest: messageDigest });
    await user.click(within(shown).getByRole('button', { name: 'Fetch linked job status' }));
    expect(await screen.findByTestId('authenticated-job')).toHaveTextContent('SUCCEEDED');
    expect(commands.at(-1)).toEqual({ command: 'job', jobId: link.jobId });
    expect(commands.some(command => ['submit', 'review', 'result'].includes(command.command))).toBe(false);
  });

  it('retries an uncertain post with the same exact request and changes the key only when edited', async () => {
    const user = userEvent.setup(); let attempts = 0;
    const { commands } = server({ post: input => {
      if (++attempts === 1) throw new TypeError('unknown write outcome');
      return reply({ message: { ...(input.request!.message as object), authorId: participant.id, scope: BOARD,
        id: 'MSG-saved', sequence: 2, createdAt: message.createdAt, digest: messageDigest }, linkedJob: null });
    } });
    render(<AuthenticatedBoard view="board" />); await connect(user); compose();
    await user.click(screen.getByRole('button', { name: 'Post as me' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_CONNECTION_FAILED');
    const firstKey = screen.getByTestId('authenticated-post-key').textContent;
    expect(screen.queryByTestId('authenticated-posted')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Post as me' }));
    await screen.findByTestId('authenticated-posted');
    const posts = commands.filter(command => command.request?.operation === 'post');
    expect(posts[1]).toEqual(posts[0]);
    expect(posts[0].request!.message).not.toHaveProperty('authorId');
    expect(posts[0].request!.message).not.toHaveProperty('scope');
    change('Message title', 'Changed request');
    expect(screen.queryByTestId('authenticated-post-key')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Post as me' }));
    await screen.findByTestId('authenticated-posted');
    expect(screen.getByTestId('authenticated-post-key').textContent).not.toBe(firstKey);
  });

  it('pages explicitly through withheld entries without claiming empty means nonexistent', async () => {
    const user = userEvent.setup();
    const { commands } = server({ inbox: input => reply(input.request?.afterSequence === 0
      ? { ...inbox, messages: [], nextSequence: 3, highWaterSequence: 4, hasMore: true, withheld: 3 }
      : { ...inbox, messages: [{ ...entry, message: { ...message, sequence: 4 } }], afterSequence: 3, nextSequence: 4, highWaterSequence: 4 }) });
    render(<AuthenticatedBoard view="board" />); await connect(user);
    await user.click(screen.getByRole('button', { name: 'Fetch my inbox' }));
    await screen.findByRole('button', { name: 'Fetch next inbox page' });
    expect(screen.getByText(/An empty visible page/)).toHaveTextContent('Withheld: 3');
    await user.click(screen.getByRole('button', { name: 'Fetch next inbox page' }));
    await screen.findByTestId('board-message-MSG-peer');
    expect(commands.at(-1)?.request?.afterSequence).toBe(3);
    expect(screen.queryByRole('button', { name: 'Fetch next inbox page' })).not.toBeInTheDocument();
  });

  it.each([
    ['disabled backend', () => reply('COORDINATION_DISABLED', 503), 'COORDINATION_DISABLED'],
    ['wrong board', () => reply({ ...identity, board: { ...identity.board, boardId: 'other-board' } }), 'TERMINAL_RESPONSE_INVALID'],
    ['wrong participant domain', () => reply({ ...identity, participant: { ...participant, domains: ['CARAVAN'] } }), 'TERMINAL_RESPONSE_INVALID'],
    ['wrong protocol', () => new Response(JSON.stringify({ protocol: 'wrong', result: identity })), 'TERMINAL_RESPONSE_INVALID'],
    ['invalid envelope', () => reply({}), 'TERMINAL_RESPONSE_INVALID'],
    ['untrusted error text', () => reply('private provider body should never display', 500), 'TERMINAL_REQUEST_FAILED'],
  ] as const)('refuses %s without exposing connected actions', async (_name, handler, code) => {
    const user = userEvent.setup(); server({ identity: handler });
    render(<AuthenticatedBoard view="board" />);
    change('Board terminal token', TOKEN); change('Board ID', BOARD);
    await user.click(screen.getByRole('button', { name: 'Connect to board' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(code);
    expect(screen.queryByTestId('authenticated-board-identity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post as me' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private provider body');
  });

  it('refuses mismatched typed job projections instead of displaying a claimed result', async () => {
    const user = userEvent.setup(); server({ inbox: () => reply({ ...inbox, messages: [{ ...entry, linkedJob: { ...linkedJob, corpusId: 'other-corpus' } }] }) });
    render(<AuthenticatedBoard view="board" />); await connect(user);
    await user.click(screen.getByRole('button', { name: 'Fetch my inbox' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_RESPONSE_INVALID');
    expect(screen.queryByTestId('board-message-MSG-peer')).not.toBeInTheDocument();
  });

  it.each([
    ['another recipient', { recipientId: 'different-agent' }],
    ['self-authored inbox message', { authorId: participant.id }],
    ['message outside the returned cursor', { sequence: 2 }],
  ])('refuses an inbox projection containing %s', async (_name, update) => {
    const user = userEvent.setup(); server({ inbox: () => reply({ ...inbox, messages: [{ ...entry, message: { ...message, ...update } }] }) });
    render(<AuthenticatedBoard view="board" />); await connect(user);
    await user.click(screen.getByRole('button', { name: 'Fetch my inbox' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_RESPONSE_INVALID');
    expect(screen.queryByTestId('board-message-MSG-peer')).not.toBeInTheDocument();
  });

  it('does not confirm a response that changes the posted content', async () => {
    const user = userEvent.setup(); server({ post: input => reply({ message: { ...(input.request!.message as object), title: 'Changed by response',
      authorId: participant.id, scope: BOARD, id: 'MSG-wrong', sequence: 2, createdAt: message.createdAt, digest: messageDigest }, linkedJob: null }) });
    render(<AuthenticatedBoard view="board" />); await connect(user); compose();
    await user.click(screen.getByRole('button', { name: 'Post as me' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_RESPONSE_INVALID');
    expect(screen.queryByTestId('authenticated-posted')).not.toBeInTheDocument();
  });

  it('drops late identity responses after forgetting a token or changing board', async () => {
    const user = userEvent.setup(); let finish: ((response: Response) => void) | undefined;
    const { fetch } = server({ identity: () => new Promise<Response>(resolve => { finish = resolve; }) });
    render(<AuthenticatedBoard view="board" />);
    change('Board terminal token', TOKEN); change('Board ID', BOARD);
    await user.click(screen.getByRole('button', { name: 'Connect to board' }));
    await user.click(screen.getByRole('button', { name: 'Forget board token' }));
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    await act(async () => { finish!(reply(identity)); });
    expect(screen.queryByTestId('authenticated-board-identity')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Board terminal token')).toHaveValue('');
    change('Board ID', 'another-board');
    expect(screen.queryByTestId('board-message-MSG-peer')).not.toBeInTheDocument();
  });

  it('bounds response bytes and aborts on unmount', async () => {
    const user = userEvent.setup(); const { fetch } = server({ identity: () => new Response('x'.repeat(1100001)) });
    const mounted = render(<AuthenticatedBoard view="board" />);
    change('Board terminal token', TOKEN); change('Board ID', BOARD);
    await user.click(screen.getByRole('button', { name: 'Connect to board' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_RESPONSE_LIMIT');
    mounted.unmount(); expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  it('times out an unconfirmed request at ten seconds without clearing a draft key', async () => {
    const user = userEvent.setup(); const { fetch } = server({ post: () => new Promise<Response>(() => {}) });
    render(<AuthenticatedBoard view="board" />); await connect(user); compose();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Post as me' }));
    const key = screen.getByTestId('authenticated-post-key').textContent;
    await act(async () => { await vi.advanceTimersByTimeAsync(10001); });
    expect(screen.getByRole('alert')).toHaveTextContent('TERMINAL_TIMEOUT_UNCONFIRMED');
    expect(screen.getByTestId('authenticated-post-key').textContent).toBe(key);
    expect(fetch.mock.calls.at(-1)![1].signal?.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Post as me' })).toBeEnabled();
  });
});
