/**
 * The punch card, not the proof.
 *
 * A verifiable-computation stack is usually reached for as a credibility
 * substitute: believe the number because a proof attests it. That is not what
 * is wanted here, and saying so precisely matters, because the two readings
 * lead to different systems.
 *
 * What is wanted is the Hollerith function. The punch card was never a proof
 * system. It was a standardised artifact that made a record machine-processable,
 * sortable, auditable and archival across decades, and its power was format
 * discipline rather than cryptography. The equivalent here is a computation
 * that can be held in the hand: the exact transition, frozen as an artifact,
 * re-examinable by anyone, on any machine, later.
 *
 * The distinction is not stylistic. Credibility in this system lives where it
 * has always lived — in the estate, in the human rulings, and in the two clocks
 * — and no cryptography moves it. The carrier's only job is to carry that
 * across time. Full knowledge, not zero knowledge; persistence, not trust
 * substitution; no new trust assumption of any kind.
 *
 * So general proving of corpus computation is refused here, with reasons, and
 * what is kept is the artifact discipline: one record shape for every retained
 * computation, deterministic under serialisation, readable from its own
 * specification after the runtime that made it is gone.
 */

/* ── The two readings ── */

export const NOT_CREDIBILITY = {
  proofReading: 'Trust the computation because a proof attests it: the proof is the product, it substitutes for trust in the operator, and it brings a verifier, a circuit and a toolchain to be trusted instead.',
  carrierReading: 'Preserve the computation because it is reified: the carrier is the product, it records what the operator did, and it introduces no trust assumption at all.',
  chosen: 'CARRIER' as const,
  whereCredibilityLives: 'In the estate, in the human rulings and in the two clocks. No cryptography moves it, and a system that implies otherwise has misdescribed its own foundation.',
  soThen: 'The card’s job is to carry the record across decades, not to make it believable. Believability was never the carrier’s to supply.',
} as const;

/* ── What a card is ── */

export interface CardProperty {
  id: 'DETERMINISM' | 'ARCHIVABILITY' | 'UNIFORMITY' | 'AUDIT_WITHOUT_RERUN';
  title: string;
  what: string;
  /** Where this repository already has it, or does not. */
  here: string;
  present: boolean;
}

export const CARD_PROPERTIES: readonly CardProperty[] = [
  {
    id: 'DETERMINISM',
    title: 'Determinism under serialisation',
    what: 'The computation’s identity is its digest: run it anywhere, get the same bytes. Without this the artifact names nothing.',
    here: 'Digests, captures, manifests and the production demonstration are regenerated under test and compared byte for byte, which is the second verification tier and it is reached.',
    present: true,
  },
  {
    id: 'ARCHIVABILITY',
    title: 'Archivability past the runtime',
    what: 'The artifact outlives the machine that produced it. A card is its own machine; an artifact is readable from its specification alone.',
    here: 'Receipts are retained beside their inputs under operator-selected roots, and the pinned engine and its digests are recorded. Nothing states a decoding specification independent of this repository, so readability today rests on this code existing.',
    present: false,
  },
  {
    id: 'UNIFORMITY',
    title: 'One shape for every computation',
    what: 'The eighty-column format: every retained computation speaks one grammar, so sorting, chaining, diffing and replaying are uniform operations over the history rather than bespoke per instrument.',
    here: 'Each instrument retains its own run shape — audit receipt, production run, result manifest, registration and clearance runs — and they are not one format. This is the property most clearly missing.',
    present: false,
  },
  {
    id: 'AUDIT_WITHOUT_RERUN',
    title: 'Auditable without re-execution',
    what: 'The reader does not need the cluster. They need the artifact and the specification.',
    here: 'A retained run carries its inputs by exact reference and its outputs by digest, so a reader can check the binding without running anything. Re-deriving still needs the pinned runtime.',
    present: true,
  },
];

/* ── The test that decides what may be carried ── */

