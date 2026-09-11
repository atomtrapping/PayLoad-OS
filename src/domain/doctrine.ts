/**
 * The architecture the firm carries forward, as data (docs/ARCHITECTURE.md
 * is the prose). Five fabrics, three states of information, seven rules and
 * one operational rule, the verification tiers, the identity chain. Every
 * rule names where this repository enforces it and which tests prove it;
 * doctrine.test.ts fails if a named test file disappears, so the product
 * page states facts that cannot rot silently.
 */
import type { Presence } from './product';
import { ENGINE_ROLE, PROJECTION_ENGINES, type ProjectionEngine } from './projection';

export interface Fabric {
  id: 'acquisition' | 'corpus' | 'state' | 'compute' | 'projection';
  order: 1 | 2 | 3 | 4 | 5;
  title: string;
  transforms: string;
  inThisRepository: string;
  presence: Presence;
  where?: string;
}

export const FABRICS: readonly Fabric[] = [
  { id: 'acquisition', order: 1, title: 'Acquisition fabric', transforms: 'World → evidence', inThisRepository: 'The local evidence rail captures declared material under an exact INGEST decision, content-addressed, with a storage receipt. One bounded FMCSA Company Census capture is live-qualified; the separate Samsara GPS adapter is offline-tested only. A production connector fleet, frontier, crawler and change detector remain absent.', presence: 'PRESENT', where: '/candidates#cp-acquisitions' },
  { id: 'corpus', order: 2, title: 'Corpus fabric', transforms: 'Evidence → computational commons', inThisRepository: 'A fixed Carrier adapter normalizes captured bytes after a separate DERIVE decision into UNADMITTED, UNRESOLVED candidates or a quarantine; a time-bounded candidate build assembles them. The demonstration releases stand in for compiled inventory.', presence: 'PRESENT', where: '/candidates' },
  { id: 'state', order: 3, title: 'State fabric', transforms: 'Candidate → validation → version', inThisRepository: 'A deterministic local notation-state kernel is implemented: Rust validates commands, keeps stable identities through undo and redo, and replays saved history; Node persists versioned snapshots; the workspace at /notations authors against it. Canonical corpus admission remains absent: releases are committed fixtures, and no candidate crosses an admission boundary here.', presence: 'PRESENT', where: '/notations' },
  { id: 'compute', order: 4, title: 'Compute and decision fabric', transforms: 'State → model → result → decision', inThisRepository: 'Bounded local instruments run: the pinned GAT IFC audit, recorded-observation replay, a scalar linear-Gaussian benchmark, weighted rigid registration with explicit Euclidean/access-network distances, and exact clearance value-of-information comparison. Exact evidence and model references accompany retained runs. The benchmark demonstration is synthetic, not field validation or full sensor fusion. The spatial and clearance inspectors are synthetic, not live routing, independent calibration or action execution. The ruling workbench remains fixture-backed. Managed customer workloads, trained neural models and automatic canonical admission remain absent.', presence: 'PRESENT', where: '/compute/registration' },
  { id: 'projection', order: 5, title: 'Projection fabric', transforms: 'State or inquiry → human- and machine-operable representation', inThisRepository: 'The feed API, the MCP tools, the stream and every page are projections of committed releases, and a closed ProjectionSpec with a source-pinned compiler serves records and a record-to-subject graph read-only over one exact release. CesiumJS is installed and renders the Earth Twin at /earth from bundled imagery, keyless, with a computed sun; kepler.gl and Three.js are routed to, not installed. Geometry requests still return UNAVAILABLE: the fixture declares none and nothing is invented.', presence: 'FIXTURE', where: '/api' },
];

export interface InformationState {
  id: 'EVIDENCE' | 'CANONICAL' | 'INQUIRY';
  symbol: 'E' | 'K' | 'I';
  title: string;
  meaning: string;
  invariants: readonly string[];
  inThisRepository: string;
  where: string;
}

export const INFORMATION_STATES: readonly InformationState[] = [
  { id: 'EVIDENCE', symbol: 'E', title: 'Evidence', meaning: 'What has been observed. Large, heterogeneous, possibly contradictory, provenance-heavy.', invariants: ['append-only', 'content-addressed', 'a record of what a source said, never an assertion about the world'], inThisRepository: 'Evidence artifacts with capture digests, storage keys and receipts; acquisitions on the local rail.', where: '/evidence' },
  { id: 'CANONICAL', symbol: 'K', title: 'Canonical', meaning: 'What the system has formally admitted under a schema and a validation regime, as a version.', invariants: ['immutable per version', 'schema-constrained', 'deterministic identity', 'the shared truth surface'], inThisRepository: 'Released records inside certified releases, with both clocks, bounds, identity and rights. Admission itself is absent.', where: '/releases' },
  { id: 'INQUIRY', symbol: 'I', title: 'Inquiry', meaning: 'What one investigation is currently manipulating: selected evidence, hypotheses, calculations, candidate deltas. Allowed to be wrong.', invariants: ['exploratory', 'mutable', 'never a source of truth', 'promotion crosses validation'], inThisRepository: 'The notation workspace: authored notations and relations, browser drafts, kernel-validated unsaved commands, saved local versions; none of it evidence or canonical state. Also the intake draft and the candidates on the rail.', where: '/notations' },
];

