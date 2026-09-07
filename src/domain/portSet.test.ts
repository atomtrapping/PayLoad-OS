import { describe, expect, it } from 'vitest';
import { MEMBERSHIP_CLASSES, MEMBERSHIP_MEANING, PORT_SET_LOSS, PORT_SET_METHOD, occupancySeries, portSetAt, type MembershipRuling } from './portSet';

function ruling(over: Partial<MembershipRuling> & Pick<MembershipRuling, 'rulingId' | 'vesselId'>): MembershipRuling {
  return {
    portId: 'port-a',
    berthId: null,
    membership: 'ANCHORAGE',
    validFrom: '2026-09-07T06:00:00Z',
    validTo: '2026-09-07T18:00:00Z',
    knownAt: '2026-09-07T07:00:00Z',
    adjudicatedBy: ['ais', 'berth-geometry'],
    supersededByRulingId: null,
    retractedByRetractionId: null,
    ...over,
  };
}

const NOON = '2026-09-07T12:00:00Z';
const LATE = '2026-09-08T00:00:00Z';

describe('a port is a time-indexed set whose membership is ruled', () => {
  it('resolves the set at a world instant as it could have been ruled at a knowledge instant', () => {
    const set = portSetAt([
      ruling({ rulingId: 'r-1', vesselId: 'v-1', membership: 'ALONGSIDE', berthId: 'b-3' }),
      ruling({ rulingId: 'r-2', vesselId: 'v-2', membership: 'QUEUE' }),
      ruling({ rulingId: 'r-3', vesselId: 'v-3', membership: 'OUT' }),
    ], { portId: 'port-a', validAt: NOON, knownAt: LATE });
    expect(set.coverage).toBe('RULED');
    expect(set.members.map((m) => m.vesselId)).toEqual(['v-1', 'v-2', 'v-3']);
    expect(set.byClass.ALONGSIDE).toEqual(['v-1']);
    expect(set.byClass.QUEUE).toEqual(['v-2']);
    // OUT is a ruling about a vessel, not a membership of the set.
    expect(set.occupancy).toBe(2);
    expect(set.because).toMatch(/2 place a vessel in the set and 1 rule[s]? one out of it/);
    expect(PORT_SET_METHOD).toMatch(/\.v1$/);
    expect(MEMBERSHIP_CLASSES.every((key) => MEMBERSHIP_MEANING[key].length > 0)).toBe(true);
  });

  it('reports an unknown set as unknown and never as zero', () => {
    // The refusal that matters most: queue depth zero is a claim about the
    // world; the absence of an observation is not, and rendering one as the
    // other is the calmest possible lie.
    const unknown = portSetAt([], { portId: 'port-a', validAt: NOON, knownAt: LATE });
    expect(unknown.coverage).toBe('UNKNOWN');
    expect(unknown.occupancy).toBeNull();
    expect(unknown.occupancy).not.toBe(0);
    expect(unknown.because).toMatch(/unknown, not empty/);
    expect(unknown.because).toMatch(/nothing here says no vessel was there/);
    // A ruling that exists but covers no part of this instant is a real zero:
    // the port was ruled on, and no vessel was in the set.
    const ruled = portSetAt([ruling({ rulingId: 'r-1', vesselId: 'v-1', validFrom: '2026-09-01T00:00:00Z', validTo: '2026-09-02T00:00:00Z' })],
      { portId: 'port-a', validAt: NOON, knownAt: LATE });
    expect(ruled.coverage).toBe('RULED');
    expect(ruled.occupancy).toBe(0);
    expect(PORT_SET_LOSS.join(' ')).toMatch(/An unknown set is not an empty set/);
  });

  it('hides a ruling not yet knowable, so the as-of set is not the final set', () => {
    const rulings = [
      ruling({ rulingId: 'r-1', vesselId: 'v-1', membership: 'ALONGSIDE', knownAt: '2026-09-07T07:00:00Z' }),
      ruling({ rulingId: 'r-2', vesselId: 'v-2', membership: 'QUEUE', knownAt: '2026-09-07T20:00:00Z' }),
    ];
    const early = portSetAt(rulings, { portId: 'port-a', validAt: NOON, knownAt: '2026-09-07T08:00:00Z' });
    const final = portSetAt(rulings, { portId: 'port-a', validAt: NOON, knownAt: LATE });
    // The same world instant, two knowledge instants, two different sets.
    expect(early.occupancy).toBe(1);
    expect(final.occupancy).toBe(2);
    expect(PORT_SET_LOSS.join(' ')).toMatch(/only the first can be backtested/);
  });

  it('sets aside a withdrawn or superseded ruling before building the set, and names it', () => {
    const set = portSetAt([
      ruling({ rulingId: 'r-1', vesselId: 'v-1', membership: 'ALONGSIDE', supersededByRulingId: 'r-2' }),
      ruling({ rulingId: 'r-2', vesselId: 'v-1', membership: 'ANCHORAGE', knownAt: '2026-09-07T09:00:00Z' }),
      ruling({ rulingId: 'r-3', vesselId: 'v-9', retractedByRetractionId: 'ret-1' }),
    ], { portId: 'port-a', validAt: NOON, knownAt: LATE });
    expect(set.setAside.map((entry) => entry.rulingId).sort()).toEqual(['r-1', 'r-3']);
    expect(set.setAside.find((e) => e.rulingId === 'r-3')!.because).toMatch(/must not be relied on at all/);
    expect(set.setAside.find((e) => e.rulingId === 'r-1')!.because).toMatch(/a later ruling replaced this membership/);
    // The vessel holds the successor's membership, not the superseded one.
    expect(set.byClass.ANCHORAGE).toEqual(['v-1']);
    expect(set.byClass.ALONGSIDE).toEqual([]);
    expect(set.occupancy).toBe(1);
  });

  it('gives one vessel one membership, deterministically, when rulings overlap', () => {
    const set = portSetAt([
      ruling({ rulingId: 'r-a', vesselId: 'v-1', membership: 'QUEUE', knownAt: '2026-09-07T07:00:00Z' }),
      ruling({ rulingId: 'r-b', vesselId: 'v-1', membership: 'BERTH', berthId: 'b-1', knownAt: '2026-09-07T09:00:00Z' }),
    ], { portId: 'port-a', validAt: NOON, knownAt: LATE });
    expect(set.members).toHaveLength(1);
    expect(set.members[0]).toMatchObject({ membership: 'BERTH', berthId: 'b-1' });
    expect(portSetAt([
      ruling({ rulingId: 'r-b', vesselId: 'v-1', membership: 'BERTH', knownAt: '2026-09-07T09:00:00Z' }),
      ruling({ rulingId: 'r-a', vesselId: 'v-1', membership: 'QUEUE', knownAt: '2026-09-07T09:00:00Z' }),
    ], { portId: 'port-a', validAt: NOON, knownAt: LATE }).members[0].rulingId).toBe('r-b');
  });

  it('carries unknown through a derived series instead of drawing it as a floor', () => {
    const rulings = [ruling({ rulingId: 'r-1', vesselId: 'v-1', membership: 'BERTH', validFrom: '2026-09-07T10:00:00Z', validTo: '2026-09-07T14:00:00Z' })];
    const series = occupancySeries(rulings, {
      portId: 'port-b', knownAt: LATE, instants: ['2026-09-07T09:00:00Z', NOON],
    });
    // A different port with no rulings: every point unknown, none zero.
    expect(series.map((p) => p.coverage)).toEqual(['UNKNOWN', 'UNKNOWN']);
    expect(series.map((p) => p.occupancy)).toEqual([null, null]);
    const own = occupancySeries(rulings, { portId: 'port-a', knownAt: LATE, instants: ['2026-09-07T09:00:00Z', NOON] });
    expect(own.map((p) => p.occupancy)).toEqual([0, 1]);
    expect(PORT_SET_LOSS.join(' ')).toMatch(/Derived series are projections of the ruling ledger/);
  });

  it('refuses a query it cannot read, rather than answering it as empty', () => {
    const bad = portSetAt([ruling({ rulingId: 'r-1', vesselId: 'v-1' })], { portId: 'port-a', validAt: 'Tuesday', knownAt: LATE });
    expect(bad.coverage).toBe('UNKNOWN');
    expect(bad.occupancy).toBeNull();
    expect(bad.because).toMatch(/no set is resolved and none is reported as empty/);
    expect(PORT_SET_LOSS.join(' ')).toMatch(/Membership is a ruling, not a test/);
    expect(PORT_SET_LOSS.join(' ')).toMatch(/Nothing here observes a vessel/);
  });
});
