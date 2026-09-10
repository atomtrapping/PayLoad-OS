'use client';

import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChainFigure } from '@/components/primitives/ChainFigure';
import { Inspector } from '@/components/primitives/Inspector';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import {
  ACQUISITION_CANDIDATES, CORPORA, GATES, acquisitionStanding, candidatesFor,
  type CorpusId, type GateId,
} from '@/domain/industrialCorpus';

/**
 * The eight corpora, as a register with an inspector.
 *
 * The register compares them: what each answers, how many chains it has to
 * keep distinct, how many sources are on its shortlist and how many gates
 * those sources have not passed. The inspector reads one — the part of the
 * central question it carries, what would be assembled, the chains drawn as
 * figures with the confusions each forbids, what the corpus does not
 * establish, and its named candidates with the four gates on each.
 *
 * NOTHING HERE IS ACQUIRED, AND THE NUMBERS SAY SO
 *
 * Every count comes from `acquisitionStanding()`, which derives the
 * integration state rather than reading a field. The open-gate count is the
 * honest headline: forty-odd candidates, four untested gates each, nothing
 * connected. A page that showed the source names without them would read as an
 * inventory of things this system has, which is the one impression the whole
 * evidence substrate exists to prevent.
 */
const GATE_LABEL: Record<GateId, string> = {
  ACCESS: 'access', COVERAGE: 'coverage', COST: 'cost', REDISTRIBUTION_RIGHTS: 'redistribution rights',
};

export function CorpusRegister() {
  const holds = (id: string | undefined) => id !== undefined && CORPORA.some((corpus) => corpus.id === id);
  const [selectedId, setSelectedId] = useState<CorpusId | null>(() => {
    const opened = openedWith().corpus;
    return holds(opened) ? opened as CorpusId : null;
  });
  useLinkedSelection({ corpus: selectedId }, (values) => { if (holds(values.corpus)) setSelectedId(values.corpus as CorpusId); }, true);

  const selected = CORPORA.find((corpus) => corpus.id === selectedId) ?? null;
  const standing = acquisitionStanding();

  function registerKeys(event: ReactKeyboardEvent<HTMLTableSectionElement>) {
    const ids = CORPORA.map((corpus) => corpus.id);
    const at = ids.indexOf(selectedId ?? ('' as CorpusId));
    let next: number;
    if (event.key === 'ArrowDown') next = Math.min(ids.length - 1, at + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, at < 0 ? 0 : at - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    setSelectedId(ids[next]);
    (event.currentTarget.querySelector(`[data-corpus-select="${ids[next]}"]`) as HTMLElement | null)?.focus();
  }

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="corpus-workspace" data-inspecting={selected ? 'corpus' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Evidence corpora">
            <thead><tr>
              <th scope="col">Corpus</th><th scope="col">What it answers</th>
              <th scope="col">Chains</th><th scope="col">Candidates</th>
              <th scope="col" className="th-wrap">Gates<br />untested</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys}>
              {CORPORA.map((corpus) => {
                const active = corpus.id === selectedId;
                const candidates = candidatesFor(corpus.id);
                return (
                  <tr role="row" key={corpus.id} data-corpus-id={corpus.id} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-corpus-select={corpus.id}
                        onClick={() => setSelectedId(active ? null : corpus.id)}
                      >
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{corpus.title}</span>
                        <span className="block id row-sub">{corpus.order} of {CORPORA.length}</span>
                      </button>
                    </td>
                    <td role="cell" className="text-[12.5px] cell-wide"><span className="cell-label">What it answers</span>{corpus.answers}</td>
                    <td role="cell" className="text-[12px]"><span className="cell-label">Chains</span><span className="mono">{corpus.chains.length}</span></td>
                    <td role="cell" className="text-[12px]"><span className="cell-label">Candidates</span><span className="mono">{candidates.length}</span></td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Gates untested</span>
                      <span className="mono" style={{ color: 'var(--accent)' }}>{candidates.length * GATES.length}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[11.5px]" data-testid="corpus-standing" style={{ color: 'var(--text-muted)' }}>
          {standing.candidates} named candidates across {standing.corpora} corpora, of which {standing.commercial} would
          cost money. {standing.integrated} integrated; {standing.openGates} gates untested. No connection is established
          and no collection is enabled: {standing.coverage.replace(/_/g, ' ').toLowerCase()}.
        </p>
      </div>

      {selected && (
        <Inspector
          id="corpus-inspector"
          testId="corpus-inspector"
          kicker={`Corpus ${selected.order} of ${CORPORA.length}`}
          title={selected.title}
          subtitle={selected.answers}
          onClose={() => setSelectedId(null)}
          focusOnNarrow
        >
          <Part title="What would be assembled">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.assemble}</p>
          </Part>

          <Part title={selected.chains.length === 1 ? 'The chain it keeps distinct' : `The ${selected.chains.length} chains it keeps distinct`}>
            {/* Drawn rather than described: the objects are the thing that must
                not collapse, and a figure makes their separateness the first
                thing a reader sees. Each chain carries what collapsing it
                would let someone conclude. */}
            <div className="flex flex-col gap-3" data-testid="corpus-chains">
              {selected.chains.map((chain) => (
                <div key={chain.of}>
                  <p className="label-sm m-0 mb-1.5">{chain.of}</p>
                  <ChainFigure objects={chain.objects} label={`${selected.title}: ${chain.of}`} />
                  <ul className="chain-forbids">
                    {chain.forbids.map((statement) => <li key={statement}>{statement}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Part>

          <Part title="What it does not establish">
            <ul className="m-0 pl-4 text-[12px] flex flex-col gap-1" style={{ color: 'var(--text-secondary)' }} data-testid="corpus-loss">
              {selected.loss.map((statement) => <li key={statement}>{statement}</li>)}
            </ul>
          </Part>

          <Part title="The product it would enable">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.product}</p>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Enabled once the corpus is assembled. It is not a product that exists.</p>
          </Part>

          <Part title={`Acquisition shortlist · ${candidatesFor(selected.id).length} candidates`}>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              Each is a proposed integration, and each still has to pass four tests. None has been tested.
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2" data-testid="corpus-candidates">
              {candidatesFor(selected.id).map((entry) => (
                <li key={entry.id} className="border-t pt-2 text-[12px]" data-candidate={entry.id} style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span style={{ color: 'var(--text-primary)' }}>{entry.name}</span>
                    {entry.commercial && <span className="pill" style={{ color: 'var(--accent)' }}>COMMERCIAL</span>}
                  </div>
                  <p className="m-0 mt-1" style={{ color: 'var(--text-secondary)' }}>{entry.provides}</p>
                  <p className="m-0 mt-1" style={{ color: 'var(--text-muted)' }}><span className="label-sm">Proposed role</span> {entry.proposedRole}</p>
                  {entry.knownLimits.map((limit) => (
                    <p key={limit} className="m-0 mt-1" style={{ color: 'var(--status-conditional)' }}>{limit}</p>
                  ))}
                  <ul className="m-0 mt-1.5 p-0 list-none flex flex-wrap gap-1.5">
                    {GATES.map((gate) => (
                      <li key={gate} className="pill" style={{ color: 'var(--text-muted)' }}>
                        {GATE_LABEL[gate]}: {entry.gates[gate].replace(/_/g, ' ').toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Part>
        </Inspector>
      )}
    </div>
  );
}

/** Every candidate, for the surfaces that count rather than list them. */
export const CANDIDATE_COUNT = ACQUISITION_CANDIDATES.length;

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="inspector-section"><h3>{title}</h3>{children}</section>;
}
