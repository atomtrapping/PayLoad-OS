/**
 * A port is not a place. It is a time-indexed set whose membership is
 * adjudicated, and the membership rulings — not the dots — are the substrate.
 *
 * A vessel is alongside, at a berth, at anchorage, in the approach, in the
 * queue, or out. Which of those it is at a given world instant is a *ruling*,
 * not a test: berth-polygon containment alone is ambiguous between berthed,
 * manoeuvring and waiting, so a transition is adjudicated from several
 * channels (see `eventClosure`) and carries the evidence that decided it.
 * A later observation may revise a ruling, and a revision is a supersession
 * event, not an overwrite.
 *
 * Two clocks, and they differ here by hours in the ordinary case: a vessel's
 * membership has a world time (when it was actually alongside) and a
 * knowledge time (when the observations let this system rule it in). The
 * as-of set at a knowledge instant is a different, reconstructable object
 * from the final set, and only the first is backtestable.
 *
 * The refusal that matters most: **an empty set and an unknown set are not
 * the same answer.** A port with no rulings has unknown occupancy, never
 * zero. Queue depth zero is a tradeable claim; the absence of observation is
 * not, and a series that renders one as the other manufactures the calmest
 * possible lie.
 */

export const PORT_SET_METHOD = 'notationsos.port-membership.v1';

/** Where a vessel stands relative to a port's operational set. */
export type MembershipClass = 'OUT' | 'APPROACH' | 'QUEUE' | 'ANCHORAGE' | 'BERTH' | 'ALONGSIDE';

export const MEMBERSHIP_CLASSES: readonly MembershipClass[] = ['OUT', 'APPROACH', 'QUEUE', 'ANCHORAGE', 'BERTH', 'ALONGSIDE'];

export const MEMBERSHIP_MEANING: Record<MembershipClass, string> = {
  OUT: 'Ruled outside the port’s operational set. This is a ruling, not the absence of one.',
  APPROACH: 'Inbound within the approach, not yet holding or working.',
  QUEUE: 'Waiting for a berth under the port’s own ordering, where that ordering is observable.',
  ANCHORAGE: 'Holding at a declared anchorage. Not the same as queueing: a vessel may hold for reasons the port does not order.',
  BERTH: 'Assigned to and within a berth, working or not.',
  ALONGSIDE: 'Made fast alongside. The finest membership the evidence supports, and the one that needs the closest geometry.',
};

/** One adjudicated membership over an interval of world time. */
export interface MembershipRuling {
  rulingId: string;
  vesselId: string;
  portId: string;
  /** Only for BERTH and ALONGSIDE; null elsewhere, never a guess. */
  berthId: string | null;
  membership: MembershipClass;
  validFrom: string;
  /** Null means open: still holding as far as this ruling says. */
  validTo: string | null;
  knownAt: string;
  /** The channels whose closure adjudicated it, so a ruling names its evidence. */
  adjudicatedBy: readonly string[];
  supersededByRulingId: string | null;
  retractedByRetractionId: string | null;
}

export interface SetMember {
  vesselId: string;
  membership: MembershipClass;
  berthId: string | null;
  rulingId: string;
}

/** Whether the port was ruled on at all at this knowledge instant. */
export type SetCoverage = 'RULED' | 'UNKNOWN';

export interface PortSet {
  portId: string;
  validAt: string;
  knownAt: string;
  coverage: SetCoverage;
  members: SetMember[];
  byClass: Record<MembershipClass, string[]>;
  setAside: Array<{ rulingId: string; because: string }>;
  /** Null when coverage is UNKNOWN. Never zero for want of a ruling. */
  occupancy: number | null;
  because: string;
}

