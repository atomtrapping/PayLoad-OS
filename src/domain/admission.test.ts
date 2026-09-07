import { describe, expect, it } from 'vitest';
import { ADMISSION_LOSS, ADMISSION_METHOD, ADMITTED_PROVENANCE, CHECK_MEANING, isAdmitting, RECORD_PROVENANCE, admit, admitInto, admittedRow, crossedTheGate, releaseLeaks, type AdmissionCandidate } from './admission';

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
    provenanceClass: 'LIVE_CAPTURE',
    sourceTime: '2026-09-07T05:30:00Z',
    conditions: [],
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
    expect(ruling.passed).toHaveLength(9);
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

  it('requires provenance to be declared, and infers it from nothing', () => {
    // Inferred provenance is a guess about testimony, one waterline below
    // testimony. A wide gap between the clocks is not evidence of backfill.
    const undeclared = admit(candidate({ provenanceClass: null }), AUTHORITY, RULED_AT);
    expect(undeclared.outcome).toBe('REFUSED');
    expect(undeclared.failed.find((f) => f.check === 'PROVENANCE_DECLARED')!.because).toMatch(/nothing here infers it from the clocks/);
    // Declared backfill with a seven-year gap admits; the gap decides nothing.
    const old = admit(candidate({ provenanceClass: 'BACKFILLED', sourceTime: '2019-06-02T00:00:00Z', validFrom: '2019-06-01T00:00:00Z' }), AUTHORITY, RULED_AT);
    expect(old.outcome).toBe('ADMITTED');
    expect(CHECK_MEANING.PROVENANCE_DECLARED).toMatch(/one waterline below testimony itself/);
  });

  it('refuses a record obtained before its source published it', () => {
    const impossible = admit(candidate({ sourceTime: '2026-09-07T07:00:00Z' }), AUTHORITY, RULED_AT);
    expect(impossible.failed.find((f) => f.check === 'SOURCE_CLOCK_COHERENT')!.because).toMatch(/did not arrive the way it claims to have arrived/);
    expect(admit(candidate({ sourceTime: null }), AUTHORITY, RULED_AT).failed.map((f) => f.check)).toContain('SOURCE_CLOCK_COHERENT');
  });

  it('yields a writable row only from an admission, stamped at entry', () => {
    const proposed = candidate();
    const ruling = admit(proposed, AUTHORITY, RULED_AT);
    const { row, because } = admittedRow(proposed, ruling);
    expect(row).toMatchObject({
      recordId: 'REC-1',
      sourceTime: '2026-09-07T05:30:00Z',
      acquisitionTime: '2026-09-07T06:00:00Z',
      provenance: 'LIVE_CAPTURE',
      admittedBy: AUTHORITY,
      ruledAt: RULED_AT,
    });
    expect(because).toMatch(/fixed at the moment of admission rather than worked out afterwards/);

    // A refusal never yields a row: there is no partial write.
    const refusedCandidate = candidate({ rightsDecision: 'UNDECIDED' });
    const refused = admittedRow(refusedCandidate, admit(refusedCandidate, AUTHORITY, RULED_AT));
    expect(refused.row).toBeNull();
    expect(refused.because).toMatch(/was refused, so there is no row/);

    // And a ruling does not travel between candidates.
    const mismatched = admittedRow(candidate({ candidateId: 'cand-other' }), ruling);
    expect(mismatched.row).toBeNull();
    expect(mismatched.because).toMatch(/A ruling does not travel between candidates/);
    expect(ADMISSION_LOSS.join(' ')).toMatch(/The entry stamp is not reconstructable/);
  });

  it('cannot stamp a demonstration row, and a demonstration row is not admitted state', () => {
    // The seeder writes committed fixtures into the canonical records table
    // so the pages have something to show. The column is what keeps them from
    // reading as admitted state, and the two writers are disjoint by type.
    expect(RECORD_PROVENANCE).toEqual(['LIVE_CAPTURE', 'BACKFILLED', 'DEMONSTRATION']);
    expect(ADMITTED_PROVENANCE).toEqual(['LIVE_CAPTURE', 'BACKFILLED']);
    expect(ADMITTED_PROVENANCE).not.toContain('DEMONSTRATION');
    expect(crossedTheGate('DEMONSTRATION')).toBe(false);
    expect(crossedTheGate('LIVE_CAPTURE')).toBe(true);
    expect(crossedTheGate('BACKFILLED')).toBe(true);

    // A candidate cannot declare itself a demonstration into the gate: the
    // provenance check accepts only the two the gate may stamp.
    const posing = admit(candidate({ provenanceClass: 'DEMONSTRATION' as never }), AUTHORITY, RULED_AT);
    expect(posing.outcome).toBe('REFUSED');
    expect(posing.failed.map((f) => f.check)).toContain('PROVENANCE_DECLARED');

    // And every row the gate does produce crossed it.
    const proposed = candidate();
    const { row } = admittedRow(proposed, admit(proposed, AUTHORITY, RULED_AT));
    expect(crossedTheGate(row!.provenance)).toBe(true);
  });

  it('speaks the workbench\u2019s ruling vocabulary, and a conditional admission carries its conditions to the row', () => {
    const plain = admit(candidate(), AUTHORITY, RULED_AT);
    expect(plain.outcome).toBe('ADMITTED');
    expect(plain.conditions).toEqual([]);

    const conditions = ['Admissible for underwriting only while the carrier registration stays active.'];
    const conditional = candidate({ conditions });
    const ruling = admit(conditional, AUTHORITY, RULED_AT);
    expect(ruling.outcome).toBe('ADMITTED_WITH_CONDITIONS');
    expect(isAdmitting(ruling.outcome)).toBe(true);
    // Verbatim, never summarised: a paraphrased condition is one nobody agreed to.
    expect(ruling.conditions).toEqual(conditions);
    expect(ruling.because).toMatch(/Dropping them reads this as the wrong word/);

    // And they reach the row, so downstream cannot read it as unconditional.
    const { row } = admittedRow(conditional, ruling);
    expect(row!.outcome).toBe('ADMITTED_WITH_CONDITIONS');
    expect(row!.conditions).toEqual(conditions);
    expect(ADMISSION_LOSS.join(' ')).toMatch(/not a weaker admission/);

    // A refused candidate carries no conditions forward at all.
    const refused = admit(candidate({ conditions, rightsDecision: 'UNDECIDED' }), AUTHORITY, RULED_AT);
    expect(refused.outcome).toBe('REFUSED');
    expect(refused.conditions).toEqual([]);
    expect(isAdmitting(refused.outcome)).toBe(false);
  });

  it('lets a ruling replace a ruling about the same record, and nothing else', () => {
    const replacement = admit(candidate(), AUTHORITY, RULED_AT, { rulingId: 'rul-prior', recordId: 'REC-1' });
    expect(replacement.outcome).toBe('ADMITTED');
    expect(replacement.supersedesRulingId).toBe('rul-prior');

    const elsewhere = admit(candidate(), AUTHORITY, RULED_AT, { rulingId: 'rul-other', recordId: 'REC-ELSEWHERE' });
    expect(elsewhere.outcome).toBe('REFUSED');
    expect(elsewhere.failed.find((f) => f.check === 'SUPERSESSION_IS_ABOUT_THIS_RECORD')!.because)
      .toMatch(/replaces a ruling about the same record or it replaces nothing/);
    expect(elsewhere.supersedesRulingId).toBeNull();
    expect(CHECK_MEANING.SUPERSESSION_IS_ABOUT_THIS_RECORD).toMatch(/silently retire a decision nobody revisited/);
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
