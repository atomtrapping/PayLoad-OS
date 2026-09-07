/**
 * A port is not a place. It is a time-indexed set whose membership is
 * adjudicated, not observed.
 *
 * The move that makes the maritime layer estimable rather than trackable: stop
 * asking where a vessel is and start asking which vessels are in a port's
 * operational set at a stated instant — alongside, at berth, at anchorage, in
 * the approach, in the queue, or out. Every transition is a ruling with its
 * evidence and both clocks, and every object worth selling is set-level rather
 * than vessel-level: observed utilization, queue depth, turnaround
 * distribution, composition by operator, the draft-transition ledger, and the
 * arrival-against-departure balance that is flow conservation on the set.
 *
 * Three properties make it worth building this way rather than as a query over
 * dots.
 *
 * Membership is a ruling. Containment in a berth polygon at an instant is
 * ambiguous — approaching, manoeuvring, waiting — so a membership transition
 * carries an evidence class and a confidence, and a later observation
 * supersedes it rather than overwriting it. The correction machinery operates
 * on set membership like it operates on any other claim.
 *
 * Membership needs both clocks, and they differ by hours per channel. The port
 * state as of a knowledge instant is a different, reconstructable object from
 * the final state, and that difference is exactly what makes a set series
 * backtestable: what was knowable about queue depth before the rate moved is
 * only answerable if the adjudication stamped its own knowledge time.
 *
 * And the set is not the corpus. Occupancy, queue and composition are derived
 * aggregates over the membership ledger — rebuildable, versioned, digest-pinned
 * projections, exactly like every other projection here.
 *
 * The construction lifts: a corridor is a set of transits, a lane a set of
 * ports, the network a set of lanes. The port is the base case.
 *
 * Nothing here holds a port, a vessel or a membership. No feed is acquired.
 */
import { CLOSURE_LOSS } from './eventClosure';
import type { Corpus } from './corpus';

/* ── Membership ── */

/** Where a vessel stands with respect to a port's operational set. Closed. */
export type MembershipClass = 'ALONGSIDE' | 'AT_BERTH' | 'AT_ANCHORAGE' | 'IN_APPROACH' | 'IN_QUEUE' | 'OUT';

export const MEMBERSHIP_MEANING: Record<MembershipClass, string> = {
  ALONGSIDE: 'Made fast at a quay, which is the finest-grained call and the one ranging can settle where a track cannot.',
  AT_BERTH: 'Inside a berth’s declared extent and stationary enough to be working, which containment alone does not establish.',
  AT_ANCHORAGE: 'Holding position in a declared anchorage, which is the queue in physical form.',
  IN_APPROACH: 'Inside the port’s approach and closing, which is not yet an arrival and is regularly mistaken for one.',
  IN_QUEUE: 'Waiting for a berth by the port’s own ordering, which is a commercial fact and not a geometric one.',
  OUT: 'Not in the operational set. Departure is a ruling too, and a premature one shortens every turnaround it touches.',
};

export const MEMBERSHIP_IS_A_RULING = {
  claim: 'A membership transition is adjudicated, not measured. Containment at an instant is ambiguous, so the transition carries an evidence class, a confidence and the observations that decided it.',
  supersession: 'A later observation supersedes a membership call rather than overwriting it. A vessel adjudicated at berth and later shown to have been anchored inside the berth zone is a correction on the set, and every aggregate computed under the old call is downstream of it.',
  bothClocks: 'Valid time is when the vessel was actually in the set; knowledge time is when the observations allowed the system to say so. They differ by hours, systematically and differently per channel, which is why an as-of port state is a distinct object from the final one.',
  backtestable: 'That distinction is the whole reason a set series can be backtested. What was knowable about queue depth before a rate moved is answerable only if the adjudication stamped its own knowledge time at the moment it was made.',
  state: 'ABSENT' as const,
} as const;

/* ── The set-level objects ── */

export interface SetObject {
  id: 'BERTH_OCCUPANCY' | 'QUEUE_DEPTH' | 'TURNAROUND' | 'COMPOSITION' | 'DRAFT_TRANSITIONS' | 'FLOW_BALANCE';
  title: string;
  what: string;
  /** What it prices, said as the thing a customer would pay for. */
  prices: string;
  /** How the estimator reads it, since every one of these is a series. */
  asAState: string;
}

export const SET_OBJECTS: readonly SetObject[] = [
  { id: 'BERTH_OCCUPANCY', title: 'Berth occupancy sequence', what: 'Per-berth membership over time.', prices: 'The port’s real capacity: observed utilization rather than nameplate or declared capacity.', asAState: 'A state with dynamics, bounded above by the berth count, and a constraint family of its own.' },
  { id: 'QUEUE_DEPTH', title: 'Queue depth series', what: 'The size of the anchorage and waiting set over time.', prices: 'Congestion before it shows in waiting times, which is the leading indicator rather than the lagging one.', asAState: 'A driven process: weather, demand and labour are its forcing, and its innovation spectrum separates scheduled congestion from capacity erosion from an event.' },
  { id: 'TURNAROUND', title: 'Turnaround distribution', what: 'Arrival-to-departure intervals per class of call.', prices: 'The port’s operational state, where slow degradation is the early sign of a labour action, a weather regime or a demand shift.', asAState: 'A distribution with a regime, so the object of interest is the regime change rather than the mean.' },
  { id: 'COMPOSITION', title: 'Composition by identity', what: 'Which operators and carriers hold the set.', prices: 'Share shifts: reallocation visible before it is announced.', asAState: 'A categorical series whose changes are only as trustworthy as the identity resolution beneath them, which is absent.' },
  { id: 'DRAFT_TRANSITIONS', title: 'Draft-transition ledger', what: 'Loading and discharge inferred from draft change while in the set.', prices: 'Throughput without a customs document, which is the statistic nobody publishes.', asAState: 'An event series over a state component the corpus cannot yet carry, so it is the highest-value component to add.' },
  { id: 'FLOW_BALANCE', title: 'Arrivals against departures', what: 'The balance of entries and exits over the set.', prices: 'Consistency of the whole picture, and the residual when it fails to close.', asAState: 'Flow conservation on the set — the constraint stack’s first live application, stiff-soft because vessels leave observation as well as leaving port.' },
];