export type ArchivalGrade = 'PASSES' | 'DEGRADES' | 'FAILS';

export const ARCHIVAL_TEST = {
  question: 'Is this artifact readable in thirty years with only its specification?',
  why: 'It is the punch-card test, and it sorts computation classes more usefully than any judgement about their importance.',
  grades: [
    { subject: 'Fixed-point arithmetic over a frozen, minimal instruction set', grade: 'PASSES' as ArchivalGrade, because: 'The semantics are exhaustively specified and reimplementable from the specification, so the artifact does not depend on the original machine.' },
    { subject: 'Floating-point computation', grade: 'DEGRADES' as ArchivalGrade, because: 'The result depends on order of accumulation, library version and platform, so an artifact that does not pin all three names a number nobody can reproduce. This is the same disease as an unpinned elimination ordering.' },
    { subject: 'Learned-model inference', grade: 'FAILS' as ArchivalGrade, because: 'Weights are not the execution. Reproducing an inference needs the whole stack — runtime, kernels, precision, hardware behaviour — and nobody pins it, so the artifact records an output whose derivation is unrecoverable.' },
  ],
} as const;

/**
 * The waterline, for computations rather than for records: what earns a card,
 * and what is rebuilt instead.
 */
export const WHAT_GETS_A_CARD = {
  rule: 'Punch-card-grade artifacts for the reasoning paths that feed a ruling. Rebuild-from-source for everything else.',
  cards: 'A computation whose output a person relied on when ruling: the audit that supported a finding, the evaluation behind a decision, the transition that changed an admitted state.',
  rebuilt: 'Projections, indexes, previews, aggregates and learned layers. They are derived views, versioned with the release and rebuildable from it, and carrying them as artifacts would preserve the wrong thing at the wrong cost.',
  why: 'It is the same waterline the records already have. What was relied upon is kept; what can be recomputed is recomputed.',
} as const;

/* ── What is refused ── */

export const GENERAL_PROVING = {
  state: 'REFUSED' as const,
  what: 'Proving corpus computations in general with a zero-knowledge system.',
  reasons: [
    'It costs real compute to prove, and the cost scales with the state — a standing line item bought against a benefit this system does not need.',
    'It imports a new trust surface: circuit correctness, toolchain versions, setup assumptions. That is one more frame for the reference channel to guard, in a system whose entire residual risk is already frame validity.',
    'It answers a question this audience is not asking. The reader here is a professional performing due diligence, and for them re-derivation is stronger than verification: they can recompute from retained inputs rather than trust that a proof means what it claims.',
  ],
  insteadKept: 'A bounded, backend-neutral binding for one exact transition, where a specific computation is reified rather than a general claim proven — the card, at the transition level, per computation class, and optional.',
} as const;

/* ── What exists ── */

export interface CarrierStanding {
  propertiesPresent: number;
  propertiesTotal: number;
  /** Distinct retained-run shapes, which is the number that should be one. */
  runShapes: number;
  statement: string;
}

/** Pure: the properties held and the one number that says the format is not yet a format. This asks about the repository, not about a corpus, so it takes none. */
export function carrierStanding(): CarrierStanding {
  const present = CARD_PROPERTIES.filter((p) => p.present).length;
  const runShapes = 5;
  return {
    propertiesPresent: present,
    propertiesTotal: CARD_PROPERTIES.length,
    runShapes,
    statement: `${present} of ${CARD_PROPERTIES.length} card properties hold: computations are deterministic under serialisation and auditable without re-execution. The two that do not are the two that make a card a card — ${runShapes} retained run shapes rather than one format, and no decoding specification that outlives this repository.`,
  };
}

/* ── The card as a geometry ── */

/**
 * A frozen computation is a shape in state space, and the world it claims to
 * track is another. Whether the two line up is checkable, and this repository
 * already checks it in three places without calling it one thing:
 *
 *   the innovation gate, for dynamics — does the world evolve the way the
 *   computation propagated it;
 *   the reference channel, for frames — does the model correspond to anything
 *   outside itself;
 *   the disagreement layer, for sources — do two accounts of one thing line up.
 *
 * Naming them as instances of one idea is the whole of the addition. No new
 * mechanism follows from it.
 */
