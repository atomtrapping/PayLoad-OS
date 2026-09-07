/**
 * What space is for.
 *
 * Everything spatial in this repository until now was a surface: the Earth
 * Twin, the projection compiler's geodetic view, the Spatial Inquiry plan and
 * graph. They show space. None of them derived anything from it. That is the
 * gap this module names and then starts closing: space is not a display
 * attribute, it is the one dimension that runs through every product line, and
 * it can do four jobs the corpus currently asks other machinery to do badly or
 * not at all.
 *
 * It is the resolver: two things at one place, within what the evidence can
 * separate, are a candidate for being one thing, and — far more often and far
 * more cheaply — two things demonstrably apart are refuted without any name
 * matching at all. It is the join key: a cell identifier lets a flow and a
 * parcel meet with no shared identifier between them. It is a validity clock:
 * a boundary is a claim with two times like any other, and almost nobody
 * versions geometry. It is an inference engine: a scene is a source and a
 * detector is an extraction adapter, so imagery enters as candidate
 * observations under the same admission gate as everything else.
 *
 * The first is now partly built (./spatialKey). The rest are stated here with
 * what each actually needs, ranked by what they would be worth, so the order is
 * a decision rather than an accident.
 *
 * The discipline underneath all of it: buy the commodity, own the provenance.
 * PostGIS, S2, H3 and STAC are somebody else's product. The receipted
 * resolution bound, the refusal where the evidence is silent, and the recorded
 * judgment where two boundaries disagree — those are the firm's.
 */
import { AREAL_GEOMETRY, CELL_SCHEME } from './spatialKey';

/* ── The four jobs, and the one that is already built ── */

export type SpatialRoleState = 'BUILT' | 'PARTIAL' | 'ABSENT';

export const SPATIAL_ROLE_STATE_LABEL: Record<SpatialRoleState, string> = {
  BUILT: 'Built',
  PARTIAL: 'Partly built, with the missing half named',
  ABSENT: 'Absent',
};

export interface SpatialRole {
  id: 'DISPLAY' | 'IDENTITY' | 'JOIN_KEY' | 'VALIDITY_CLOCK' | 'INFERENCE' | 'TASKING';
  title: string;
  /** Space doing this job, in one line. */
  job: string;
  state: SpatialRoleState;
  /** What exists here, checkable against the code. */
  here: string;
  /** What is not there yet, when the state is not BUILT. */
  missing?: string;
}

