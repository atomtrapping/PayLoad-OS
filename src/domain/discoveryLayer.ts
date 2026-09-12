/**
 * The computational discovery layer: information the corpus produces about
 * itself.
 *
 * Everything upstream of here acquires. A source is read, an observation is
 * recorded, an identity is resolved, evidence is retained, and a canonical
 * state is maintained. That machinery answers questions whose answers arrived
 * from outside.
 *
 * This layer answers questions whose answers did not. Once observations share
 * canonical identities, geography, timestamps and provenance, computing across
 * them yields claims no single source stated: that several nominally
 * independent manufacturers depend on one upstream producer; that a corridor
 * exists; that a facility's role is not what its registration says. That is new
 * information, manufactured from the corpus rather than acquired into it, and
 * it is the point at which owning the accumulated state stops being equivalent
 * to querying somebody else's API. A competitor can buy the same customs
 * dataset. They cannot buy the identity resolution, the corrections, the
 * spatial history, the derived features and the validation record that came
 * from operating one.
 *
 * THE DISTINCTION THIS LAYER EXISTS TO HOLD
 *
 * A graph algorithm discovering a likely dependency must never silently become
 * equivalent to a bill of lading establishing that dependency.
 *
 * Both are rows. Both have subjects, predicates, times and confidence. Served
 * side by side without a class, they read identically, and the second is
 * evidence while the first is arithmetic performed on evidence. So there are
 * four classes and they are never collapsed: a source observation, a
 * deterministic computed result, a model inference, and a prediction. Each
 * additional step is further from the world and closer to the machinery, and
 * the distance is what the class records.
 *
 * MINING COMES BACK THROUGH THE EVIDENCE ARCHITECTURE, NOT AROUND IT
 *
 * The tempting shape is a separate analytics store where derived numbers
 * accumulate beside the corpus and eventually leak into it. The shape here is
 * the opposite: a derived claim is a first-class record carrying what produced
 * it — inputs, method, parameters, model, code version, computation time,
 * confidence, validation — because a derived claim nobody can reproduce is a
 * rumour with a timestamp. `src/db/derivedObservation.ts` is where that stops
 * being a convention.
 *
 * FOUR KINDS OF QUESTION, IN INCREASING ORDER OF COMMITMENT
 *
 * Descriptive mining asks what structure already exists. Inferential mining
 * asks what is probably true but incompletely observed. Predictive mining asks
 * what happens next. Prescriptive mining asks what should be done — and that
 * last one crosses into the action layer, where an agent may propose and may
 * not authorize.
 *
 * THE CORPUS DIRECTING ITS OWN ACQUISITION
 *
 * The recursive step is the valuable one. Mining identifies structure;
 * structure identifies dependency; dependency identifies which unobserved facts
 * would most reduce uncertainty. Acquisition then has a ranked target list
 * derived from the corpus rather than from a guess about what might be useful.
 * That is the difference between strategic acquisition and indiscriminate
 * scraping, and it is why the acquisition shortlist in
 * `src/domain/industrialCorpus.ts` is a starting condition rather than a plan.
 *
 * WHAT IS TRUE TODAY
 *
 * Nothing has been mined, because nothing has been admitted. This layer needs a
 * corpus to compute across and there is not one: admitted records are zero. So
 * `discoveryStanding()` derives its zeros from an empty table rather than
 * printing them, and moves the moment a derivation exists.
 */

/* ── Seven claim classes, each with exactly one origin ── */

/**
 * Where a claim can come from. Every class below has exactly one, and the
 * origin is what decides who may produce it.
 */
export const CLAIM_ORIGINS = ['ACQUISITION', 'COMPUTATION', 'AUTHORIZATION', 'EXECUTION'] as const;
export type ClaimOrigin = typeof CLAIM_ORIGINS[number];

export const CLAIM_CLASSES = [
  'SOURCE_OBSERVATION',
  'COMPUTED_RESULT',
  'MODEL_INFERENCE',
  'PREDICTION',
  'RECOMMENDATION',
  'DECISION',
  'EXECUTION_RESULT',
] as const;
export type ClaimClass = typeof CLAIM_CLASSES[number];

/** Retained for readers of the earlier vocabulary; the four epistemic classes. */
export const DERIVATION_CLASSES = CLAIM_CLASSES;
export type DerivationClass = ClaimClass;

