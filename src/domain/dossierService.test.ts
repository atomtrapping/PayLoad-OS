import { describe, expect, it } from 'vitest';
import {
  COVERAGE_ASSESSMENTS, DELIVERY_RIGHT, USABLE_ASSESSMENTS, assessEvidence, coverageLevel, estimateUnits, rollupAssessment, standingValidation,
  type AssessmentContext, type EvidenceUnderAssessment,
} from './dossierService';
import { PERMITTED_USES } from './corpus';

const AT = '2026-09-06T09:10:00.000Z';
const BEFORE = '2026-09-01T00:00:00.000Z';
const refutedAt = (validatedAt: string) => ({ outcome: 'FALSIFIED', validatedAt });
const LATER = '2026-09-07T00:00:00.000Z';
const context = (over: Partial<AssessmentContext> = {}): AssessmentContext => ({
  assessedAt: AT, requiredRight: DELIVERY_RIGHT, takenBack: [], alongside: [], ...over,
});
const evidence = (over: Partial<EvidenceUnderAssessment> = {}): EvidenceUnderAssessment => ({
  artifactId: 'A1', subject: 'LOT-1', claim: '4 claims rest on 3 sources.', validations: [], horizonEndsAt: null,
  rights: ['acquisition', 'customer_delivery', 'normalization'], inputRecordIds: ['REC-1', 'REC-2'], ...over,
});

