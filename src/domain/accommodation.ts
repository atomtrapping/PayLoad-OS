/**
 * What the last stretch of work added, and what the rest of the system now
 * has to accommodate.
 *
 * Roughly twenty modules landed in a short time: the spatial derivations, the
 * sensor families, the constraint and factor-graph estimation layer, the
 * invariant filters, the vessel and the port set, the carrier and congruence,
 * the serving boundary, the actuarial correspondence, the legacy-trade
 * backfill, the scene and manifold projection tiers. Each states what exists
 * and what does not. None of them says what the *system* now owes as a
 * consequence, and that is a different question — the one worth asking when a
 * lot has been added quickly.
 *
 * This module answers it in the only way that survives: as data with a test
 * over it, so a capability that quietly becomes runnable stops being listed as
 * blocked, and a precondition that quietly stops being met is caught rather
 * than remembered wrongly.
 *
 * Three findings fall out of the arrangement rather than being asserted by it,
 * and the first was a surprise the probes produced rather than a claim written
 * in advance.
 *
 * The corpus already contains exactly one independently corroborated quantity.
 * Lot 5B-221's gross weight is claimed twice by two different sources: a draft
 * survey at 40.0 t stating no bound at all, and a terminal weighbridge at
 * 40.12 t stating ±0.040 t. That is the seed of everything the estimation layer
 * describes — and under this system's own rule the pair is *not assessable*,
 * because a channel that states no uncertainty is not compared and none is
 * assumed for it. So the corpus holds one disagreement, and it is the kind that
 * cannot be adjudicated. That is a sharper statement of the gap than any count
 * of modules: what is missing is not a second account, it is a second account
 * that stated its own bound.
 *
 * The second is that the gap is narrower than the module count suggests. Almost
 * every unmet precondition below is of one kind — corpus content — and they are
 * variations on that same theme: a position observed twice, an event claimed by
 * two channels, two accounts that can actually be tested against each other.
 * The system is not twenty things away from working. It is one kind of thing
 * away, twenty times.
 *
 * The third is that the additions were mostly cheap for the existing system to
 * absorb, and the few that were not are named in PRESSURE. A module that only
 * declares costs nothing. A module that changes what an existing caller must
 * say — the third clock is the clear case — costs every caller, and that debt
 * is real whether or not anyone writes it down.
 *
 * Nothing here acquires anything, and no capability below is claimed to run.
 */
import type { Corpus, CorpusRecord } from './corpus';

/* ── What a capability can be waiting on ── */

export type PreconditionKind =
  /** Records the corpus does not hold. Acquisition, extraction or a longer run of time. */
  | 'CORPUS_CONTENT'
  /** A permission that has not been obtained or decided. */
  | 'RIGHTS'
  /** Something that would have to be installed, trained or written. */
  | 'INFRASTRUCTURE'
  /** A method that would have to be chosen and pinned. */
  | 'A_METHOD'
  /** A ruling a person has to make. No amount of building produces one. */
  | 'AN_ADJUDICATION';

export type PreconditionId =
  | 'ADMITTED_RECORD'
  | 'INDEPENDENT_ACCOUNTS'
  | 'COMPARABLE_ACCOUNTS'
  | 'REPEATED_POSITION'
  | 'MULTI_CHANNEL_EVENT'
  | 'SOURCE_LINEAGE'
  | 'DECLARED_SOURCE_TIME'
  | 'A_DENOMINATOR'
  | 'IDENTITY_RESOLUTION'
  | 'ESTABLISHED_WORLD_TIME'
  | 'AREAL_GEOMETRY'
  | 'HISTORICAL_DEPTH'
  | 'STATED_UNCERTAINTY'
  | 'LIVE_SOURCE'
  | 'IMAGERY_RIGHTS'
  | 'ARCHIVE_HOLDER'
  | 'A_SOLVER'
  | 'A_TRAINED_MODEL'
  | 'A_USD_WRITER'
  | 'A_RECORD_STORE'
  | 'THE_ADMISSION_GATE'
  | 'THE_SERVING_BOUNDARY'
  | 'THE_CELL_KEY'
  | 'BOTH_CLOCKS'
  | 'AN_ADMISSION_AUTHORITY';

