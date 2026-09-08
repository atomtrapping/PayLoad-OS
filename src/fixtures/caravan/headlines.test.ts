/**
 * The specimens are specimens, and they land on every state the reading can produce.
 */
import { describe, expect, it } from 'vitest';
import { currentRelease } from '@/domain/corpus';
import { corroborate, locateAll, placementOf, validateClaim } from '@/domain/locatedClaims';
import { CARAVAN_CORPUS } from './release';
import { SPECIMEN_HEADLINES } from './headlines';

const release = currentRelease(CARAVAN_CORPUS);

describe('the specimen headlines', () => {
  it('are all drafted specimens from a source named as one, and all validate', () => {
    for (const claim of SPECIMEN_HEADLINES) {
      expect(claim.beganAs).toBe('DRAFTED_SPECIMEN');
      expect(claim.source.sourceId).toBe('specimen-wire');
      expect(claim.source.displayName).toMatch(/not a publication/);
      expect(claim.geocode.method).toBe('notationsos.geocode.declared-specimen.v1');
      expect(validateClaim(claim).claim).not.toBeNull();
    }
    expect(new Set(SPECIMEN_HEADLINES.map((claim) => claim.claimId)).size).toBe(SPECIMEN_HEADLINES.length);
  });

  it('land on each state the reading can produce, against records the corpus actually holds', () => {
    const now = Object.fromEntries(SPECIMEN_HEADLINES.map((claim) => [claim.claimId, corroborate(CARAVAN_CORPUS, release, claim).now]));
    expect(now['SPEC-H-001'].label).toBe('CORROBORATED');
    expect(now['SPEC-H-001'].record?.recordId).toBe('REC-0204');
    expect(now['SPEC-H-002'].label).toBe('CONFLICTING');
    expect(now['SPEC-H-002'].record?.recordId).toBe('REC-0302');
    expect(now['SPEC-H-003'].label).toBe('NOT_IN_COVERAGE');
    expect(now['SPEC-H-003'].record).toBeNull();
    expect(now['SPEC-H-004'].label).toBe('NOT_IN_COVERAGE');
    expect(now['SPEC-H-004'].refusal?.code).toBe('NO_IDENTITY_LINK');
  });

  it('carry one claim whose two clocks disagree, because the corpus learned something between them', () => {
    const reading = corroborate(CARAVAN_CORPUS, release, SPECIMEN_HEADLINES.find((claim) => claim.claimId === 'SPEC-H-005')!);
    expect(reading.atCapture.label).toBe('CORROBORATED');
    expect(reading.atCapture.record?.recordId).toBe('REC-0203');
    expect(reading.now.label).toBe('CONFLICTING');
    expect(reading.now.record?.recordId).toBe('REC-0204');
  });

  it('draw one region, one point-with-ring, and leave the one with no radius unplaced', () => {
    const placement = Object.fromEntries(SPECIMEN_HEADLINES.map((claim) => [claim.claimId, placementOf(claim.geocode)]));
    expect(placement['SPEC-H-002']).toEqual({ placed: true, radiusM: 5000 });
    expect(placement['SPEC-H-001']).toEqual({ placed: true, radiusM: 300 });
    expect(placement['SPEC-H-004'].placed).toBe(false);
  });

  it('bundle with the ledger into seven located items, five of them placed', () => {
    const all = locateAll(CARAVAN_CORPUS, release, SPECIMEN_HEADLINES);
    expect(all).toHaveLength(7);
    expect(all.filter((entry) => entry.placement.placed)).toHaveLength(5);
    expect(all.filter((entry) => entry.item.kind === 'LEDGER_EVENT')).toHaveLength(2);
  });
});
