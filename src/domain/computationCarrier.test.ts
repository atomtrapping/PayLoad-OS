import { describe, expect, it } from 'vitest';
import { DIVERGENCE_MEANING, GRADE_MEANING } from './computationCard';
import {
  ARCHIVAL_TEST, CARD_PROPERTIES, CONGRUENCE, CONGRUENCE_GUARDS, FROZEN_SIDE,
  AUTHORITY_DIRECTION, GENERAL_PROVING, INTEROPERATION, INTEROP_FAMILIES, INTEROP_GUARDS,
  MIRRORS_THE_MODEL, NOT_CREDIBILITY, WHAT_GETS_A_CARD, carrierStanding,
} from './computationCarrier';

describe('the carrier reading, not the proof reading', () => {
  it('chooses the carrier and says where credibility actually lives', () => {
    expect(NOT_CREDIBILITY.chosen).toBe('CARRIER');
    expect(NOT_CREDIBILITY.proofReading).toMatch(/substitutes for trust in the operator/);
    expect(NOT_CREDIBILITY.carrierReading).toMatch(/no trust assumption at all/);
    expect(NOT_CREDIBILITY.whereCredibilityLives).toMatch(/estate.*rulings.*two clocks/);
    expect(NOT_CREDIBILITY.soThen).toMatch(/never the carrier’s to supply/);
  });

  it('refuses general proving, with the cost, the new frame and the wrong question', () => {
    expect(GENERAL_PROVING.state).toBe('REFUSED');
    expect(GENERAL_PROVING.reasons).toHaveLength(3);
    expect(GENERAL_PROVING.reasons.join(' ')).toMatch(/one more frame for the reference channel to guard/);
    expect(GENERAL_PROVING.reasons.join(' ')).toMatch(/re-derivation is stronger than verification/);
    // What is kept is bounded and per-transition, not general.
    expect(GENERAL_PROVING.insteadKept).toMatch(/one exact transition/);
  });
});

describe('what makes a card a card', () => {
  it('holds the two properties it has and names the two it does not', () => {
    expect(CARD_PROPERTIES).toHaveLength(4);
    const present = CARD_PROPERTIES.filter((p) => p.present).map((p) => p.id);
    expect(present).toEqual(['DETERMINISM', 'AUDIT_WITHOUT_RERUN']);
    const missing = CARD_PROPERTIES.filter((p) => !p.present).map((p) => p.id);
    expect(missing).toEqual(['ARCHIVABILITY', 'UNIFORMITY']);
    for (const p of CARD_PROPERTIES) expect(p.here.trim().length).toBeGreaterThan(60);
  });

  it('grades computation classes by whether the artifact outlives the machine', () => {
    const by = (subject: string) => ARCHIVAL_TEST.grades.find((g) => g.subject.startsWith(subject))!;
    expect(by('Fixed-point').grade).toBe('PASSES');
    expect(by('Floating-point').grade).toBe('DEGRADES');
    expect(by('Learned-model').grade).toBe('FAILS');
    // Floating point fails the same way an unpinned solver ordering does.
    expect(by('Floating-point').because).toMatch(/unpinned elimination ordering/);
    // Weights are not the execution.
    expect(by('Learned-model').because).toMatch(/Weights are not the execution/);
    // The class table states the grades; one artifact is graded by the module that implements it.
    expect(ARCHIVAL_TEST.computedBy).toMatch(/cardGrade/);
    for (const grade of ['CARD_GRADE', 'REPLAYABLE_HERE', 'LOG_ONLY'] as const) {
      expect(ARCHIVAL_TEST.computedBy).toContain(grade);
      expect(GRADE_MEANING[grade]).toBeTruthy();
    }
  });

  it('applies the record waterline to computations', () => {
    expect(WHAT_GETS_A_CARD.rule).toMatch(/reasoning paths that feed a ruling/);
    expect(WHAT_GETS_A_CARD.rebuilt).toMatch(/derived views/);
    expect(WHAT_GETS_A_CARD.why).toMatch(/same waterline/);
  });
});

describe('what exists', () => {
  it('reports two of four properties, and the run-shape count that says the format is not one', () => {
    const standing = carrierStanding();
    expect(standing.propertiesTotal).toBe(CARD_PROPERTIES.length);
    expect(standing.propertiesPresent).toBe(2);
    expect(standing.runShapes).toBeGreaterThan(1);
    expect(standing.statement).toMatch(/rather than one format/);
    expect(standing.statement).toMatch(/no decoding specification that outlives this repository/);
  });
});

