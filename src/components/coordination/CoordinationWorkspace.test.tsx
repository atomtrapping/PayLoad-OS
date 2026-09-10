import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from '@/coordination/seed';
import { applyCommand, connectionsFor } from '@/coordination/ledger';
import type { CoordinationCommand, CoordinationSnapshot, CoordinationState } from '@/coordination/types';
import { CoordinationWorkspace } from './CoordinationWorkspace';

function snapshot(state = createSeed(), canWrite = false): CoordinationSnapshot {
  return { ...state, fixture_only: true, scope: DEMO_SCOPE, mode: canWrite ? 'LOCAL_SANDBOX' : 'FIXTURE',
    persistence: canWrite ? 'LOCAL_FILE' : 'NONE', canWrite, connections: connectionsFor(state, DEMO_SCOPE), releaseContexts: RELEASE_CONTEXTS };
}

function localApi(initial: CoordinationState) {
  let state = initial;
  const commands: CoordinationCommand[] = [];
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.body) {
      const command = JSON.parse(String(init.body)) as CoordinationCommand;
      commands.push(command);
      state = applyCommand(state, DEMO_SCOPE, command, RELEASE_CONTEXTS, '2026-09-05T13:00:00.000Z');
    }
    return { ok: true, json: async () => snapshot(state, true) };
  });
  vi.stubGlobal('fetch', fetch);
  return { commands, fetch };
}

/**
 * A selection is written into the fragment, and jsdom keeps one document for
 * the whole file. Without this, a test that selected a row would leave the
 * next one already open on that row.
 */
beforeEach(() => window.history.replaceState(null, '', '/agents'));
afterEach(() => vi.unstubAllGlobals());

