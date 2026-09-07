/**
 * When several channels claim one event, how far apart are they?
 *
 * A vessel arrives. AIS places the arrival at one instant, a SAR pass at
 * another, berth-geometry containment at a third, a draft change at a
 * fourth, a dispatch ETA at a fifth. Nothing in the corpus asks the question
 * those five answers pose: *do they close?* The spread between them is the
 * closure residual, and it is the measurement — not any one channel's
 * instant, which is only that channel's account.
 *
 * This is the position separation of `earth.ts`, moved from metres to
 * seconds, and it keeps that module's disciplines because they are the same
 * disciplines:
 *
 * A channel that states no uncertainty is not compared, and none is assumed
 * for it. A pair that cannot be tested leaves the whole set untested, never
 * closed. And no composite confidence is produced at all: the channels state
 * an instant and a half-width, no distribution, so there is nothing to
 * multiply — and even if there were, multiplying would assume an
 * independence these channels demonstrably lack. Optical and SAR share
 * weather gating; berth geometry and a dispatch ETA can both descend from
 * the terminal's own declarations. Channels therefore declare what they
 * depend on, and agreement is counted over independent groups rather than
 * over channels, because counting channels is counting republications.
 */
import type { PositionConsistency } from './spatialKey';

export const CLOSURE_METHOD = 'notationsos.event-closure.v1';
/** Seconds, on the declared clock. There is no other metric here and none is implied. */
export const CLOSURE_METRIC = 'DECLARED_CLOCK_SECONDS';

/** One channel's account of when one event happened. */
export interface ChannelClaim {
  /** The channel, as the record names it: 'ais', 'sar', 'berth-geometry', 'draft', 'dispatch'. */
  channelId: string;
  sourceId: string;
  /** The instant this channel places the event at. */
  instant: string;
  /** Stated half-width in seconds, or null when the channel states none. */
  uncertaintySeconds: number | null;
  /** What the channel observed, verbatim. */
  basis: string;
  /**
   * Channels this one is not independent of, as *declared* — shared gating,
   * a shared upstream, a republication. Never inferred: an undeclared
   * dependency is unknown, not absent.
   */
  dependsOn: readonly string[];
}

export interface ClaimPair {
  a: ChannelClaim;
  b: ChannelClaim;
  separationSeconds: number | null;
  combinedHalfWidthSeconds: number | null;
  state: PositionConsistency;
  because: string;
}

export interface EventClosure {
  compared: ChannelClaim[];
  setAside: Array<{ claim: ChannelClaim; because: string }>;
  pairs: ClaimPair[];
  state: PositionConsistency;
  /** Widest gap between compared instants, or null when fewer than two are compared. */
  spreadSeconds: number | null;
  /** Compared channels partitioned by declared dependency; agreement counts these, not channels. */
  independentGroups: string[][];
  sourceIds: string[];
  because: string;
}

function instantMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function halfWidth(claim: ChannelClaim): number | null {
  const stated = claim.uncertaintySeconds;
  if (stated === null || stated === undefined) return null;
  return Number.isFinite(stated) && stated >= 0 ? stated : null;
}

export function formatSeconds(seconds: number): string {
  const value = Math.abs(seconds);
  if (value >= 86_400) return `${(value / 86_400).toFixed(1)} d`;
  if (value >= 3_600) return `${(value / 3_600).toFixed(1)} h`;
  if (value >= 60) return `${(value / 60).toFixed(1)} min`;
  return `${value.toFixed(0)} s`;
}

function pairOf(a: ChannelClaim, b: ChannelClaim): ClaimPair {
  const left = instantMs(a.instant), right = instantMs(b.instant);
  if (left === null || right === null) {
    return { a, b, separationSeconds: null, combinedHalfWidthSeconds: null, state: 'NOT_ASSESSABLE',
      because: `${left === null ? a.channelId : b.channelId} does not place the event at a readable instant.` };
  }
  const separationSeconds = Math.abs(left - right) / 1000;
  const wa = halfWidth(a), wb = halfWidth(b);
  const missing = [wa === null ? a.channelId : null, wb === null ? b.channelId : null].filter((id): id is string => id !== null);
  if (missing.length) {
    return { a, b, separationSeconds, combinedHalfWidthSeconds: null, state: 'NOT_ASSESSABLE',
      because: `${missing.join(' and ')} state${missing.length === 1 ? 's' : ''} no usable uncertainty. None is assumed, so these two cannot be tested against each other.` };
  }
  const combinedHalfWidthSeconds = wa! + wb!;
  const disjoint = separationSeconds > combinedHalfWidthSeconds;
  return { a, b, separationSeconds, combinedHalfWidthSeconds, state: disjoint ? 'DISJOINT' : 'OVERLAPPING',
    because: `${formatSeconds(separationSeconds)} apart, against ±${formatSeconds(wa!)} and ±${formatSeconds(wb!)} — a combined ${formatSeconds(combinedHalfWidthSeconds)}. The two stated windows ${disjoint ? 'cannot contain one common instant' : 'can contain one common instant'}.` };
}

