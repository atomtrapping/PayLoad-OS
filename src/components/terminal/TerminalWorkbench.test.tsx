import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalWorkbench } from './TerminalWorkbench';

const methodDigest = `sha256:${'a'.repeat(64)}`;
const snapshotDigest = `sha256:${'b'.repeat(64)}`;
const actionDigest = `sha256:${'c'.repeat(64)}`;
const baseRequest = { capability: 'discovery.run-workload', releaseId: 'REL-CAR-2026.09.01', snapshotDigest, methodDigest,
  parameters: { minRecords: 2 }, budget: { maxRows: 1000, maxInputBytes: 1048576, maxOutputBytes: 1048576, timeoutMs: 5000 }, idempotencyKey: 'REQ-saved' };
const baseJob = { jobId: 'JOB-retained', releaseId: baseRequest.releaseId, state: 'PROPOSED', actionDigest, snapshotDigest, methodDigest, request: baseRequest };
const discovery = { identity: { principalId: 'operator-one', terminalId: 'browser-one', purpose: 'internal_research', corpusScope: ['caravan.specialty-cargo'], canReview: true },
  reads: ['list_releases', 'list_records'], mining: { capability: baseRequest.capability, methodDigest, limits: { rows: 1000, inputBytes: 1048576, outputBytes: 1048576, timeoutMs: 5000 } } };
const pin = { snapshotDigest, snapshot: { releaseId: baseRequest.releaseId, corpusId: 'caravan.specialty-cargo', knownAt: '2026-09-01T12:00:00Z', fixture_only: true, records: [{ recordId: 'record-one' }],
  selection: 'PERMITTED_STANDING_RECORDS', coverage: { standingRecords: 7, selectedRecords: 1, withheldByPermission: 6 } } };
const retainedResult = { result: { status: 'SUCCEEDED', artifacts: [{ validation: 'NOT_VALIDATED' }] }, resultDigest: `sha256:${'d'.repeat(64)}`,
  receipt: { jobId: baseJob.jobId, snapshotDigest }, receiptDigest: `sha256:${'e'.repeat(64)}` };
type Command = { command: string; request?: typeof baseRequest; review?: { jobId: string; actionDigest: string; response: string; reason: string }; [key: string]: unknown };
const response = (result: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ protocol: 'payload.terminal.v1', ...(status < 400 ? { result } : { error: result }) }) });

function server(overrides: Partial<Record<string, (input: Command) => unknown | Promise<unknown>>> = {}) {
  const commands: Command[] = [];
  const state = { job: { ...baseJob } };
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(init.body as string) as Command; commands.push(input);
    if (overrides[input.command]) return overrides[input.command]!(input);
    switch (input.command) {
      case 'discover': return response(discovery);
      case 'pin': return response({ ...pin, snapshot: { ...pin.snapshot, releaseId: input.releaseId } });
      case 'submit': state.job = { ...baseJob, request: input.request! }; return response(state.job);
      case 'review': state.job = { ...state.job, state: input.review?.response === 'APPROVE' ? 'QUEUED' : 'DENIED' }; return response(state.job);
      case 'jobs': return response({ jobs: [state.job], nextCursor: null });
      case 'job': return response(state.job);
      case 'result': return response(retainedResult);
      default: return response('COMMAND_INVALID', 400);
    }
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, commands, state };
}

