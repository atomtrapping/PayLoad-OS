/**
 * Scoring a record by what it survives, and the one thing that cannot score.
 *
 * Data earns credence by surviving declared checks. That is consistency-based
 * epistemology, and it is how replication, metrology and this repository's own
 * verification tiers already work. Four tiers of filter, each already present
 * in the architecture in some form:
 *
 *   structural  — type, unit, both clocks, provenance present: the observation
 *                 contract acting as a filter. Binary, cheap, absolute.
 *   cross-source — disagreement bounds and corroboration: the disagreement
 *                 layer as a scoring input.
 *   model       — conservation residuals and innovation gates: the constraint
 *                 stack and the factor layer adjudicating an observation.
 *   reliability — a fitted prior per source, updated from the filters' own
 *                 verdicts, which is what turns scoring into an estate.
 *
 * That last tier is the one worth building, because recording the verdicts is
 * what makes this different from validation. A source whose records keep
 * failing conservation gets a fitted reliability with a history, and that
 * history is evidence the promotion decision consumes.
 *
 * And then the boundary, which no amount of filtering moves: invariants
 * validate coherence with a declared model, not correspondence with reality. A
 * perfectly self-consistent corpus can be uniformly wrong. If every source
 * inherited one error, or the invariant set encodes one blind assumption, the
 * filters confirm instead of detecting. The residual risk after all four tiers
 * is frame validity, and the only machinery that touches it is an independent
 * reference — which must therefore be firewalled from the scoring, or the
 * benchmark trains the test.
 *
 * Nothing here scores anything. No invariant is declared, no verdict is
 * recorded, no reliability is fitted and no reference channel exists.
 */
import { VERIFICATION_TIERS } from './doctrine';
import type { Corpus } from './corpus';

/* ── The four tiers ── */

export type FilterTier = 'STRUCTURAL' | 'CROSS_SOURCE' | 'MODEL' | 'RELIABILITY';

export interface FilterSpec {
  id: FilterTier;
  title: string;
  what: string;
  /** The component that would run it, by name. */
  runBy: string;
  /** What a verdict from this tier is worth, and what it is not. */
  worth: string;
  state: 'PARTIAL' | 'ABSENT';
  here: string;
}

export const FILTER_TIERS: readonly FilterSpec[] = [
  {
    id: 'STRUCTURAL',
    title: 'Structural invariants',
    what: 'Type, unit, both clocks, provenance present, digest resolvable. Binary, cheap and absolute: a record either satisfies the observation contract or it is not a record.',
    runBy: 'The record and candidate contracts, already enforced at every boundary.',
    worth: 'A pass says the record is well-formed. It says nothing whatever about whether it is true.',
    state: 'PARTIAL',
    here: 'Enforced as validation and as quarantine on the production rail. The verdicts are not retained as scores against the source that produced them.',
  },
  {
    id: 'CROSS_SOURCE',
    title: 'Cross-source invariants',
    what: 'Disagreement bounds and corroboration between sources describing the same subject.',
    runBy: 'The disagreement layer, and the geometric verdict where the quantity is a position.',
    worth: 'Agreement raises credence only to the extent the agreeing sources are independent. Counted without independence it is worth nothing, and worse than nothing when it looks like something.',
    state: 'PARTIAL',
    here: 'Two declared positions that cannot both be right are already reported as such. Nothing scores a source from that outcome, and no source-independence is computed.',
  },
  {
    id: 'MODEL',
    title: 'Model invariants',
    what: 'Conservation residuals, constraint violations and normalized-innovation gates: the declared laws adjudicating an observation.',
    runBy: 'The constraint stack in ./constraints and the factor layer in ./factorGraph.',
    worth: 'A residual inside its gate says the observation is consistent with the model in force. Which is a statement about the model as much as about the observation.',
    state: 'ABSENT',
    here: 'No constraint is declared, no residual is computed and no gate exists.',
  },
  {
    id: 'RELIABILITY',
    title: 'Reliability priors, fitted from the verdicts',
    what: 'A per-source prior, in the tradition of an Admiralty-style rating, updated from this filter set’s own outcomes and carried with its history.',
    runBy: 'Nothing yet. It would be a corpus object like any other, with both clocks.',
    worth: 'This is the tier that compounds. A rating is only meaningful with the history that produced it and the invariant set version that produced the history.',
    state: 'ABSENT',
    here: 'Source reliability is mentioned in the source programme and computed nowhere. No verdict is retained, so nothing could be fitted from one.',
  },
];

/* ── Why recording the verdicts is the whole point ── */