/**
 * Compared channels grouped by declared dependency, as connected components:
 * two channels sit together when either declares a dependency on the other,
 * directly or through a chain. A group is one account however many channels
 * are in it.
 */
function groupByDeclaredDependency(claims: readonly ChannelClaim[]): string[][] {
  const ids = claims.map((claim) => claim.channelId);
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (x: string, y: string) => { const rx = find(x), ry = find(y); if (rx !== ry) parent.set(rx, ry); };
  for (const claim of claims) {
    for (const other of claim.dependsOn) if (parent.has(other)) union(claim.channelId, other);
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()].map((group) => group.sort()).sort((x, y) => (x[0] < y[0] ? -1 : 1));
}

/** Do the channels' accounts of one event close, and by how much do they miss? */
export function eventClosure(claims: readonly ChannelClaim[]): EventClosure {
  const seen = new Set<string>();
  const all: ChannelClaim[] = [];
  for (const claim of claims) if (!seen.has(claim.channelId)) { seen.add(claim.channelId); all.push(claim); }
  all.sort((x, y) => (x.channelId < y.channelId ? -1 : x.channelId > y.channelId ? 1 : 0));

  const compared: ChannelClaim[] = [];
  const setAside: EventClosure['setAside'] = [];
  for (const claim of all) {
    if (instantMs(claim.instant) === null) setAside.push({ claim, because: 'Places the event at no readable instant, so it takes no part in the closure.' });
    else compared.push(claim);
  }

  const pairs: ClaimPair[] = [];
  for (let i = 0; i < compared.length; i += 1) for (let j = i + 1; j < compared.length; j += 1) pairs.push(pairOf(compared[i], compared[j]));

  const instants = compared.map((claim) => instantMs(claim.instant)!).sort((x, y) => x - y);
  const spreadSeconds = instants.length >= 2 ? (instants[instants.length - 1] - instants[0]) / 1000 : null;
  const independentGroups = groupByDeclaredDependency(compared);
  const sourceIds = [...new Set(compared.map((claim) => claim.sourceId))].sort();

  const counted = `${compared.length} ${compared.length === 1 ? 'channel' : 'channels'} in ${independentGroups.length} independent ${independentGroups.length === 1 ? 'group' : 'groups'}`;
  let state: PositionConsistency;
  let because: string;
  if (compared.length < 2) {
    state = 'NOT_ASSESSABLE';
    because = `${compared.length} channel places this event. There is nothing for it to close against, and one account does not close.`;
  } else if (pairs.some((pair) => pair.state === 'DISJOINT')) {
    state = 'DISJOINT';
    because = `${counted}, spread ${formatSeconds(spreadSeconds!)}, and at least one pair cannot both be right. The event's instant has not been settled, and nothing here settles it.`;
  } else if (pairs.some((pair) => pair.state === 'NOT_ASSESSABLE')) {
    state = 'NOT_ASSESSABLE';
    because = `${counted}, spread ${formatSeconds(spreadSeconds!)}, and at least one pair could not be tested. The set is not shown to close.`;
  } else if (independentGroups.length === 1) {
    state = 'OVERLAPPING';
    because = `${counted}, spread ${formatSeconds(spreadSeconds!)}: the windows can contain one common instant, but every channel here descends from one declared account, so this is one account restated and nothing corroborates anything.`;
  } else {
    state = 'OVERLAPPING';
    because = `${counted}, spread ${formatSeconds(spreadSeconds!)}: the stated windows can all contain one common instant. That is the whole of the finding, and it is not a confidence.`;
  }
  return { compared, setAside, pairs, state, spreadSeconds, independentGroups, sourceIds, because };
}

/** What the closure is, and what a reader must not take it for. */
export const CLOSURE_LOSS = [
  'The residual is a spread in seconds on the declared clock between channels that each placed the event themselves. It is not an error, because no channel here is the truth against which the others would be measured.',
  'No composite confidence is produced. The channels state an instant and a half-width and no distribution, so there is nothing to combine — and combining would assume an independence these channels do not have.',
  'Independence is declared, never inferred. Channels are grouped by the dependencies they state, and an undeclared dependency is unknown rather than absent, so the group count is an upper bound on the independent accounts and never a lower one.',
  'Overlapping windows are not agreement and not a settled instant. They are the absence of a contradiction between the windows the channels stated.',
  'A channel that states no uncertainty is not compared and none is assumed for it. One untestable pair leaves the whole set untested, never closed.',
  'Closing says nothing about whether the event happened. Five channels can agree closely about the instant of something none of them witnessed.',
] as const;
