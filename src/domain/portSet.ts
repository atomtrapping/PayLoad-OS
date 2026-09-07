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
