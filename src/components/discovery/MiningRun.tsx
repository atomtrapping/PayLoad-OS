'use client';

import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Inspector } from '@/components/primitives/Inspector';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import type { DemonstrationMining } from '@/discovery/demonstrationRun';

/**
 * The run, rather than the contract.
 *
 * Everything above this on the page describes what would be computed. This is
 * what was: one spec, three executions over the three demonstration corpora,
 * and every artifact they produced with the records it read.
 *
 * WHY THE REGISTER IS ARTIFACTS AND NOT SUBJECTS
 *
 * A table of subjects would read as a table of facts about lots and parcels,
 * which is exactly the collapse the layer exists to prevent. The row is the
 * artifact — a thing the corpus computed, with an identity, a lineage, a
 * rights floor and a validation state — and the subject is a column on it. A
 * reader who takes a row for evidence has to walk past its class, its
 * fingerprint and the word NOT_VALIDATED to do it.
 *
 * The inspector carries the lineage, because that is the whole claim. "Four
 * retained claims about this lot rest on three sources" is only worth
 * anything beside the four record identities it counted, and a derived result
 * that cannot name what it read is an assertion.
 */
export function MiningRun({ mining }: { mining: DemonstrationMining }) {
  const artifacts = mining.artifacts;
  const holds = (id: string | undefined) => id !== undefined && artifacts.some((entry) => entry.artifactId === id);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const opened = openedWith().artifact;
    return holds(opened) ? opened! : null;
  });
  useLinkedSelection({ artifact: selectedId }, (values) => { if (holds(values.artifact)) setSelectedId(values.artifact!); }, true);

  const selected = artifacts.find((entry) => entry.artifactId === selectedId) ?? null;
  const gap = selected ? mining.gaps.find((entry) => entry.artifactId === selected.artifactId) ?? null : null;
  const proposal = gap ? mining.proposals.find((entry) => entry.gapId === gap.gapId) ?? null : null;
  const runOf = (artifactId: string) => mining.runs.find((run) => run.result.artifacts.some((a) => a.artifactId === artifactId));

  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    const ids = artifacts.map((entry) => entry.artifactId);
    const at = ids.indexOf(selectedId ?? '');
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    setSelectedId(ids[next]);
    (event.currentTarget.querySelector(`[data-artifact-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="mining-workspace" data-inspecting={selected ? 'artifact' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Derived artifacts and what they read">
            <thead><tr>
              <th scope="col">Subject</th>
              <th scope="col">Line</th>
              <th scope="col" className="th-wrap">Claims<br />read</th>
              <th scope="col">Concentration</th>
              <th scope="col">Validation</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys}>
              {artifacts.map((artifact) => {
                const active = artifact.artifactId === selectedId;
                const detail = artifact.detail as { records: number; sources: number; herfindahl: number; singleSourced: boolean };
                const run = runOf(artifact.artifactId);
                return (
                  <tr role="row" key={artifact.artifactId} data-artifact-id={artifact.artifactId} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-artifact-select={artifact.artifactId}
                        onClick={() => setSelectedId(active ? null : artifact.artifactId)}
                      >
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{artifact.subject}</span>
                        <span className="block id row-sub">{artifact.artifactId}</span>
                      </button>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Line</span>
                      <span className="pill">{run?.domain ?? '—'}</span>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Claims read</span>
                      <span style={{ color: 'var(--text-muted)' }}>{detail.records} from {detail.sources}</span>
                    </td>
                    <td role="cell" className="text-[12px]" data-single-sourced={String(detail.singleSourced)}>
                      <span className="cell-label">Concentration</span>
                      <span style={{ color: detail.singleSourced ? 'var(--status-conditional)' : 'var(--text-muted)' }}>
                        {detail.herfindahl}{detail.singleSourced ? ' · one source' : ''}
                      </span>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Validation</span>
                      <span className="pill" data-validation={artifact.validation}>{artifact.validation}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[11.5px]" data-testid="mining-standing" style={{ color: 'var(--text-muted)' }}>
          {mining.counts.artifacts} artifacts from {mining.counts.runs} runs of one computation over{' '}
          {mining.counts.recordsRead} standing records. {mining.counts.validated} validated,{' '}
          {mining.counts.served} served. Derivations over admitted evidence: {mining.counts.admittedDerivations}.
        </p>
      </div>

      {selected && (
        <Inspector
          id="artifact-inspector"
          testId="artifact-inspector"
          kicker={`${selected.claimClass} · ${runOf(selected.artifactId)?.domain ?? ''}`}
          title={selected.subject}
          subtitle={<span className="mono">{selected.artifactId}</span>}
          onClose={() => setSelectedId(null)}
          focusOnNarrow
        >
          <Part title="What it computed">
            <p className="m-0 text-[12.5px]" data-testid="artifact-claim" style={{ color: 'var(--text-primary)' }}>{selected.claim}</p>
            <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              {String((selected.detail as { limit: string }).limit)}
            </p>
          </Part>

          {/* The lineage is the claim. Without it this is an assertion. */}
          <Part title={`What it read — ${selected.inputs.length} record${selected.inputs.length === 1 ? '' : 's'}`}>
            <ul className="m-0 pl-0 list-none flex flex-col gap-1" data-testid="artifact-lineage">
              {selected.inputs.map((input) => (
                <li key={input.recordId} className="text-[12px] flex flex-wrap gap-x-2" data-input-record={input.recordId}>
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>{input.recordId}</span>
                  <span style={{ color: 'var(--text-muted)' }}>known {input.knownAt}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              Records the corpus still asserts at the time the run computed. A withdrawn record, or the
              original of a corrected one, is not here — a computation does not read what the corpus took back.
            </p>
          </Part>

          <Part title="What may be done with it">
            <p className="m-0 text-[12.5px]" data-testid="artifact-rights" style={{ color: 'var(--text-secondary)' }}>
              {selected.rights.length > 0 ? selected.rights.join(', ') : 'Nothing. No input carried a right the others also carried.'}
            </p>
            <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              The intersection of what every record above permits, computed rather than declared, and never
              wider than the narrowest of them.
            </p>
          </Part>

          <Part title="Validation">
            <p className="m-0 text-[12.5px]" data-testid="artifact-validation" style={{ color: 'var(--status-conditional)' }}>
              {selected.validation}
            </p>
            <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{mining.notValidatedBecause}</p>
          </Part>

          {gap && (
            <Part title="The gap it found">
              <p className="m-0 text-[12.5px]" data-testid="artifact-gap" style={{ color: 'var(--text-secondary)' }}>{gap.missing}</p>
              <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                An independent source would drop the index by {gap.expectedUncertaintyReduction}. Arithmetic, not an estimate.
              </p>
            </Part>
          )}

          {proposal && (
            <Part title="And what it proposes">
              <p className="m-0 text-[12.5px]" data-testid="artifact-proposal" style={{ color: 'var(--text-secondary)' }}>{proposal.targetSource}</p>
              <p className="m-0 mt-1.5 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Standing <span className="pill">{proposal.standing}</span>, authorized by nobody. {mining.proposalRule}
              </p>
            </Part>
          )}
        </Inspector>
      )}
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