function at(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Does this ruling's world-time interval contain the asked-for instant? */
function coversValidAt(ruling: MembershipRuling, validAtMs: number): boolean {
  const from = at(ruling.validFrom);
  if (from === null || from > validAtMs) return false;
  const to = ruling.validTo === null ? null : at(ruling.validTo);
  if (ruling.validTo !== null && to === null) return false;
  return to === null || validAtMs < to;
}

/**
 * The port's set at a world instant, as this system could have ruled it at a
 * knowledge instant. Rulings not yet knowable are invisible; rulings
 * withdrawn or superseded by then are set aside and named, because a
 * superseded ruling standing in the set would report a membership the system
 * has already replaced.
 */
export function portSetAt(
  rulings: readonly MembershipRuling[],
  query: { portId: string; validAt: string; knownAt: string },
): PortSet {
  const validAtMs = at(query.validAt);
  const knownAtMs = at(query.knownAt);
  const empty: Record<MembershipClass, string[]> = { OUT: [], APPROACH: [], QUEUE: [], ANCHORAGE: [], BERTH: [], ALONGSIDE: [] };
  if (validAtMs === null || knownAtMs === null) {
    return { ...query, coverage: 'UNKNOWN', members: [], byClass: { ...empty }, setAside: [], occupancy: null,
      because: 'The query does not name two readable instants, so no set is resolved and none is reported as empty.' };
  }

  const forPort = rulings.filter((ruling) => ruling.portId === query.portId);
  const knowable = forPort.filter((ruling) => { const known = at(ruling.knownAt); return known !== null && known <= knownAtMs; });

  const setAside: PortSet['setAside'] = [];
  const standing: MembershipRuling[] = [];
  for (const ruling of knowable) {
    if (ruling.retractedByRetractionId) {
      setAside.push({ rulingId: ruling.rulingId, because: `Withdrawn by ${ruling.retractedByRetractionId} at this knowledge instant: it must not be relied on at all.` });
      continue;
    }
    if (ruling.supersededByRulingId) {
      const successor = knowable.find((other) => other.rulingId === ruling.supersededByRulingId);
      if (successor) {
        setAside.push({ rulingId: ruling.rulingId, because: `Superseded by ${successor.rulingId} at this knowledge instant: a later ruling replaced this membership.` });
        continue;
      }
    }
    standing.push(ruling);
  }

  if (!knowable.length) {
    return { ...query, coverage: 'UNKNOWN', members: [], byClass: { ...empty }, setAside, occupancy: null,
      because: `No ruling about ${query.portId} was knowable at this instant. The set is unknown, not empty: nothing here says no vessel was there.` };
  }

  const covering = standing.filter((ruling) => coversValidAt(ruling, validAtMs));
  // One vessel holds one membership: the latest-known ruling covering the instant wins,
  // ties broken by ruling id so the answer is the same on every run.
  const byVessel = new Map<string, MembershipRuling>();
  for (const ruling of covering) {
    const held = byVessel.get(ruling.vesselId);
    if (!held) { byVessel.set(ruling.vesselId, ruling); continue; }
    const a = at(ruling.knownAt)!, b = at(held.knownAt)!;
    if (a > b || (a === b && ruling.rulingId > held.rulingId)) byVessel.set(ruling.vesselId, ruling);
  }

  const members: SetMember[] = [...byVessel.values()]
    .map((ruling) => ({ vesselId: ruling.vesselId, membership: ruling.membership, berthId: ruling.berthId, rulingId: ruling.rulingId }))
    .sort((x, y) => (x.vesselId < y.vesselId ? -1 : x.vesselId > y.vesselId ? 1 : 0));

  const byClass: Record<MembershipClass, string[]> = { ...empty };
  for (const key of MEMBERSHIP_CLASSES) byClass[key] = members.filter((m) => m.membership === key).map((m) => m.vesselId);

  // OUT is a ruling about a vessel, not a membership of the set.
  const inSet = members.filter((member) => member.membership !== 'OUT');
  return {
    ...query,
    coverage: 'RULED',
    members,
    byClass,
    setAside,
    occupancy: inSet.length,
    because: `${knowable.length} ruling${knowable.length === 1 ? '' : 's'} knowable, ${standing.length} standing, ${members.length} covering this instant, of which ${inSet.length} place a vessel in the set and ${members.length - inSet.length} rule one out of it.`,
  };
}

/** A derived series is a projection of the ruling ledger, rebuildable and never the corpus. */
export interface OccupancyPoint { validAt: string; occupancy: number | null; coverage: SetCoverage }

export function occupancySeries(
  rulings: readonly MembershipRuling[],
  query: { portId: string; knownAt: string; instants: readonly string[] },
): OccupancyPoint[] {
  return query.instants.map((validAt) => {
    const set = portSetAt(rulings, { portId: query.portId, validAt, knownAt: query.knownAt });
    return { validAt, occupancy: set.occupancy, coverage: set.coverage };
  });
}

export const PORT_SET_LOSS = [
  'An unknown set is not an empty set. A port with no knowable ruling reports unknown occupancy and never zero, because zero is a claim about the world and the absence of an observation is not.',
  'Membership is a ruling, not a test. Berth-polygon containment alone is ambiguous between berthed, manoeuvring and waiting; a ruling names the channels that decided it, and a later observation supersedes rather than overwrites.',
  'The set is resolved at two instants, and they answer different questions. The set as ruled at a past knowledge instant is not the set as finally ruled, and only the first can be backtested.',
  'A superseded or withdrawn ruling is set aside before the set is built, and named. A superseded ruling left standing would report a membership the system has already replaced.',
  'Derived series are projections of the ruling ledger. Occupancy, queue depth and turnaround are rebuildable from the rulings and are never themselves the record.',
  'Nothing here observes a vessel. A ruling is only as good as the channels that adjudicated it, and this module neither acquires nor verifies them.',
] as const;

/* ── What the set is worth, and why the grammar comes before the feeds ── */

/**
 * The mechanism above computes a set. These are the objects a set makes
 * sellable, the joins that make it joinable, and the reason the whole thing is
 * worth declaring before any feed exists. None of it is computed here: the
 * series are projections of the ruling ledger, and there are no rulings.
 */
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
  { id: 'BERTH_OCCUPANCY', title: 'Berth occupancy sequence', what: 'Per-berth membership over time, which occupancySeries already computes from rulings.', prices: 'The port’s real capacity: observed utilization rather than nameplate or declared capacity.', asAState: 'A state with dynamics, bounded above by the berth count, and a constraint family of its own.' },
  { id: 'QUEUE_DEPTH', title: 'Queue depth series', what: 'The size of the queue and anchorage classes over time.', prices: 'Congestion before it shows in waiting times, which is the leading indicator rather than the lagging one.', asAState: 'A driven process: weather, demand and labour are its forcing, and its innovation spectrum separates scheduled congestion from capacity erosion from an event.' },
  { id: 'TURNAROUND', title: 'Turnaround distribution', what: 'Arrival-to-departure intervals per class of call.', prices: 'The port’s operational state, where slow degradation is the early sign of a labour action, a weather regime or a demand shift.', asAState: 'A distribution with a regime, so the object of interest is the regime change rather than the mean.' },
  { id: 'COMPOSITION', title: 'Composition by identity', what: 'Which operators and carriers hold the set.', prices: 'Share shifts: reallocation visible before it is announced.', asAState: 'A categorical series whose changes are only as trustworthy as the identity resolution beneath them, which is absent.' },
  { id: 'DRAFT_TRANSITIONS', title: 'Draft-transition ledger', what: 'Loading and discharge inferred from draft change while in the set.', prices: 'Throughput without a customs document, which is the statistic nobody publishes.', asAState: 'An event series over a state component the corpus cannot yet carry, so it is the highest-value component to add.' },
  { id: 'FLOW_BALANCE', title: 'Arrivals against departures', what: 'The balance of entries and exits over the set.', prices: 'Consistency of the whole picture, and the residual when it fails to close.', asAState: 'Flow conservation on the set — the constraint stack’s first live application, stiff-soft because vessels leave observation as well as leaving port.' },
];