export interface DoctrineRule {
  n: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  rule: string;
  meaning: string;
  enforcedHere: string;
  where?: string;
  /** Repository-relative test files that prove the rule. doctrine.test.ts asserts they exist. */
  tests: readonly string[];
}

export const DOCTRINE: readonly DoctrineRule[] = [
  { n: 1, rule: 'Evidence is not state.', meaning: 'An observation records what a source said and when it was captured. Whether it becomes canonical is a separate act.', enforcedHere: 'Evidence artifacts and corpus records are distinct types; every record names the artifact it was extracted from and its capture receipt; every capture and candidate carries sourceTruthClaimed: false.', where: '/evidence', tests: ['src/fixtures/capture.contract.test.ts', 'src/fixtures/production/demo.contract.test.ts'] },
  { n: 2, rule: 'Canonical state is not the entire corpus.', meaning: 'A release admits a view. Evidence, candidates, quarantines and refusals stay outside it and stay visible.', enforcedHere: 'No candidate, run or build identifier or digest appears in any release, any feed payload on either projection, or any MCP tool result; the rail is shown on its own page.', where: '/candidates', tests: ['src/fixtures/production/demo.contract.test.ts'] },
  { n: 3, rule: 'Inquiry is allowed to be wrong.', meaning: 'A working state may hold hypotheses and drafts. Nothing in it becomes admitted by being written down.', enforcedHere: 'The intake draft says it is not evaluated and its submission is an intent; the workbench computes no fact and adjudicates nothing; a board message cannot resolve an identity.', where: '/cases/new', tests: ['src/components/case/CaseWorkspace.test.tsx', 'src/coordination/ledger.test.ts'] },
  { n: 4, rule: 'Computation produces derived objects, not truth automatically.', meaning: 'A parser, a model or a solver yields a derived object with its method identity. Evaluation is not verification.', enforcedHere: 'Derived quantities are computed by named, versioned methods and marked as derived; every candidate carries its derivation decision and adapter contract digest; checks are evaluation and verification is stated as internal recompute.', where: '/releases/REL-CAR-2026.09.01', tests: ['src/domain/corpus.test.ts', 'src/data-os/local-normalization.test.ts'] },
  { n: 5, rule: 'Projection never mutates its source.', meaning: 'A map, a globe, a graph, a feed or a page reads state. It has no path back into it.', enforcedHere: 'Feed payloads and MCP results are pure functions of committed releases: the fixture corpus is identical before and after every projection; the projection compiler returns detached copies and states sourceMutated: false.', where: '/api', tests: ['src/architecture.test.ts', 'src/domain/projection.test.ts', 'src/projection/projection.test.ts'] },
  { n: 6, rule: 'Identity survives representation changes.', meaning: 'A projection changes how a thing is shown, never what it is. Visual adjacency is not a relation.', enforcedHere: 'A record keeps the same notation:// identity in the records feed, the as-of answer, every MCP result and every compiled projection; the only graph edge is the record-to-subject incidence a record already names, and relationInferred is false.', where: '/stream', tests: ['src/architecture.test.ts', 'src/domain/projection.test.ts', 'src/projection/projection.test.ts'] },
  { n: 7, rule: 'Every promoted result crosses an explicit validation boundary.', meaning: 'Nothing becomes canonical because a process computed it. Promotion is an act at a boundary, with a record.', enforcedHere: 'The rail writes UNADMITTED records only and refuses what it cannot vouch for; browser and application code take only types and the pure source-use evaluator from data-os and cannot capture, parse, normalize or build; the admission gate now exists and refuses by default \u2014 it stamps source time, acquisition time and declared provenance at entry, yields a writable row only from an ADMITTED ruling, and will not admit on its own behalf \u2014 while the act of admission remains absent: no candidate has crossed it, and the committed fixtures the seeder writes are stamped DEMONSTRATION so they cannot read as admitted state.', where: '/candidates#cp-refusals', tests: ['src/architecture.test.ts', 'src/data-os/local-candidate-build.test.ts'] },
];

/**
 * What an absence means lives in one place, and it is not here.
 *
 * `src/domain/negativeStates.ts` carries the negative-state registry: the
 * distinct states an ordinary system collapses into one null, each with the
 * pair it separates, the fabrication the collapse produces, and the module
 * and exported symbol that enforce it. Its test reads those modules and
 * fails if a named symbol has gone.
 *
 * This file held a second, smaller copy of the same idea for a few hours.
 * Two homes for one vocabulary is the registry problem in miniature, and the
 * fix is one home rather than a third — so the copy is gone and this is the
 * pointer. The seven rules below govern how information moves; the negative
 * states govern what it means when there is none.
 */
