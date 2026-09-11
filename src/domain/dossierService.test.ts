import { describe, expect, it } from 'vitest';
import {
  COVERAGE_ASSESSMENTS, DELIVERY_RIGHT, USABLE_ASSESSMENTS, assessEvidence, coverageLevel, estimateUnits, rollupAssessment,
  type AssessmentContext, type EvidenceUnderAssessment,
} from './dossierService';
import { PERMITTED_USES } from './corpus';

const AT = '2026-09-06T09:10:00.000Z';
const context = (over: Partial<AssessmentContext> = {}): AssessmentContext => ({
  assessedAt: AT, requiredRight: DELIVERY_RIGHT, takenBack: [], alongside: [], ...over,
});
const evidence = (over: Partial<EvidenceUnderAssessment> = {}): EvidenceUnderAssessment => ({
  artifactId: 'A1', subject: 'LOT-1', claim: '4 claims rest on 3 sources.', validation: 'NOT_VALIDATED', horizonEndsAt: null,
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

  it('is conflicting when the claim was refuted', () => {
    expect(assessEvidence(evidence({ validation: 'FALSIFIED' }), context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence(evidence({ validation: 'BACKTESTED' }), context()).assessment).toBe('PRESENT');
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
    const everything = evidence({ validation: 'FALSIFIED', rights: [], horizonEndsAt: '2026-01-01T00:00:00.000Z' });
    expect(assessEvidence(everything, context()).assessment).toBe('DISALLOWED');
    expect(assessEvidence({ ...everything, rights: [DELIVERY_RIGHT] }, context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence({ ...everything, rights: [DELIVERY_RIGHT], validation: 'NOT_VALIDATED' }, context()).assessment).toBe('STALE');
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