export interface ClassContract {
  class: ClaimClass;
  origin: ClaimOrigin;
  /** What a row of this class is. */
  is: string;
  /** What produced it. */
  producedBy: string;
  /** The confusion that presenting it as another class would produce. */
  forbids: string;
  /** Whether a number expressing uncertainty is meaningful for it. */
  carriesConfidence: boolean;
  /** Whether it makes a claim about a time later than the evidence it read. */
  aboutTheFuture: boolean;
}

export const CLASS_CONTRACTS: readonly ClassContract[] = [
  {
    class: 'SOURCE_OBSERVATION',
    origin: 'ACQUISITION',
    is: 'A record of what a source stated, retained with the evidence that it stated it.',
    producedBy: 'Acquisition. A document was read, a feed was captured, a filing was published.',
    forbids: 'Nothing above it. This is the floor, and the only class the corpus did not compute.',
    carriesConfidence: false,
    aboutTheFuture: false,
  },
  {
    class: 'COMPUTED_RESULT',
    origin: 'COMPUTATION',
    is: 'A deterministic function of retained records. Same inputs, same code, same answer.',
    producedBy: 'Arithmetic, aggregation, joins, spatial predicates, graph traversal.',
    forbids: 'A bill of lading establishes a dependency; a join that surfaces one computes it. Presenting the second as the first is the failure this layer exists to prevent.',
    carriesConfidence: false,
    aboutTheFuture: false,
  },
  {
    class: 'MODEL_INFERENCE',
    origin: 'COMPUTATION',
    is: 'A claim about something incompletely observed, produced by a fitted model.',
    producedBy: 'Estimation, classification, link prediction, resolution under uncertainty.',
    forbids: 'A deterministic result is reproducible from the inputs alone. An inference also depends on a model, its parameters and its training set, and calling it a computed result hides all three.',
    carriesConfidence: true,
    aboutTheFuture: false,
  },
  {
    class: 'PREDICTION',
    origin: 'COMPUTATION',
    is: 'A claim about a state later than every input it read.',
    producedBy: 'Forecasting, state-space projection, simulation.',
    forbids: 'An inference is about a time the evidence covers. A prediction is about a time nothing has observed yet, and reporting one as the other converts an untested claim into an established one.',
    carriesConfidence: true,
    aboutTheFuture: true,
  },
  {
    class: 'RECOMMENDATION',
    origin: 'COMPUTATION',
    is: 'A proposed action, with the loss it was chosen to minimise stated.',
    producedBy: 'Prescriptive workloads: selection, routing, positioning, timing.',
    forbids: 'A recommendation is a proposal. A decision is somebody accepting it, and the gap between them is where the authority lives.',
    carriesConfidence: true,
    aboutTheFuture: true,
  },
  {
    class: 'DECISION',
    origin: 'AUTHORIZATION',
    is: 'A recommendation accepted, by a principal with the standing to accept it.',
    producedBy: 'The action layer. A human or a policy, never an agent and never a computation.',
    forbids: 'Computing a recommendation is not deciding on it. A system that recorded its own recommendations as decisions would have authorized itself.',
    carriesConfidence: false,
    aboutTheFuture: false,
  },
  {
    class: 'EXECUTION_RESULT',
    origin: 'EXECUTION',
    is: 'What a counterparty did or did not do when the decision was dispatched.',
    producedBy: 'An execution attempt, and the receipt or silence that came back.',
    forbids: 'A decision is an intention. An execution result is an outcome, and it can be CONFIRMED, REJECTED or unknown — a dispatch is not completion.',
    carriesConfidence: false,
    aboutTheFuture: false,
  },
];

export function classContract(cls: ClaimClass): ClassContract {
  const found = CLASS_CONTRACTS.find((entry) => entry.class === cls);
  if (!found) throw new Error(`DISCOVERY_UNKNOWN_CLASS:${cls}`);
  return found;
}

/** The classes a computational workload may produce. */
export const DERIVABLE_CLASSES: readonly ClaimClass[] =
  CLASS_CONTRACTS.filter((entry) => entry.origin === 'COMPUTATION').map((entry) => entry.class);

/** The classes for which a confidence and a fitted model are meaningful. */
export const FITTED_CLASSES: readonly ClaimClass[] =
  CLASS_CONTRACTS.filter((entry) => entry.carriesConfidence).map((entry) => entry.class);

