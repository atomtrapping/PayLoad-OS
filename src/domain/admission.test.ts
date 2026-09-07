import { describe, expect, it } from 'vitest';
import { ADMISSION_LOSS, ADMISSION_METHOD, CHECK_MEANING, admit, admitInto, releaseLeaks, type AdmissionCandidate } from './admission';

const AUTHORITY = 'role:corpus-steward';
const RULED_AT = '2026-09-07T12:00:00Z';

function candidate(over: Partial<AdmissionCandidate> = {}): AdmissionCandidate {
  return {
    candidateId: 'cand-1',
    buildId: 'build-9',
    recordId: 'REC-1',
    subjectCanonicalId: 'notation://subject/facility-1',
    origin: 'MEASURED',
    evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'unknown' },
    provenance: { artifactDigest: 'a'.repeat(64), capturedAt: '2026-09-07T06:00:00Z' },
    validFrom: '2026-09-07T06:00:00Z',
    knownAt: '2026-09-07T09:00:00Z',
    rightsDecision: 'PERMITTED',
    ...over,
  };
}

describe('the admission authority: the gate the store says it is owed', () => {
  it('admits a complete candidate, and says admission is not truth', () => {
    const ruling = admit(candidate(), AUTHORITY, RULED_AT);
    expect(ruling.outcome).toBe('ADMITTED');
    expect(ruling.failed).toEqual([]);
    expect(ruling.passed).toHaveLength(7);
    expect(ruling.authority).toBe(AUTHORITY);
    expect(ruling.because).toMatch(/does not say the claim is true/);
    expect(ADMISSION_LOSS.join(' ')).toMatch(/no number of passed checks makes it true/);
  });

  it('fails a check it cannot evaluate, because an undeclared axis is not a weak one', () => {
    const noClass = admit(candidate({ evidenceClass: { claimStrength: 'reported', productionClass: null, interest: 'unknown' } }), AUTHORITY, RULED_AT);
    expect(noClass.outcome).toBe('REFUSED');
    expect(noClass.failed[0].because).toMatch(/an undeclared axis is not a weak one/);

    const unclassified = admit(candidate({ evidenceClass: { claimStrength: 'reported', productionClass: 'unclassified', interest: 'unknown' } }), AUTHORITY, RULED_AT);
    expect(unclassified.failed.map((f) => f.check)).toContain('EVIDENCE_CLASS_COMPLETE');
    expect(unclassified.failed[0].because).toMatch(/inadmissible for canonical assertion/);

    const noDigest = admit(candidate({ provenance: { artifactDigest: null, capturedAt: null } }), AUTHORITY, RULED_AT);
    expect(noDigest.failed.map((f) => f.check)).toContain('EVIDENCE_ARTIFACT_BOUND');
    expect(noDigest.failed[0].because).toMatch(/points at no retained bytes/);

    const noSubject = admit(candidate({ subjectCanonicalId: '  ' }), AUTHORITY, RULED_AT);
    expect(noSubject.failed.map((f) => f.check)).toContain('SUBJECT_IDENTIFIED');
  });

  it('treats an undecided right as a refusal and never as a default permission', () => {
    for (const decision of ['UNDECIDED', 'PROHIBITED', null] as const) {
      const ruling = admit(candidate({ rightsDecision: decision }), AUTHORITY, RULED_AT);
      expect(ruling.outcome).toBe('REFUSED');
      expect(ruling.failed.find((f) => f.check === 'RIGHTS_DECIDED')!.because).toMatch(/never a default permission/);
    }
  });

  it('refuses an origin that could not be evidence at all', () => {
    for (const origin of ['ASSUMED', 'SIMULATED']) {
      const ruling = admit(candidate({ origin }), AUTHORITY, RULED_AT);
      expect(ruling.outcome).toBe('REFUSED');
      expect(ruling.failed.find((f) => f.check === 'ORIGIN_ADMISSIBLE')!.because).toMatch(/not an observation of the world/);
    }
    expect(admit(candidate({ origin: null }), AUTHORITY, RULED_AT).failed.map((f) => f.check)).toContain('ORIGIN_ADMISSIBLE');
  });

  it('refuses a record knowable before the evidence it descends from was captured', () => {
    const ruling = admit(candidate({ knownAt: '2026-09-07T05:00:00Z' }), AUTHORITY, RULED_AT);
    expect(ruling.failed.find((f) => f.check === 'BOTH_CLOCKS')!.because).toMatch(/knowable before its evidence existed/);
    expect(admit(candidate({ validFrom: null }), AUTHORITY, RULED_AT).failed.map((f) => f.check)).toContain('BOTH_CLOCKS');
    expect(admit(candidate({ knownAt: 'Tuesday' }), AUTHORITY, RULED_AT).failed.map((f) => f.check)).toContain('BOTH_CLOCKS');
  });

  it('will not admit on its own behalf', () => {
    // Rule 7: promotion is an act at a boundary, with a record. A process
    // promoting its own output is a write wearing a ruling's clothes.
    const itself = admit(candidate(), ADMISSION_METHOD, RULED_AT);
    expect(itself.outcome).toBe('REFUSED');
    expect(itself.failed.find((f) => f.check === 'AUTHORITY_IS_NOT_THE_PROCESS')!.because).toMatch(/Nothing admits on its own behalf/);
    expect(admit(candidate(), '', RULED_AT).outcome).toBe('REFUSED');
    expect(CHECK_MEANING.AUTHORITY_IS_NOT_THE_PROCESS).toMatch(/a write wearing a ruling’s clothes/);
  });

  it('produces ancestry only for what it admitted, so a caller cannot have one without the other', () => {
    const { rulings, ancestry } = admitInto({ releaseId: 'REL-1' }, [
      candidate({ candidateId: 'cand-1', recordId: 'REC-1' }),
      candidate({ candidateId: 'cand-2', recordId: 'REC-2', rightsDecision: 'UNDECIDED' }),
    ], AUTHORITY, RULED_AT);
    expect(rulings.map((r) => r.outcome)).toEqual(['ADMITTED', 'REFUSED']);
    expect(ancestry).toHaveLength(1);
    expect(ancestry[0]).toMatchObject({ recordId: 'REC-1', releaseId: 'REL-1', candidateId: 'cand-1', buildId: 'build-9', authority: AUTHORITY });
    // A refusal is a record too: it names why, and nothing is hidden.
    expect(rulings[1].failed).not.toEqual([]);
    expect(ADMISSION_LOSS.join(' ')).toMatch(/A refusal is a record too/);
  });

  it('checks rule 2 rather than asserting it: no rail identifier reaches the release', () => {
    const { ancestry } = admitInto({ releaseId: 'REL-1' }, [candidate()], AUTHORITY, RULED_AT);
    const clean = { releaseId: 'REL-1', records: [{ recordId: 'REC-1', value: '12.4 m' }] };
    expect(releaseLeaks(clean, ancestry)).toEqual([]);
    // The build id leaking through a provenance field is exactly the failure
    // rule 2 forbids, and it is caught wherever in the release it appears.
    const leaky = { releaseId: 'REL-1', records: [{ recordId: 'REC-1', builtBy: 'build-9' }] };
    expect(releaseLeaks(leaky, ancestry)).toEqual(['build-9']);
    const both = { releaseId: 'REL-1', note: 'from cand-1 in build-9' };
    expect(releaseLeaks(both, ancestry)).toEqual(['build-9', 'cand-1']);
    expect(ADMISSION_LOSS.join(' ')).toMatch(/which releaseLeaks checks rather than the comment claiming it/);
  });
});