export interface SetJoin {
  id: 'WEATHER' | 'IMAGERY' | 'DISPATCH' | 'DOCUMENTS' | 'PORT_PAIR';
  with: string;
  yields: string;
  hazard: string;
}

export const SET_JOINS: readonly SetJoin[] = [
  { id: 'WEATHER', with: 'The forcing field at the same instants', yields: 'Downtime separated into attributed and unexplained: occupancy under storm conditions, wind-day closures, and the gating that makes an absence explained rather than missing.', hazard: 'Attributed downtime is an insurance and a claim question, so the attribution must be evidence-bearing rather than a plausible pairing of two series.' },
  { id: 'IMAGERY', with: 'Each scene’s detections at the scene’s own instant', yields: 'Two residuals: hulls present in imagery and absent from the set, which is the off-transponder economy; and set members not imaged, which is coverage accounting.', hazard: 'The second residual is the one that must render void as void. A member not imaged is not an absence of the vessel, and a coverage gap reported as a finding is the fabrication this system exists to refuse.' },
  { id: 'DISPATCH', with: 'The declared-intent set at the same instants', yields: 'Declared arrival against ruled arrival, at fleet scale: a reliability metric for a carrier or a shipper rather than for one voyage.', hazard: 'It is a belief against a belief. Scoring a carrier on divergence assumes the ruling is right, and the ruling has its own confidence.' },
  { id: 'DOCUMENTS', with: 'Filings, permits and labour events over the same period', yields: 'Disruption attribution: a stand-down or an action set against the set’s own dynamics. This is the cross-line join in one operation, because it needs a document corpus and a physical set held as governed series on both sides.', hazard: 'Coincidence in time is not attribution. Two series moving together need a stated mechanism, or the join manufactures causes at the rate the calendar allows.' },
  { id: 'PORT_PAIR', with: 'Another port’s set', yields: 'The corridor: transshipment pairs, feeder flows, and the network’s own membership.', hazard: 'A pairing inferred from timing alone is a correlation. A corridor edge needs a vessel identity carried across both sets, which is resolution again.' },
];

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