export function originOf(cls: ClaimClass): ClaimOrigin {
  return classContract(cls).origin;
}

/**
 * Stated once, because it is the whole argument.
 *
 * Computation may produce a result, an inference, a prediction or a
 * recommendation. It may not produce a source observation — only acquisition
 * does that — and it may not produce a decision or an execution result, which
 * belong to the action layer. The mining engine's reach ends at a proposal in
 * both directions: it cannot manufacture evidence behind it, and it cannot
 * manufacture authority ahead of it.
 */
export const DERIVATION_RULE =
  'Computation may produce a result, an inference, a prediction or a recommendation. It may not produce a source observation: only acquisition does that, and a derived claim never becomes evidence that a source stated it. It may not produce a decision or an execution result either: those belong to the action layer, and computing a recommendation is not deciding on it.';

/* ── Four kinds of question ── */

export const MINING_KINDS = ['DESCRIPTIVE', 'INFERENTIAL', 'PREDICTIVE', 'PRESCRIPTIVE'] as const;
export type MiningKind = typeof MINING_KINDS[number];

export interface MiningContract {
  kind: MiningKind;
  question: string;
  /** What the corpus is asked to yield. */
  yields: readonly string[];
  /** The class a result of this kind carries. */
  produces: DerivationClass;
  /** Whether acting on it requires an authorization from the action layer. */
  crossesIntoAction: boolean;
}

export const MINING_CONTRACTS: readonly MiningContract[] = [
  {
    kind: 'DESCRIPTIVE',
    question: 'What structure already exists?',
    yields: ['clusters', 'corridors', 'supplier communities', 'material flows', 'geographic concentration', 'co-occurrence', 'temporal patterns'],
    produces: 'COMPUTED_RESULT',
    crossesIntoAction: false,
  },
  {
    kind: 'INFERENTIAL',
    question: 'What is probably true but incompletely observed?',
    yields: ['likely supplier relationships', 'facility roles', 'unrecorded ownership', 'probable routes', 'capacity estimates', 'material classification'],
    produces: 'MODEL_INFERENCE',
    crossesIntoAction: false,
  },
  {
    kind: 'PREDICTIVE',
    question: 'What happens next?',
    yields: ['price movement', 'congestion', 'supplier interruption', 'lead times', 'demand', 'facility activity', 'commodity movement'],
    produces: 'PREDICTION',
    crossesIntoAction: false,
  },
  {
    kind: 'PRESCRIPTIVE',
    question: 'What should be done?',
    yields: ['supplier selection', 'routing', 'inventory positioning', 'substitution', 'procurement timing', 'measurement acquisition'],
    produces: 'RECOMMENDATION',
    crossesIntoAction: true,
  },
];

/**
 * The one kind that leaves this layer.
 *
 * A prescriptive result is a proposal and nothing more. It enters the action
 * layer at `propose`, where an agent is permitted, and stops at `authorize`,
 * where it is not. A recommendation that executed itself would be the
 * proposal/authorization arrow skipped.
 */
export const PRESCRIPTIVE_BOUNDARY =
  'A prescriptive result is a proposal. It enters the action layer at propose and stops at authorize, which no computation and no agent may perform.';

/* ── The record a derivation leaves ── */

/**
 * What must be retained for a derived claim to be worth anything.
 *
 * Each field answers a question someone will ask when the claim turns out to be
 * wrong, and a derivation missing any of them cannot be re-examined — only
 * believed or discarded.
 */
export interface InferenceContract {
  field: string;
  answers: string;
  requiredFor: readonly ClaimClass[];
}

const DERIVED: readonly ClaimClass[] = DERIVABLE_CLASSES;

