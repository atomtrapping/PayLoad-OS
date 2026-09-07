/**
 * The vessel is not a fifth source. It is the state the other four were
 * defined around.
 *
 * Meteorology drives it, satellite and ranging see it, dispatch commands it —
 * and until now the state space had no object at that centre. Adding it closes
 * the loop rather than widening it: a moving belief with an identity, observed
 * by heterogeneous channels, driven by exogenous forcing, and constrained by
 * physics, by law and by contract.
 *
 * Two things in this module are unusual enough to be the point.
 *
 * Dispatch is a prior, not an observation. A declared destination is an
 * intention, and in shipping it is a famously strategic one. The divergence
 * between declared and tracked is therefore signal rather than error, and it is
 * held as a disagreement between two beliefs instead of being adjudicated on
 * arrival.
 *
 * And the metric that matters is not the position. Position is the one thing
 * the aggregators already sell. What no single-channel holder can produce is the
 * closure residual: the disagreement between five families about one physical
 * event — which channel led, which lagged, which lied — which is at once the
 * calibration estate, the parametric event clock and the signal layer.
 *
 * Nothing here ingests a feed, holds a vessel, or computes a track. No AIS, no
 * SAR, no port-call record and no charter is acquired. This is the type the
 * estate will be written in, declared before the first position arrives.
 */
import { CLOSURE_METHOD, CLOSURE_METRIC } from './eventClosure';
import { IDENTIFIER_FAMILIES } from './identity';
import type { Hardness } from './constraints';
import type { Corpus } from './corpus';

/* ── The state ── */

export interface StateComponent {
  id: 'POSITION' | 'COURSE_SPEED' | 'HEADING' | 'DRAFT' | 'SET_AND_DRIFT';
  what: string;
  /** Why it is state rather than a reading to be stored. */
  why: string;
  /** Whether the corpus can carry it today. */
  carried: boolean;
  here: string;
}

export const VESSEL_STATE: readonly StateComponent[] = [
  { id: 'POSITION', what: 'Where the hull is, on a declared datum, with its own stated uncertainty.', why: 'The only component any source reports directly, and the one every join is computed from.', carried: true, here: 'The record contract already carries a geodetic position with a stated horizontal uncertainty, and the cell key already keys one. No vessel declares one.' },
  { id: 'COURSE_SPEED', what: 'Course over ground and speed over ground, as an estimated pair rather than two readings.', why: 'Speed is the freight signal — slow steaming is a market statement — and it is only interpretable against the forcing that produced it.', carried: false, here: 'No predicate exists for either, and nothing relates two positions in time.' },
  { id: 'HEADING', what: 'Where the hull points, which is not where it moves.', why: 'The difference between heading and course is the crab angle, and it is the observable that carries the current.', carried: false, here: 'Absent. It is reported by the same self-report channel as position, so it arrives free with AIS and costs nothing extra to carry once one is acquired.' },
  { id: 'DRAFT', what: 'How deep the hull sits, as a belief with uncertainty.', why: 'A draft change at a berth is loading or discharge, which is the cargo event without a cargo document.', carried: false, here: 'Absent, and it is the component with the highest ratio of signal to acquisition cost.' },
  { id: 'SET_AND_DRIFT', what: 'The current the vessel is moving in, estimated from the state rather than looked up.', why: 'Treated as nuisance it becomes noise attributed to the vessel. Estimated as state it becomes a met-ocean product and it stops corrupting the speed signal.', carried: false, here: 'Absent. The meteorological forcing that would inform it is a contract with no source behind it.' },
];

/* ── The channels ── */

export type ChannelKind = 'OBSERVATION' | 'PRIOR';

export interface VesselChannel {
  id: 'AIS' | 'SAR' | 'OPTICAL' | 'PORT_CALL' | 'DISPATCH';
  title: string;
  kind: ChannelKind;
  /** What it actually fixes, which is rarely everything. */
  fixes: string;
  /** How it fails, because every fusion decision turns on this. */
  failureMode: string;
  here: string;
}