/** Rows are selected by their own identity, which is what the register makes a control. */
const select = (kind: 'participant' | 'message', id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-${kind}-select="${id}"]`)!;
const rows = () => document.querySelectorAll('tbody tr').length;

describe('CoordinationWorkspace', () => {
  it('walks declared connections from the inspector and filters stable definitions without implying running workers', async () => {
    const user = userEvent.setup();
    render(<CoordinationWorkspace initial={snapshot()} view="stable" />);
    expect(screen.getByText('No agents are launched by this board.')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Register participant' })).not.toBeInTheDocument();

    // The register compares definitions; one definition is read in the inspector.
    expect(rows()).toBe(12);
    expect(screen.queryByTestId('participant-inspector')).not.toBeInTheDocument();
    await user.click(select('participant', 'agent.normalize'));
    const inspector = screen.getByTestId('participant-inspector');
    expect(within(inspector).getByText('Normalization agent')).toBeInTheDocument();
    expect(within(inspector).getByText(/Contract compatibility indicates how definitions can work together/)).toBeInTheDocument();
    expect(within(inspector).getByText(/Missing inputs:/)).toHaveTextContent('IdentityMapping/v1');

    // A connection names another definition in this register, so following it
    // moves the inspector rather than printing an identifier.
    await user.click(within(inspector).getByRole('button', { name: 'Identity agent' }));
    expect(within(screen.getByTestId('participant-inspector')).getByText('Propose evidence-bearing mappings and expose unresolved identity.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Participant kind'), 'AGENT');
    await user.type(screen.getByLabelText('Search the stable'), 'identity.propose');
    expect(rows()).toBe(1);
    expect(select('participant', 'agent.identity')).toBeInTheDocument();
  });

  it('keeps a selection the filters have hidden, and says that it is hidden rather than dropping it', async () => {
    const user = userEvent.setup();
    render(<CoordinationWorkspace initial={snapshot()} view="stable" />);
    await user.click(select('participant', 'apparatus.corpus'));
    expect(screen.queryByTestId('participant-not-listed')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Participant kind'), 'AGENT');
    expect(screen.getByTestId('participant-not-listed')).toBeInTheDocument();
    expect(within(screen.getByTestId('participant-inspector')).getByText('Domain corpus')).toBeInTheDocument();
  });

  it('filters board messages and keeps fixture mode read only', async () => {
    const user = userEvent.setup();
    render(<CoordinationWorkspace initial={snapshot()} view="board" />);
    expect(screen.queryByRole('form', { name: 'Compose message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
    expect(screen.getByText('npm run dev:coordination')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Message kind filter'), 'BLOCKER');
    expect(rows()).toBe(1);

    // The release a message was written about is a different object, so it is a link.
    await user.click(select('message', 'MSG-00002'));
    expect(screen.getByRole('link', { name: 'REL-CAR-2026.09.01' })).toHaveAttribute('href', '/releases/REL-CAR-2026.09.01');
    await user.selectOptions(screen.getByLabelText('Topic filter'), 'release-assembly');
    expect(screen.getByText('No messages match these filters.')).toBeInTheDocument();
  });

  it('retains a failed draft and retries with the same idempotency key before showing the saved message', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    const api = localApi(state);
    api.fetch.mockRejectedValueOnce(new Error('Connection interrupted'));
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="board" />);
    await user.type(screen.getByLabelText('Topic'), 'corpus-inputs');
    await user.type(screen.getByLabelText('Title'), 'Inspect the input contract');
    await user.type(screen.getByLabelText('Body'), 'Keep the release context attached to the next handoff.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');
    expect(screen.getByLabelText('Body')).toHaveValue('Keep the release context attached to the next handoff.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    expect(await screen.findByText('Inspect the input contract')).toBeInTheDocument();
    const first = JSON.parse(String(api.fetch.mock.calls[0][1]?.body));
    const second = JSON.parse(String(api.fetch.mock.calls[1][1]?.body));
    expect(first.message.requestId).toBeTruthy();
    expect(second.message.requestId).toBe(first.message.requestId);
    expect(screen.getByLabelText('Body')).toHaveValue('');
  });

  it('limits directed acknowledgements to the recipient and locks parent context when replying', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    const api = localApi(state);
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="board" />);
    const title = state.messages[1].title;
    await user.click(select('message', 'MSG-00002'));
    const inspector = screen.getByTestId('message-inspector');
    const actor = within(inspector).getByRole('combobox', { name: `Acknowledge ${title} as` });
    expect(within(actor).getAllByRole('option')).toHaveLength(1);
    expect(actor).toHaveValue('agent.identity');
    await user.click(within(inspector).getByRole('button', { name: 'Acknowledge' }));
    expect(await within(screen.getByTestId('message-inspector')).findByTestId('message-receipts')).toHaveTextContent('Identity agent');
    expect(api.commands[0]).toEqual({ operation: 'acknowledge', messageId: 'MSG-00002', participantId: 'agent.identity' });

    await user.click(within(screen.getByTestId('message-inspector')).getByRole('button', { name: 'Reply' }));
    /*
     * By role, because the inspector's own "Release context" panel is a named
     * region now and a bare label query matches both it and this control. The
     * query was unambiguous only while the panel had no accessible name, which
     * is the thing that was worth fixing.
     */
    const context = screen.getByRole('combobox', { name: 'Release context' });
    expect(context).toBeDisabled();
    expect(context).toHaveValue('REL-CAR-2026.09.01');
    expect(screen.getByLabelText('Topic')).toBeDisabled();
    await user.type(screen.getByLabelText('Body'), 'The identity is still unresolved.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    expect(await screen.findByText(`Re: ${title}`)).toBeInTheDocument();
    expect(api.commands[1]).toMatchObject({ operation: 'post', message: { replyTo: 'MSG-00002', topic: state.messages[1].topic, context: state.messages[1].context } });
  });

  it('walks a thread from the reply back to the message it answers', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    localApi(state);
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="board" />);
    await user.click(select('message', 'MSG-00002'));
    await user.click(within(screen.getByTestId('message-inspector')).getByRole('button', { name: 'Reply' }));
    await user.type(screen.getByLabelText('Body'), 'The identity is still unresolved.');
    await user.click(screen.getByRole('button', { name: 'Post message' }));
    const reply = await screen.findByText(`Re: ${state.messages[1].title}`);
    await user.click(reply);
    const inspector = screen.getByTestId('message-inspector');
    expect(within(inspector).getByTestId('inspector-reply-to')).toHaveTextContent('MSG-00002');
    await user.click(within(inspector).getByTestId('inspector-reply-to-open'));
    expect(within(screen.getByTestId('message-inspector')).getByTestId('message-body'))
      .toHaveTextContent('The demonstration release has no sample-to-lot link.');
  });

  it('registers a local definition with contracts and its bound scope', async () => {
    const user = userEvent.setup();
    const state = createSeed();
    const api = localApi(state);
    render(<CoordinationWorkspace initial={snapshot(state, true)} view="stable" />);
    const form = screen.getByRole('form', { name: 'Register participant' });
    await user.type(within(form).getByLabelText('Participant ID'), 'agent.condition-review');
    await user.type(within(form).getByLabelText('Name'), 'Condition review agent');
    await user.type(within(form).getByLabelText('Purpose'), 'Review physical condition changes.');
    await user.type(within(form).getByLabelText('Input contracts · comma separated'), 'CorpusRelease/v1, Retraction/v1');
    await user.click(within(form).getByRole('button', { name: 'Register definition' }));
    const registered = await screen.findByText('agent.condition-review');
    expect(registered.closest('tr')).toHaveTextContent('LOCAL');
    expect(api.commands[0]).toMatchObject({ operation: 'register', participant: { scope: DEMO_SCOPE, version: '0.1.0', status: 'LOCAL', inputs: ['CorpusRelease/v1', 'Retraction/v1'], domains: ['CARAVAN'] } });
  });
});