export const INFERENCE_CONTRACT: readonly InferenceContract[] = [
  { field: 'claim', answers: 'What is being asserted, in the corpus vocabulary rather than the model output vocabulary.', requiredFor: DERIVED },
  { field: 'inputs', answers: 'Which retained records it read. A derivation with no inputs read nothing and asserts nothing.', requiredFor: DERIVED },
  { field: 'method', answers: 'What was computed. Named, not described.', requiredFor: DERIVED },
  { field: 'parameters', answers: 'Under what settings. The same method at different thresholds is a different derivation.', requiredFor: DERIVED },
  { field: 'codeVersion', answers: 'Which implementation. A result nobody can re-run is not reproducible, whatever it says about itself.', requiredFor: DERIVED },
  { field: 'computedAt', answers: 'When the corpus produced it, which bounds what it could possibly have read.', requiredFor: DERIVED },
  { field: 'model', answers: 'Which fitted artefact produced it, and on what it was fitted.', requiredFor: FITTED_CLASSES },
  { field: 'confidence', answers: 'How uncertain. Meaningless for a deterministic result and required for anything fitted.', requiredFor: FITTED_CLASSES },
  { field: 'horizon', answers: 'How far past the evidence the claim reaches. A claim about a time nothing has observed needs one.', requiredFor: CLASS_CONTRACTS.filter((entry) => entry.aboutTheFuture).map((entry) => entry.class) },
  { field: 'reproducibility', answers: 'Whether it re-runs. Graded by the computation card rather than restated here, because this repository already has one answer to that question.', requiredFor: DERIVED },
  { field: 'rightsFloor', answers: 'What may be done with it, which is never more than what may be done with its most restricted input.', requiredFor: DERIVED },
  { field: 'validation', answers: 'Whether it was checked against anything, and against what. Unvalidated is a state, not an absence.', requiredFor: DERIVED },
];

export const VALIDATION_STATES = ['NOT_VALIDATED', 'HELD_OUT', 'BACKTESTED', 'OUTCOME_OBSERVED', 'FALSIFIED'] as const;
export type ValidationState = typeof VALIDATION_STATES[number];

/**
 * The states a validation record can leave an artifact in. Unvalidated is
 * the absence of a record, never an outcome one carries.
 */
export type ValidationOutcome = Exclude<ValidationState, 'NOT_VALIDATED'>;
export const VALIDATION_OUTCOMES: readonly ValidationOutcome[] =
  VALIDATION_STATES.filter((state): state is ValidationOutcome => state !== 'NOT_VALIDATED');

/**
 * `NOT_VALIDATED` is the honest default and the common case. It is a recorded
 * state rather than a missing field, for the same reason an unknown dispatch
 * outcome is: a claim whose validation is silent is not a claim that passed.
 */
export const VALIDATION_RULE =
  'NOT_VALIDATED is a state, not an absence. A derivation that has never been checked says so, and silence is never read as having passed.';

/**
 * And the state is dated. A refutation with no instant could be written
 * over an artifact that a coverage assessment had already read as present,
 * and the assessment would be wrong with nothing to say when it became so.
 * So the validation record is the dated fact, written once; the artifact
 * carries the outcome and instant of its latest record; an assessment reads
 * the record standing at its own instant; and a record dated at or before an
 * assessment that did not know it is refused where it would change what
 * that assessment earned — the same treatment a backdated retraction gets.
 */
export const VALIDATION_INSTANT_RULE =
  'A validation is dated. An artifact carries the outcome and the instant of its latest validation record; an assessment reads the record standing at its own instant; and a record dated at or before an assessment that did not know it is refused where it would change what that assessment earned, the same way a retraction is.';

/* ── Which substrate answers which question ── */

export interface SubstrateWorkload {
  substrate: string;
  workload: string;
  /** Whether this repository holds it today. */
  present: boolean;
}

export const SUBSTRATE_WORKLOADS: readonly SubstrateWorkload[] = [
  { substrate: 'PostgreSQL', workload: 'relational and statistical patterns', present: true },
  { substrate: 'PostGIS', workload: 'spatial clustering, corridors, proximity, accessibility', present: false },
  { substrate: 'Graph projection', workload: 'dependencies, communities, paths, centrality', present: false },
  { substrate: 'Lakehouse', workload: 'longitudinal and time-series analysis at volume', present: false },
  { substrate: 'Vector projection', workload: 'semantic similarity and latent retrieval', present: false },
  { substrate: 'Object store', workload: 'documents, images and source artefacts', present: false },
  { substrate: 'Canonical state', workload: 'authoritative entity and observation history', present: true },
];

/**
 * Not one undifferentiated database.
 *
 * Every one of these is a projection of the same canonical state, so a derived
 * claim names the records it read rather than the substrate it read them
 * through. The substrate is an implementation detail of the query; the inputs
 * are not.
 */
export const SUBSTRATE_RULE =
  'Every substrate is a projection of one canonical state. A derivation records the records it read, never the substrate it read them through.';