export const VERDICTS_ARE_THE_ESTATE = {
  claim: 'Recording what each filter decided, per record and per source, is what turns scoring into an estate rather than a gate.',
  difference: 'A gate rejects bad rows. An estate learns which sources produce bad rows, with a history, and that history is evidence a promotion decision consumes.',
  needs: [
    'A retained verdict per record per filter, naming the invariant set version that produced it.',
    'A fitted reliability per source, with both clocks, superseding rather than overwriting as evidence accumulates.',
    'The promotion predicate reading the fitted reliability as evidence, never as an authorization.',
  ],
  state: 'ABSENT' as const,
} as const;

/* ── Where it stops being sufficient ── */

export interface FrameRisk {
  id: 'CORRELATED_FAILURE' | 'INVARIANTS_ARE_BELIEFS' | 'CONSISTENCY_IS_NOT_CORRESPONDENCE';
  title: string;
  failure: string;
  /** The discipline that contains it. Not a fix: a containment. */
  discipline: string;
}

export const FRAME_RISKS: readonly FrameRisk[] = [
  {
    id: 'CORRELATED_FAILURE',
    title: 'Correlated failure masquerading as confirmation',
    failure: 'Five sources agreeing about a facility’s capacity, all syndicating one original measurement, pass every cross-source invariant. Corroboration assumes independence, and the physical economy’s data supply chain is heavily syndicated, so the biggest syndicator becomes the most corroborated source.',
    discipline: 'Weight corroboration by independent provenance paths, never by the count of agreeing sources. The corpus already retains source lineage, which is exactly what makes the weighting computable — and what makes counting instead of weighting an unforced error.',
  },
  {
    id: 'INVARIANTS_ARE_BELIEFS',
    title: 'The invariants are themselves beliefs',
    failure: 'A constraint stack, a corroboration threshold and a disagreement bound are declared models with versions and sources. A reliability score is only as honest as the invariant set that produced it, and a wrong invariant produces confidently wrong scores across every source it touches.',
    discipline: 'Invariants carry provenance, versions and both clocks, and have their own violation tape. Every score reports which invariant set version produced it, so a later correction to the invariants invalidates the scores derived under them rather than silently outliving them.',
  },
  {
    id: 'CONSISTENCY_IS_NOT_CORRESPONDENCE',
    title: 'Consistency is not correspondence',
    failure: 'A perfectly self-consistent corpus can be uniformly wrong. Where every source inherited the same error, or the invariant set encodes the same blind assumption, the filters confirm rather than detect — which is how invariant-conforming data feeding invariant-conforming models fails in every field it has failed in.',
    discipline: 'An independent reference channel: physical fixtures, held-out ground truth, a backtest against outcomes. Filters refine belief within the frame; only a reference tells you the frame is the world.',
  },
];

/* ── The firewall ── */

export const REFERENCE_CHANNEL = {
  role: 'The only machinery that touches the world rather than the model of the world.',
  firewall: 'References are structurally separated from the invariant scoring. A reference must never become an invariant input, because a benchmark that trains the test measures nothing.',
  consequence: 'Filters and references are two channels with two purposes: filters refine belief inside the declared frame, references calibrate whether the frame corresponds to anything. Mixing them produces a system that cannot be surprised.',
  posture: 'The correct statement is not “filters, therefore safe to promote”. It is “filters, therefore safe to promote, calibrated by an independent channel the filters cannot contaminate”.',
  /** Read from the verification tiers rather than restated, so the two cannot drift. */
  hereTier: VERIFICATION_TIERS.find((t) => t.tier === 'V3')!,
  state: 'ABSENT' as const,
  here: 'Verification here is internal recompute, stated as such on every release. No independent reference measurement exists, no held-out ground truth is retained, and no backtest against outcomes runs.',
} as const;

/* ── What exists ── */

export interface ScoringStanding {
  recordsSubjectToFilters: number;
  sourcesThatCouldBeRated: number;
  retainedVerdicts: number;
  fittedReliabilities: number;
  declaredInvariantSets: number;
  independentReferences: number;
  statement: string;
}

/** Pure: the population, and the four counts that are zero. */
export function scoringStanding(corpus: Corpus): ScoringStanding {
  const sources = new Set(corpus.records.map((r) => r.provenance.sourceId));
  return {
    recordsSubjectToFilters: corpus.records.length,
    sourcesThatCouldBeRated: sources.size,
    retainedVerdicts: 0,
    fittedReliabilities: 0,
    declaredInvariantSets: 0,
    independentReferences: 0,
    statement: `${corpus.records.length} records from ${sources.size} sources are the population a filter set would score. No invariant set is declared, no verdict is retained, no reliability is fitted, and no independent reference exists — so nothing here has been scored, and nothing here has been checked against the world.`,
  };
}
