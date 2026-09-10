'use client';

import { useState } from 'react';
import { Inspector, InspectorSection } from '@/components/primitives/Inspector';
import { openedWith, useLinkedSelection } from '@/components/primitives/useLinkedSelection';
import { COVERAGE_REGIONS, coverageStanding, type RegionId } from '@/domain/coverageUniverse';
import { registerKeys } from '@/components/primitives/registerKeys';

/**
 * The six coverage regions, as a register with an inspector.
 *
 * The register is the honest form for this because the regions are not
 * interchangeable and a map would say they were. Down a column: what is
 * actually proposed first in each, what product it would run, and what public
 * evidence already exists there. A map draws six shapes of different sizes and
 * invites the reader to conclude that the biggest one matters most.
 *
 * FOUNDATION AND LIMIT ARE ONE FACT IN TWO PARTS
 *
 * Every region names public evidence that exists and what that evidence does
 * not establish, and the inspector shows them together. The opportunity is the
 * gap between the two, so a surface that showed only the foundation would
 * describe a solved problem and one that showed only the limit would describe
 * an empty region. Neither is what is being claimed.
 *
 * Nothing is covered. `coverageStanding()` derives that from an empty corridor
 * table, so the first real corridor changes the readout by existing.
 */
export function CoverageRegister() {
  const holds = (id: string | undefined) => id !== undefined && COVERAGE_REGIONS.some((region) => region.id === id);
  const [selectedId, setSelectedId] = useState<RegionId | null>(() => {
    const opened = openedWith().region;
    return holds(opened) ? opened as RegionId : null;
  });
  useLinkedSelection({ region: selectedId }, (values) => { if (holds(values.region)) setSelectedId(values.region as RegionId); }, true);

  const selected = COVERAGE_REGIONS.find((region) => region.id === selectedId) ?? null;
  const standing = coverageStanding();

  return (
    <div className={`workspace workspace-register${selected ? ' has-inspector' : ''}`} data-testid="coverage-workspace" data-inspecting={selected ? 'region' : undefined}>
      <div className="workspace-top">
        <div className="surface register" tabIndex={0}>
          <table role="table" className="ledger-table" aria-label="Coverage regions">
            <thead><tr>
              <th scope="col">Region</th><th scope="col" className="th-wrap">Initial scope<br />proposed</th>
              <th scope="col">Product emphasis</th><th scope="col">Corridors</th>
              <th scope="col">Standing</th>
            </tr></thead>
            <tbody role="rowgroup" onKeyDown={registerKeys({ ids: COVERAGE_REGIONS.map((region) => region.id), selected: selectedId, select: setSelectedId, attribute: 'data-region-select' })}>
              {COVERAGE_REGIONS.map((region) => {
                const active = region.id === selectedId;
                const corridors = standing.corridorsMaintained === 0 ? 0 : null;
                return (
                  <tr role="row" key={region.id} data-region-id={region.id} aria-selected={active}>
                    <td role="cell">
                      <button
                        type="button"
                        className="row-selectable text-left w-full"
                        aria-pressed={active}
                        data-region-select={region.id}
                        onClick={() => setSelectedId(active ? null : region.id)}
                      >
                        <span style={{ color: active ? 'var(--accent-strong)' : 'var(--text-primary)' }}>{region.name}</span>
                        {region.distinction && <span className="block id row-sub">carries a distinction</span>}
                      </button>
                    </td>
                    <td role="cell" className="text-[12.5px] cell-wide"><span className="cell-label">Initial scope proposed</span>{region.initialScope}</td>
                    <td role="cell" className="text-[12px] cell-wide">
                      <span className="cell-label">Product emphasis</span>
                      {region.productEmphasis.join(' · ')}
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Corridors</span>
                      <span className="mono">{corridors}</span>
                    </td>
                    <td role="cell" className="text-[12px]">
                      <span className="cell-label">Standing</span>
                      <span className="pill" style={{ color: 'var(--text-muted)' }}>DECLARED</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-[11.5px]" data-testid="coverage-standing" style={{ color: 'var(--text-muted)' }}>
          {standing.regionsDeclared} regions declared, {standing.regionsEntered} entered.
          {' '}{standing.corridorsMaintained} corridors maintained — {standing.reference} at reference,
          {' '}{standing.assessed} assessed, {standing.monitored} monitored.
          {' '}This is a {standing.regionStanding.replace(/_/g, ' ').toLowerCase()}.
        </p>
      </div>

      {selected && (
        <Inspector
          id="region-inspector"
          testId="region-inspector"
          kicker="Coverage region · declared"
          title={selected.name}
          onClose={() => setSelectedId(null)}
          focusOnNarrow
        >
          <InspectorSection title="What would be investigated first">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{selected.initialScope}</p>
            <p className="m-0 text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              A bounded scope rather than the region. The regions do not run the same product.
            </p>
          </InspectorSection>

          <InspectorSection title="Product emphasis">
            <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5" data-testid="region-emphasis">
              {selected.productEmphasis.map((emphasis) => (
                <li key={emphasis} className="pill" style={{ color: 'var(--text-secondary)' }}>{emphasis}</li>
              ))}
            </ul>
          </InspectorSection>

          {/* The pair, together. The gap between them is the opportunity, and
              either half alone misdescribes it. */}
          <InspectorSection title="Evidence that already exists, and what it does not establish">
            <p className="m-0 text-[12.5px]" data-testid="region-foundation" style={{ color: 'var(--text-secondary)' }}>{selected.foundation}</p>
            <p className="m-0 mt-1.5 text-[12.5px]" data-testid="region-limit" style={{ color: 'var(--status-conditional)' }}>{selected.foundationLimit}</p>
          </InspectorSection>

          {selected.distinction && (
            <InspectorSection title="A distinction the label would erase">
              <p className="m-0 text-[12.5px]" data-testid="region-distinction" style={{ color: 'var(--text-secondary)' }}>{selected.distinction}</p>
            </InspectorSection>
          )}

          <InspectorSection title="What is covered here">
            <p className="m-0 text-[12.5px]" style={{ color: 'var(--text-muted)' }}>
              Nothing yet. No corridor is maintained in this region and no subject sits at any coverage level.
              A region is an intention; a corridor is the maintained object.
            </p>
          </InspectorSection>
        </Inspector>
      )}
    </div>
  );
}