describe('the five assessments, one artifact at a time', () => {
  it('names the mandate’s five, and the delivery right is one the corpus already names', () => {
    expect(COVERAGE_ASSESSMENTS).toEqual(['PRESENT', 'STALE', 'CONFLICTING', 'MISSING', 'DISALLOWED']);
    expect(PERMITTED_USES).toContain(DELIVERY_RIGHT);
    expect(USABLE_ASSESSMENTS).toEqual(['PRESENT']);
  });

  it('is present only by passing the three refusals', () => {
    const result = assessEvidence(evidence(), context());
    expect(result.assessment).toBe('PRESENT');
    expect(result.because).toMatch(/^Carries customer_delivery; no input corrected or withdrawn/);
  });

  it('is conflicting when a record it read was corrected: the corpus now says something else', () => {
    const result = assessEvidence(evidence(), context({ takenBack: [{ recordId: 'REC-2', kind: 'CORRECTION' }] }));
    expect(result.assessment).toBe('CONFLICTING');
    expect(result.because).toMatch(/read REC-2, which the corpus has since corrected/);
    expect(assessEvidence(evidence(), context({ takenBack: [{ recordId: 'REC-9', kind: 'CORRECTION' }] })).assessment).toBe('PRESENT');
  });

  it('is conflicting when another artifact on the facet says something else about the same subject', () => {
    const other = { artifactId: 'A2', subject: 'LOT-1', claim: '4 claims rest on 1 source.' };
    const result = assessEvidence(evidence(), context({ alongside: [other] }));
    expect(result.assessment).toBe('CONFLICTING');
    expect(result.because).toMatch(/A2 bears on the same facet/);
    expect(assessEvidence(evidence(), context({ alongside: [{ ...other, claim: evidence().claim }] })).assessment).toBe('PRESENT');
    expect(assessEvidence(evidence(), context({ alongside: [{ ...other, subject: 'LOT-2' }] })).assessment).toBe('PRESENT');
    expect(assessEvidence(evidence(), context({ alongside: [{ artifactId: 'A1', subject: 'LOT-1', claim: 'x' }] })).assessment).toBe('PRESENT');
  });

  it('is conflicting when the claim was refuted by the assessment instant', () => {
    expect(assessEvidence(evidence({ validations: [refutedAt(BEFORE)] }), context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence(evidence({ validations: [refutedAt(AT)] }), context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence(evidence({ validations: [{ outcome: 'BACKTESTED', validatedAt: BEFORE }] }), context()).assessment).toBe('PRESENT');
  });

  /* A refutation is dated like a retraction: one after the instant is not yet known to the assessment. */
  it('does not know a refutation dated after the instant', () => {
    const refutedLater = evidence({ validations: [refutedAt(LATER)] });
    expect(assessEvidence(refutedLater, context()).assessment).toBe('PRESENT');
    expect(assessEvidence(refutedLater, context()).because).toContain('not refuted');
    expect(assessEvidence(refutedLater, context({ assessedAt: LATER })).assessment).toBe('CONFLICTING');
    /* The same instant under another spelling is the same instant. */
    expect(assessEvidence(evidence({ validations: [refutedAt('2026-09-06T11:10:00+02:00')] }), context()).assessment).toBe('CONFLICTING');
  });

  /*
   * The state at an instant is the record standing then, not the artifact's
   * latest: a later check that passed does not un-refute what stood, and a
   * refutation that came after does not reach back. This is the case the
   * ledger's `dossier_expected_assessment` reads with its own ORDER BY, and
   * the two answers have to be the same one.
   */
  it('reads the validation standing at the instant, not the latest record', () => {
    const rehabilitated = evidence({ validations: [refutedAt(BEFORE), { outcome: 'HELD_OUT', validatedAt: LATER }] });
    expect(assessEvidence(rehabilitated, context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence(rehabilitated, context({ assessedAt: LATER })).assessment).toBe('PRESENT');
    const refutedTwice = evidence({ validations: [refutedAt(BEFORE), refutedAt(LATER)] });
    expect(assessEvidence(refutedTwice, context()).assessment).toBe('CONFLICTING');
    const passedThenRefuted = evidence({ validations: [{ outcome: 'HELD_OUT', validatedAt: BEFORE }, refutedAt(LATER)] });
    expect(assessEvidence(passedThenRefuted, context()).assessment).toBe('PRESENT');
    expect(assessEvidence(passedThenRefuted, context({ assessedAt: LATER })).assessment).toBe('CONFLICTING');
  });

  it('resolves the standing record the way the ledger selects it', () => {
    expect(standingValidation([], AT)).toBeNull();
    expect(standingValidation([refutedAt(LATER)], AT)).toBeNull();
    expect(standingValidation([refutedAt(BEFORE), { outcome: 'HELD_OUT', validatedAt: LATER }], AT)).toEqual(refutedAt(BEFORE));
    /* Latest by instant, not by position. */
    expect(standingValidation([{ outcome: 'HELD_OUT', validatedAt: BEFORE }, refutedAt(AT)], AT)).toEqual(refutedAt(AT));
    expect(standingValidation([refutedAt(AT), { outcome: 'HELD_OUT', validatedAt: BEFORE }], AT)).toEqual(refutedAt(AT));
  });

  it('is disallowed when its rights do not carry the right the delivery exercises', () => {
    const result = assessEvidence(evidence({ rights: ['acquisition', 'normalization'] }), context());
    expect(result.assessment).toBe('DISALLOWED');
    expect(result.because).toMatch(/customer_delivery is not among them/);
    expect(assessEvidence(evidence({ rights: ['DERIVE', 'INGEST'] }), context()).assessment).toBe('DISALLOWED');
    expect(assessEvidence(evidence({ rights: [] }), context()).because).toMatch(/are none/);
  });

  it('is stale when its horizon passed, or when a record it read was withdrawn', () => {
    expect(assessEvidence(evidence({ horizonEndsAt: '2026-09-01T00:00:00.000Z' }), context()).assessment).toBe('STALE');
    expect(assessEvidence(evidence({ horizonEndsAt: '2026-12-01T00:00:00.000Z' }), context()).assessment).toBe('PRESENT');
    const stale = assessEvidence(evidence(), context({ takenBack: [{ recordId: 'REC-2', kind: 'WITHDRAWAL' }] }));
    expect(stale.assessment).toBe('STALE');
    expect(stale.because).toMatch(/read REC-2, which the corpus has since withdrawn/);
  });

  it('reads a record both corrected and withdrawn as corrected, whichever was recorded first', () => {
    const both = [{ recordId: 'REC-2', kind: 'WITHDRAWAL' as const }, { recordId: 'REC-2', kind: 'CORRECTION' as const }];
    expect(assessEvidence(evidence(), context({ takenBack: both })).assessment).toBe('CONFLICTING');
    expect(assessEvidence(evidence(), context({ takenBack: [...both].reverse() })).assessment).toBe('CONFLICTING');
  });

  it('compares the horizon as an instant, not as a spelling', () => {
    // 10:10 at +02:00 is 08:10Z, an hour before the 09:10Z assessment; the string sorts after it.
    expect(assessEvidence(evidence({ horizonEndsAt: '2026-09-06T10:10:00+02:00' }), context()).assessment).toBe('STALE');
    // The same instant spelled differently is not before itself.
    expect(assessEvidence(evidence({ horizonEndsAt: '2026-09-06T09:10:00Z' }), context()).assessment).toBe('PRESENT');
    expect(() => assessEvidence(evidence({ horizonEndsAt: 'yesterday' }), context())).toThrow(/CORPUS_INVALID_TIMESTAMP/);
  });

  /* The order is the argument: rights gate the view; then conflict; then staleness. */
  it('keeps the precedence: disallowed over conflicting over stale', () => {
    const everything = evidence({ validations: [refutedAt(BEFORE)], rights: [], horizonEndsAt: '2026-01-01T00:00:00.000Z' });
    expect(assessEvidence(everything, context()).assessment).toBe('DISALLOWED');
    expect(assessEvidence({ ...everything, rights: [DELIVERY_RIGHT] }, context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence({ ...everything, rights: [DELIVERY_RIGHT], validations: [] }, context()).assessment).toBe('STALE');
  });
});

describe('the facet’s assessment from its artifacts’', () => {
  it('is missing with nothing, worst-first over what is not present, and present only when everything is', () => {
    expect(rollupAssessment([])).toEqual({ assessment: 'MISSING', present: 0, stale: 0, conflicting: 0, disallowed: 0 });
    expect(rollupAssessment(['PRESENT', 'CONFLICTING', 'DISALLOWED']).assessment).toBe('CONFLICTING');
    expect(rollupAssessment(['DISALLOWED', 'PRESENT'])).toEqual({ assessment: 'DISALLOWED', present: 1, stale: 0, conflicting: 0, disallowed: 1 });
    expect(rollupAssessment(['PRESENT', 'STALE']).assessment).toBe('STALE');
    expect(rollupAssessment(['STALE', 'DISALLOWED']).assessment).toBe('STALE');
    expect(rollupAssessment(['PRESENT', 'PRESENT']).assessment).toBe('PRESENT');
    expect(rollupAssessment(['DISALLOWED']).assessment).toBe('DISALLOWED');
  });

  it('counts the level over usable artifacts only', () => {
    expect(coverageLevel(0, 0)).toBe('NONE');
    expect(coverageLevel(1, 1)).toBe('THIN');
    expect(coverageLevel(2, 1)).toBe('THIN');
    expect(coverageLevel(2, 2)).toBe('SUPPORTED');
    expect(estimateUnits([{ facet: 'RISK', level: 'NONE' }, { facet: 'DEPENDENCY', level: 'THIN' }])).toBe(3);
  });
});
