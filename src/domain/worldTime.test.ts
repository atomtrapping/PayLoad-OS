import { describe, expect, it } from 'vitest';
import { WORLD_TIME_LOSS, establishWorldTime } from './worldTime';

describe('when a fact became true, versus when a register was read', () => {
  it('establishes from a declared effective date or an observation instant', () => {
    const declared = establishWorldTime({ kind: 'SOURCE_DECLARED_EFFECTIVE', at: '2026-08-17T06:00:00Z', declaredBy: 'FMCSA filing' });
    expect(declared.outcome).toBe('ESTABLISHED');
    expect(declared.validFrom).toBe('2026-08-17T06:00:00Z');

    const observed = establishWorldTime({ kind: 'OBSERVATION_INSTANT', at: '2026-08-17T15:20:00Z', observedBy: 'terminal weighbridge' });
    expect(observed.outcome).toBe('ESTABLISHED');
    expect(observed.validFrom).toBe('2026-08-17T15:20:00Z');
    // And it is honest about what an observation instant is not.
    expect(observed.because).toContain('not a claim that the state began then');
  });

  it('refuses a single read outright, which is the ordinary case', () => {
    const snap = establishWorldTime({ kind: 'SNAPSHOT_READ', at: '2026-09-07T06:00:00Z', register: 'FMCSA company census' });
    expect(snap.outcome).toBe('REFUSED');
    expect(snap.validFrom).toBeNull();
    expect(snap.because).toContain('dates every fact to the moment somebody looked');
  });

  it('returns a bracket as a bracket, and never as a valid-from', () => {
    const bracket = establishWorldTime({
      kind: 'BRACKETED_BY_READS', unchangedAt: '2026-08-03T00:00:00Z', changedBy: '2026-08-07T00:00:00Z', register: 'FMCSA company census',
    });
    expect(bracket.outcome).toBe('BRACKETED');
    // The whole point: real information, and not an instant.
    expect(bracket.validFrom).toBeNull();
    expect(bracket.bracket).toEqual({ after: '2026-08-03T00:00:00Z', by: '2026-08-07T00:00:00Z' });
    expect(bracket.because).toContain('a midpoint would invent a moment nothing observed');
  });

  it('refuses reads that are not ordered, because they bracket nothing', () => {
    const bad = establishWorldTime({
      kind: 'BRACKETED_BY_READS', unchangedAt: '2026-08-07T00:00:00Z', changedBy: '2026-08-03T00:00:00Z', register: 'r',
    });
    expect(bad.outcome).toBe('REFUSED');
    expect(bad.bracket).toBeNull();
  });

  it('says a bracket may not be flattened', () => {
    expect(WORLD_TIME_LOSS.some((l) => l.includes('may not be flattened'))).toBe(true);
  });
});