export const CONGRUENCE = {
  claim: 'A retained computation traces a higher-order geometry — a transformation of belief — over the lower-order geometry of the thing it tracks. Faithfulness is the two being related by exactly the transformation the computation declared, and a failure of that relation is a detectable class of error rather than a vague doubt.',
  alreadyHere: [
    { instance: 'The innovation gate', checks: 'Dynamics: whether arriving observations fall where the propagated belief said they would.' },
    { instance: 'The reference channel', checks: 'Frames: whether the declared model corresponds to something measured outside it.' },
    { instance: 'The disagreement layer', checks: 'Sources: whether two accounts of one event or one place can both be right.' },
  ],
  unification: 'Three mechanisms, one idea. Naming it is worth doing because it stops them being maintained as three unrelated instincts.',
} as const;

/**
 * The asymmetry is the payoff, and it is the argument for freezing a manifest
 * at the ruling boundary specifically.
 */
export const FROZEN_SIDE = {
  asymmetry: 'The world arrives with noise, gaps and, sometimes, an adversary, and it cannot be replayed. A deterministic trace is bit-exact and can be replayed forever. So one side of the comparison never jitters.',
  payoff: 'A divergence between fresh evidence and a frozen computation isolates three ways rather than one: the world changed, which is an event; the input changed, which is a source problem; or nothing legitimate changed, which is a tamper signal. Three-way isolation, because one side is fixed.',
  therefore: 'Adjudicated facts are the ones that earn a frozen computational geometry, so that every later observation measures against a reference that cannot be renegotiated.',
  butStill: 'The frozen trace testifies. It never decides, and a congruence failure enters the disagreement layer as a candidate rather than as a finding.',
} as const;

export const CONGRUENCE_GUARDS = [
  { guard: 'Declared, then measured', detail: 'A manifest states which lower-order geometry it claims to track — which variables, which epoch, which frames. A computation that declares nothing cannot fail congruence silently, because it never claimed anything; the declaration is the contract that makes the check possible.' },
  { guard: 'Mismatches route, they do not adjudicate', detail: 'A congruence failure is a candidate event. It may be the world, the frame or the source, and deciding which is a ruling — the same wall that keeps a solver from deciding an identity.' },
  { guard: 'Bidirectional in time', detail: 'Forward: does the world evolve congruently with what was propagated. Backward: does re-executing the frozen trace over retained inputs still land on the recorded result. Both are receipts, and together they pin the computation at both ends.' },
] as const;

/**
 * The limit that keeps the card from being mistaken for a warrant, and it is
 * the sharpest sentence in this module.
 */
export const MIRRORS_THE_MODEL = {
  limit: 'A manifest is a perfect mirror of the model, and therefore a perfect mirror of the model’s errors. Its exactness says the computation was faithful to its declared inputs and its declared model; it says nothing whatever about whether that model is faithful to the world.',
  danger: 'Exact execution of a wrong model looks more credible than sloppy execution of a right one, which is the fabrication pattern in its most seductive form.',
  therefore: 'Two congruences, two guardians. The frozen trace guards fidelity to the declaration; only an independent reference guards fidelity to the world, and it is absent here.',
} as const;

/* ── Interoperation with strong object systems ── */

/**
 * The deployed object world — scene graphs, building models, geodatabases,
 * enterprise graph platforms, solver ecosystems — shares one property: each is
 * an authoritative object model with local truth and no provenance discipline.
 * They know what things are; they cannot say how they know.
 *
 * A manifest-carrying computation is the missing half, and it attaches without
 * asking them to change: the host's own format carries the artifact, and the
 * provenance rides in a typed, namespaced extension the host is free to ignore.
 * A consumer that has the specification reconstructs the computation; one that
 * does not still opens the file. That is the punch-card property across systems
 * rather than across decades.
 */