export const NEGATIVE_STATES_LIVE_IN = 'src/domain/negativeStates.ts' as const;

/**
 * TWO RULES ABOUT A PRODUCER'S OWN WORDS, HARVESTED FROM A MODULE THAT WENT.
 *
 * src/domain/vocabulary.ts existed to reconcile two dialects of one decision:
 * a GAT report grammar saying RECOMMEND_MEASUREMENT / FIT / REJECT, and this
 * system's clearance producer saying MEASUREMENT_RECOMMENDED / ACCEPT_FIT /
 * REJECT_FIT. It ruled verb-first canonical and recorded the other as aliases,
 * "rather than argued about again".
 *
 * The GAT producer never arrived. `gat.finite-decision-plan.v1` appeared in
 * exactly two places in the repository — that module and its own test — and
 * `canonicalFor` and `displayTerm` had no callers anywhere, so half the alias
 * table was an unverified transcription of an external engine's grammar
 * checked only against itself. The module is deleted.
 *
 * Its stated justification did not survive reading either: verb-first was
 * argued "in the same event vocabulary as the ruling state machine", and that
 * machine is `AdmissionOutcome` — ADMITTED, ADMITTED_WITH_CONDITIONS, REFUSED,
 * three past participles. The authority cited ruled the other way.
 *
 * These two rules are what was worth keeping, and neither depends on the
 * dialect that prompted them. They are about any producer whose words reach a
 * surface.
 */
export const PRODUCER_VOCABULARY_RULES = {
  normalizeWhere:
    'At the adapter boundary, never in a surface. A surface that normalized would be deciding what a producer meant, which is an adapter job and not a renderer one.',
  printWhat:
    "The producer's own word, verbatim. A canonical word is what an accent or a palette keys on; where the two differ the surface shows both, so the mapping is visible rather than hidden in an adapter.",
  whyBoth:
    'The two do not contradict each other because they govern different fields: one decides what the system stores, the other what the reader sees.',
} as const;

export const OPERATIONAL_RULE = 'Build shared information before multiplying reasoning processes.';

export interface VerificationTier { tier: 'V0' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5'; name: string; reachedHere: boolean; how: string }

/** Verification is selective, never universal: an application chooses the tier it needs. */
export const VERIFICATION_TIERS: readonly VerificationTier[] = [
  { tier: 'V0', name: 'Provenance', reachedHere: true, how: 'Every record, artifact, candidate and payload names its sources, transforms, decisions and digests.' },
  { tier: 'V1', name: 'Deterministic reproducibility', reachedHere: true, how: 'Digests, captures, manifests and the production demonstration are regenerated under test and compared byte for byte.' },
  { tier: 'V2', name: 'Signed releases and manifests', reachedHere: false, how: 'Manifests carry commitments; nothing signs them.' },
  { tier: 'V3', name: 'Independent recomputation', reachedHere: false, how: 'Verification here is internal recompute, stated as such on every release.' },
  { tier: 'V4', name: 'Cryptographic execution attestation', reachedHere: false, how: 'Absent.' },
  { tier: 'V5', name: 'Formal or zero-knowledge proof', reachedHere: false, how: 'Absent. Reserved for the few claims that would justify it.' },
];

/** Distinct identities, with the morphisms between them preserved rather than collapsed. */
export const IDENTITY_CHAIN = ['evidence', 'observation', 'claim', 'canonical state', 'representation', 'model', 'execution', 'verification'] as const;

export const EXTRACTION_INTERFACE = {
  statement: 'Extraction is an interface, not a vendor. A deterministic parser, a local or hosted model, a vision model or a human annotation each yield a structured candidate observation with its method identity, parameters, output and provenance.',
  inThisRepository: 'One deterministic adapter, the Caravan Carrier JSON contract, with a fixed contract digest. No model vendor has an architectural role.',
} as const;

/** CesiumJS is present as the Earth Twin's engine (src/domain/earth.ts): installed, rendering a keyless globe, fed no fixture geometry yet. */
export const PROJECTION_ENGINE_PRESENCE: Record<ProjectionEngine, Presence> = { 'kepler.gl': 'ABSENT', CesiumJS: 'PRESENT', 'Three.js': 'ABSENT', OpenUSD: 'ABSENT', records: 'FIXTURE' };

export const PROJECTION_ENGINES_IN_REPOSITORY = PROJECTION_ENGINES.map((engine) => ({ engine, ...ENGINE_ROLE[engine], presence: PROJECTION_ENGINE_PRESENCE[engine] }));

export const WORKBENCH_RUNTIME = {
  statement: 'Node.js is the workbench and application runtime: sessions, transport, routing, projection requests. It owns no canonical state, no provenance of record and no heavy computation.',
  inThisRepository: 'Next.js on Node serves the pages, the feed routes and the coordination routes; the corpus is committed data and the rails run in separate node processes.',
} as const;
