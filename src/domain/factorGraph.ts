/**
 * The factor graph is the name for what the estimator already is.
 *
 * A joint belief over the quantities the corpus tracks, expressed as a product
 * of factors: p(x) ∝ ∏ f_i(x_i). Gaussian factors are the linear-Gaussian
 * family; a soft constraint is a weighted factor; a hard constraint is a
 * zero-noise one. The dynamics that carry a belief from one epoch to the next
 * are motion factors. The hierarchical rollups the complex describes are
 * restriction and prolongation factors between adjacent levels. Every piece of
 * estimation machinery in this repository has been describing one object.
 *
 * Three properties are why it is worth naming rather than just using.
 *
 * Disagreement is representable. Two sources disagreeing about a capacity are
 * two factors pulling one variable, and the posterior widens to reflect genuine
 * conflict. A pipeline that averages them silently reports a number nobody
 * asserted; a graph holds the tension in suspension, visibly, which is exactly
 * what the disagreement layer is for.
 *
 * Marginals are a by-product of solving, so the value of a measurement is a
 * query rather than a study: insert the candidate factor virtually and measure
 * what it does to the marginal of the decision variable. The measurement
 * economy already computes this; the graph is its native substrate.
 *
 * And an as-of answer is elimination over retained factors, which is the
 * rebuild-from-canonical-state doctrine restated for inference. A solve is a
 * computed projection: cached, invalidated on a release bump, never
 * authoritative.
 *
 * Two disciplines are written here before the first solve, because both are
 * cheap now and expensive later: a posterior digest is meaningless unless the
 * elimination ordering and the solver version are pinned and recorded, and a
 * solver never decides an identity.
 *
 * Nothing here solves anything. No factor is declared, no graph is assembled,
 * and no solver is installed.
 */
import { IDENTITY_LINK_PREDICATE } from './corpus';
import type { Corpus } from './corpus';

/* ── The joint ── */

export const THE_JOINT = {
  statement: 'The graph is the joint: p(x) ∝ ∏ f_i(x_i). Variables are the quantities and poses being estimated; factors are everything known about them.',
  correspondence: [
    { thread: 'Gaussian measurement', factor: 'A factor whose noise model is the measurement covariance.' },
    { thread: 'Soft constraint', factor: 'A weighted factor, with R_c from the declared confidence.' },
    { thread: 'Hard constraint', factor: 'A zero-noise factor, implemented as the projection form rather than as a literal zero.' },
    { thread: 'Declared dynamics between epochs', factor: 'A motion factor chaining the epoch variables.' },
    { thread: 'Hierarchical rollup between cell levels', factor: 'Restriction and prolongation factors, which makes aggregation part of the inference rather than a preprocessing step.' },
  ],
  why: 'Naming it collapses four separate machineries — the estimator, the constraint stack, the complex’s aggregation, and the measurement economy — into one object with one contract.',
} as const;

/* ── The kinds of factor ── */

export type FactorKind = 'PRIOR' | 'BETWEEN' | 'MOTION' | 'CONSTRAINT' | 'RESTRICTION';

export interface FactorSpec {
  id: FactorKind;
  title: string;
  what: string;
  /** Where one would come from in this repository, or that nothing produces one. */
  from: string;
  state: 'AVAILABLE_AS_DATA' | 'ABSENT';
}

