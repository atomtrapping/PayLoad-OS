'use client';

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import { CLASS_CONTRACTS, discoveryStanding, type ClaimClass } from '@/domain/discoveryLayer';

/**
 * The seven claim classes, as a register with an inspector.
 *
 * The origin column is the load-bearing one and the reason this is a register
 * rather than a diagram. A diagram of seven boxes invites the reader to see a
 * spectrum from solid to speculative; the table puts the class beside the
 * origin that produced it, and the point is that the second determines the
 * first. A class is not a confidence level a producer picks — it is a
 * consequence of where the claim came from.
 *
 * The inspector carries what the row cannot fit: what collapsing the class
 * would produce. That sentence is the whole reason each class exists
 * separately, and it is too long for a cell and too important to drop.
 */
export function ClassRegister() {
  const holds = (id: string | undefined) => id !== undefined && CLASS_CONTRACTS.some((entry) => entry.class === id);
  const [selectedId, setSelectedId] = useState<ClaimClass | null>(() => {
    const opened = openedWith().claim;
    return holds(opened) ? opened as ClaimClass : null;
  });
  useLinkedSelection({ claim: selectedId }, (values) => { if (holds(values.claim)) setSelectedId(values.claim as ClaimClass); }, true);

  const selected = CLASS_CONTRACTS.find((entry) => entry.class === selectedId) ?? null;
  const standing = discoveryStanding();

  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    const ids = CLASS_CONTRACTS.map((entry) => entry.class);
    const at = ids.indexOf(selectedId ?? ('' as ClaimClass));
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    setSelectedId(ids[next]);
    (event.currentTarget.querySelector(`[data-claim-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="class-workspace" data-inspecting={selected ? 'claim' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Claim classes and their origins">
            <thead><tr>
              <th scope="col">Class</th>
              <th scope="col">Origin</th>
              <th scope="col" className="th-wrap">What it<br />is</th>
              <th scope="col">Confidence</th>
              <th scope="col">Reaches forward</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys}>
              {CLASS_CONTRACTS.map((entry) => {
                const active = entry.class === selectedId;
                return (
                  <tr role="row" key={entry.class} data-claim-id={entry.class} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-claim-select={entry.class}
                        onClick={() => setSelectedId(active ? null : entry.class)}
                      >
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{entry.class}</span>
                        {entry.origin === 'ACQUISITION' && <span className="block id row-sub">the only acquired class</span>}
                      </button>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Origin</span>
                      <span className="pill">{entry.origin}</span>
                    </td>
                    <td role="cell" className="text-[12.5px] cell-wide"><span className="cell-label">What it is</span>{entry.is}</td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Confidence</span>
                      <span style={{ color: 'var(--text-muted)' }}>{entry.carriesConfidence ? 'required' : 'meaningless'}</span>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Reaches forward</span>
                      <span style={{ color: 'var(--text-muted)' }}>{entry.aboutTheFuture ? 'yes' : 'no'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[11.5px]" data-testid="class-standing" style={{ color: 'var(--text-muted)' }}>
          {CLASS_CONTRACTS.length} classes, four origins. {standing.derivations} derivations exist,
          {' '}{standing.validated} of them validated. This is {standing.coverage.replace(/_/g, ' ').toLowerCase()}.
        </p>
      </div>

      {selected && (
        <Inspector
          id="claim-inspector"
          testId="claim-inspector"
          kicker={`Claim class · ${selected.origin.toLowerCase()}`}
          title={selected.class}
          onClose={() => setSelectedId(null)}
          focusOnNarrow
        >
          <Part title="What a row of this class is">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.is}</p>
          </Part>

          <Part title="Produced by">
            <p className="m-0 text-[12.5px]" data-testid="claim-produced-by" style={{ color: 'var(--text-secondary)' }}>{selected.producedBy}</p>
            <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              The origin decides who may produce it. A class is not a label a producer chooses.
            </p>
          </Part>

          {/* The sentence the class exists for. Too long for a cell, too
              important to leave out. */}
          <Part title="What collapsing it would produce">
            <p className="m-0 text-[12.5px]" data-testid="claim-forbids" style={{ color: 'var(--status-conditional)' }}>{selected.forbids}</p>
          </Part>

          <Part title="How many exist">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              {standing.byClass[selected.class]}. Nothing has been mined, because nothing has been admitted —
              so this is a contract rather than a count of anything held.
            </p>
          </Part>
        </Inspector>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
