/**
 * Constraints are observations with provenance.
 *
 * The unifying fact, and the reason this belongs in a corpus rather than in a
 * solver: a hard equality constraint Cx = c is a measurement update with H = C,
 * R = 0 and z = c. A soft constraint is the same object with R > 0. So a
 * conservation identity, a cadastral rule, a zoning ordinance and a unit
 * conversion are not solver configuration — they are declared, versioned,
 * bitemporal claims with sources, and they belong in the release manifest
 * beside everything else the corpus asserts.
 *
 * Two consequences follow, and both are doctrine rather than numerics.
 *
 * A hard constraint reduces the posterior covariance by rank(C) for free, and
 * that information is real only if the constraint is true. A wrong hard
 * constraint therefore manufactures certainty the estimator will then defend:
 * contradicting evidence is absorbed into other state variables, innovations
 * stop looking anomalous, and confident wrongness becomes structural rather
 * than accidental. Certainty is harvested in proportion to declared confidence,
 * which is the same honesty lever the process noise already was.
 *
 * And a constraint that keeps being violated is not noise. It is evidence the
 * constraint is wrong, and it enters the ordinary adjudication path as a
 * candidate for supersession. Which declared constraints failed, when, and with
 * what proof, is another estate the corpus accumulates.
 *
 * Nothing here runs an estimator. No constraint is declared, none is enforced,
 * and no residual is gated. This module is the contract those things would have
 * to satisfy, stated so that the first implementation is a decision against it.
 */
import type { Corpus } from './corpus';
import type { Domain } from './types';

/* ── A constraint is a measurement ── */

export const CONSTRAINT_IS_AN_OBSERVATION = {
  identity: 'A hard equality constraint Cx = c is a measurement update with H = C, R = 0 and z = c. A soft constraint is the same update with R > 0.',
  consequence: 'Constraints are therefore beliefs with provenance, not solver settings: declared, versioned, sourced, bitemporal, and carried in the release manifest.',
  neverLiterally: 'R = 0 is never implemented as a number. A zero measurement covariance makes the innovation covariance singular; the projection form below is the well-conditioned limit of the same operation.',
} as const;

/* ── How it is enforced ── */

export type EnforcementMethod = 'PROJECTION' | 'PSEUDO_MEASUREMENT' | 'REPARAMETERIZATION' | 'CLIPPING';

export interface EnforcementSpec {
  id: EnforcementMethod;
  title: string;
  what: string;
  /** When this is the right one, or that it is never right. */
  use: string;
  verdict: 'RECOMMENDED' | 'ACCEPTED' | 'CASE_BY_CASE' | 'FORBIDDEN';
}

export const ENFORCEMENT_METHODS: readonly EnforcementSpec[] = [
  {
    id: 'PROJECTION',
    title: 'Projection onto the constraint surface',
    what: 'Run the unconstrained update, then project the estimate onto Cx = c in the covariance metric: K_c = P Cᵀ (C P Cᵀ)⁻¹, x̂_c = x̂ + K_c (c − C x̂), P_c = (I − K_c C) P in Joseph form for numerical hygiene.',
    use: 'The default for equality constraints. It keeps the filter itself linear-Gaussian and makes enforcement a separate, digestible stage.',
    verdict: 'RECOMMENDED',
  },
  {
    id: 'PSEUDO_MEASUREMENT',
    title: 'Constraint as a pseudo-measurement',
    what: 'Feed the constraint through the ordinary update with H = C, z = c and a declared R_c. The projection above is its R → 0 limit.',
    use: 'The form every soft constraint takes, because a soft constraint is exactly a measurement whose noise says how much to trust it.',
    verdict: 'ACCEPTED',
  },
  {
    id: 'REPARAMETERIZATION',
    title: 'Change of variables',
    what: 'Choose coordinates in which the constraint holds by construction: a log transform for positivity, an angle on the circle, a simplex parameterization for shares.',
    use: 'Elegant where it fits, and it makes the model nonlinear, so it is a per-quantity decision rather than a policy.',
    verdict: 'CASE_BY_CASE',
  },
  {
    id: 'CLIPPING',
    title: 'Clamping the estimate to the bound',
    what: 'Move the violating value to the nearest allowed one and leave the covariance alone.',
    use: 'Never. It ignores the covariance and corrupts the posterior silently, which is the most common malpractice in constrained estimation and the hardest to detect afterwards.',
    verdict: 'FORBIDDEN',
  },
];

/* ── The declared object ── */

export type Hardness = 'HARD' | 'STIFF_SOFT' | 'SOFT';