export const FACTOR_KINDS: readonly FactorSpec[] = [
  { id: 'PRIOR', title: 'Prior', what: 'An absolute statement about one variable: an anchor, a control point, a declared starting belief.', from: 'A record with a value and stated uncertainty bounds is a unary factor on its subject’s quantity. The corpus carries these today, as data.', state: 'AVAILABLE_AS_DATA' },
  { id: 'BETWEEN', title: 'Between', what: 'A relative statement about two variables: a difference, a ratio, an offset one observation asserts.', from: `Authored, evidence-bearing relations. One predicate exists, ${IDENTITY_LINK_PREDICATE}; a richer link vocabulary does not.`, state: 'AVAILABLE_AS_DATA' },
  { id: 'MOTION', title: 'Motion', what: 'The declared dynamics carrying a variable from one epoch to the next, with its process noise.', from: 'Nothing. No process model is declared anywhere, and no epoch variables exist.', state: 'ABSENT' },
  { id: 'CONSTRAINT', title: 'Constraint', what: 'A law or identity relating variables, at its declared hardness: definitional hard, real-world stiff-soft, measured or regulatory soft.', from: 'The constraint contract in ./constraints. No constraint is declared, so no constraint factor exists.', state: 'ABSENT' },
  { id: 'RESTRICTION', title: 'Restriction and prolongation', what: 'Factors between adjacent levels of the cell hierarchy, so a regional aggregate and its members are related inside the inference rather than beside it.', from: 'The cell nesting in ./spatialKey gives the levels. Nothing carries a signal on them, so there is nothing to restrict.', state: 'ABSENT' },
];

/* ── Why it suits this corpus specifically ── */

export const DISAGREEMENT_IS_REPRESENTABLE = {
  claim: 'Two sources disagreeing about one quantity are two factors pulling one variable. The posterior widens to reflect the conflict instead of hiding it.',
  contrast: 'A pipeline that resolves the disagreement by averaging reports a number no source asserted, with a confidence neither source earns. That is the failure this corpus exists to refuse.',
  here: 'The corpus already carries conflicting records with their own sources, evidence classes and both clocks, and the Earth Twin already reports two declared positions that cannot both be right. Nothing computes a joint over them, so the disagreement is visible and not yet quantified.',
  perSource: 'Per-source marginals are the shape of the answer: what each source alone implies, and what the tension between them costs in certainty.',
} as const;

export const MARGINALS_AND_VALUE = {
  free: 'Marginals fall out of solving, so the value of a prospective measurement is a query: insert the candidate factor virtually and measure the shift in the marginal of the decision variable.',
  alerting: 'A watchlist becomes a standing query over marginal changes. A factor arrival that moves a decision variable past a threshold is the alert, which makes alerting an event of the solved graph rather than a polling job.',
  boundary: 'This decides which measurement to buy, not which sensor to own. The firm buys measurements; it does not become an instrument operator.',
  here: 'The measurement economy already computes value of information over instrument profiles. It does it without a graph, over a declared milestone rather than over a marginal, and that is the honest state.',
} as const;

export const AS_OF_IS_ELIMINATION = {
  statement: 'Retain the factors; eliminate on demand. A belief is rebuilt from canonical state per query rather than stored as a result.',
  consequence: 'A solve is a computed projection of canonical state: cached, invalidated when the release moves, and never authoritative. It is the index-versus-corpus separation, restated for inference.',
  clocks: 'The factors in force are those knowable at the asked-for knowledge instant, and each factor’s own validity decides whether it applies at the asked-for valid instant. Both clocks survive the translation.',
} as const;

/* ── The two disciplines, written before the first solve ── */

/**
 * A posterior digest is only meaningful if the function that produced it is
 * pinned. Elimination orderings are heuristic; ordering changes floating-point
 * accumulation; two orderings give different answers that are both correct.
 * That is fine mathematically and fatal for a receipt.
 */
export const REPRODUCIBILITY = {
  hazard: 'Elimination orderings are heuristic, ordering changes the order of floating-point accumulation, and two orderings produce different-but-both-correct posteriors. Correct is not the same as reproducible, and a receipt needs the second.',
  discipline: [
    'The elimination ordering is a declared parameter, pinned and recorded, never left to the solver’s heuristic.',
    'The solver version is pinned and recorded beside it, the same way the notation kernel and the audit engine are pinned.',
    'The computation receipt carries the release, the factor set, the ordering and the version, and posterior digests are verified across replays before anything downstream trusts one.',
  ],
  atThisScale: 'At fixture scale the sequential form is exactly reproducible by construction and more receipt-transparent than a batch solver. A batch solver earns its complexity only where the problem is genuinely large and multiscale.',
} as const;

