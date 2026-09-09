'use client';

import { type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import type { Connection, Participant } from '@/coordination/types';

/**
 * The stable of agents and apparatuses, as a register with an inspector.
 *
 * WHY THE CARDS WERE CHANGED
 *
 * Twelve participants in a two-column grid of 415px cards. Measured on the
 * rendered page at 1440x900: 2,969px of document, of which two cards were
 * fully on the first screen. On a Pixel 7: 6,497px, and not one card fully
 * visible. A stable is a thing you compare — which of these is an agent,
 * which is only declared, which one decides what — and a reader who can hold
 * two of twelve in view at once is not comparing, they are remembering.
 *
 * Six columns now, each one a question asked of every row: what it is, how
 * far along it is, what it may decide, what it runs on, and how many other
 * definitions it can work with. Everything about one participant — its
 * purpose, its declared contracts, its relationships one by one — is in the
 * inspector beside it.
 *
 * SYNASTRY IS A RELATION, SO IT IS WALKABLE
 *
 * A connection names another participant in this same register, so it is a
 * button that selects that participant, the way a ruling's supersession chain
 * is walkable rather than printed. Following one is how a reader traces a
 * contract through the system, and it costs nothing: the register does not
 * move and the inspector answers again about the next definition.
 *
 * Nothing here evaluates or launches. Every field is the participant's own
 * declaration, and a connection is contract compatibility between two
 * declarations — which is stated on the surface, because a reader looking at
 * MATCH would otherwise be entitled to think something had been verified.
 */
export interface StableRegisterProps {
  /** The rows to draw: the stable as the reader's filters have left it. */
  participants: Participant[];
  /** Every participant in scope, because a selection may name one a filter hides. */
  all: Participant[];
  connections: Connection[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function StableRegister({ participants, all, connections, selectedId, onSelect }: StableRegisterProps) {
  const name = (id: string) => all.find((participant) => participant.id === id)?.name ?? id;
  const selected = all.find((participant) => participant.id === selectedId) ?? null;
  const listed = selected !== null && participants.some((participant) => participant.id === selected.id);
  const connectionsFor = (id: string) => connections.filter((connection) => connection.sourceId === id || connection.targetId === id);

  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    const ids = participants.map((participant) => participant.id);
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
    (event.currentTarget.querySelector(`[data-participant-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="stable-workspace" data-inspecting={selected ? 'participant' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Agents and apparatuses">
            <thead><tr>
              <th scope="col">Participant</th><th scope="col">Kind</th><th scope="col">Status</th>
              <th scope="col" className="th-wrap">Declared<br />authority</th><th scope="col">Runtime</th>
              <th scope="col">Connections</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys}>
              {participants.map((participant) => {
                const active = participant.id === selectedId;
                const related = connectionsFor(participant.id);
                const matched = related.filter((connection) => connection.status === 'MATCH').length;
                return (
                  <tr role="row" key={participant.id} data-participant-id={participant.id} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-participant-select={participant.id}
                        onClick={() => onSelect(active ? null : participant.id)}
                      >
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{participant.name}</span>
                        <span className="block id row-sub">{participant.id}</span>
                      </button>
                    </td>
                    <td role="cell"><span className="cell-label">Kind</span><span className="text-[12px]">{participant.kind}</span></td>
                    <td role="cell">
                      <span className="cell-label">Status</span>
                      <span className="pill" style={{ color: participant.status === 'LOCAL' ? 'var(--accent)' : 'var(--text-muted)' }}>{participant.status}</span>
                    </td>
                    <td role="cell"><span className="cell-label">Declared authority</span><span className="text-[12px]">{participant.authority}</span></td>
                    <td role="cell"><span className="cell-label">Runtime</span><span className="text-[12px]">{participant.runtime} <span className="ver">{participant.version}</span></span></td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Connections</span>
                      {related.length === 0
                        ? <span style={{ color: 'var(--text-muted)' }}>None</span>
                        : <span className="mono">{related.length} · {matched} match</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {participants.length === 0 && <p className="surface p-3 m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>No definitions match these filters.</p>}
      </div>

      {selected && (
        <Inspector
          id="participant-inspector"
          testId="participant-inspector"
          kicker={`${selected.kind} · ${selected.status}`}
          title={selected.name}
          subtitle={<span className="id">{selected.id}</span>}
          onClose={() => onSelect(null)}
          focusOnNarrow
        >
          {!listed && (
            <p className="m-0 text-[11.5px]" data-testid="participant-not-listed" style={{ color: 'var(--text-muted)' }}>
              This definition is not in the register above under the current filters. It is still in scope, and this is still what it declares.
            </p>
          )}

          <Part title="What it is for">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.purpose}</p>
          </Part>

          <Part title="Declared contracts">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Inputs</dt><dd className="mono break-words">{selected.inputs.join(', ') || 'None declared'}</dd>
              <dt>Outputs</dt><dd className="mono break-words">{selected.outputs.join(', ') || 'None declared'}</dd>
              <dt>Capabilities</dt><dd className="break-words">{selected.capabilities.join(', ') || 'None declared'}</dd>
            </dl>
          </Part>

          <Part title="Where it stands">
            <dl className="kv m-0 text-[12.5px]">
              <dt>Declared authority</dt><dd>{selected.authority}</dd>
              <dt>Runtime / version</dt><dd>{selected.runtime} <span className="mono">{selected.version}</span></dd>
              <dt>Domains</dt><dd>{selected.domains.join(' · ') || 'Shared'}</dd>
              <dt>Scope</dt><dd className="mono break-words">{selected.scope}</dd>
              <dt>Reference</dt><dd className="mono break-words">{selected.reference}</dd>
            </dl>
          </Part>

          <Part title={`Synastry · ${connectionsFor(selected.id).length} declared connections`}>
            {/* Each connection names another definition in this same register,
                so it is a button that selects it rather than a line of text
                about it: following a contract through the system is the reason
                a reader opened this panel. */}
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              Contract compatibility indicates how definitions can work together. It does not attest deployment or authorize execution.
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2" data-testid="participant-synastry">
              {connectionsFor(selected.id).map((connection) => {
                const other = connection.sourceId === selected.id ? connection.targetId : connection.sourceId;
                const outward = connection.sourceId === selected.id;
                return (
                  <li key={`${connection.sourceId}:${connection.targetId}`} className="border-t pt-2 text-[12px]" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>{outward ? 'to' : 'from'}</span>
                      <button type="button" className="btn btn-sm btn-quiet" data-connection-select={other} onClick={() => onSelect(other)}>{name(other)}</button>
                      <span className="pill" style={{ color: connection.status === 'MATCH' ? 'var(--accent)' : 'var(--text-muted)' }}>{connection.status}</span>
                    </div>
                    <p className="m-0 mt-1 mono break-words">Contracts: {connection.contracts.join(', ')}</p>
                    <p className="m-0 mt-1" style={{ color: 'var(--text-muted)' }}>Domains: {connection.domains.join(' · ') || 'Shared'}</p>
                    {connection.missingInputs.length > 0 && <p className="m-0 mt-1" style={{ color: 'var(--accent)' }}>Missing inputs: <span className="mono">{connection.missingInputs.join(', ')}</span></p>}
                  </li>
                );
              })}
              {connectionsFor(selected.id).length === 0 && <li className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No compatible declared contracts in this scope.</li>}
            </ul>
          </Part>
        </Inspector>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