export const SPATIAL_ROLES: readonly SpatialRole[] = [
  {
    id: 'DISPLAY',
    title: 'Space as a picture',
    job: 'Draw what is already known at a place, so a person can look at it.',
    state: 'BUILT',
    here: 'The Earth Twin draws one point per declared position with its stated uncertainty as a ring; the projection compiler resolves positions under rights, visibility and both clocks; Spatial Inquiry draws a floor plan and its access graph. This is the easy half and it is finished.',
    missing: 'Nothing, and that is the finding: the display was built first and on its own it derives nothing. It is the windshield, not the engine.',
  },
  {
    id: 'IDENTITY',
    title: 'Space as the resolver',
    job: 'Decide, from measured geometry rather than from matching names, whether two records are about the same thing.',
    state: 'PARTIAL',
    here: 'Two positions are now compared metrically: the geodesic on the WGS84 ellipsoid against their combined stated uncertainty, yielding a refutation, a candidate, or an explicit refusal to put the question. Geometry can already refute an identity claim here, and the Earth Twin asks the same test of one subject’s own declarations.',
    missing: 'Confirmation. An OVERLAPPING pair is a candidate and stops there, because no resolution decision object exists to carry two identifiers to one subject with evidence, method, version and both clocks. Containment and adjacency — the strong geometric joins — need areal geometry the corpus does not carry.',
  },
  {
    id: 'JOIN_KEY',
    title: 'Space as the meeting point',
    job: 'Let two records with no shared identifier meet, at a stated resolution, without bespoke geometry glue in every query.',
    state: 'PARTIAL',
    here: `A cell key is computed for every position that states its uncertainty, at the finest resolution that uncertainty supports and no finer, using ${CELL_SCHEME.id} so that another party computes the same key. Two keys block at the coarser of their two resolutions.`,
    missing: 'A second line with records. The key is line-agnostic by construction, but Tradewind and Landshark hold nothing to join to, so the cross-line join remains a claim about a key rather than a demonstrated answer.',
  },
  {
    id: 'VALIDITY_CLOCK',
    title: 'Space as a thing that was true then',
    job: 'Answer where a boundary ran, or where a thing was, as of a stated moment — in both valid time and knowledge time.',
    state: 'PARTIAL',
    here: 'A position is a record like any other: it carries validity bounds, a separate knowledge time, supersession and retraction, and the as-of query already clamps it to the release cutoff. Point geometry is fully bitemporal today.',
    missing: 'Versioned boundaries, because no boundary exists. A zoning line, a flood zone, a berth or a parcel edge is revised on a date and relied upon before the revision; answering what the map said when the decision was made needs the polygon inside the same supersession machinery, and almost no spatial system does that.',
  },
  {
    id: 'INFERENCE',
    title: 'Space as an observation source',
    job: 'Derive new candidate facts from imagery over a place: what changed, how much of it is there, whether it is being used.',
    state: 'ABSENT',
    here: 'The shape is already declared — extraction is an interface, so a detector over a scene is an adapter whose output is a candidate observation with its method identity, parameters and provenance, admitted or refused like any other candidate. Nothing implements it: no scene is acquired, no detector runs, no imagery source is registered.',
    missing: 'A registered imagery source with its rights, a scene addressed by content digest in the evidence rail, and a detector adapter whose confidence is a stated parameter rather than a score with no semantics.',
  },
  {
    id: 'TASKING',
    title: 'Space as a purchase decision',
    job: 'Decide which observation to buy over which place, from the value of what it would resolve rather than from a schedule.',
    state: 'PARTIAL',
    here: 'The instrument economics already exist and are already spatial: the measurement instruments carry ground resolution, latency, unit cost, detection sensitivity and false-alarm rate, from free radar and optical constellations up to sub-metre tasked passes, and the optimizer chooses among them by value of information.',
    missing: 'A site to task and an indicator to watch. The optimizer prices instruments against a milestone; pointing it at a place requires a watchlist of positions or footprints, an indicator defined over them, and a prior worth updating.',
  },
];

/* ── The derivations, ranked by what they would be worth ── */

export type DerivationState = 'PARTIAL' | 'ABSENT';

export interface SpatialDerivation {
  id: 'FLOW_GEOMETRY' | 'CHANGE_DETECTION' | 'SPATIAL_AGGREGATION' | 'VERSIONED_BOUNDARIES' | 'MOVEMENT_SIGNATURE';
  rank: number;
  title: string;
  /** The derived thing, said as a sentence a customer would pay for. */
  what: string;
  /** Why this firm and not a point vendor. The answer is never "better data". */
  whyHere: string;
  state: DerivationState;
  here: string;
  /** Exactly what has to exist. */
  needs: readonly string[];
  /** The mistake this derivation invites. */
  hazard: string;
}