export const SETS_ARE_PROJECTIONS = {
  rule: 'The set objects are derived aggregates over the membership ledger, not stored state. They are rebuildable from the rulings, versioned with the release, and digest-pinned like every other projection.',
  because: 'A membership correction has to move every aggregate that depended on it. If occupancy were stored rather than derived, a superseded ruling would leave a series that no longer follows from anything.',
} as const;

/* ── The joins, as set intersections in time ── */

export interface SetJoin {
  id: 'WEATHER' | 'IMAGERY' | 'DISPATCH' | 'DOCUMENTS' | 'PORT_PAIR';
  with: string;
  yields: string;
  hazard: string;
}

export const SET_JOINS: readonly SetJoin[] = [
  { id: 'WEATHER', with: 'The forcing field at the same instants', yields: 'Downtime separated into attributed and unexplained: occupancy under storm conditions, wind-day closures, and the gating that makes an absence explained rather than missing.', hazard: 'Attributed downtime is an insurance and a claim question, so the attribution must be evidence-bearing rather than a plausible pairing of two series.' },
  { id: 'IMAGERY', with: 'Each scene’s detections at the scene’s own instant', yields: 'Two residuals: hulls present in imagery and absent from the set, which is the off-transponder economy; and set members not imaged, which is coverage accounting.', hazard: 'The second residual is the one that must render void as void. A member not imaged is not an absence of the vessel, and a coverage gap reported as a finding is the fabrication this system exists to refuse.' },
  { id: 'DISPATCH', with: 'The declared-intent set at the same instants', yields: 'Declared arrival against adjudicated arrival, at fleet scale: a reliability metric for a carrier or a shipper rather than for one voyage.', hazard: 'It is a belief against a belief. Scoring a carrier on divergence assumes the adjudication is right, and the adjudication has its own confidence.' },
  { id: 'DOCUMENTS', with: 'Filings, permits and labour events over the same period', yields: 'Disruption attribution: a stand-down or an action set against the set’s own dynamics. This is the cross-line join in one operation, because it needs a document corpus and a physical set held as governed series on both sides.', hazard: 'Coincidence in time is not attribution. Two series moving together need a stated mechanism, or the join manufactures causes at the rate the calendar allows.' },
  { id: 'PORT_PAIR', with: 'Another port’s set', yields: 'The corridor: transshipment pairs, feeder flows, and the network’s own membership.', hazard: 'A pairing inferred from timing alone is a correlation. A corridor edge needs a vessel identity carried across both sets, which is resolution again.' },
];

/* ── The construction lifts ── */

export const COMPOSITIONAL_HIERARCHY = {
  rule: 'The same object at every scale: a set, changing in time, whose membership is adjudicated and joinable.',
  levels: [
    { level: 'Port', members: 'Vessels, by membership class.' },
    { level: 'Corridor', members: 'Transits between two ports.' },
    { level: 'Lane', members: 'Corridors that serve one trade.' },
    { level: 'Network', members: 'Lanes, and the ports that anchor them.' },
  ],
  why: 'One grammar and one correction path for all four, rather than a bespoke model per scale. The port is the base case and the rest are the same construction applied to its own outputs.',
} as const;

/* ── What it is worth, and what it is not ── */

export const SET_PRODUCTS = {
  differentiator: 'The inputs are commodities — position feeds, public imagery, filings. The adjudicated operational state is not, because it is the governance layer that makes utilization, turnaround, arrival dispersion and residuals defensible rather than plausible.',
  notThis: 'Cargo and flow estimates, which the established vendors already sell and sell well. This is operational state with provenance, which they do not.',
  archiveGated: 'A set history cannot be reconstructed later. Occupancy, queue and turnaround series for a period nobody recorded are unrecoverable at any budget, which is the one asset in this system that only time can buy — and the reason the grammar is worth declaring before the first feed rather than after.',
  dependence: CLOSURE_LOSS,
} as const;

export const PORT_SET_SEQUENCE: readonly string[] = [
  'The membership event grammar first: vessel, port, berth, membership class, both clocks, the observations that decided it, and the supersession path. It is contract work and it is the interface the whole estate writes into.',
  'The set objects as derived projections next, so that a superseded ruling moves every aggregate that depended on it.',
  'The joins as named set intersections after that, each with its own hazard, so a coincidence in time is never reported as an attribution.',
  'Ingestion last. Every position that ever arrives then lands as membership evidence with two clocks rather than as a dot, which is the whole difference between starting the archive now and starting it later.',
];

/* ── What exists ── */

export interface PortSetStanding {
  ports: number;
  membershipRulings: number;
  setSeries: number;
  statement: string;
}

/** Pure: nothing is held. The population is stated so the zero is legible. */
export function portSetStanding(corpus: Corpus): PortSetStanding {
  const positions = corpus.records.filter((r) => r.geometry).length;
  return {
    ports: 0,
    membershipRulings: 0,
    setSeries: 0,
    statement: `No port is declared and no membership is adjudicated. ${positions} record${positions === 1 ? '' : 's'} in the demonstration corpus carry a position, and one of them names a loading terminal — which is a place a set would be defined over, and not yet a set.`,
  };
}