/* ── The recursive step ── */

export const ACQUISITION_LOOP: readonly string[] = [
  'Acquire',
  'Corpus',
  'Mine',
  'Discover structure',
  'Identify uncertainty',
  'Acquire strategically',
];

export const FLYWHEEL: readonly string[] = [
  'external evidence',
  'proprietary corpus',
  'internal computation',
  'derived intelligence',
  'better decisions',
  'operational observations',
  'better corpus',
  'better models',
];

/**
 * Where this layer sits. Between the representations and the products, not
 * beside them: a derived claim that reached a customer without passing through
 * the evidence architecture arrived by a path that cannot be audited.
 */
export const LAYER_POSITION: readonly string[] = [
  'Evidence',
  'Canonical state',
  'Representations',
  'Computational discovery',
  'Derived knowledge',
  'Products and decisions',
];

/**
 * What accumulates that a competitor cannot buy. Stated as the specific
 * artefacts rather than as a claim about moats, because each one is a thing
 * this repository either holds or does not.
 */
export const INFORMATION_CAPITAL: readonly string[] = [
  'accumulated identity resolution',
  'corrections',
  'relationships',
  'spatial history',
  'derived features',
  'operational feedback',
  'validation history',
];

/* ── Standing ── */

export interface Derivation {
  derivationId: string;
  class: ClaimClass;
  kind: MiningKind;
  inputs: readonly string[];
  validation: ValidationState;
}

/** No derivation exists, because no corpus exists to compute across. */
export const DERIVATIONS: readonly Derivation[] = [];

export const DISCOVERY_BLOCKED_ON: readonly string[] = [
  'No connector has been lit, so no source observation has been acquired.',
  'Admitted records are zero, so there is nothing to compute across.',
  'A derivation names the records it read, and there are none to name.',
];

/**
 * The zeros are counted from the table rather than written down.
 *
 * A written zero would be true today and would go on printing after the first
 * derivation existed. This takes its input so the tests can pass a synthetic
 * derivation and require the counts to move.
 */
export function discoveryStanding(derivations: readonly Derivation[] = DERIVATIONS) {
  const byClass = Object.fromEntries(
    CLAIM_CLASSES.map((cls) => [cls, derivations.filter((entry) => entry.class === cls).length]),
  ) as Record<ClaimClass, number>;
  const validated = derivations.filter((entry) => entry.validation !== 'NOT_VALIDATED').length;
  return {
    derivations: derivations.length,
    byClass,
    validated,
    /* A derivation that read nothing computed nothing. */
    withoutInputs: derivations.filter((entry) => entry.inputs.length === 0).length,
    substratesPresent: SUBSTRATE_WORKLOADS.filter((entry) => entry.present).length,
    substratesAbsent: SUBSTRATE_WORKLOADS.filter((entry) => !entry.present).length,
    canMine: derivations.length > 0,
    blockedOn: derivations.length > 0 ? [] : [...DISCOVERY_BLOCKED_ON],
    coverage: derivations.length === 0 ? 'CONTRACT_ONLY_NOTHING_DERIVED' : 'DERIVATIONS_PRESENT',
  } as const;
}

/* ── The workload contract ── */

/**
 * A computation, its run, and what came out — three identities, for the same
 * reason the action layer keeps the operation, the attempt and the
 * verification apart. A workload is a definition; a run is one execution of
 * it; an artifact is what that execution produced. Collapsing them makes a
 * re-run indistinguishable from a second result.
 *
 * `WorkloadSpec.implementation` and `WorkloadRun` fingerprints deliberately
 * reuse `src/domain/computationCard.ts` rather than restating reproducibility
 * here. That module already answers "does this re-run in 2060, on a machine
 * that does not exist yet, to the same bytes" and grades the answer
 * CARD_GRADE, REPLAYABLE_HERE or LOG_ONLY. Two vocabularies for one question
 * would be one too many, so the card grades the reproducibility and this layer
 * grades the epistemic class. They are orthogonal on purpose: a perfectly
 * reproducible computation of a wrong model is CARD_GRADE and still only a
 * MODEL_INFERENCE.
 */
export const WORKLOAD_IDENTITIES = ['WorkloadSpec', 'WorkloadRun', 'DerivedArtifact'] as const;
export type WorkloadIdentity = typeof WORKLOAD_IDENTITIES[number];