export const SPATIAL_DERIVATIONS: readonly SpatialDerivation[] = [
  {
    id: 'FLOW_GEOMETRY',
    rank: 1,
    title: 'Flow through geometry',
    what: 'A movement resolved to a facility, the facility resolved to the parcel it sits on, and the parcel’s own events attached — one sentence crossing three lines, every step of it a spatial predicate.',
    whyHere: 'The flow vendors stop at “the vessel visited the port”; the parcel vendors stop at “the parcel exists”. Neither can write the joined sentence, because neither holds the other half and the join is not a data purchase — it is a resolution decision with evidence behind it. Geometry is the conjunction.',
    state: 'ABSENT',
    here: 'One line has records. The cell key that would carry a flow and a parcel to the same block is computed; there is nothing on the other side of the join.',
    needs: [
      'A resolution decision object, so a facility identifier and a parcel identifier are carried to one subject by evidence rather than by a shared cell.',
      'Areal geometry, so “sits on” is containment against a boundary and not proximity between two points.',
      'A second line with admitted records: a berth or facility footprint on one side, a parcel on the other.',
    ],
    hazard: 'Every step is a spatial predicate, and a chain of predicates each true at its own tolerance is not true at the tolerance of the tightest one. The joined sentence must carry the loosest uncertainty in the chain, not the tightest.',
  },
  {
    id: 'CHANGE_DETECTION',
    rank: 2,
    title: 'Change over a place, as a candidate observation',
    what: 'Construction stage, stockpile volume, railcar count, yard utilization — derived from imagery over a watched site and entering the corpus as candidates with their sensor, model, scene and confidence.',
    whyHere: 'The doctrine already handles it without a new concept: a detector is an extraction adapter, its output is a candidate observation, and admission is the same gate. A vendor selling detections sells the answer; this sells the answer with the scene it came from and the option to disagree with it.',
    state: 'ABSENT',
    here: 'No imagery source is registered, no scene is acquired, no detector exists. The instruments that would supply the scenes are priced but not connected.',
    needs: [
      'An imagery source registered with its rights, because redistribution and tasking terms for commercial imagery are strict and the rights index is load-bearing here more than anywhere.',
      'A scene in the evidence rail addressed by content digest, so a detection points at the exact bytes it was computed from.',
      'A detector adapter declaring its model, version and parameters, whose confidence has stated semantics rather than being a number between zero and one.',
    ],
    hazard: 'A detection is an assertion by a model, and a model is an interested party. Recording it as an observation with its producer is the difference between a corpus and a feed of guesses.',
  },
  {
    id: 'SPATIAL_AGGREGATION',
    rank: 3,
    title: 'One receipted spatial join, reused by all three lines',
    what: 'What is inside, around or connected to a place: exposure of a portfolio to a zone, capacity along a corridor, suppliers within a radius of a hazard. Every product question is a spatial aggregate wearing a domain’s clothes.',
    whyHere: 'Because it argues for one primitive rather than three. If each line builds its own spatial join, the firm pays three times and still cannot answer across them; one receipted join over one cell key is the same work done once.',
    state: 'PARTIAL',
    here: 'The cell key exists and is line-agnostic. The aggregate over it does not: nothing takes a set of keys and returns what falls inside a region with a receipt for the operation.',
    needs: [
      'A region as a first-class object — a set of cells, or a boundary once areal geometry exists — with the resolution it is stated at.',
      'An aggregation that answers with its own receipt: the release, the cell resolution, the records considered and the records withheld by rights or visibility.',
    ],
    hazard: 'An aggregate hides its refusals. A count of what is inside a region is meaningless without the count of what was excluded because its position was never keyable, and reporting the first without the second reads as coverage the corpus does not have.',
  },
  {
    id: 'VERSIONED_BOUNDARIES',
    rank: 4,
    title: 'What the map said at the time',
    what: 'An as-of answer for geometry: the flood zone, the zoning line or the berth layout as it stood on the date a decision relied on it, not as it stands now.',
    whyHere: 'Every other bitemporal thing in this corpus is already versioned; geometry is the one class of claim the industry treats as a current-state overwrite. Folding polygons into the same supersession machinery costs little here and is a genuine differentiator, because the maps that matter commercially are revised periodically and relied upon between revisions.',
    state: 'PARTIAL',
    here: 'Positions are already fully bitemporal and already supersede and retract. Boundaries are not, because the record contract admits points only.',
    needs: [
      'Areal geometry on the record contract, with its datum, its scale and its own positional uncertainty.',
      'A boundary source registered with its revision cadence, so a revision is a correction with a knowledge time rather than a silent replacement.',
    ],
    hazard: 'A revised boundary is a correction, so every ruling that relied on the old one is downstream of a retraction. Versioning geometry without wiring it to the retraction ledger produces an honest history and a dishonest set of conclusions.',
  },
  {
    id: 'MOVEMENT_SIGNATURE',
    rank: 5,
    title: 'Behaviour from trajectories',
    what: 'Patterns over repeated positions: a route flown regularly, a stop that is not a scheduled stop, a throughput signature at a gate.',
    whyHere: 'The positions arrive anyway as a by-product of the flow line, so the signal is free once the key exists. It is ranked last because it is the most inferential and the easiest to over-claim.',
    state: 'ABSENT',
    here: 'Positions of one subject over time are a trajectory rather than an identity question, and are deliberately not compared for co-location. Nothing computes a pattern over them.',
    needs: [
      'Enough positions per subject to make a pattern rather than a coincidence, which the demonstration corpus does not have.',
      'A stated null model, so that “irregular” means irregular against something written down.',
    ],
    hazard: 'A mined pattern is a candidate, never an admitted fact, and a behavioural inference about an identified party is the point where a corpus stops being a record and starts being an accusation.',
  },
];