export const INTEROPERATION = {
  pattern: 'Their authoritative objects carry our computation manifests, so their world ships with our receipts. No host adoption is required, because nothing asks the host to understand the extension.',
  soWhat: 'Their installed base becomes distribution rather than competition, and the integration lands on our contracts rather than exporting the estate.',
  state: 'ABSENT' as const,
  here: 'Nothing is exported to any host, no external object model is ingested, and no integration exists. One carrier is proven in principle by the scene target’s contract; that is a specification, not a shipment.',
} as const;

export interface InteropFamily {
  id: 'SCENE_AND_BUILDING' | 'GEOSPATIAL' | 'GRAPH_PLATFORM' | 'SOLVER';
  systems: string;
  through: string;
  /** What crosses the boundary, and in which direction. */
  mechanism: string;
}

export const INTEROP_FAMILIES: readonly InteropFamily[] = [
  { id: 'SCENE_AND_BUILDING', systems: 'Scene-graph hosts and building-model authoring tools', through: 'The carrier: the host’s native format, with belief, definitions and the execution trace in a namespaced extension.', mechanism: 'Outward. A stage or a model opens natively because it is their vocabulary; the receipts ride along and are reconstructable by anything holding the specification.' },
  { id: 'GEOSPATIAL', systems: 'Geodatabases, desktop and server GIS, open geospatial services and imagery catalogues', through: 'The spatial grammar: a cell key both sides can compute, containment predicates, and a position that carries its own frame and uncertainty.', mechanism: 'Inward. An authority’s parcel layer is an external authoritative model, ingested as observations through a typed measurement model with its own declared fidelity — evidence about parcels, joined by identity, never an overwrite.' },
  { id: 'GRAPH_PLATFORM', systems: 'Enterprise ontology and graph platforms', through: 'The record contract as a feed: typed subjects, evidence-bearing links, validity bounds and a separate knowledge time.', mechanism: 'Outward. They already consume assertions with time bounds, so a release imports as their native objects with the receipts intact. This is the governed layer they lack rather than a platform competing with them.' },
  { id: 'SOLVER', systems: 'Finite-element, energy, fabrication and robotics backends', through: 'The projection-and-return boundary: a backend receives a projection and returns a result through the ordinary transformation and verification path.', mechanism: 'Both ways, and gated. A solver is a compute provider whose output re-enters as a candidate observation with its declared model, never as a fact.' },
];

/**
 * The inversion that makes interoperation safe. Treating an external object
 * model as truth is how a data firm quietly loses its own epistemics: the
 * county layer overwrites the parcel belief, the building model defines the
 * as-built, and the corpus becomes a cache of other people's assertions.
 */
export const AUTHORITY_DIRECTION = {
  wrongWay: 'Import their truth. The external model overwrites the belief, and the corpus becomes a cache of other systems’ assertions with the provenance stripped at the boundary.',
  rightWay: 'Import their geometry and keep the ledger of how well it tracks. Their objects are a shape this system measures against its own belief; the divergence is a congruence residual.',
  residualIs: 'A candidate event, a signal about that source’s reliability, or an entry in the disagreement layer. Never a silent overwrite, and never an adjudication performed by the import.',
  therefore: 'The congruence contract is what lets this interoperate with arbitrarily strong object systems without absorbing their epistemics.',
} as const;

export const INTEROP_GUARDS = [
  { guard: 'An export is a projection, never a carrier of authority', detail: 'A scene a customer takes away is a view of adjudicated state, bound to a release and a digest. It is not a second corpus, and nothing it is edited into comes back as a fact.' },
  { guard: 'Vendor-format churn is a source-capture problem', detail: 'Format editions and schema revisions are versions of the source, ingested with their own two clocks like any other vintage data, so the corpus’s answer does not jitter when a vendor revises a format.' },
] as const;