describe('the card as a geometry', () => {
  it('names three mechanisms already here as instances of one idea', () => {
    expect(CONGRUENCE.alreadyHere).toHaveLength(3);
    expect(CONGRUENCE.alreadyHere.map((i) => i.instance)).toEqual([
      'The innovation gate', 'The reference channel', 'The disagreement layer',
    ]);
    expect(CONGRUENCE.unification).toMatch(/three unrelated instincts/);
  });

  it('takes the payoff from the side that never jitters, three ways', () => {
    expect(FROZEN_SIDE.asymmetry).toMatch(/cannot be replayed/);
    expect(FROZEN_SIDE.payoff).toMatch(/the inputs are no longer the inputs/);
    // The isolation is performed by the module that implements it, not restated here.
    expect(FROZEN_SIDE.computedBy).toMatch(/divergenceOf/);
    for (const key of ['NONE', 'INPUTS_CHANGED', 'EXECUTION_UNSTABLE', 'WORLD_OR_MODEL'] as const) {
      expect(FROZEN_SIDE.computedBy).toContain(key);
      expect(DIVERGENCE_MEANING[key]).toBeTruthy();
    }
    expect(FROZEN_SIDE.therefore).toMatch(/cannot be renegotiated/);
    // And it still testifies rather than deciding.
    expect(FROZEN_SIDE.butStill).toMatch(/never decides/);
  });

  it('declares before it measures, routes rather than adjudicates, and checks both directions', () => {
    expect(CONGRUENCE_GUARDS).toHaveLength(3);
    expect(CONGRUENCE_GUARDS[0].detail).toMatch(/cannot fail congruence silently/);
    expect(CONGRUENCE_GUARDS[1].detail).toMatch(/keeps a solver from deciding an identity/);
    expect(CONGRUENCE_GUARDS[2].detail).toMatch(/pin the computation at both ends/);
  });

  it('says the manifest mirrors the model and not the world', () => {
    expect(MIRRORS_THE_MODEL.limit).toMatch(/perfect mirror of the model’s errors/);
    expect(MIRRORS_THE_MODEL.danger).toMatch(/Exact execution of a wrong model/);
    expect(MIRRORS_THE_MODEL.therefore).toMatch(/Two congruences, two guardians/);
    // And the guardian that would separate them is absent.
    expect(MIRRORS_THE_MODEL.therefore).toMatch(/absent here/);
  });
});

describe('interoperation without absorbing their epistemics', () => {
  it('attaches to a host without asking the host to change', () => {
    expect(INTEROPERATION.pattern).toMatch(/No host adoption is required/);
    expect(INTEROPERATION.soWhat).toMatch(/distribution rather than competition/);
    // And nothing is integrated, which the state says rather than the prose implying.
    expect(INTEROPERATION.state).toBe('ABSENT');
    expect(INTEROPERATION.here).toMatch(/a specification, not a shipment/);
  });

  it('names four families with the direction each crosses in', () => {
    expect(INTEROP_FAMILIES).toHaveLength(4);
    const by = (id: (typeof INTEROP_FAMILIES)[number]['id']) => INTEROP_FAMILIES.find((f) => f.id === id)!;
    expect(by('GEOSPATIAL').mechanism).toMatch(/^Inward/);
    expect(by('GEOSPATIAL').mechanism).toMatch(/never an overwrite/);
    expect(by('GRAPH_PLATFORM').mechanism).toMatch(/^Outward/);
    expect(by('SOLVER').mechanism).toMatch(/never as a fact/);
  });

  it('inverts the direction of authority, which is what keeps it safe', () => {
    expect(AUTHORITY_DIRECTION.wrongWay).toMatch(/cache of other systems’ assertions/);
    expect(AUTHORITY_DIRECTION.rightWay).toMatch(/keep the ledger of how well it tracks/);
    expect(AUTHORITY_DIRECTION.residualIs).toMatch(/Never a silent overwrite/);
    expect(AUTHORITY_DIRECTION.therefore).toMatch(/without absorbing their epistemics/);
  });

  it('keeps exports as projections and vendor formats as versioned sources', () => {
    expect(INTEROP_GUARDS).toHaveLength(2);
    expect(INTEROP_GUARDS[0].detail).toMatch(/not a second corpus/);
    expect(INTEROP_GUARDS[1].detail).toMatch(/does not jitter when a vendor revises a format/);
  });
});
