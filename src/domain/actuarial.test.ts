import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import {
  CORRESPONDENCES, ENTRY_CAUTIONS, FIT_DEPTH_LABEL, MANDATE_INVERSION,
  TRIANGLE_SHAPED_RESULT, actuarialStanding,
} from './actuarial';

describe('the isomorphism, and where it is not a metaphor', () => {
  it('labels every depth it uses and gives every row a reason and a present state', () => {
    for (const c of CORRESPONDENCES) {
      expect(FIT_DEPTH_LABEL[c.depth]).toBeTruthy();
      expect(c.why.trim().length).toBeGreaterThan(80);
      expect(c.here.trim().length).toBeGreaterThan(50);
    }
    expect(new Set(CORRESPONDENCES.map((c) => c.ours)).size).toBe(CORRESPONDENCES.length);
  });

  it('reserves IDENTICAL for the three that are the same object', () => {
    const identical = CORRESPONDENCES.filter((c) => c.depth === 'IDENTICAL').map((c) => c.theirs);
    expect(identical).toHaveLength(3);
    expect(identical.join(' ')).toMatch(/loss development triangle/);
    expect(identical.join(' ')).toMatch(/valuation-date statement/);
    expect(identical.join(' ')).toMatch(/signing actuary/);
  });

  it('marks catastrophe modelling as their open problem rather than as a fit', () => {
    const cat = CORRESPONDENCES.find((c) => c.theirs.startsWith('Catastrophe'))!;
    expect(cat.depth).toBe('ADJACENT');
    expect(cat.why).toMatch(/hardest current problem/);
    expect(cat.here).toMatch(/nothing is acquired/);
  });

  it('never lets a correspondence read as a capability claim', () => {
    // Every row's present state names an absence or a fixture, because every one is one.
    for (const c of CORRESPONDENCES) {
      expect(c.here).toMatch(/[Nn]o |absent|fixture|never|Nothing/);
    }
  });
});

describe('what follows commercially, stated without inventing a duty', () => {
  it('inverts the sale and refuses to paraphrase a professional obligation', () => {
    expect(MANDATE_INVERSION.claim).toMatch(/already required of the buyer/);
    expect(MANDATE_INVERSION.because).toMatch(/professionally accountable/);
    // The restraint that keeps this honest: name a standard, never restate it.
    expect(MANDATE_INVERSION.restraint).toMatch(/inventing a professional duty/);
  });

  it('enters beside the incumbents rather than through them', () => {
    expect(ENTRY_CAUTIONS).toHaveLength(3);
    for (const c of ENTRY_CAUTIONS) expect(c.entry.trim().length).toBeGreaterThan(40);
    expect(ENTRY_CAUTIONS[0].detail).toMatch(/Nothing here displaces a classification/);
    expect(ENTRY_CAUTIONS[1].detail).toMatch(/same instinct as the refusals/);
  });

  it('states the triangle-shaped result as a shape with a precondition, not a promise', () => {
    expect(TRIANGLE_SHAPED_RESULT.state).toBe('ABSENT');
    expect(TRIANGLE_SHAPED_RESULT.precondition).toMatch(/admission authority/);
    expect(TRIANGLE_SHAPED_RESULT.because).toMatch(/reader’s own structure/);
  });
});

describe('what exists', () => {
  it('counts the mapping and the emptiness it maps to', () => {
    const standing = actuarialStanding(CARAVAN_CORPUS);
    expect(standing.correspondences).toBe(CORRESPONDENCES.length);
    expect(standing.identicalPairs).toBe(3);
    expect(standing.developmentHistories).toBe(0);
    expect(standing.valuationDatesAnswered).toBe(0);
    expect(standing.engagements).toBe(0);
    expect(standing.statement).toMatch(/not evidence that anyone has used it/);
  });
});