export const VESSEL_CHANNELS: readonly VesselChannel[] = [
  { id: 'AIS', title: 'AIS', kind: 'OBSERVATION', fixes: 'Position, course, speed, identity and declared draft, self-reported by the vessel.', failureMode: 'Sporadic, gappy out of range, and spoofable in both position and identity. It is a self-report, so its evidence class is the claimant’s, not a disinterested observer’s.', here: 'No AIS is acquired. The identity family already names IMO and MMSI as this line’s vessel identifiers and no record carries one.' },
  { id: 'SAR', title: 'Radar imagery', kind: 'OBSERVATION', fixes: 'Presence and position of a hull, independent of cloud and of daylight, and independent of what the vessel says about itself.', failureMode: 'Detects a hull without identifying it, and revisit cadence is sparse. Association to a named vessel is a resolution decision, not a detection.', here: 'No imagery source is registered.' },
  { id: 'OPTICAL', title: 'Optical imagery', kind: 'OBSERVATION', fixes: 'Identity features and condition in daylight and clear sky.', failureMode: 'Gated by cloud and by night, which is the meteorological gating rule: an absence here is explained, not missing.', here: 'No imagery source is registered.' },
  { id: 'PORT_CALL', title: 'Port-call and terminal records', kind: 'OBSERVATION', fixes: 'That a call happened, as the terminal or the authority recorded it.', failureMode: 'Latent, sometimes by days, and it shares an origin with the terminal’s own declarations — so it is not independent of the berth geometry those declarations describe.', here: 'Absent. The demonstration corpus does carry a port custody record as the source of one declared position, which is the shape this channel would take at scale.' },
  { id: 'DISPATCH', title: 'Dispatch, charter and declared destination', kind: 'PRIOR', fixes: 'Nothing. It states an intention about the future.', failureMode: 'Declared destinations are strategic. Treating intent as observation is the single most common error in this domain, and it turns a signal into a correction.', here: 'Absent, and typed here as a prior so that it cannot be ingested as a fix later by accident.' },
];

/* ── The constraints ── */

export interface VesselConstraint {
  family: 'PHYSICS' | 'LAW' | 'COMMERCIAL';
  statement: string;
  hardness: Hardness;
  note: string;
}

export const VESSEL_CONSTRAINTS: readonly VesselConstraint[] = [
  { family: 'PHYSICS', statement: 'Speed is bounded by the power curve for the hull and its loading.', hardness: 'STIFF_SOFT', note: 'A law with a residual: fouling, trim and sea state all move it, and a hard bound would absorb every one of them into the speed estimate.' },
  { family: 'PHYSICS', statement: 'Draft plus under-keel clearance does not exceed charted depth on the track.', hardness: 'STIFF_SOFT', note: 'Charted depth is itself a dated survey with its own vertical datum, which is where the datum trap arrives in this line.' },
  { family: 'LAW', statement: 'A traffic separation scheme is transited in its declared direction.', hardness: 'SOFT', note: 'Violated in practice and informative when it is; a hard version would delete the observation that matters.' },
  { family: 'LAW', statement: 'A sanctioned zone or an exclusive economic zone is a declared boundary with dates.', hardness: 'SOFT', note: 'The boundary is a versioned legal object with two clocks, and a crossing is a candidate event rather than a finding.' },
  { family: 'COMMERCIAL', statement: 'A charter states a speed band and a laycan window.', hardness: 'SOFT', note: 'A contract term, so it is a prior on behaviour and never a constraint on the world.' },
];

/* ── The five joins ── */

export interface VesselJoin {
  id: 'BERTH_GEOMETRY' | 'METEOROLOGY' | 'DISPATCH' | 'SATELLITE' | 'RANGING';
  with: string;
  /** The epistemic operation, which differs per join and is the reason to name them separately. */
  operation: string;
  yields: string;
  hazard: string;
}

export const VESSEL_JOINS: readonly VesselJoin[] = [
  {
    id: 'BERTH_GEOMETRY',
    with: 'Facility and berth geometry derived from imagery and ranging',
    operation: 'Containment and approach: occupancy of a berth polygon, proximity to a terminal, residence time in an anchorage.',
    yields: 'A port call constructed as a sequence — approach, occupancy, draft change, departure — each step an observation with provenance and the composite an event with a receipt naming which observations, at which instants, with what confidence.',
    hazard: 'The berth polygon is a boundary with a scale and a date, and containment computed against it is exact arithmetic over an inexact line. A call is a constructed event, never a measurement.',
  },
  {
    id: 'METEOROLOGY',
    with: 'The forcing field',
    operation: 'Forcing on the dynamics, gating on the observation model, and interpretation of the residual.',
    yields: 'A speed drop attributable to an adverse current rather than to the engine, and an optical gap attributable to cloud rather than to absence.',
    hazard: 'Without the forcing layer every weather effect is a false anomaly, and a change detector generates events at the rate the weather sets.',
  },
  {
    id: 'DISPATCH',
    with: 'Declared destination and charter intent',
    operation: 'Belief against belief. Intent is a prior over the trajectory, and the track is evidence about it.',
    yields: 'Divergence as signal: declared one port, tracked toward another, held as a disagreement with both sides intact rather than resolved on arrival.',
    hazard: 'Adjudicating the divergence immediately destroys the signal. The disagreement is the product; the resolution is a later, separate decision.',
  },
  {
    id: 'SATELLITE',
    with: 'Radar and optical imagery',
    operation: 'Two directions at once: imagery fixes the vessel, and a well-tracked vessel calibrates the imagery.',
    yields: 'A hull detected where the self-report says nothing is the dark-fleet signal; and vessels with long coherent tracks become reference points for image geolocation, which is the reference-channel pattern in miniature.',
    hazard: 'The second direction cannot feed the first. A vessel used to calibrate an image must not then be confirmed by that image, or the calibration becomes circular — the same firewall the reference channel already requires.',
  },
  {
    id: 'RANGING',
    with: 'Berth-level ranging at the quay',
    operation: 'The residual between a centimetric berth model and a metric track.',
    yields: 'The alongside state — approaching, moored, rafted — which is the finest-grained port event available, and the seam where a position receipt has to carry its own frame.',
    hazard: 'Two frames meeting at centimetres is exactly where an undeclared vertical or horizontal datum turns a real residual into a fabricated one.',
  },
];