export const HARDNESS_RULE: Record<Hardness, string> = {
  HARD: 'Definitional identities only: unit conversions, sum of shares equals one, an accounting identity that is true by construction. Nothing measured and nothing regulatory.',
  STIFF_SOFT: 'A real-world law with a small declared residual noise. Mass balance is stiff-soft, not hard, because facilities leak, meters drift and unmodelled flows exist.',
  SOFT: 'Everything measured, surveyed or regulatory, with R_c set in proportion to one minus the declared confidence, so the certainty harvested matches the certainty claimed.',
};

export const CONSTRAINT_RECORD_CONTRACT = {
  bitemporal: 'Constraints carry both clocks like any other claim. A capacity changes with a retrofit and a floor-area ratio with an ordinance version, so an as-of rebuild must apply the constraint stack as of the knowledge instant asked for, not the current one.',
  inTheManifest: 'The constraint versions in force belong in the release manifest, because a release that was computed under a different constraint stack is a different release.',
  state: 'ABSENT' as const,
  here: 'No constraint is declared anywhere in this repository, and nothing enforces one. Records carry values, units, bases and uncertainty; no relation between two quantities is asserted as a constraint.',
} as const;

/* ── The rule that keeps a constraint from forging certainty ── */

export const HARVEST_RULE = {
  rule: 'Harvest certainty in proportion to declared confidence.',
  why: 'A hard constraint reduces the covariance by rank(C) for free. That reduction is real only if the constraint is true, so a wrong hard constraint manufactures certainty the estimator then defends: contradicting evidence is absorbed elsewhere in the state, innovations stop looking anomalous, and the wrongness becomes structural.',
  therefore: 'Definitional identities may be hard. Everything measured or regulatory is soft, with R_c proportional to one minus confidence. Real-world laws are stiff-soft with a declared residual, because the world leaks.',
  echoes: 'Declared constraint noise is the same honesty lever process noise is: the number that says how much of the world the model admits it does not carry.',
} as const;

/* ── The violation tape ── */

export const VIOLATION_TAPE = {
  residual: 'r = c − C x̂, with covariance C P Cᵀ. The same normalized-innovation gate that watches a measurement watches a constraint.',
  meaning: 'A constraint that keeps being violated is not noise. It is evidence the constraint is wrong, and it enters the ordinary adjudication path as a candidate for supersession, with its violations as the proof.',
  estate: 'Which declared constraints failed, when, and against what evidence, accumulates the same way corrections and resolutions do. It is an estate, not a log.',
  twoAnalyses: 'Where something material rides on it, run the analysis twice — with and without the constraint stack — and report the delta. That is the two-knowledge-times honesty pattern applied to model structure rather than to time.',
  state: 'ABSENT' as const,
} as const;

/* ── Inequalities, honestly ── */

export const INEQUALITIES = {
  truth: 'The posterior under an inequality is a truncated Gaussian. It is not Gaussian and has no closed form, so any Gaussian answer under an inequality is an approximation and must say so.',
  options: [
    { option: 'Per-dimension truncated-Gaussian moments', when: 'Box constraints. Exact for the box and cheap.', effort: 'LOW' },
    { option: 'Active-set quadratic programme per update', when: 'A general polytope of constraints.', effort: 'MEDIUM' },
    { option: 'Leave the belief unconstrained and constrain the action', when: 'Usually correct. Constrained optimization over actions is well-posed, and most inequalities are about what may be done rather than about what is true.', effort: 'LOW' },
  ],
  doNotConflate: 'A state constraint and an action constraint are different objects. “Clearance ≥ 0” is not a fact about the world being estimated; it is the decision boundary, and it belongs to the decision layer.',
} as const;

/* ── What each line's constraints would be ── */

export interface ConstraintFamily {
  domain: Domain | 'CROSS_CUTTING';
  constraints: readonly { statement: string; hardness: Hardness; note: string }[];
}