export interface IdentityContract {
  identity: WorkloadIdentity;
  is: string;
  /** What collapsing it into another would produce. */
  collapsing: string;
}

export const WORKLOAD_IDENTITY_CONTRACTS: readonly IdentityContract[] = [
  {
    identity: 'WorkloadSpec',
    is: 'What would be computed: the input selector, the method, the parameters, the implementation and the output schema.',
    collapsing: 'Collapsed into the run, a change of parameters becomes indistinguishable from a re-run of the same computation.',
  },
  {
    identity: 'WorkloadRun',
    is: 'One execution of a spec, with its input fingerprint, its output fingerprint, its duration and its failure identity if it has one.',
    collapsing: 'Collapsed into the artifact, a failed run becomes a missing result rather than a recorded failure — and a retry becomes a second result.',
  },
  {
    identity: 'DerivedArtifact',
    is: 'What one run produced: the claim, its class, its uncertainty, its lineage and its validation state.',
    collapsing: 'Collapsed into the run, an artifact that was later falsified cannot be marked without rewriting the history of the execution that made it.',
  },
];

/**
 * The rule the run/artifact split exists for, stated plainly because it is
 * easy to violate by accident and expensive to violate at scale.
 */
export const EXECUTION_IS_NOT_VALIDITY =
  'A run that exited zero produced a result. It did not produce a validated one. Execution success and analytical validity are different findings and are recorded separately.';

/* ── Validation ── */

export interface ValidationContract {
  field: string;
  answers: string;
}

export const VALIDATION_RECORD: readonly ValidationContract[] = [
  { field: 'method', answers: 'How it was checked.' },
  { field: 'target', answers: 'Which artifact was checked.' },
  { field: 'metric', answers: 'What was measured.' },
  { field: 'baseline', answers: 'Against what. A metric with no baseline is a number, not a finding.' },
  { field: 'result', answers: 'What the metric came out at.' },
  { field: 'threshold', answers: 'What would have counted as passing, declared before the result rather than after it.' },
  { field: 'evidence', answers: 'Which held-out records, independent sources or historical observations it was checked against.' },
  { field: 'validatedAt', answers: 'When, which bounds what could have been held out — and from which instant the artifact holds the outcome.' },
  { field: 'outcome', answers: 'The state the artifact holds from that instant: HELD_OUT, BACKTESTED or OUTCOME_OBSERVED when it passed, FALSIFIED when it did not.' },
];

/* ── Rights ── */

/**
 * Derived data inherits the restrictions of its inputs.
 *
 * The failure this closes is a real one and it is quiet: a source that may not
 * be redistributed is aggregated into a statistic, and the statistic is
 * redistributed because nobody wrote down that it descended from that source.
 * Computation is not a laundering step for rights any more than it is one for
 * evidence, so a derived artifact's permitted operations are the intersection
 * of its inputs' — the most restrictive floor, never the union and never the
 * artifact's own declaration.
 */
export const RIGHTS_INHERITANCE_RULE =
  'A derived artifact may be used only in ways every one of its inputs may be used. Rights are inherited as an intersection, computed from the inputs rather than declared on the artifact, and a computation never widens them.';

/**
 * The floor, as a function. Intersecting rather than unioning is the whole
 * point: one restricted input restricts the result.
 */
export function inheritedRights(
  inputRights: ReadonlyArray<readonly string[]>,
): readonly string[] {
  if (inputRights.length === 0) return [];
  const [first, ...rest] = inputRights;
  return first.filter((operation) => rest.every((other) => other.includes(operation)));
}

/* ── The gap loop ── */

/**
 * Mining that notices what it cannot see produces an acquisition proposal, and
 * a proposal is where it stops. The engine does not reach a source: it ranks
 * what would most reduce uncertainty, and the existing acquisition fabric —
 * with its policy gate, its rights checks and its admission boundary — does the
 * rest, or refuses to.
 */
export const GAP_LOOP: readonly string[] = [
  'GapDetection',
  'AcquisitionProposal',
  'Policy and authorization',
  'Acquisition fabric',
  'Evidence admission',
  'Corpus',
];

export const GAP_LOOP_RULE =
  'A gap detection may produce an acquisition proposal and nothing else. The mining engine never reaches a source directly: the proposal enters the existing acquisition fabric at its policy gate, and evidence returns through the one admission boundary.';
