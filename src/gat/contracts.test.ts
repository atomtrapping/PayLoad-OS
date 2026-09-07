
/* ── The engine's epistemic vocabulary meeting the corpus's ── */

import {
  ENGINE_INTEREST,
  EVIDENCE_MAPPING_DECLARED_BY,
  GAT_EVIDENCE_KINDS,
  GAT_EVIDENCE_MAPPING,
  GAT_EVIDENCE_MAPPING_LOSS,
  corpusClassFor,
} from './contracts';
import { CLAIM_STRENGTH_RANK, INTEREST_RANK } from '@/domain/types';

describe('the engine speaks one axis and the corpus speaks three', () => {
  it('maps every kind the engine declares, and nothing it does not', () => {
    // Rows are grouped by whether they map at all, not by the engine's
    // declaration order, so every kind is covered and none is invented.
    expect([...GAT_EVIDENCE_MAPPING.map((row) => row.kind)].sort()).toEqual([...GAT_EVIDENCE_KINDS].sort());
    expect(new Set(GAT_EVIDENCE_MAPPING.map((row) => row.kind)).size).toBe(GAT_EVIDENCE_KINDS.length);
    for (const row of GAT_EVIDENCE_MAPPING) {
      expect(row.means).toMatch(/\S/);
      expect(row.because).toMatch(/\S/);
    }
    expect(() => corpusClassFor('NOT_A_KIND' as never)).toThrow(/no mapping declared/);
  });

  it('refuses to grade a value nothing witnessed, and offers no unclassified default in its place', () => {
    // An assumption is a condition the computation ran under; a simulation is
    // an observation of a model. Neither is evidence about the world.
    expect(corpusClassFor('ASSUMED')).toBeNull();
    expect(corpusClassFor('SIMULATED')).toBeNull();
    expect(GAT_EVIDENCE_MAPPING.filter((row) => row.becomes === null).map((row) => row.kind))
      .toEqual(['ASSUMED', 'SIMULATED']);
    // `unclassified` is inadmissible for canonical assertion, so it is not a
    // resting place for a kind that has no class: the mapping says nothing.
    expect(GAT_EVIDENCE_MAPPING.some((row) => row.becomes?.productionClass === 'unclassified')).toBe(false);
  });

  it('never calls an engine output disinterested', () => {
    // The engine holds no stake and knows nothing of its inputs' stakes. A
    // computation over an interested party's declarations is not
    // disinterested because a machine performed it.
    expect(ENGINE_INTEREST).toBe('unknown');
    for (const row of GAT_EVIDENCE_MAPPING) {
      if (row.becomes) expect(row.becomes.interest).toBe('unknown');
    }
    expect(INTEREST_RANK.unknown).toBeLessThan(INTEREST_RANK.disinterested);
    expect(INTEREST_RANK.unknown).toBeGreaterThan(INTEREST_RANK.self_reported);
  });

  it('does not match DERIVED by spelling, because it is three terms in two vocabularies', () => {
    // DERIVED is a GAT kind, a corpus claim strength and a corpus production
    // class. Only one row may carry it on both corpus axes.
    expect(corpusClassFor('DERIVED')).toMatchObject({ claimStrength: 'derived', productionClass: 'derived' });
    // INFERRED is derived in production and only an estimate in strength:
    // conditioning does not make a value harder than the evidence under it.
    expect(corpusClassFor('INFERRED')).toMatchObject({ claimStrength: 'estimated', productionClass: 'derived' });
    expect(CLAIM_STRENGTH_RANK.estimated).toBeGreaterThan(CLAIM_STRENGTH_RANK.derived);
    // MEASURED keeps the reading's strength; the engine measured nothing.
    expect(corpusClassFor('MEASURED')).toMatchObject({ claimStrength: 'reported', productionClass: 'measured' });
    expect(corpusClassFor('ESTIMATED')).toMatchObject({ claimStrength: 'estimated', productionClass: 'computed' });
  });

  it('says whose reading it is, and that mapping a value is not admitting it', () => {
    const loss = GAT_EVIDENCE_MAPPING_LOSS.join(' ');
    expect(loss).toMatch(/never that a record may be written/);
    expect(loss).toMatch(/the engine is not a corpus writer/);
    expect(loss).toMatch(/three terms in two vocabularies/);
    expect(loss).toMatch(/No engine output is disinterested/);
    expect(EVIDENCE_MAPPING_DECLARED_BY).toMatch(/THE CONSUMER/);
    expect(EVIDENCE_MAPPING_DECLARED_BY).toMatch(/the engine has declared no mapping/);
    expect(loss).toContain(EVIDENCE_MAPPING_DECLARED_BY);
  });
});