export const CONSTRAINT_FAMILIES: readonly ConstraintFamily[] = [
  {
    domain: 'CARAVAN',
    constraints: [
      { statement: 'Flow conservation at a node: inflow = outflow + change in storage.', hardness: 'STIFF_SOFT', note: 'A law with a residual. Meters drift, transfers go unrecorded, and a hard balance would absorb every discrepancy into whichever quantity is least observed.' },
      { statement: 'Berth occupancy ≤ berth capacity.', hardness: 'SOFT', note: 'An inequality about the world, and capacity is itself a measured, revisable quantity.' },
      { statement: 'Vessel draft and speed are coupled through loading.', hardness: 'SOFT', note: 'A relationship with real scatter; enforcing it hard would invent precision in whichever of the two is worse observed.' },
    ],
  },
  {
    domain: 'LANDSHARK',
    constraints: [
      { statement: 'Parcel-split conservation: the child areas sum to the parent area.', hardness: 'STIFF_SOFT', note: 'The best example in the system. It ties an identity operation to a quantity, so a violation is either a bad extraction — calibration feedback — or a real event such as a partial sale. A constraint that doubles as an anomaly detector.' },
      { statement: 'Built floor-area ratio ≤ zoned floor-area ratio.', hardness: 'SOFT', note: 'An inequality whose violation is a signal rather than an error, and whose right-hand side is an ordinance version with its own two clocks.' },
      { statement: 'Survey traverses close.', hardness: 'STIFF_SOFT', note: 'Closure error is the surveyor’s own quality measure; forcing it to zero discards exactly the number that says how good the survey was.' },
    ],
  },
  {
    domain: 'TRADEWIND',
    constraints: [
      { statement: 'Position weights sum to one.', hardness: 'HARD', note: 'Definitional. A share that does not sum is a bookkeeping error, not a belief.' },
      { statement: 'Exposures are non-negative where the instrument forbids a short.', hardness: 'SOFT', note: 'An inequality, and one that usually belongs to the decision layer rather than to the belief.' },
      { statement: 'Inventory stays within declared bounds.', hardness: 'SOFT', note: 'A bound that is itself declared, dated and revisable.' },
    ],
  },
  {
    domain: 'CROSS_CUTTING',
    constraints: [
      { statement: 'Unit-conversion identities hold exactly.', hardness: 'HARD', note: 'Definitional and the safest hard constraint there is: it is arithmetic, not a claim about the world.' },
      { statement: 'A cumulative series is monotone.', hardness: 'STIFF_SOFT', note: 'True of the world and false of the data, because restatements go backwards. A hard version would hide exactly the restatements worth seeing.' },
      { statement: 'Shares of a whole sum to one.', hardness: 'HARD', note: 'Definitional, and the classic reparameterization case: a simplex coordinate makes it hold by construction.' },
    ],
  },
];

/* ── What constraints do to the value of a measurement ── */

export const VOI_INTERACTION = {
  effect: 'Constraints propagate information between quantities, so they change what a measurement is worth. If a constraint ties two facilities’ throughputs, one instrument on one facility illuminates the other.',
  therefore: 'Instrument value is computed with the constraint stack active — aᵀ(P⁻ − P⁺)a under the constraints — or measurements are systematically underpriced and the tasking decision is wrong in a predictable direction.',
  butHonestly: 'The cross-illumination is worth exactly its declared confidence, and a soft constraint prices that automatically. A hard constraint would price it at certainty, which is the harvest rule again, now costing money rather than credibility.',
} as const;

/* ── How it would be built ── */

export const BUILD_NOTES = {
  receiptedStage: 'Enforcement is a separate stage after the unconstrained update, and both are digested into the computation receipt: unconstrained filter, then constraint projection, each deterministic and each auditable on its own.',
  batchForm: 'In the rebuild-from-canonical-state world the smoother form is cleaner still: constrained trajectory estimation is constrained least squares, and a quadratic programme only if inequalities enter. Factor-graph solvers do this natively, with the standing caveat that the elimination order must be pinned for a reproducible digest.',
  keepsTheFilterLinear: 'Doing it this way keeps the filter itself linear-Gaussian, which is what makes the receipt meaningful.',
} as const;

export const CONSTRAINT_SEQUENCE: readonly string[] = [
  'Equality projection as a receipted stage first: it is days of work, it is exact, and it makes the shape of everything else concrete.',
  'Soft constraints as pseudo-measurements next, with R_c from declared confidence, because that is where every measured or regulatory constraint belongs.',
  'The violation tape after that, gating residuals the way innovations are gated, so a wrong constraint is found by the system rather than by a person.',
  'Inequalities to the decision layer, where constrained optimization over actions is well-posed.',
  'A quadratic programme only if a product demands general polytope constraints on the belief itself, and not before.',
];

/* ── What exists here ── */

export interface ConstraintStanding {
  declared: number;
  enforced: number;
  violations: number;
  /** Quantities that carry a unit, which is the population a unit identity would constrain. */
  quantitiesWithUnits: number;
  statement: string;
}

/** Pure: the honest count, which is zero, over a population that is not. */
export function constraintStanding(corpus: Corpus): ConstraintStanding {
  const quantitiesWithUnits = corpus.records.filter((r) => typeof r.unit === 'string' && r.unit.length > 0).length;
  return {
    declared: 0,
    enforced: 0,
    violations: 0,
    quantitiesWithUnits,
    statement: `No constraint is declared and none is enforced. ${quantitiesWithUnits} record${quantitiesWithUnits === 1 ? '' : 's'} carry a unit, which is the population a unit-conversion identity would act on — the one family safe to make hard, because it is arithmetic rather than a claim about the world.`,
  };
}