/**
 * The boundary that would be quietest to cross and worst to have crossed. A
 * solver estimates continuous quantities. Identity is discrete, combinatorial,
 * and adjudicated with stored reasons.
 */
export const SOLVER_NEVER_DECIDES = {
  rule: 'A solver informs the corpus; the corpus never delegates authority to the solver.',
  why: 'Estimation is over continuous variables — geometry, quantities, calibration, drift. Whether two identifiers name one carrier is none of those: it is a decision, made by a person, with its evidence retained and reversible.',
  whatIsAllowed: 'A tight marginal between two candidate identities is exactly the kind of scored evidence the resolution layer should consume, alongside the geometric verdict the cell key already produces.',
  whatIsNot: 'A solver output becoming a resolution, a merge, or an admitted fact. It is the same invariant that keeps an audit computation from becoming a corpus fact, now standing next to a numerical engine.',
} as const;

/* ── Adopting a solver ── */

export const SOLVER_ADOPTION = {
  candidate: 'GTSAM',
  status: 'CANDIDATE' as const,
  role: 'A solver for the factor layer, not a new architecture and not a second vocabulary for corpus concepts.',
  waitsFor: 'Real volume and a genuinely multiscale problem: cross-source trajectory fusion, regional rollups at scale, as-of reconstruction over thousands of variables. At fixture scale it would add a dependency and subtract receipt transparency.',
  precondition: 'The representation first. Factors as typed, provenance-bearing objects with both clocks and a noise model are valuable before any solver exists, because they are the schema the estimator, the complex and the measurement economy all want to write into.',
} as const;

export const FACTOR_SEQUENCE: readonly string[] = [
  'The representation before the solver: factors as first-class objects carrying source, release, method, both clocks and a noise model. This is the piece that is useful immediately and expensive to retrofit.',
  'Prior and between factors first, because the corpus already carries what they are made of: values with stated uncertainty, and authored evidence-bearing relations.',
  'Constraint factors next, from the declared constraint stack, at their declared hardness.',
  'Motion factors when a process model is declared, which requires epoch variables that do not exist.',
  'Restriction and prolongation last, when a signal is carried on the cell hierarchy at all.',
  'A batch solver only when a problem is large and multiscale enough to need one, under a pinned ordering and a pinned version.',
];

/* ── What the corpus would contribute today ── */

export interface FactorStanding {
  /** Distinct subject-and-predicate pairs: the variables a graph would be over. */
  variables: number;
  /** Records with stated uncertainty bounds: unary factors with a noise model. */
  priorFactors: number;
  /** Authored evidence-bearing relations: between factors. */
  betweenFactors: number;
  constraintFactors: number;
  motionFactors: number;
  solves: number;
  statement: string;
}

/** Pure: what exists to build a graph from, and the fact that none is built. */
export function factorStanding(corpus: Corpus): FactorStanding {
  const variables = new Set(corpus.records.map((r) => `${r.subjectCanonicalId}|${r.predicate}`)).size;
  const priorFactors = corpus.records.filter((r) => r.uncertainty && (typeof r.uncertainty.low === 'number' || typeof r.uncertainty.high === 'number')).length;
  const betweenFactors = corpus.records.filter((r) => r.predicate === IDENTITY_LINK_PREDICATE).length;
  return {
    variables,
    priorFactors,
    betweenFactors,
    constraintFactors: 0,
    motionFactors: 0,
    solves: 0,
    statement: `${variables} subject-and-predicate pairs would be the variables, with ${priorFactors} record${priorFactors === 1 ? '' : 's'} carrying bounds a noise model could be read from and ${betweenFactors} authored relation${betweenFactors === 1 ? '' : 's'} between them. No constraint factor, no motion factor and no solve exists, and at this size a batch solver would subtract receipt transparency rather than add capability.`,
  };
}
