import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { positionKeys, positionPairs } from '@/domain/spatialKey';
import { SpatialKeys } from './SpatialKeys';

const release = 'COR-CAR-2026.09.01';

describe('the derivation beneath the globe', () => {
  it('shows a cell for every keyed position, with the uncertainty that bounded it', () => {
    render(<SpatialKeys corpus={CARAVAN_CORPUS} releaseId={release} />);
    for (const key of positionKeys(CARAVAN_CORPUS)) {
      const row = document.querySelector(`[data-key-record="${key.recordId}"]`)!;
      expect(row).toBeTruthy();
      expect(row.getAttribute('data-keyed')).toBe(String(key.outcome.keyed));
      if (key.outcome.keyed) {
        expect(within(row as HTMLElement).getByText(key.outcome.key.cell)).toBeInTheDocument();
        // The cell is never presented without the claim that bounded its resolution.
        expect(row.textContent).toContain(`±${Math.round(key.outcome.key.boundedByM).toLocaleString('en-US')} m`);
      }
    }
  });

  it('reports the verdict for every pair, with its reasoning shown', () => {
    render(<SpatialKeys corpus={CARAVAN_CORPUS} releaseId={release} />);
    const pairs = positionPairs(CARAVAN_CORPUS);
    expect(pairs.length).toBeGreaterThan(0);
    for (const pair of pairs) {
      const row = document.querySelector(`[data-pair="${pair.a.recordId}-${pair.b.recordId}"]`)!;
      expect(row.getAttribute('data-verdict')).toBe(pair.verdict);
      expect(row.textContent).toContain(pair.because);
    }
  });

  it('says the display is not the derivation, and that containment is absent', () => {
    render(<SpatialKeys corpus={CARAVAN_CORPUS} releaseId={release} />);
    expect(screen.getByText(/The globe is the display/)).toBeInTheDocument();
    expect(screen.getByText(/Containment is the join that would matter, and it is absent/)).toBeInTheDocument();
  });

  it('refuses rather than defaults when a position states no uncertainty', () => {
    const corpus = structuredClone(CARAVAN_CORPUS);
    for (const record of corpus.records) if (record.geometry) delete record.geometry.horizontalUncertaintyM;
    render(<SpatialKeys corpus={corpus} releaseId={release} />);
    const refused = document.querySelectorAll('[data-key-record][data-keyed="false"]');
    expect(refused.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Refused').length).toBe(refused.length);
    expect(screen.getAllByText('none stated').length).toBe(refused.length);
  });
});
