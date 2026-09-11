'use client';

import { useState } from 'react';
import { Inspector, InspectorSection } from '@/components/primitives/Inspector';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import { registerKeys } from '@/components/primitives/registerKeys';
import type { GovernedActRow } from './acts';

/**
 * The register of governed acts, and the inspector that shows one.
 *
 * A row is a proposal that went through a gate. The columns are the arrows —
 * reviewed, granted, dispatched, reconciled — and a row that stopped at one
 * of them says which guard stopped it. The inspector carries the digest the
 * review was of, the reviewer's words, the authorization's window, the
 * revocation if there was one, the dispatch outcome and what the
 * reconciliation rested on, and the lineage to what it corrects or revises.
 */
export function GovernedActs({ acts, label, selectionKey = 'act' }: { acts: readonly GovernedActRow[]; label: string; selectionKey?: string }) {
  const holds = (id: string | undefined) => id !== undefined && acts.some((entry) => entry.id === id);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const opened = openedWith()[selectionKey];
    return holds(opened) ? opened! : null;
  });
  useLinkedSelection({ [selectionKey]: selectedId }, (values) => { if (holds(values[selectionKey])) setSelectedId(values[selectionKey]!); }, true);
  const selected = acts.find((entry) => entry.id === selectedId) ?? null;
  const tone = (row: GovernedActRow) => row.refusedBy ? 'var(--status-conditional)' : row.revocation ? 'var(--status-conditional)' : row.reconciliation?.found === 'STILL_UNKNOWN' ? 'var(--status-conditional)' : 'var(--text-muted)';

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid={`governed-${selectionKey}`} data-inspecting={selected ? selectionKey : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label={label}>
            <thead><tr>
              <th scope="col">Proposal</th>
              <th scope="col">Reviewed</th>
              <th scope="col">Granted</th>
              <th scope="col">Dispatched</th>
              <th scope="col">Standing</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys({ ids: acts.map((entry) => entry.id), selected: selectedId, select: setSelectedId, attribute: 'data-act-select' })}>
              {acts.map((row) => {
                const active = row.id === selectedId;
                return (
                  <tr role="row" key={row.id} data-act-id={row.id} data-standing={row.standing} aria-selected={active}>
                    <td role="cell">
                      <button type="button" className="row-selectable text-left w-full" aria-pressed={active} data-act-select={row.id} onClick={() => setSelectedId(active ? null : row.id)}>
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{row.id}</span>
                        <span className="block row-sub text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{row.subject}</span>
                      </button>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Reviewed</span>
                      {row.review ? <span className="pill" data-response={row.review.response}>{row.review.response}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Granted</span>
                      {row.authorization ? <span className="id">{row.authorization.id}</span> : <span style={{ color: 'var(--text-muted)' }}>no</span>}
                      {row.revocation && <span className="pill ml-1" style={{ color: 'var(--status-conditional)' }}>REVOKED</span>}
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Dispatched</span>
                      {row.dispatch ? <span className="pill" data-outcome={row.dispatch.outcome}>{row.dispatch.outcome}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Standing</span>
                      <span style={{ color: tone(row) }}>{row.standing}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Inspector id={`${selectionKey}-inspector`} testId="governed-inspector" kicker={`${selected.lifecycle} · ${selected.kind}`} title={selected.id} subtitle={<span>{selected.subject}</span>} onClose={() => setSelectedId(null)} focusOnNarrow>
          <InspectorSection title="What the reviewer was shown">
            <p className="m-0 text-[12.5px]" data-testid="act-bound" style={{ color: 'var(--text-secondary)' }}>Bound to {selected.boundTo}.</p>
            {selected.digest && <p className="m-0 mt-1 text-[12px] mono" data-testid="act-digest" style={{ color: 'var(--text-primary)' }}>{selected.digest}</p>}
          </InspectorSection>

          <InspectorSection title="What the reviewer said">
            {selected.review ? (
              <p className="m-0 text-[12.5px]" data-testid="act-review" style={{ color: 'var(--text-primary)' }}>
                <span className="pill mr-1.5" data-response={selected.review.response}>{selected.review.response}</span>
                {selected.review.reviewer}{selected.review.reasoning ? ` — ${selected.review.reasoning}` : ''}
              </p>
            ) : (
              <p className="m-0 text-[12.5px]" data-testid="act-review" style={{ color: 'var(--text-muted)' }}>Nobody reviewed it: it was refused before it was a proposal.</p>
            )}
          </InspectorSection>

          <InspectorSection title="What was granted">
            {selected.authorization ? (
              <p className="m-0 text-[12.5px]" data-testid="act-authorization" style={{ color: 'var(--text-primary)' }}>
                <span className="id">{selected.authorization.id}</span> by {selected.authorization.grantedBy}
                {selected.authorization.grantedAt ? <span style={{ color: 'var(--text-muted)' }}> · {selected.authorization.grantedAt} → {selected.authorization.expiresAt}</span> : null}
              </p>
            ) : (
              <p className="m-0 text-[12.5px]" data-testid="act-authorization" style={{ color: 'var(--status-conditional)' }}>Nothing. No authorization row exists for this proposal.</p>
            )}
            {selected.refusedBy && (
              <p className="m-0 mt-1 text-[12px]" data-testid="act-refused" style={{ color: 'var(--status-conditional)' }}>
                Refused by <span className="mono">{selected.refusedBy}</span>.
              </p>
            )}
          </InspectorSection>

          {selected.revocation && (
            <InspectorSection title="Taken back">
              <p className="m-0 text-[12.5px]" data-testid="act-revocation" style={{ color: 'var(--status-conditional)' }}>
                Revoked by {selected.revocation.by} at {selected.revocation.at}: {selected.revocation.reason}
              </p>
            </InspectorSection>
          )}

          <InspectorSection title="Dispatched, and what happened">
            {selected.dispatch ? (
              <p className="m-0 text-[12.5px]" data-testid="act-dispatch" style={{ color: 'var(--text-primary)' }}>
                <span className="id">{selected.dispatch.id}</span> <span className="pill ml-1" data-outcome={selected.dispatch.outcome}>{selected.dispatch.outcome}</span>
                {selected.dispatch.receipt && <span className="block mt-1 mono text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{selected.dispatch.receipt}</span>}
              </p>
            ) : (
              <p className="m-0 text-[12.5px]" data-testid="act-dispatch" style={{ color: 'var(--text-muted)' }}>Not dispatched.</p>
            )}
            {selected.reconciliation && (
              <p className="m-0 mt-1.5 text-[12px]" data-testid="act-reconciliation" style={{ color: selected.reconciliation.found === 'STILL_UNKNOWN' ? 'var(--status-conditional)' : 'var(--text-secondary)' }}>
                <span className="pill mr-1.5">{selected.reconciliation.found}</span>{selected.reconciliation.basis}
              </p>
            )}
          </InspectorSection>

          {(selected.corrects || selected.revises) && (
            <InspectorSection title="Lineage">
              <p className="m-0 text-[12.5px]" data-testid="act-lineage" style={{ color: 'var(--text-secondary)' }}>
                {selected.corrects && <span>Corrects operation <span className="id">{selected.corrects}</span>. </span>}
                {selected.revises && <span>Revises proposal <span className="id">{selected.revises}</span>. </span>}
              </p>
            </InspectorSection>
          )}
        </Inspector>
      )}
    </div>
  );
}