export interface Precondition {
  id: PreconditionId;
  what: string;
  kind: PreconditionKind;
  /** Declared. Where a probe exists, the test holds this to what the corpus actually shows. */
  met: boolean;
  because: string;
  /**
   * Decides `met` from the corpus itself, so the declaration cannot drift away
   * from the records. Absent where the answer is about the repository rather
   * than about the corpus, in which case `provenBy` names what would fail.
   */
  probe?: (corpus: Corpus) => boolean;
  /** The module or test whose failure would show this answer had changed. */
  provenBy?: string;
}

const positions = (corpus: Corpus): CorpusRecord[] => corpus.records.filter((r) => r.predicate === 'location.position');

/** Records grouped by the thing they are an account of: one subject, one predicate. */
function accounts(corpus: Corpus): Map<string, CorpusRecord[]> {
  const grouped = new Map<string, CorpusRecord[]>();
  for (const record of corpus.records) {
    const key = `${record.subjectId}|${record.predicate}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  return grouped;
}

/** Distinct sources behind one group of accounts. Sources, never records: records restate. */
const sourcesOf = (records: readonly CorpusRecord[]): Set<string> => new Set(records.map((r) => r.provenance.sourceId));

/** A bound that can be tested against another. A stated semantics with no numbers is not one. */
const hasUsableBound = (record: CorpusRecord): boolean =>
  typeof record.uncertainty?.low === 'number' && typeof record.uncertainty?.high === 'number';

export const PRECONDITIONS: readonly Precondition[] = [
  {
    id: 'ADMITTED_RECORD',
    what: 'One record that crossed the admission gate.',
    kind: 'AN_ADJUDICATION',
    met: false,
    because: 'The gate is built and installed at the write boundary, and no candidate has been put through it. The committed corpus is synthetic and stamped as a demonstration, which is a different type of thing and deliberately cannot read as admitted state.',
    provenBy: 'src/domain/admission.ts, src/db/schema.ts',
  },
  {
    id: 'INDEPENDENT_ACCOUNTS',
    what: 'Two accounts of one subject and one predicate, from two different sources.',
    kind: 'CORPUS_CONTENT',
    met: true,
    because: 'Lot 5B-221’s gross weight is claimed twice by two sources — a draft survey and a terminal weighbridge. This is the only such pair in the corpus, and it is the seed of every derivation that needs something to disagree with.',
    probe: (corpus) => [...accounts(corpus).values()].some((records) => sourcesOf(records).size >= 2),
  },
  {
    id: 'COMPARABLE_ACCOUNTS',
    what: 'Two accounts from two sources that can actually be tested against each other, because both stated a bound.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'The one independently corroborated quantity in the corpus cannot be adjudicated: the weighbridge states ±0.040 t and the draft survey states no bound at all. A channel that states no uncertainty is not compared and none is assumed for it, so the pair is not assessable rather than in disagreement. What is missing is not a second account — it is a second account that stated its own bound.',
    probe: (corpus) =>
      [...accounts(corpus).values()].some(
        (records) => sourcesOf(records.filter(hasUsableBound)).size >= 2,
      ),
  },
  {
    id: 'REPEATED_POSITION',
    what: 'One subject whose position is declared more than once.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'Two subjects each carry one position. A separation verdict between two subjects answers whether they are distinguishable; only a repeated position of one subject answers whether two accounts of it agree, and that is the question the spatial layer was built for.',
    probe: (corpus) => {
      const counts = new Map<string, number>();
      for (const record of positions(corpus)) counts.set(record.subjectId, (counts.get(record.subjectId) ?? 0) + 1);
      return [...counts.values()].some((n) => n >= 2);
    },
  },
  {
    id: 'MULTI_CHANNEL_EVENT',
    what: 'One event — an arrival, a loading, a departure — placed in time by two channels.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'Custody events are each claimed by a single channel. The closure residual is the spread between channels that placed the event themselves, so one channel leaves nothing to close against, and one account does not close.',
    probe: (corpus) =>
      [...accounts(corpus).entries()].some(
        ([key, records]) => key.split('|')[1].startsWith('custody.') && sourcesOf(records).size >= 2,
      ),
  },
  {
    id: 'DECLARED_SOURCE_TIME',
    what: 'A record carrying the source\u2019s own clock: when the source published or knew the thing.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'Every record states when it became knowable *here*, which is a fact about this system. The store carries a third clock and no committed record fills it, so the source as-of question is refused rather than answered on the wrong clock. It must be declared by the source; inferring it from the gap between the other two clocks would be this system guessing at provenance.',
    probe: (corpus) => corpus.records.some((r) => 'sourceTime' in r || 'publishedAt' in r),
  },
  {
    id: 'A_DENOMINATOR',
    what: 'Enough corpus history for a restatement rate to mean something.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'The corpus has restated two records, the longest arriving eighteen days after the record became knowable. That measures a window and does not estimate a frequency: a handful of events over one synthetic corpus supports an anecdote. Anything that prices a hold, a reserve or a confidence needs a denominator this corpus has not run long enough to have.',
    probe: (corpus) => corpus.retractions.length >= 30 && corpus.records.length >= 500,
  },
  {
    id: 'IDENTITY_RESOLUTION',
    what: 'A stage that turns a source record id into a canonical subject.',
    kind: 'A_METHOD',
    met: false,
    because: 'Both normalization rails state identity.state UNRESOLVED and canonicalId null, which is the rail being honest rather than incomplete. Nothing resolves them, so every candidate the rail can produce is refused by the gate on SUBJECT_IDENTIFIED — correctly, because a record admitted on a source-local name would join on a name.',
    provenBy: 'src/data-os/local-normalization.ts, src/acquisition/census-normalization.ts',
  },
  {
    id: 'ESTABLISHED_WORLD_TIME',
    what: 'A stage that establishes when a fact became true, as distinct from when a register was read.',
    kind: 'A_METHOD',
    met: false,
    because: 'The census adapter states validTimeMeaning NOT_ESTABLISHED_BY_SNAPSHOT: a snapshot says what a register held when it was read and not when the fact became true. Carrying that through means the gate refuses on BOTH_CLOCKS, which is the second absent stage rather than a defect in the projection.',
    provenBy: 'src/acquisition/census-normalization.ts, src/domain/candidateProjection.ts',
  },
  {
    id: 'SOURCE_LINEAGE',
    what: 'A record that names the source its own source obtained it from.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'Provenance names the immediate source and stops there. Two publishers republishing one measurement are therefore indistinguishable from two observers, and nothing in a record would show it — so independence is declared by a channel or it is unknown, never inferred from a count of sources.',
    probe: (corpus) => corpus.records.some((r) => 'upstreamSourceId' in r.provenance || 'derivedFromSourceId' in r.provenance),
  },
  {
    id: 'AREAL_GEOMETRY',
    what: 'A geometry that is not a point: a berth, a yard, a boundary, a footprint.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'Containment, coverage and every areal join need an area. Every geometry the corpus holds is a point with a stated horizontal uncertainty, and a point is not a small polygon.',
    probe: (corpus) => corpus.records.some((r) => r.geometry !== undefined && r.geometry.kind !== 'POINT'),
  },
  {
    id: 'HISTORICAL_DEPTH',
    what: 'Records older than the instruments that would have measured them.',
    kind: 'CORPUS_CONTENT',
    met: false,
    because: 'The corpus’s earliest record is weeks old. Nothing about backfill can be tested against it, and the archives that would supply the depth are not held.',
    probe: (corpus) => corpus.records.some((r) => Number(r.validFrom.slice(0, 4)) < 2020),
  },
  {
    id: 'STATED_UNCERTAINTY',
    what: 'A record that states its own uncertainty in machine-readable form.',
    kind: 'CORPUS_CONTENT',
    met: true,
    because: 'Positions carry a horizontal uncertainty in metres, which is what the cell key reads to pick a precision and what a separation verdict reads before it agrees to compare anything.',
    probe: (corpus) => positions(corpus).some((r) => typeof r.geometry?.horizontalUncertaintyM === 'number'),
  },
  {
    id: 'LIVE_SOURCE',
    what: 'One source acquired from the world rather than committed as a fixture.',
    kind: 'RIGHTS',
    met: false,
    because: 'Two connectors are implemented and operator-gated. Collection needs an explicit flag the operator holds, and this system does not hold it.',
    provenBy: 'docs/SOURCE_CONNECTION_PROGRAM.md, src/domain/productionPath.ts',
  },
  {
    id: 'IMAGERY_RIGHTS',
    what: 'A right to derive from optical or radar imagery and to sell what the derivation produces.',
    kind: 'RIGHTS',
    met: false,
    because: 'The sensor families are described and none is licensed. Imagery rights bite hardest exactly where the derivations are most valuable, and a right that has not been decided is a refusal rather than a quiet permission.',
    provenBy: 'src/domain/sensorFamilies.ts',
  },
  {
    id: 'ARCHIVE_HOLDER',
    what: 'A named institution holding trade artifacts, and terms for them.',
    kind: 'RIGHTS',
    met: false,
    because: 'The backfill argument is about what an archive would be worth. No archive is held, no holder is named and no artifact is retained.',
    provenBy: 'src/domain/legacyTrade.ts',
  },
  {
    id: 'A_SOLVER',
    what: 'A pinned factor-graph solver, with its version and its numerics fixed.',
    kind: 'A_METHOD',
    met: false,
    because: 'A candidate is named and none is adopted. Adopting one is a pin rather than an install, because a solver that moves between releases makes its own results unreproducible.',
    provenBy: 'src/domain/factorGraph.ts',
  },
  {
    id: 'A_TRAINED_MODEL',
    what: 'A trained embedding of the containment hierarchy.',
    kind: 'INFRASTRUCTURE',
    met: false,
    because: 'The manifold tier is specified and nothing is embedded. It would project a computation over a release rather than the release, so it never testifies — and with no admitted record it would render void everywhere, correctly.',
    provenBy: 'src/domain/earthComplex.ts',
  },
  {
    id: 'A_USD_WRITER',
    what: 'A writer that composes an admitted release as one USD layer.',
    kind: 'INFRASTRUCTURE',
    met: false,
    because: 'The mapping is data and the routing table routes to it. No USD library is installed and no writer exists, so the compiler answers that the geometry is not available.',
    provenBy: 'src/domain/usdProjection.ts, src/domain/projection.ts',
  },
  {
    id: 'A_RECORD_STORE',
    what: 'A store for canonical records with the invariants the class requires.',
    kind: 'INFRASTRUCTURE',
    met: true,
    because: 'PostgreSQL is selected and wired for records, and the schema carries the admission status and the clocks.',
    provenBy: 'src/db/schema.ts, src/domain/storage.ts',
  },
  {
    id: 'THE_ADMISSION_GATE',
    what: 'A gate that refuses by default and never admits on its own behalf.',
    kind: 'INFRASTRUCTURE',
    met: true,
    because: 'Nine checks with refusal as the default, installed at the write boundary, with a response pipeline that will not serve a row which never crossed it.',
    provenBy: 'src/domain/admission.ts, src/domain/responsePipeline.ts',
  },
  {
    id: 'THE_SERVING_BOUNDARY',
    what: 'A boundary that decides what leaves, in refusal order, with the estates refused before rights are read.',
    kind: 'INFRASTRUCTURE',
    met: true,
    because: 'Five stages, no later stage rescuing an earlier refusal, and a refusal that names its stage rather than returning an error or silence.',
    provenBy: 'src/domain/responsePipeline.ts, src/domain/servingBoundary.ts',
  },
  {
    id: 'THE_CELL_KEY',
    what: 'A spatial key no finer than the source’s own stated uncertainty.',
    kind: 'INFRASTRUCTURE',
    met: true,
    because: 'A published prefix code, truncatable, with the precision chosen from the declared uncertainty and a refusal where no uncertainty is stated.',
    provenBy: 'src/domain/spatialKey.ts',
  },
  {
    id: 'BOTH_CLOCKS',
    what: 'Valid time and knowledge time on every record, kept apart.',
    kind: 'INFRASTRUCTURE',
    met: true,
    because: 'Every record carries both, the as-of answer refuses rather than guessing, and the store now carries a third clock for the source’s own time.',
    provenBy: 'src/domain/corpus.ts, src/domain/referenceGround.ts',
  },
  {
    id: 'AN_ADMISSION_AUTHORITY',
    what: 'A named authority that is not the method being admitted.',
    kind: 'AN_ADJUDICATION',
    met: false,
    because: 'The gate requires one and there is nobody in the role. This is the one precondition no amount of building satisfies: it is a person accepting responsibility for a ruling.',
    provenBy: 'src/domain/admission.ts, src/domain/productionPath.ts',
  },
];

const preconditionOf = (id: PreconditionId): Precondition => {
  const found = PRECONDITIONS.find((p) => p.id === id);
  if (!found) throw new Error(`unknown precondition: ${id}`);
  return found;
};

/* ── What was added, and what each thing waits on ── */

export interface Capability {
  id: string;
  what: string;
  module: string;
  needs: readonly PreconditionId[];
  /** The mistake available to a reader who takes the module for the capability. */
  ifMistaken: string;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'SPATIAL_KEY',
    what: 'A cell key derived from a position and its stated uncertainty, and a geodesic verdict on whether two positions can be told apart.',
    module: 'src/domain/spatialKey.ts',
    needs: ['THE_CELL_KEY', 'STATED_UNCERTAINTY'],
    ifMistaken: 'The key runs. What it cannot yet do is resolve an identity, because that needs two accounts of one subject and there are none.',
  },
  {
    id: 'CROSS_SUBJECT_SEPARATION',
    what: 'Whether two subjects’ declared positions can be told apart at their stated uncertainties.',
    module: 'src/domain/spatialKey.ts',
    needs: ['THE_CELL_KEY', 'STATED_UNCERTAINTY', 'REPEATED_POSITION'],
    ifMistaken: 'A verdict that two subjects are distinguishable is not a verdict that two accounts of one subject agree. The second question is the one the layer was built for, and the corpus cannot pose it.',
  },
  {
    id: 'EVENT_CLOSURE',
    what: 'The residual between channels claiming one event, counted over declared independent groups.',
    module: 'src/domain/eventClosure.ts',
    needs: ['MULTI_CHANNEL_EVENT'],
    ifMistaken: 'With one channel there is nothing to close against, and one account does not close.',
  },
  {
    id: 'PORT_SET',
    what: 'A port as a time-indexed set whose membership is a ruling with both clocks.',
    module: 'src/domain/portSet.ts',
    needs: ['BOTH_CLOCKS', 'AREAL_GEOMETRY', 'MULTI_CHANNEL_EVENT'],
    ifMistaken: 'Occupancy over a corpus with no rulings is null and never zero, and a null is not a quiet zero.',
  },
  {
    id: 'CONSTRAINT_ENFORCEMENT',
    what: 'Constraints as observations with R = 0, enforced by projection, never by clipping.',
    module: 'src/domain/constraints.ts',
    needs: ['COMPARABLE_ACCOUNTS', 'A_SOLVER'],
    ifMistaken: 'A constraint applied to a single unopposed measurement restates it. The certainty a constraint harvests comes from a disagreement it resolves, and the corpus’s one disagreement is not assessable.',
  },
  {
    id: 'FACTOR_GRAPH',
    what: 'The joint over states, with disagreement representable rather than averaged away.',
    module: 'src/domain/factorGraph.ts',
    needs: ['A_SOLVER', 'COMPARABLE_ACCOUNTS'],
    ifMistaken: 'A graph with one factor per state has no joint to speak of; the structure is real and there is nothing in it.',
  },
  {
    id: 'INVARIANT_SCORING',
    what: 'Four filter tiers over source behaviour, and a reference channel they must never feed.',
    module: 'src/domain/invariantScoring.ts',
    needs: ['LIVE_SOURCE', 'SOURCE_LINEAGE'],
    ifMistaken: 'Invariance is measured across frames a source is observed in. Seven fixture sources observed once each supply no frames to be invariant across.',
  },
  {
    id: 'VESSEL_STATE',
    what: 'The vessel as the state the sensor families were defined around, with dispatch typed as a prior.',
    module: 'src/domain/vessel.ts',
    needs: ['REPEATED_POSITION', 'MULTI_CHANNEL_EVENT', 'LIVE_SOURCE'],
    ifMistaken: 'Only position is carried today. The other state fields are declared and empty, and a declared field is not a held value.',
  },
  {
    id: 'SENSOR_TRIAD',
    what: 'Three sensor families with their frames, and the semantic convergence that is the actual work.',
    module: 'src/domain/sensorFamilies.ts',
    needs: ['IMAGERY_RIGHTS', 'LIVE_SOURCE'],
    ifMistaken: 'The sensor convergence is free and already happened. The semantic one is the whole job and none of it is done here.',
  },
  {
    id: 'USD_INTERCHANGE',
    what: 'An admitted release composed as one USD layer, prims on stable paths.',
    module: 'src/domain/usdProjection.ts',
    needs: ['A_USD_WRITER', 'ADMITTED_RECORD', 'AREAL_GEOMETRY'],
    ifMistaken: 'USD is a target and never a store: composition resolves opinions silently where this corpus preserves them, so a round trip loses every refusal.',
  },
  {
    id: 'MANIFOLD_TIER',
    what: 'A hyperbolic embedding of the containment hierarchy, drawn as a shell.',
    module: 'src/domain/earthComplex.ts',
    needs: ['A_TRAINED_MODEL', 'ADMITTED_RECORD', 'AREAL_GEOMETRY'],
    ifMistaken: 'It projects a computation over a release rather than the release, so it never testifies — and a region with no admitted record renders void, which is the correct answer and reads like an empty one.',
  },
  {
    id: 'LEGACY_BACKFILL',
    what: 'Trade archives as the historical layer, adversarially audited at creation and conserving.',
    module: 'src/domain/legacyTrade.ts',
    needs: ['ARCHIVE_HOLDER', 'HISTORICAL_DEPTH'],
    ifMistaken: 'Every claim there is about what a backfill would be worth, not about one that happened.',
  },
  {
    id: 'ADJUDICABLE_DISAGREEMENT',
    what: 'Two independent accounts of one quantity, tested against each other and given a three-valued verdict.',
    module: 'src/domain/spatialKey.ts',
    needs: ['INDEPENDENT_ACCOUNTS', 'COMPARABLE_ACCOUNTS'],
    ifMistaken: 'The corpus has the pair and not the bounds. The verdict it can reach today is NOT_ASSESSABLE, which is an honest answer and not a weak version of agreement.',
  },
  {
    id: 'NAMED_AS_OF_QUESTION',
    what: 'An as-of answer that names which question it answers and which clock bounded it, and refuses the question it cannot answer.',
    module: 'src/domain/corpus.ts',
    needs: ['BOTH_CLOCKS', 'THE_SERVING_BOUNDARY'],
    ifMistaken: 'It refuses the source question rather than answering it. That refusal is the feature: this corpus carries no source clock, so the only honest answer to "what had the source published by then" is that it cannot be bounded here.',
  },
  {
    id: 'SOURCE_TIME_AS_OF',
    what: 'Answering what the source had published by an instant, bounded by the source\u2019s own clock.',
    module: 'src/domain/referenceGround.ts',
    needs: ['DECLARED_SOURCE_TIME'],
    ifMistaken: 'Inferring a source time from the gap between the other two clocks would make the answer up. The clock is declared by the source or the question stays refused.',
  },
  {
    id: 'CONDITIONAL_CUSTODY',
    what: 'A collateral deposit held and released against an adjudicated fact: the documentary credit with receipts in place of documents.',
    module: 'src/domain/collateralVehicle.ts',
    needs: ['ADMITTED_RECORD', 'AN_ADMISSION_AUTHORITY', 'MULTI_CHANNEL_EVENT', 'LIVE_SOURCE'],
    ifMistaken: 'The adjudication runs today and every decision it reaches is stamped DEMONSTRATION, because money must not move on a fixture. The condition also needs a second channel: one channel that also benefits from the release is the adversarial-oracle case with extra steps.',
  },
  {
    id: 'PRICED_HOLD_WINDOW',
    what: 'Holding a deposit past the window in which the facts behind it are likely to be restated.',
    module: 'src/domain/collateralVehicle.ts',
    needs: ['A_DENOMINATOR'],
    ifMistaken: 'The window is measured, not estimated: two restatements over twenty-one records, the longest arriving eighteen days later. That is an anecdote and the module refuses to make it a rate.',
  },
  {
    id: 'RAIL_TO_GATE',
    what: 'A normalized rail candidate becoming admission candidates the gate can rule on.',
    module: 'src/domain/candidateProjection.ts',
    needs: ['IDENTITY_RESOLUTION', 'ESTABLISHED_WORLD_TIME'],
    ifMistaken: 'The projection runs today and produces candidates the gate refuses — on SUBJECT_IDENTIFIED and BOTH_CLOCKS, and on nothing the projection invented. That is the hop working and the two stages behind it being absent, which is a different thing from the hop being broken.',
  },
  {
    id: 'RESPONSE_PIPELINE',
    what: 'What leaves and why: five stages in refusal order, with a receipt over the run.',
    module: 'src/domain/responsePipeline.ts',
    needs: ['THE_SERVING_BOUNDARY', 'THE_ADMISSION_GATE', 'A_RECORD_STORE'],
    ifMistaken: 'The pipeline runs and refuses correctly. What it has to serve is a demonstration corpus, which it will not serve as corpus state.',
  },
  {
    id: 'ADMISSION',
    what: 'A candidate put through the gate and admitted, with an ancestry entry outside the release.',
    module: 'src/domain/admission.ts',
    needs: ['THE_ADMISSION_GATE', 'AN_ADMISSION_AUTHORITY', 'LIVE_SOURCE'],
    ifMistaken: 'The gate exists; the act does not. A built gate is not a crossed one.',
  },
];

/* ── The fit, derived rather than asserted ── */

export type Fit = 'RUNS_TODAY' | 'ONE_THING_AWAY' | 'SEVERAL_THINGS_AWAY';

export interface CapabilityFit {
  capability: Capability;
  fit: Fit;
  unmet: readonly Precondition[];
  because: string;
}

/** Pure: what a capability is waiting on, with the corpus deciding every precondition it can. */
export function fitOf(capability: Capability, corpus: Corpus): CapabilityFit {
  const unmet = capability.needs
    .map(preconditionOf)
    .filter((precondition) => !(precondition.probe ? precondition.probe(corpus) : precondition.met));
  const fit: Fit = unmet.length === 0 ? 'RUNS_TODAY' : unmet.length === 1 ? 'ONE_THING_AWAY' : 'SEVERAL_THINGS_AWAY';
  const because =
    unmet.length === 0
      ? `Every precondition is met, so this runs on what the repository holds. ${capability.ifMistaken}`
      : `Waiting on ${unmet.length === 1 ? 'one thing' : `${unmet.length} things`}: ${unmet.map((p) => p.what.replace(/\.$/, '')).join('; ')}. ${capability.ifMistaken}`;
  return { capability, fit, unmet, because };
}

export interface AccommodationStanding {
  runsToday: number;
  oneThingAway: number;
  severalThingsAway: number;
  /** Unmet preconditions grouped by what kind of thing they are. */
  gapShape: Record<PreconditionKind, number>;
  /** The unmet precondition blocking the most capabilities, which is the one worth buying first. */
  widest: { id: PreconditionId; blocks: number } | null;
  statement: string;
}

/** Pure: the shape of the gap between what is described and what runs. */
export function accommodationStanding(corpus: Corpus): AccommodationStanding {
  const fits = CAPABILITIES.map((capability) => fitOf(capability, corpus));
  const gapShape: Record<PreconditionKind, number> = {
    CORPUS_CONTENT: 0, RIGHTS: 0, INFRASTRUCTURE: 0, A_METHOD: 0, AN_ADJUDICATION: 0,
  };
  const blocks = new Map<PreconditionId, number>();
  for (const fit of fits) {
    for (const precondition of fit.unmet) blocks.set(precondition.id, (blocks.get(precondition.id) ?? 0) + 1);
  }
  for (const id of blocks.keys()) gapShape[preconditionOf(id).kind] += 1;
  const ranked = [...blocks.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const widest = ranked.length ? { id: ranked[0][0], blocks: ranked[0][1] } : null;
  const runsToday = fits.filter((f) => f.fit === 'RUNS_TODAY').length;
  const oneThingAway = fits.filter((f) => f.fit === 'ONE_THING_AWAY').length;
  const severalThingsAway = fits.filter((f) => f.fit === 'SEVERAL_THINGS_AWAY').length;
  return {
    runsToday, oneThingAway, severalThingsAway, gapShape, widest,
    statement: widest
      ? `${runsToday} of ${CAPABILITIES.length} capabilities run on what the repository holds; ${oneThingAway} wait on one thing and ${severalThingsAway} on several. The single precondition blocking the most of them is ${widest.id}, which ${widest.blocks} of them wait on — so the gap is narrower than the module count suggests, and one acquisition moves more of it than any amount of building.`
      : `All ${CAPABILITIES.length} capabilities run on what the repository holds, which would be a surprising thing for this module to report and is worth checking before believing.`,
  };
}

/* ── What the additions cost the parts that already existed ── */

export interface Pressure {
  on: string;
  from: string;
  obligation: string;
  /** Whether the existing system absorbs it without change. */
  absorbed: boolean;
  cost: string;
}

export const PRESSURE: readonly Pressure[] = [
  {
    on: 'Every caller of an as-of answer',
    from: 'The third clock: source time, distinct from acquisition and knowledge time.',
    obligation: 'A caller must name which as-of question it is asking, because *what the source knew by D* and *what this system held at K* are different questions with different answers.',
    absorbed: true,
    cost: 'This was the one addition that changed existing callers rather than adding beside them, and the debt has been paid rather than noted. AsOfQuery carries a required question with no default, so the compiler named every caller that owed one; the HTTP route and the MCP tool refuse an unnamed or unknown question instead of guessing; every answer states the clock it was bounded by; and the source question is refused outright, because no record here carries a source clock and answering it on knowledge time is exactly the fabrication the third clock exists to prevent.',
  },
  {
    on: 'The record schema',
    from: 'Constraints as observations with provenance.',
    obligation: 'A constraint is a belief someone declared, so it needs a source, a clock and a strength like any other observation.',
    absorbed: false,
    cost: 'There is no slot for it. A constraint declared in a module is not a constraint the corpus carries, and the two must not be confused when the solver arrives.',
  },
  {
    on: 'Anything exported',
    from: 'OpenUSD as a scene target.',
    obligation: 'Composition resolves opinions silently. A corpus that preserves disagreement cannot survive a round trip through a format that settles it.',
    absorbed: true,
    cost: 'Absorbed because the direction is fixed at the type level: a target, never a store, and nothing reads back.',
  },
  {
    on: 'The globe and any future viewer',
    from: 'The manifold tier below the corpus.',
    obligation: 'A region with no admitted record renders void, and void must not read as empty.',
    absorbed: true,
    cost: 'Absorbed because the tier is declared as projecting a computation rather than the release, so it never testifies and is never mistaken for the corpus.',
  },
  {
    on: 'Corroboration anywhere in the system',
    from: 'The independence rule arriving in three places at once — closure, positions, invariant scoring.',
    obligation: 'Agreement is counted over declared independent groups, never over records or sources, because counting sources counts republications.',
    absorbed: true,
    cost: 'Absorbed, and it is the strongest thing the additions produced: one rule that three unrelated modules reached independently is a rule rather than a preference.',
  },
  {
    on: 'The estates',
    from: 'The serving boundary and the reasoning witness.',
    obligation: 'Calibration, identity decisions, source reliability and the surprise tape are refused before rights are read, so no contract can buy them.',
    absorbed: true,
    cost: 'Absorbed because it is a type rather than a policy: the refusal happens at a stage no licence reaches.',
  },
  {
    on: 'The verification tiers',
    from: 'Everything above.',
    obligation: 'None of the additions raises a tier. Two of six are reached, and describing a capability does not verify it.',
    absorbed: true,
    cost: 'Absorbed by saying so plainly, which is the only honest accommodation available.',
  },
];

/** What the arrangement shows, stated once so a reader does not have to derive it. */
export const THE_FINDING = {
  theSeedIsAlreadyHere: 'The corpus contains exactly one independently corroborated quantity: lot 5B-221’s gross weight, claimed by a draft survey and by a terminal weighbridge. The estimation layer is not waiting on the idea of disagreement — one instance of it is already committed.',
  andItCannotBeAdjudicated: 'That pair is not assessable, because the draft survey states no bound. So the missing thing is more precise than "a second account": it is a second account that stated its own uncertainty. A source that declines to bound itself contributes a number and no test.',
  narrowness: 'Almost every other unmet precondition is corpus content and a variation on the same theme — a position observed twice, an event placed by two channels, an account with a bound. The system is one kind of thing away, many times over, not many things away once.',
  order: 'That makes the acquisition order the whole roadmap, and it puts stated uncertainty at the top of the specification for any source worth connecting. Building more description moves nothing.',
  whatGotPaid: 'The third clock\u2019s debt was the one addition that fell on existing callers, and it is paid: the as-of query requires its question, the compiler found every caller that owed one, both public surfaces refuse an unnamed question, and the question this corpus cannot answer is refused rather than served on the wrong clock. What remains owed is the record-schema slot a constraint needs.',
  theOneThingBuildingCannotDo: 'An admission authority is a person accepting responsibility for a ruling. No module produces one, and the gate is built and waiting on it.',
} as const;
