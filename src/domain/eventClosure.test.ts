import { describe, expect, it } from 'vitest';
import { CLOSURE_LOSS, CLOSURE_METHOD, CLOSURE_METRIC, eventClosure, formatSeconds, type ChannelClaim } from './eventClosure';

const T = (offsetSeconds: number) => new Date(Date.parse('2026-09-07T08:00:00Z') + offsetSeconds * 1000).toISOString();

function claim(channelId: string, offsetSeconds: number, uncertaintySeconds: number | null, over: Partial<ChannelClaim> = {}): ChannelClaim {
  return {
    channelId,
    sourceId: `src-${channelId}`,
    instant: T(offsetSeconds),
    uncertaintySeconds,
    basis: `${channelId} placed the arrival`,
    dependsOn: [],
    ...over,
  };
}

describe('the closure residual across channels claiming one event', () => {
  it('measures the spread and says the windows can hold one instant, without turning that into a confidence', () => {
    const closure = eventClosure([
      claim('ais', 0, 600), claim('berth-geometry', 300, 900), claim('draft', 420, 1200),
    ]);
    expect(closure.state).toBe('OVERLAPPING');
    expect(closure.spreadSeconds).toBe(420);
    expect(closure.independentGroups).toEqual([['ais'], ['berth-geometry'], ['draft']]);
    expect(closure.because).toMatch(/3 channels in 3 independent groups/);
    expect(closure.because).toMatch(/spread 7\.0 min/);
    expect(closure.because).toMatch(/it is not a confidence/);
    expect(CLOSURE_METHOD).toMatch(/\.v1$/);
    expect(CLOSURE_METRIC).toBe('DECLARED_CLOCK_SECONDS');
  });

  it('counts independent groups, not channels, and never infers an undeclared independence', () => {
    // Optical and SAR share weather gating; a dispatch ETA and the terminal's
    // own berth call descend from the same declaration. Four channels, two
    // accounts — and the count comes from what they declare, not from a guess.
    const closure = eventClosure([
      claim('sar', 0, 600),
      claim('optical', 120, 600, { dependsOn: ['sar'] }),
      claim('dispatch', 240, 900),
      claim('berth-call', 300, 900, { dependsOn: ['dispatch'] }),
    ]);
    expect(closure.independentGroups).toEqual([['berth-call', 'dispatch'], ['optical', 'sar']]);
    expect(closure.because).toMatch(/4 channels in 2 independent groups/);
    const loss = CLOSURE_LOSS.join(' ');
    expect(loss).toMatch(/Independence is declared, never inferred/);
    expect(loss).toMatch(/an undeclared dependency is unknown rather than absent/);
    expect(loss).toMatch(/upper bound on the independent accounts and never a lower one/);
  });

  it('says so when every channel descends from one declared account', () => {
    const closure = eventClosure([
      claim('dispatch', 0, 600),
      claim('berth-call', 60, 600, { dependsOn: ['dispatch'] }),
      claim('agent-report', 120, 600, { dependsOn: ['berth-call'] }),
    ]);
    expect(closure.state).toBe('OVERLAPPING');
    expect(closure.independentGroups).toEqual([['agent-report', 'berth-call', 'dispatch']]);
    expect(closure.because).toMatch(/one account restated and nothing corroborates anything/);
  });

  it('calls a pair disjoint only when the stated windows cannot hold one common instant', () => {
    const closure = eventClosure([claim('ais', 0, 600), claim('sar', 7_200, 600)]);
    expect(closure.state).toBe('DISJOINT');
    expect(closure.spreadSeconds).toBe(7_200);
    expect(closure.pairs[0].combinedHalfWidthSeconds).toBe(1_200);
    expect(closure.pairs[0].because).toMatch(/2\.0 h apart, against ±10\.0 min and ±10\.0 min/);
    expect(closure.pairs[0].because).toMatch(/cannot contain one common instant/);
    expect(closure.because).toMatch(/has not been settled, and nothing here settles it/);
  });

  it('assumes no window for a channel that states none, and leaves the set untested rather than closed', () => {
    const closure = eventClosure([claim('ais', 0, null), claim('sar', 120, 600)]);
    expect(closure.state).toBe('NOT_ASSESSABLE');
    expect(closure.pairs[0].combinedHalfWidthSeconds).toBeNull();
    expect(closure.pairs[0].because).toMatch(/ais states no usable uncertainty/);
    expect(closure.pairs[0].because).toMatch(/None is assumed/);
    // A negative half-width is not a half-width either.
    expect(eventClosure([claim('ais', 0, -60), claim('sar', 120, 600)]).state).toBe('NOT_ASSESSABLE');
  });

  it('sets aside a channel that places the event nowhere, and refuses to close on one account', () => {
    const closure = eventClosure([claim('ais', 0, 600), claim('rumour', 0, 600, { instant: 'sometime Tuesday' })]);
    expect(closure.setAside.map((entry) => entry.claim.channelId)).toEqual(['rumour']);
    expect(closure.setAside[0].because).toMatch(/no readable instant/);
    expect(closure.compared.map((c) => c.channelId)).toEqual(['ais']);
    expect(closure.state).toBe('NOT_ASSESSABLE');
    expect(closure.spreadSeconds).toBeNull();
    expect(closure.because).toMatch(/one account does not close/);
  });

  it('counts one channel once however many times it is offered', () => {
    const closure = eventClosure([claim('ais', 0, 600), claim('ais', 3_600, 600), claim('sar', 60, 600)]);
    expect(closure.compared.map((c) => c.channelId)).toEqual(['ais', 'sar']);
    expect(closure.spreadSeconds).toBe(60);
  });

  it('refuses a composite confidence and says closing is not evidence the event happened', () => {
    const loss = CLOSURE_LOSS.join(' ');
    expect(loss).toMatch(/No composite confidence is produced/);
    expect(loss).toMatch(/combining would assume an independence these channels do not have/);
    expect(loss).toMatch(/Overlapping windows are not agreement/);
    expect(loss).toMatch(/Five channels can agree closely about the instant of something none of them witnessed/);
    // The residual is not an error: no channel here is the truth.
    expect(loss).toMatch(/no channel here is the truth against which the others would be measured/);
  });

  it('writes seconds at the scale a reader thinks in', () => {
    expect(formatSeconds(45)).toBe('45 s');
    expect(formatSeconds(420)).toBe('7.0 min');
    expect(formatSeconds(7_200)).toBe('2.0 h');
    expect(formatSeconds(172_800)).toBe('2.0 d');
  });
});
