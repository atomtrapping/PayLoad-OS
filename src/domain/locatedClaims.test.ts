/**
 * A claim met by the corpus: the four states, the two clocks, and no fake pins.
 */
import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease } from './corpus';
import {
  CORROBORATION_LABEL, CORROBORATION_MEANING, LOCATED_CLAIM_LOSS, WIRE_EVIDENCE_CLASS,
  corroborate, corroborateAt, locateAll, locateLedgerEvents, placementOf, validateClaim,
  type LocatedClaim,
} from './locatedClaims';

const corpus = CARAVAN_CORPUS;
const release = currentRelease(corpus);
const record = (id: string) => corpus.records.find((entry) => entry.recordId === id)!;

function claim(overrides: Partial<LocatedClaim> = {}): LocatedClaim {
  return {
    kind: 'CLAIM', claimId: 'T-1', headline: 'Terminal weighbridge puts lot 5B-221 at 40.10 t gross',
    source: { sourceId: 'specimen-wire', displayName: 'Drafted specimen — not a publication' },
    evidenceClass: WIRE_EVIDENCE_CLASS, publishedAt: '2026-08-26T08:00:00Z', capturedAt: '2026-08-26T09:00:00Z',
    beganAs: 'DRAFTED_SPECIMEN',
    geocode: { point: { kind: 'POINT', datum: 'WGS84', longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 300 }, method: 'notationsos.geocode.declared.v1', because: 'declared by the drafter' },
    asserts: { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', value: 40.10, validAt: record('REC-0204').validFrom },
    ...overrides,
  };
}

describe('the four states ride on the check vocabulary', () => {
  it('labels every check status and gives each a meaning', () => {
    expect(CORROBORATION_LABEL).toEqual({ PASSED: 'CORROBORATED', FAILED: 'CONFLICTING', NOT_EVALUATED: 'UNCORROBORATED', NOT_APPLICABLE: 'NOT_IN_COVERAGE' });
    for (const status of Object.keys(CORROBORATION_LABEL) as Array<keyof typeof CORROBORATION_MEANING>) expect(CORROBORATION_MEANING[status].length).toBeGreaterThan(0);
  });

  it('corroborates a value inside the record’s stated bounds', () => {
    const now = corroborateAt(corpus, release, claim(), release.knownAt);
    expect(now.status).toBe('PASSED');
    expect(now.label).toBe('CORROBORATED');
    expect(now.record?.recordId).toBe('REC-0204');
    expect(now.record?.uncertainty).toMatchObject({ low: 40.08, high: 40.16 });
    expect(now.because).toMatch(/within REC-0204’s stated bounds \[40\.08, 40\.16\] t/);
  });

  it('conflicts with a value outside the bounds, and says which record holds what', () => {
    const now = corroborateAt(corpus, release, claim({ asserts: { subjectId: 'LOT-7C-104', predicate: 'quantity.gross', value: 21.5, validAt: record('REC-0302').validFrom } }), release.knownAt);
    expect(now.status).toBe('FAILED');
    expect(now.label).toBe('CONFLICTING');
    expect(now.because).toMatch(/falls outside REC-0302’s stated bounds \[19\.94, 19\.98\] t/);
    expect(now.because).toMatch(/The record holds 19\.96 t/);
  });

  it('assumes no tolerance when the record states no bounds and the values differ', () => {
    // Before the weighbridge ticket became knowable, the draft survey (40.0, no bounds) was current.
    const before = corroborateAt(corpus, release, claim({ asserts: { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', value: 40.05, validAt: record('REC-0203').validFrom } }), '2026-08-20T00:00:00Z');
    expect(before.record?.recordId).toBe('REC-0203');
    expect(before.status).toBe('NOT_EVALUATED');
    expect(before.label).toBe('UNCORROBORATED');
    expect(before.because).toMatch(/No tolerance is assumed/);
  });

  it('holds equality as the only agreement a bound-less record can offer', () => {
    const before = corroborateAt(corpus, release, claim({ asserts: { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', value: 40.0, validAt: record('REC-0203').validFrom } }), '2026-08-20T00:00:00Z');
    expect(before.status).toBe('PASSED');
    expect(before.because).toMatch(/equality is the only agreement available/);
  });

  it('is not in coverage when the corpus refuses for want of an identity link, carrying the corpus’s own reason', () => {
    const now = corroborateAt(corpus, release, claim({ asserts: { subjectId: 'LOT-7C-104', predicate: 'condition.moisture', value: 7.9, validAt: '2026-08-28T14:00:00Z' } }), release.knownAt);
    expect(now.status).toBe('NOT_APPLICABLE');
    expect(now.label).toBe('NOT_IN_COVERAGE');
    expect(now.refusal?.code).toBe('NO_IDENTITY_LINK');
    expect(now.because).toMatch(/^NO_IDENTITY_LINK:/);
    expect(now.because).toMatch(/never merges on similarity/);
  });

  it('is not in coverage when the headline names no predicate at all, and asks the corpus nothing', () => {
    const now = corroborateAt(corpus, release, claim({ asserts: null }), release.knownAt);
    expect(now.status).toBe('NOT_APPLICABLE');
    expect(now.record).toBeNull();
    expect(now.refusal).toBeNull();
    expect(now.because).toMatch(/names no predicate this corpus holds/);
  });

  it('treats a categorical mismatch as a conflict, because a different value is a different claim', () => {
    // A custody record the seat is shown, asked at its own validity start with the release's knowledge.
    const custody = corpus.records.find((entry) => typeof entry.value === 'string' && entry.predicate.startsWith('custody.') && entry.visibility === 'COUNTERPARTY_SHARED')!;
    const same = corroborateAt(corpus, release, claim({ asserts: { subjectId: custody.subjectId, predicate: custody.predicate, value: String(custody.value), validAt: custody.validFrom } }), release.knownAt);
    const other = corroborateAt(corpus, release, claim({ asserts: { subjectId: custody.subjectId, predicate: custody.predicate, value: 'somebody else entirely', validAt: custody.validFrom } }), release.knownAt);
    // Both ask the same question; only the value differs, so any refusal would hit both alike.
    expect(same.refusal).toEqual(other.refusal);
    if (same.refusal === null) {
      expect(same.status).toBe('PASSED');
      expect(other.status).toBe('FAILED');
      expect(other.because).toMatch(/A categorical value has no tolerance/);
    }
  });
});

describe('two clocks, both shown', () => {
  it('reads a draft-survey headline as corroborated at capture and conflicting now, because the corpus learned something between', () => {
    const reading = corroborate(corpus, release, claim({ capturedAt: '2026-08-20T09:00:00Z', publishedAt: '2026-08-20T08:00:00Z', asserts: { subjectId: 'LOT-5B-221', predicate: 'quantity.gross', value: 40.0, validAt: record('REC-0203').validFrom } }));
    expect(reading.atCapture.status).toBe('PASSED');
    expect(reading.atCapture.record?.recordId).toBe('REC-0203');
    expect(reading.now.status).toBe('FAILED');
    expect(reading.now.record?.recordId).toBe('REC-0204');
    expect(reading.atCapture.knownAt).toBe('2026-08-20T09:00:00Z');
    expect(reading.now.knownAt).toBe(release.knownAt);
  });
});

describe('never a fake pin', () => {
  it('places a geocode only with a radius', () => {
    expect(placementOf(claim().geocode)).toEqual({ placed: true, radiusM: 300 });
    const noRadius = placementOf({ ...claim().geocode, point: { kind: 'POINT', datum: 'WGS84', longitude: 4.025, latitude: 51.9497 } });
    expect(noRadius.placed).toBe(false);
    if (!noRadius.placed) expect(noRadius.because).toMatch(/precision claim nobody made/);
    expect(placementOf(null).placed).toBe(false);
  });

  it('refuses coordinates outside the datum', () => {
    const off = placementOf({ ...claim().geocode, point: { kind: 'POINT', datum: 'WGS84', longitude: 190, latitude: 0, horizontalUncertaintyM: 10 } });
    expect(off.placed).toBe(false);
  });
});

describe('the ledger is the best source there is', () => {
  it('places the correction at lot 5B-221’s own berth and leaves the sample withdrawal unplaced', () => {
    const events = locateLedgerEvents(corpus, release);
    expect(events.map((event) => event.eventId)).toEqual(['RET-0001', 'RET-0002']);
    const correction = events[0];
    expect(correction.subjectId).toBe('LOT-5B-221');
    expect(correction.geocode?.point).toMatchObject({ longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 250 });
    expect(correction.geocode?.because).toMatch(/last declared position, REC-0207, valid 2026-08-15T06:00:00Z → 2026-08-18T00:00:00Z/);
    expect(correction.geocode?.because).toMatch(/Where the subject was when RET-0001 was issued is not held/);
    const withdrawal = events[1];
    expect(withdrawal.affectedSubjectIds).toEqual(['SAMPLE-S-4390']);
    expect(withdrawal.geocode).toBeNull();
    expect(placementOf(withdrawal.geocode).placed).toBe(false);
  });

  it('bundles the ledger’s events with the supplied claims, each with its placement and readings', () => {
    const all = locateAll(corpus, release, [claim()]);
    expect(all).toHaveLength(3);
    expect(all[0].item.kind).toBe('LEDGER_EVENT');
    expect(all[0].reading).toBeNull();
    expect(all[2].item.kind).toBe('CLAIM');
    expect(all[2].reading?.now.label).toBe('CORROBORATED');
    expect(all[2].placement).toEqual({ placed: true, radiusM: 300 });
  });
});

describe('a claim is validated at the boundary', () => {
  it('refuses a claim captured before its source published it', () => {
    const refused = validateClaim(claim({ capturedAt: '2026-08-26T07:00:00Z' }));
    expect(refused.claim).toBeNull();
    expect(refused.because).toMatch(/cannot have obtained a headline before its source published it/);
  });

  it('refuses a claim that does not say whether it was captured or drafted', () => {
    const refused = validateClaim(claim({ beganAs: 'FOUND_SOMEWHERE' as LocatedClaim['beganAs'] }));
    expect(refused.claim).toBeNull();
    expect(refused.because).toMatch(/will not guess/);
  });

  it('refuses a claim with no source, no headline, or a geocode with no method', () => {
    expect(validateClaim(claim({ headline: '  ' })).claim).toBeNull();
    expect(validateClaim(claim({ source: { sourceId: '', displayName: '' } })).claim).toBeNull();
    expect(validateClaim(claim({ geocode: { ...claim().geocode, method: '' } })).claim).toBeNull();
  });

  it('accepts a well-formed claim and believes none of it', () => {
    const accepted = validateClaim(claim());
    expect(accepted.claim).not.toBeNull();
    expect(accepted.because).toMatch(/Nothing here is believed/);
  });
});

describe('what the reading gives up', () => {
  it('states its losses, beginning with a headline never being a fact', () => {
    expect(LOCATED_CLAIM_LOSS[0]).toMatch(/A headline is a claim, never a fact/);
    expect(LOCATED_CLAIM_LOSS.join(' ')).toMatch(/CORROBORATED and not CONFIRMED/);
    expect(LOCATED_CLAIM_LOSS.join(' ')).toMatch(/Nothing writes/);
  });
});