/* ── The metric ── */

/**
 * The closure residual: the disagreement between the channels about one event.
 * This is the thing a single-channel holder structurally cannot produce, and
 * the reason the moat is not ingestion.
 *
 * The mechanism is implemented in ./eventClosure — position separation moved
 * from metres to seconds, keeping the same three-valued vocabulary, the same
 * refusal where a channel states no uncertainty, and dependency groups declared
 * rather than inferred. This states only what that residual is worth, which the
 * mechanism deliberately does not.
 */
export const CLOSURE_IS_THE_MEASUREMENT = {
  what: 'For one physical event — an arrival, say — each family closes its own belief at its own instant: berth containment, sea state permitting, declared arrival, imagery presence, draft change. The residual between those instants is the measurement, not any one channel’s instant.',
  computedBy: `${CLOSURE_METHOD}, over ${CLOSURE_METRIC}`,
  isThreeThings: [
    'The calibration estate: which family leads, which lags and which misreports, fitted over time and retained with its history.',
    'The event clock: the first channel to close sets the instant, and the others are corroboration and latency evidence rather than duplicates.',
    'The signal layer: dispersion across channels is a congestion and throughput indicator before any single channel confirms anything.',
  ],
  whyItIsTheMoat: 'Position is the one thing the aggregators already sell. The spread between five accounts of one event is not sellable by any holder of one account, and it is worth nothing on the first event and everything on the thousandth.',
  state: 'ABSENT' as const,
  here: 'The mechanism exists and nothing feeds it: no channel is acquired, so no event has ever been closed.',
} as const;

/* ── Identity, against an adversary ── */

export const ADVERSARIAL_IDENTITY = {
  problem: 'Self-reported identity can be switched, silenced or fabricated: a spoofed position, a dark period with the transponder off, a flag or a name changed between calls.',
  defence: 'A track history, a port-call record and cross-channel consistency are a vessel’s reputation, and a fabricated identity has none. The cost of faking a coherent longitudinal estate across five channels is the defence; a single-channel check is not.',
  moat: 'Not ingestion. No one out-ingests the position aggregators, and nobody needs to: the defensible asset is resolved, cross-channel, longitudinal identity, which a single-source holder structurally cannot produce.',
  requires: 'The resolution decision object, which is absent, and the identity estate it would accumulate into.',
} as const;

/* ── What exists ── */

export interface VesselStanding {
  vessels: number;
  channels: number;
  tracks: number;
  portCalls: number;
  /** The identifier family this line already declares for vessels. */
  declaredIdentifiers: readonly string[];
  statement: string;
}

/** Pure: nothing is held, and the identifiers that would name it are already declared. */
export function vesselStanding(corpus: Corpus): VesselStanding {
  const caravan = IDENTIFIER_FAMILIES.find((f) => f.domain === 'CARAVAN');
  const declared = (caravan?.identifiers ?? []).filter((i) => i.state === 'DECLARED').map((i) => i.id);
  // No record names a vessel subject, so the count is read rather than assumed.
  const vessels = new Set(corpus.records.filter((r) => r.subjectType === 'Vessel').map((r) => r.subjectId)).size;
  return {
    vessels,
    channels: 0,
    tracks: 0,
    portCalls: 0,
    declaredIdentifiers: declared,
    statement: `No vessel is held, no channel is acquired and no track exists. ${declared.join(' and ')} are already named as this line’s vessel identifiers and no record carries one, so the type is declared ahead of the first position rather than fitted around it.`,
  };
}

export const VESSEL_SEQUENCE: readonly string[] = [
  'The state type and the channel kinds first, because typing dispatch as a prior after the first feed arrives means unpicking every fix that was ingested as an observation.',
  'The five joins as named predicates next, each with its own epistemic operation, so a port call is constructed rather than asserted.',
  'The closure residual as the retained measurement, because its value is historical: it is worth nothing on the first event and everything on the thousandth.',
  'Feeds last, and they are purchasable. What is not purchasable is the estate they would accumulate into, which is the reason the type comes first.',
];