beforeEach(() => {
  let key = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++key).padStart(12, '0')}`);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Terminal token'), 'secret-test-token');
  await user.click(screen.getByRole('button', { name: 'Connect and discover' }));
  await screen.findByTestId('terminal-identity');
}
async function pinRequest(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Release ID'), baseRequest.releaseId);
  await user.click(screen.getByRole('button', { name: 'Pin release' }));
  await screen.findByTestId('terminal-request');
}

describe('TerminalWorkbench', () => {
  it('keeps credentials in memory and uses only the terminal POST endpoint', async () => {
    const user = userEvent.setup(); const { fetch } = server();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<TerminalWorkbench />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Terminal token')).toHaveAttribute('type', 'password');
    expect(screen.getByText(/Pure internal research/)).toHaveTextContent('NOT_VALIDATED');
    await connect(user);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/terminal');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { authorization: 'Bearer secret-test-token', 'content-type': 'application/json' } });
    expect(JSON.parse(init.body as string)).toEqual({ command: 'discover' });
    expect(storage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Forget token' }));
    expect(screen.getByLabelText('Terminal token')).toHaveValue('');
    expect(screen.queryByTestId('terminal-identity')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('pins exact work, submits without approval, and explicitly reviews and retrieves it', async () => {
    const user = userEvent.setup(); const { commands, state } = server();
    render(<TerminalWorkbench />); await connect(user);
    fireEvent.change(screen.getByLabelText('Minimum records'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Maximum input rows'), { target: { value: '50' } });
    await pinRequest(user);
    const coverage = screen.getByTestId('terminal-pin');
    expect(coverage).toHaveTextContent('PERMITTED_STANDING_RECORDS');
    expect(coverage).toHaveTextContent('Standing records7');
    expect(coverage).toHaveTextContent('Selected records1');
    expect(coverage).toHaveTextContent('Withheld by permission6');
    expect(coverage).toHaveTextContent('Results cover only these selected records');
    expect(coverage).toHaveTextContent('does not establish independent sources or full release coverage');
    const proposed = JSON.parse(screen.getByTestId('terminal-request').textContent!);
    expect(proposed).toMatchObject({ ...baseRequest, parameters: { minRecords: 3 }, budget: { ...baseRequest.budget, maxRows: 50 }, idempotencyKey: expect.stringMatching(/^REQ-/) });
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByTestId('terminal-job');
    expect(commands.map((input) => input.command)).toEqual(['discover', 'pin', 'submit']);
    expect(commands[2].request).toEqual(proposed);
    expect(screen.getByTestId('terminal-action-digest')).toHaveTextContent(actionDigest);
    expect(screen.getByRole('button', { name: 'Approve exact action' })).toBeDisabled();
    await user.type(screen.getByLabelText('Review reason'), 'Reviewed the exact snapshot, method and budget.');
    await user.click(screen.getByRole('button', { name: 'Approve exact action' }));
    await waitFor(() => expect(screen.getByTestId('terminal-job')).toHaveTextContent('QUEUED'));
    expect(commands[3]).toEqual({ command: 'review', review: { jobId: baseJob.jobId, actionDigest, response: 'APPROVE', reason: 'Reviewed the exact snapshot, method and budget.' } });
    expect(screen.getByRole('button', { name: 'Fetch result and receipt' })).toBeDisabled();
    state.job.state = 'SUCCEEDED';
    await user.click(screen.getByRole('button', { name: 'Fetch job status' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fetch result and receipt' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Fetch result and receipt' }));
    expect(await screen.findByTestId('terminal-result')).toHaveTextContent(retainedResult.receiptDigest);
    expect(commands.map((input) => input.command)).toEqual(['discover', 'pin', 'submit', 'review', 'job', 'result']);
  });

  it('fetches jobs and records an explicit denial with the displayed digest', async () => {
    const user = userEvent.setup(); const { commands } = server();
    render(<TerminalWorkbench />); await connect(user);
    await user.click(screen.getByRole('button', { name: 'Fetch jobs' }));
    await user.click(await screen.findByRole('button', { name: baseJob.jobId }));
    await screen.findByLabelText('Review reason');
    await user.type(screen.getByLabelText('Review reason'), 'The selected snapshot is unsuitable.');
    await user.click(screen.getByRole('button', { name: 'Deny exact action' }));
    await waitFor(() => expect(screen.getByTestId('terminal-job')).toHaveTextContent('DENIED'));
    expect(commands.at(-1)).toEqual({ command: 'review', review: { jobId: baseJob.jobId, actionDigest, response: 'DENY', reason: 'The selected snapshot is unsuitable.' } });
    expect(commands.filter((input) => input.command === 'review')).toHaveLength(1);
  });

  it('clears pins after input changes and binds corrections to a new request', async () => {
    const user = userEvent.setup(); const { commands } = server();
    render(<TerminalWorkbench />); await connect(user); await pinRequest(user);
    const firstKey = JSON.parse(screen.getByTestId('terminal-request').textContent!).idempotencyKey;
    fireEvent.change(screen.getByLabelText('Minimum records'), { target: { value: '4' } });
    expect(screen.queryByTestId('terminal-pin')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
    await user.type(screen.getByLabelText('Predecessor job ID (optional)'), 'JOB-predecessor');
    expect(screen.getByRole('button', { name: 'Pin release' })).toBeDisabled();
    await user.type(screen.getByLabelText('Correction reason'), 'Use the newer release snapshot.');
    await user.click(screen.getByRole('button', { name: 'Pin release' }));
    const corrected = JSON.parse((await screen.findByTestId('terminal-request')).textContent!);
    expect(corrected.idempotencyKey).not.toBe(firstKey);
    expect(corrected.correction).toEqual({ jobId: 'JOB-predecessor', reason: 'Use the newer release snapshot.' });
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByTestId('terminal-job');
    expect(commands.at(-1)?.request).toEqual(corrected);
    fireEvent.change(screen.getByLabelText('Release ID'), { target: { value: 'REL-CAR-newer' } });
    expect(screen.queryByTestId('terminal-pin')).not.toBeInTheDocument();
  });

  it('retains the same idempotency key for an unchanged retry after a connection failure', async () => {
    const user = userEvent.setup(); let attempt = 0;
    const { commands } = server({ submit: (input) => { if (++attempt === 1) throw new TypeError('fetch failed'); return response({ ...baseJob, request: input.request }); } });
    render(<TerminalWorkbench />); await connect(user); await pinRequest(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_CONNECTION_FAILED');
    expect(screen.queryByTestId('terminal-job')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    await screen.findByTestId('terminal-job');
    const submits = commands.filter((input) => input.command === 'submit');
    expect(submits).toHaveLength(2); expect(submits[1]).toEqual(submits[0]);
  });

  it.each([
    ['unconfigured backend', () => response('TERMINAL_UNAVAILABLE', 503), 'TERMINAL_UNAVAILABLE'],
    ['wrong response version', () => ({ ok: true, json: async () => ({ protocol: 'wrong-version', result: discovery }) }), 'TERMINAL_RESPONSE_INVALID'],
    ['invalid success body', () => response({}), 'TERMINAL_RESPONSE_INVALID'],
  ])('does not claim connection or expose actions for %s', async (_name, answer, code) => {
    const user = userEvent.setup(); server({ discover: answer });
    render(<TerminalWorkbench />);
    await user.type(screen.getByLabelText('Terminal token'), 'secret-test-token');
    await user.click(screen.getByRole('button', { name: 'Connect and discover' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(code);
    expect(screen.queryByTestId('terminal-identity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
  });

  it('does not offer review actions to a request credential', async () => {
    const user = userEvent.setup(); server({ discover: () => response({ ...discovery, identity: { ...discovery.identity, canReview: false } }) });
    render(<TerminalWorkbench />); await connect(user); await pinRequest(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByTestId('terminal-job')).toHaveTextContent('Awaiting a credential with review authority');
    expect(screen.queryByRole('button', { name: 'Approve exact action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deny exact action' })).not.toBeInTheDocument();
  });

  it('does not pin a response whose coverage counts disagree with its selected records', async () => {
    const user = userEvent.setup();
    server({ pin: () => response({ ...pin, snapshot: { ...pin.snapshot, coverage: { standingRecords: 7, selectedRecords: 7, withheldByPermission: 0 } } }) });
    render(<TerminalWorkbench />); await connect(user);
    await user.type(screen.getByLabelText('Release ID'), baseRequest.releaseId);
    await user.click(screen.getByRole('button', { name: 'Pin release' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('TERMINAL_RESPONSE_INVALID');
    expect(screen.queryByTestId('terminal-pin')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  });

  it('disables pending controls and discards responses after the token is forgotten', async () => {
    const user = userEvent.setup(); let complete!: (value: unknown) => void;
    const pending = new Promise((resolve) => { complete = resolve; });
    const { fetch } = server({ pin: () => pending });
    render(<TerminalWorkbench />); await connect(user);
    await user.type(screen.getByLabelText('Release ID'), baseRequest.releaseId);
    await user.click(screen.getByRole('button', { name: 'Pin release' }));
    expect(screen.getByRole('button', { name: 'Pin release' })).toBeDisabled();
    expect(screen.getByLabelText('Release ID')).toBeDisabled();
    const signal = fetch.mock.calls[1][1].signal!;
    await user.click(screen.getByRole('button', { name: 'Forget token' }));
    expect(signal.aborted).toBe(true);
    await act(async () => { complete(response(pin)); await pending; });
    expect(screen.queryByTestId('terminal-pin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('terminal-identity')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Terminal token')).toHaveValue('');
  });
});
