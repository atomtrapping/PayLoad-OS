import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { ENFORCEMENT_METHODS } from './constraints';
import {
  AS_OF_IS_ELIMINATION, DISAGREEMENT_IS_REPRESENTABLE, FACTOR_KINDS, FACTOR_SEQUENCE,
  MARGINALS_AND_VALUE, REPRODUCIBILITY, SOLVER_ADOPTION, SOLVER_NEVER_DECIDES, THE_JOINT,
  factorStanding,
} from './factorGraph';

describe('the graph is the joint, and the constraint stack lives in it', () => {
  it('maps every machinery in the thread onto one object', () => {
    expect(THE_JOINT.statement).toMatch(/p\(x\) ∝ ∏/);
    const factors = THE_JOINT.correspondence.map((c) => c.factor).join(' ');
    expect(factors).toMatch(/zero-noise factor/);
    expect(factors).toMatch(/weighted factor/);
    expect(factors).toMatch(/motion factor/);
    // The zero-noise factor is still implemented as the projection, per the constraint module.
    expect(factors).toMatch(/rather than as a literal zero/);
    expect(ENFORCEMENT_METHODS.find((m) => m.id === 'PROJECTION')!.verdict).toBe('RECOMMENDED');
  });

  it('marks a factor kind available only where the corpus already carries its material', () => {
    const by = (id: (typeof FACTOR_KINDS)[number]['id']) => FACTOR_KINDS.find((f) => f.id === id)!;
    expect(by('PRIOR').state).toBe('AVAILABLE_AS_DATA');
    expect(by('BETWEEN').state).toBe('AVAILABLE_AS_DATA');
    expect(by('MOTION').state).toBe('ABSENT');
    expect(by('CONSTRAINT').state).toBe('ABSENT');
    expect(by('RESTRICTION').state).toBe('ABSENT');
    for (const kind of FACTOR_KINDS) expect(kind.from.trim().length).toBeGreaterThan(40);
  });
});

describe('what a graph buys this corpus in particular', () => {
  it('keeps disagreement representable instead of averaging it away', () => {
    expect(DISAGREEMENT_IS_REPRESENTABLE.claim).toMatch(/posterior widens/);
    expect(DISAGREEMENT_IS_REPRESENTABLE.contrast).toMatch(/number no source asserted/);
    expect(DISAGREEMENT_IS_REPRESENTABLE.here).toMatch(/Nothing computes a joint/);
  });

  it('makes the value of a measurement a query, and keeps the firm out of instrument ownership', () => {
    expect(MARGINALS_AND_VALUE.free).toMatch(/insert the candidate factor virtually/);
    expect(MARGINALS_AND_VALUE.alerting).toMatch(/rather than a polling job/);
    expect(MARGINALS_AND_VALUE.boundary).toMatch(/buys measurements/);
  });

  it('answers as-of by elimination over retained factors, never by storing a result', () => {
    expect(AS_OF_IS_ELIMINATION.consequence).toMatch(/never authoritative/);
    expect(AS_OF_IS_ELIMINATION.clocks).toMatch(/Both clocks survive/);
  });
});

describe('the two disciplines, written before the first solve', () => {
  it('separates correct from reproducible, and pins what makes a digest mean anything', () => {
    expect(REPRODUCIBILITY.hazard).toMatch(/Correct is not the same as reproducible/);
    expect(REPRODUCIBILITY.discipline.length).toBe(3);
    expect(REPRODUCIBILITY.discipline.join(' ')).toMatch(/elimination ordering is a declared parameter/i);
    expect(REPRODUCIBILITY.discipline.join(' ')).toMatch(/solver version is pinned/);
    expect(REPRODUCIBILITY.atThisScale).toMatch(/sequential form is exactly reproducible/);
  });

  it('refuses to let a solver decide an identity, while letting it inform one', () => {
    expect(SOLVER_NEVER_DECIDES.rule).toMatch(/never delegates authority/);
    expect(SOLVER_NEVER_DECIDES.whatIsAllowed).toMatch(/scored evidence/);
    expect(SOLVER_NEVER_DECIDES.whatIsNot).toMatch(/audit computation from becoming a corpus fact/);
  });

  it('names the solver as a candidate that waits on the representation', () => {
    expect(SOLVER_ADOPTION.status).toBe('CANDIDATE');
    expect(SOLVER_ADOPTION.role).toMatch(/not a new architecture/);
    expect(SOLVER_ADOPTION.precondition).toMatch(/representation first/);
    expect(FACTOR_SEQUENCE[0]).toMatch(/representation before the solver/);
  });
});

describe('what the corpus would contribute', () => {
  it('counts variables and factors from records, and no solve', () => {
    const standing = factorStanding(CARAVAN_CORPUS);
    expect(standing.variables).toBeGreaterThan(0);
    expect(standing.priorFactors).toBeGreaterThan(0);
    expect(standing.betweenFactors).toBeGreaterThan(0);
    expect(standing.constraintFactors).toBe(0);
    expect(standing.motionFactors).toBe(0);
    expect(standing.solves).toBe(0);
    expect(standing.statement).toMatch(/subtract receipt transparency/);
  });
});