/* ── Where each capability lives here ── */

export interface SpatialCapability {
  capability: string;
  /** The module or surface that carries it, by path. */
  component: string;
  state: SpatialRoleState;
  note: string;
}

export const SPATIAL_CAPABILITIES: readonly SpatialCapability[] = [
  { capability: 'Datum, frame and transform discipline', component: 'src/domain/observationReplay.ts, /compute/observations', state: 'PARTIAL', note: 'Frames, calibrations and transforms are modelled for recorded observations with their validity windows. They are not corpus objects, so a position cannot yet cite the transform that produced it.' },
  { capability: 'Cell key and blocking', component: 'src/domain/spatialKey.ts', state: 'BUILT', note: 'Resolution bounded by stated uncertainty; a position with none is refused rather than defaulted.' },
  { capability: 'Geometric verdict between two positions', component: 'src/domain/spatialKey.ts compareSubjects', state: 'BUILT', note: 'One metric — the WGS84 ellipsoidal geodesic, by Vincenty’s inverse solution, refusing where it does not converge — and one three-valued vocabulary, shared with the twin’s reading of a subject’s own declarations.' },
  { capability: 'Areal geometry: containment, adjacency, overlap', component: 'CorpusRecord.geometry', state: 'ABSENT', note: AREAL_GEOMETRY.why },
  { capability: 'Scene and detector as a source', component: 'The extraction interface and the acquisition rail', state: 'ABSENT', note: 'The interface admits a vision model as an adapter; no imagery source is registered and no scene is acquired.' },
  { capability: 'Tasking economics over instruments', component: 'src/domain/n11MeasurementEconomy.ts', state: 'PARTIAL', note: 'Instruments carry ground resolution, latency, cost, sensitivity and false-alarm rate and are chosen by value of information. No site or indicator exists to point them at.' },
  { capability: 'Display and inspection', component: 'src/domain/earth.ts, src/projection/compile.ts, /spatial', state: 'BUILT', note: 'Positions drawn under rights, visibility and both clocks, with refusals shown rather than gaps left.' },
];

/* ── The discipline ── */

export const SPATIAL_DISCIPLINE = {
  buyTheCommodity: CELL_SCHEME.notBuiltHere,
  uncertaintyCutsBothWays: 'Geometry is evidence, and evidence has error. A satellite fix, a digitized line and a datum shift are each metres, and a containment computed to the millimetre against a line drawn at 1:25 000 reports the arithmetic’s precision as the answer’s. Where two boundaries disagree, the reconciliation is a recorded human judgment — which is exactly where the estate accumulates.',
  rightsBiteHardest: 'Imagery is the class where source rights are strictest: tasking, redistribution and derived-product terms are all separately constrained. Every spatial derivation above that touches imagery is gated by the rights index, not by capability.',
  displayIsNotDerivation: 'A globe is not an inference. Nothing drawn on a map becomes a fact by being drawn there, and no graph layout or model geometry becomes a geographic position without an explicit transform and evidence for that interpretation.',
} as const;

/** The order these earn their place, from what each one presupposes. */
export const SPATIAL_SEQUENCE: readonly string[] = [
  'The cell key first, because every other derivation presupposes it and it is the only one that needs no new source. Done: a key bounded by stated uncertainty, and a verdict that refuses rather than guesses.',
  'Areal geometry next, because containment is the strong join and four of the five derivations wait on it. It is a change to the record contract and a registered boundary source, not a database.',
  'The resolution decision object, so that an OVERLAPPING pair can become one subject with evidence behind it and be undone without rewriting history. This is shared with the identity core and is not a spatial problem.',
  'Then the flow-through-geometry demonstration over one place and one week, end to end with digests, because it is the strongest single proof of the cross-line thesis and it is a demonstration rather than a product.',
  'Imagery last of the sources, because its rights are the strictest and its value depends on everything above it being in place.',
];
