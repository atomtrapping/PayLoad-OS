'use client';

import Link from 'next/link';
import { type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { fmtUtc } from '@/lib/format';
import type { Acknowledgement, BoardMessage, Participant } from '@/coordination/types';

/**
 * The message board, as a register with an inspector.
 *
 * WHY THE CARDS WERE CHANGED
 *
 * A board is a record that accumulates. Three seeded messages already took
 * 1.2 screens at 1440x900 and 2.1 on a Pixel 7, with no message fully visible
 * on the phone's first screen, because every card carried its whole body, its
 * receipts and its controls whether or not the reader was reading it. Thirty
 * messages is twelve screens of the same. The question a reader brings to a
 * board — what is outstanding, who owes whom, which of these is a blocker —
 * is answered by comparing messages, and none of it needs the bodies.
 *
 * Six columns: the message, its kind, its topic, who sent it to whom, whether
 * it has been acknowledged, and when. The body, the release context, the
 * thread and the receipts are in the inspector, with the actions that belong
 * to one message.
 *
 * A THREAD IS A RELATION, SO IT IS WALKABLE
 *
 * The thread root and the message being replied to were anchors: `#message-X`
 * scrolled the page to a card. In a register they are buttons that select
 * that message, so following a thread moves the inspector rather than the
 * page, and the register stays where the reader left it. The release context
 * is a link, because a release is not one of these rows.
 *
 * Nothing here interprets. Kind, topic, sequence and time are the message's
 * own fields; a receipt is a receipt that was recorded; and the eligibility
 * of an acknowledger is the ledger's rule, computed by the caller.
 */
export interface BoardRegisterProps {
  /** The rows to draw: the board as the reader's filters have left it, oldest first. */
  messages: BoardMessage[];
  /** Every message in scope, because a thread may name one a filter hides. */
  all: BoardMessage[];
  participants: Participant[];
  acknowledgements: Acknowledgement[];
  canWrite: boolean;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReply: (message: BoardMessage) => void;
  onAcknowledge: (messageId: string, participantId: string) => void;
  acknowledgerFor: (messageId: string) => string;
  onAcknowledgerChange: (messageId: string, participantId: string) => void;
}

/** The first message in a reply chain, following `replyTo` up and stopping on a cycle. */
export function threadRoot(message: BoardMessage, messages: BoardMessage[]) {
  let current = message;
  const visited = new Set([current.id]);
  while (current.replyTo) {
    const parent = messages.find((candidate) => candidate.id === current.replyTo);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

export function BoardRegister({
  messages, all, participants, acknowledgements, canWrite, busy,
  selectedId, onSelect, onReply, onAcknowledge, acknowledgerFor, onAcknowledgerChange,
}: BoardRegisterProps) {
  const name = (id: string) => participants.find((participant) => participant.id === id)?.name ?? id;
  const selected = all.find((message) => message.id === selectedId) ?? null;
  const listed = selected !== null && messages.some((message) => message.id === selected.id);
  const receiptsFor = (id: string) => acknowledgements.filter((acknowledgement) => acknowledgement.messageId === id);

  /** Who the ledger would accept an acknowledgement from: not the author, within the message's audience, and not already recorded. */
  const eligibleFor = (message: BoardMessage) => {
    const receipts = receiptsFor(message.id);
    return participants.filter((participant) => participant.id !== message.authorId &&
      (!message.recipientId || message.recipientId === participant.id) &&
      (!message.context || participant.domains.includes(message.context.domain)) &&
      !receipts.some((receipt) => receipt.participantId === participant.id));
  };

  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    const ids = messages.map((message) => message.id);
    if (ids.length === 0) return;
    const at = ids.indexOf(selectedId ?? '');
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    onSelect(ids[next]);
    (event.currentTarget.querySelector(`[data-message-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  const selectedEligible = selected ? eligibleFor(selected) : [];
  const selectedAcknowledger = selected
    ? selectedEligible.find((participant) => participant.id === acknowledgerFor(selected.id))?.id ?? selectedEligible[0]?.id ?? ''
    : '';
  const selectedRoot = selected ? threadRoot(selected, all) : null;

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="board-workspace" data-inspecting={selected ? 'message' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Messages">
            <thead><tr>
              <th scope="col">Message</th><th scope="col">Kind</th><th scope="col">Topic</th>
              <th scope="col">Correspondents</th><th scope="col">Acknowledged</th>
              <th scope="col" className="th-wrap">Posted</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys}>
              {messages.map((message) => {
                const active = message.id === selectedId;
                const receipts = receiptsFor(message.id);
                return (
                  <tr role="row" key={message.id} data-message-id={message.id} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-message-select={message.id}
                        onClick={() => onSelect(active ? null : message.id)}
                      >
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{message.title}</span>
                        <span className="block id row-sub">#{message.sequence} · {message.id}</span>
                      </button>
                    </td>
                    <td role="cell">
                      <span className="cell-label">Kind</span>
                      <span className="pill" style={{ color: message.kind === 'BLOCKER' || message.kind === 'REQUEST' ? 'var(--accent)' : 'var(--text-muted)' }}>{message.kind}</span>
                    </td>
                    <td role="cell"><span className="cell-label">Topic</span><span className="mono text-[12px]">{message.topic}</span></td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Correspondents</span>
                      {name(message.authorId)}
                      <span className="block row-sub">to {message.recipientId ? name(message.recipientId) : 'all participants in this scope'}</span>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Acknowledged</span>
                      {receipts.length === 0
                        ? <span style={{ color: 'var(--text-muted)' }}>No receipts</span>
                        : <span className="mono">{receipts.length}</span>}
                    </td>
                    <td role="cell" data-clock="createdAt"><span className="cell-label">Posted</span><span className="ts">{fmtUtc(message.createdAt)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {messages.length === 0 && <p className="surface p-3 m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>No messages match these filters.</p>}
      </div>

      {selected && (
        <Inspector
          id="message-inspector"
          testId="message-inspector"
          kicker={`${selected.kind} · #${selected.sequence}`}
          title={selected.title}
          subtitle={<span className="id">{selected.id}</span>}
          onClose={() => onSelect(null)}
          focusOnNarrow
        >
          {!listed && (
            <p className="m-0 text-[11.5px]" data-testid="message-not-listed" style={{ color: 'var(--text-muted)' }}>
              This message is not in the register above under the current filters. It is still on the board, and this is still what it says.
            </p>
          )}

          <Part title="Who wrote it, and to whom">
            <dl className="kv m-0 text-[12.5px]">
              <dt>From</dt><dd>{name(selected.authorId)}</dd>
              <dt>To</dt><dd>{selected.recipientId ? name(selected.recipientId) : 'All participants in this scope'}</dd>
              <dt>Topic</dt><dd className="mono">{selected.topic}</dd>
              <dt>Posted</dt><dd className="ts">{fmtUtc(selected.createdAt, { seconds: true })}</dd>
            </dl>
          </Part>

          <Part title="What it says">
            <p className="m-0 text-[13px] whitespace-pre-wrap break-words" data-testid="message-body">{selected.body}</p>
          </Part>

          {selected.context && (
            <Part title="Release context">
              <dl className="kv m-0 text-[12.5px]">
                <dt>Domain</dt><dd>{selected.context.domain}</dd>
                <dt>Release</dt><dd><Link href={`/releases/${encodeURIComponent(selected.context.releaseId)}`} className="id" style={{ color: 'var(--info)' }}>{selected.context.releaseId}</Link></dd>
                <dt>Build</dt><dd className="id">{selected.context.buildId}</dd>
                <dt>Known at</dt><dd className="ts">{fmtUtc(selected.context.knownAt)}</dd>
              </dl>
            </Part>
          )}

          <Part title="Thread">
            {/* Both ends name a message in this same register, so both select
                it. The anchors these replace scrolled the page to a card and
                left the reader to find their way back. */}
            <dl className="kv m-0 text-[12.5px]">
              <dt>Thread</dt>
              <dd data-testid="inspector-thread">{selectedRoot === selected.id
                ? <span style={{ color: 'var(--text-muted)' }}>This message starts the thread.</span>
                : <button type="button" className="btn btn-sm btn-quiet" data-testid="inspector-thread-root" onClick={() => onSelect(selectedRoot)}><span className="id">{selectedRoot}</span></button>}</dd>
              <dt>In reply to</dt>
              <dd data-testid="inspector-reply-to">{selected.replyTo
                ? <button type="button" className="btn btn-sm btn-quiet" data-testid="inspector-reply-to-open" onClick={() => onSelect(selected.replyTo)}><span className="id">{selected.replyTo}</span></button>
                : <span style={{ color: 'var(--text-muted)' }}>Nothing — it is not a reply.</span>}</dd>
            </dl>
          </Part>

          <Part title="Acknowledgement receipts">
            {receiptsFor(selected.id).length === 0
              ? <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>No acknowledgement receipts.</p>
              : <ul className="m-0 pl-4 text-[12px]" style={{ color: 'var(--text-secondary)' }} data-testid="message-receipts">
                {receiptsFor(selected.id).map((receipt) => <li key={receipt.participantId}>{name(receipt.participantId)} · <span className="ts">{fmtUtc(receipt.createdAt, { seconds: true })}</span></li>)}
              </ul>}
            {canWrite && <div className="flex flex-wrap gap-2 items-end mt-2">
              <button className="btn btn-sm" type="button" disabled={busy} onClick={() => onReply(selected)}>Reply</button>
              {selectedEligible.length > 0 && <>
                <label className="flex flex-col gap-1">
                  <span className="label-sm">Acknowledge as</span>
                  <select
                    className="surface-inset px-2 py-1.5 text-[13px] w-full"
                    aria-label={`Acknowledge ${selected.title} as`}
                    value={selectedAcknowledger}
                    onChange={(event) => onAcknowledgerChange(selected.id, event.target.value)}
                    disabled={busy}
                  >{selectedEligible.map((participant) => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select>
                </label>
                <button className="btn btn-sm" type="button" disabled={busy} onClick={() => onAcknowledge(selected.id, selectedAcknowledger)}>Acknowledge</button>
              </>}
            </div>}
          </Part>
        </Inspector>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