export const SET_PRODUCTS = {
  differentiator: 'The inputs are commodities — position feeds, public imagery, filings. The adjudicated operational state is not, because it is the governance layer that makes utilization, turnaround, arrival dispersion and residuals defensible rather than plausible.',
  notThis: 'Cargo and flow estimates, which the established vendors already sell and sell well. This is operational state with provenance, which they do not.',
  archiveGated: 'A set history cannot be reconstructed later. Occupancy, queue and turnaround series for a period nobody recorded are unrecoverable at any budget, which is the one asset in this system that only time can buy — and the reason the grammar is worth declaring before the first feed rather than after.',
} as const;

export const PORT_SET_SEQUENCE: readonly string[] = [
  'The membership ruling and the set resolution first, which exist: a ruling with both clocks, a supersession path, and a set that reports unknown rather than zero.',
  'The derived series next as projections of the ledger, so that a superseded ruling moves every aggregate that depended on it.',
  'The joins as named set intersections after that, each with its own hazard, so a coincidence in time is never reported as an attribution.',
  'Ingestion last. Every position that ever arrives then lands as membership evidence with two clocks rather than as a dot, which is the whole difference between starting the archive now and starting it later.',
];

export interface PortSetStanding {
  ports: number;
  membershipRulings: number;
  setSeries: number;
  statement: string;
}

/** Pure: nothing is held. The population is stated so the zero is legible. */
export function portSetStanding(positionsInCorpus: number): PortSetStanding {
  return {
    ports: 0,
    membershipRulings: 0,
    setSeries: 0,
    statement: `The mechanism resolves a set from rulings and no ruling exists. ${positionsInCorpus} record${positionsInCorpus === 1 ? '' : 's'} in the demonstration corpus carry a position, and one of them names a loading terminal — which is a place a set would be defined over, and not yet a set.`,
  };
}
