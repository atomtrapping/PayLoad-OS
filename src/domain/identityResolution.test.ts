import { describe, expect, it } from 'vitest';
import { RESOLUTION_LOSS, resolveSubject, type Registration } from './identityResolution';

const REGISTRY: Registration[] = [
  { family: 'USDOT', value: '118422', canonicalId: 'notation://subject/carrier-4402', knownAt: '2026-08-01T00:00:00Z', evidenceRecordId: 'REC-REG-1' },
  { family: 'LEI', value: '5493001KJTIIGC8Y1R12', canonicalId: 'notation://subject/carrier-4402', knownAt: '2026-08-10T00:00:00Z', evidenceRecordId: 'REC-REG-2' },
  { family: 'USDOT', value: '990001', canonicalId: 'notation://subject/carrier-9001', knownAt: '2026-08-01T00:00:00Z', evidenceRecordId: 'REC-REG-3' },
];
const NOW = '2026-09-07T00:00:00Z';

describe('identity resolves on issuance, never on similarity', () => {
  it('resolves on an issued identifier and names the registrations that decided it', () => {
    const r = resolveSubject([{ family: 'USDOT', value: '118422' }], REGISTRY, NOW);
    expect(r.outcome).toBe('RESOLVED');
    expect(r.canonicalId).toBe('notation://subject/carrier-4402');
    expect(r.on.map((e) => e.evidenceRecordId)).toEqual(['REC-REG-1']);
  });

  it('refuses a name as a resolution key however distinctive it looks', () => {
    const r = resolveSubject([{ family: 'NOT_AN_IDENTIFIER', value: 'Blue Anchor Logistics' }], REGISTRY, NOW);
    expect(r.outcome).toBe('NO_USABLE_IDENTIFIER');
    expect(r.canonicalId).toBeNull();
    expect(r.setAside[0].because).toContain('does not merge on similarity');
  });

  it('reports unresolved rather than guessing when nothing binds', () => {
    const r = resolveSubject([{ family: 'USDOT', value: '777777' }], REGISTRY, NOW);
    expect(r.outcome).toBe('UNRESOLVED');
    expect(r.canonicalId).toBeNull();
    expect(r.because).toContain('statement about the registry');
  });

  it('refuses ambiguity rather than breaking it on a tiebreak', () => {
    const r = resolveSubject(
      [{ family: 'USDOT', value: '118422' }, { family: 'USDOT', value: '990001' }],
      REGISTRY, NOW,
    );
    expect(r.outcome).toBe('AMBIGUOUS');
    expect(r.canonicalId).toBeNull();
    expect(r.on).toHaveLength(2);
    expect(r.because).toContain('tiebreak nobody agreed to');
  });

  it('resolves bitemporally: a later registration does not answer an earlier question', () => {
    const offered = [{ family: 'LEI' as const, value: '5493001KJTIIGC8Y1R12' }];
    // The LEI registration became knowable on 2026-08-10.
    expect(resolveSubject(offered, REGISTRY, '2026-08-05T00:00:00Z').outcome).toBe('UNRESOLVED');
    expect(resolveSubject(offered, REGISTRY, '2026-08-15T00:00:00Z').outcome).toBe('RESOLVED');
  });

  it('says what resolving does not establish', () => {
    expect(RESOLUTION_LOSS.some((l) => l.includes('not a subject that does not exist'))).toBe(true);
    expect(RESOLUTION_LOSS.some((l) => l.includes('Nothing merges on similarity'))).toBe(true);
  });
});
