import { describe, expect, it } from 'vitest';
import {
  COVERAGE_ASSESSMENTS, DELIVERY_RIGHT, USABLE_ASSESSMENTS, assessEvidence, coverageLevel, estimateUnits, rollupAssessment,
  type AssessmentContext, type EvidenceUnderAssessment,
} from './dossierService';
import { PERMITTED_USES } from './corpus';

const AT = '2026-09-06T09:10:00.000Z';
const context = (over: Partial<AssessmentContext> = {}): AssessmentContext => ({
  assessedAt: AT, requiredRight: DELIVERY_RIGHT, contradictedSubjects: new Set(), takenBackRecordIds: new Set(), ...over,
});
const evidence = (over: Partial<EvidenceUnderAssessment> = {}): EvidenceUnderAssessment => ({
  artifactId: 'A1', subject: 'LOT-1', validation: 'NOT_VALIDATED', horizonEndsAt: null,
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
    expect(result.because).toMatch(/carrying customer_delivery/);
  });

  it('is conflicting when the state ledger records a contradiction about its subject', () => {
    expect(assessEvidence(evidence(), context({ contradictedSubjects: new Set(['LOT-1']) })).assessment).toBe('CONFLICTING');
    expect(assessEvidence(evidence({ subject: 'LOT-2' }), context({ contradictedSubjects: new Set(['LOT-1']) })).assessment).toBe('PRESENT');
  });

  it('is conflicting when the claim was falsified', () => {
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

  it('is stale when its horizon passed, or when a record it read was taken back', () => {
    expect(assessEvidence(evidence({ horizonEndsAt: '2026-09-01T00:00:00.000Z' }), context()).assessment).toBe('STALE');
    expect(assessEvidence(evidence({ horizonEndsAt: '2026-12-01T00:00:00.000Z' }), context()).assessment).toBe('PRESENT');
    const stale = assessEvidence(evidence(), context({ takenBackRecordIds: new Set(['REC-2']) }));
    expect(stale.assessment).toBe('STALE');
    expect(stale.because).toMatch(/read REC-2/);
    expect(assessEvidence(evidence(), context({ takenBackRecordIds: new Set(['REC-9']) })).assessment).toBe('PRESENT');
  });

  /* The order is the argument: a conflict outranks a rights refusal outranks staleness. */
  it('keeps the precedence: conflicting over disallowed over stale', () => {
    const everything = evidence({ validation: 'FALSIFIED', rights: [], horizonEndsAt: '2026-01-01T00:00:00.000Z' });
    expect(assessEvidence(everything, context()).assessment).toBe('CONFLICTING');
    expect(assessEvidence({ ...everything, validation: 'NOT_VALIDATED' }, context()).assessment).toBe('DISALLOWED');
    expect(assessEvidence({ ...everything, validation: 'NOT_VALIDATED', rights: [DELIVERY_RIGHT] }, context()).assessment).toBe('STALE');
  });
});

describe('the facet’s assessment from its artifacts’', () => {
  it('is missing with nothing, conflicting whenever anything conflicts, present whenever anything is present', () => {
    expect(rollupAssessment([])).toBe('MISSING');
    expect(rollupAssessment(['PRESENT', 'CONFLICTING', 'DISALLOWED'])).toBe('CONFLICTING');
    expect(rollupAssessment(['DISALLOWED', 'PRESENT'])).toBe('PRESENT');
    expect(rollupAssessment(['DISALLOWED', 'STALE'])).toBe('STALE');
    expect(rollupAssessment(['DISALLOWED'])).toBe('DISALLOWED');
  });

  it('counts the level over usable artifacts only', () => {
    expect(coverageLevel(0, 0)).toBe('NONE');
    expect(coverageLevel(1, 1)).toBe('THIN');
    expect(coverageLevel(2, 1)).toBe('THIN');
    expect(coverageLevel(2, 2)).toBe('SUPPORTED');
    expect(estimateUnits([{ facet: 'RISK', level: 'NONE' }, { facet: 'DEPENDENCY', level: 'THIN' }])).toBe(3);
  });
});
