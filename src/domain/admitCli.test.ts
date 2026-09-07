import { describe, expect, it } from 'vitest';
import { ADMIT_CLI_HELP, parseAdmitArgs, runAdmit, type AdmitCliArgs } from './admitCli';
import type { AdmissionCandidate } from './admission';

const ARGS: AdmitCliArgs = { candidatesPath: 'c.json', authority: 'role:corpus-steward', at: '2026-09-07T12:00:00Z', write: false };

function candidate(over: Partial<AdmissionCandidate> = {}): AdmissionCandidate {
  return {
    candidateId: 'cand-1', buildId: 'build-9', recordId: 'REC-1',
    subjectCanonicalId: 'notation://subject/facility-1', origin: 'MEASURED',
    evidenceClass: { claimStrength: 'reported', productionClass: 'measured', interest: 'unknown' },
    provenance: { artifactDigest: 'a'.repeat(64), capturedAt: '2026-09-07T06:00:00Z' },
    provenanceClass: 'LIVE_CAPTURE', sourceTime: '2026-09-07T05:30:00Z', conditions: [],
    validFrom: '2026-09-07T06:00:00Z', knownAt: '2026-09-07T09:00:00Z', rightsDecision: 'PERMITTED',
    ...over,
  };
}

describe('the admit command', () => {
  it('will not invent an authority or a clock', () => {
    // An admission names who made it and when. A command that defaulted
    // either would make the act anonymous or its instant an accident of when
    // the process happened to run.
    expect(() => parseAdmitArgs(['--candidates', 'c.json', '--at', ARGS.at])).toThrow(/--authority is required and has no default/);
    expect(() => parseAdmitArgs(['--candidates', 'c.json', '--authority', 'x'])).toThrow(/--at is required/);
    expect(() => parseAdmitArgs(['--authority', 'x', '--at', ARGS.at])).toThrow(/--candidates is required/);
    expect(() => parseAdmitArgs(['--candidates', 'c.json', '--authority', 'x', '--at', 'now'])).toThrow(/never taken from the clock this process happened to run on/);
    expect(parseAdmitArgs(['--candidates', 'c.json', '--authority', 'role:x', '--at', ARGS.at]))
      .toMatchObject({ candidatesPath: 'c.json', authority: 'role:x', at: ARGS.at, write: false });
    expect(parseAdmitArgs([])).toEqual({ help: ADMIT_CLI_HELP });
  });

  it('rules and reports, and will not pretend to have written', () => {
    const result = runAdmit(ARGS, [candidate(), candidate({ candidateId: 'cand-2', recordId: 'REC-2', rightsDecision: 'UNDECIDED' })]);
    expect(result.mode).toBe('RULED_NOT_WRITTEN');
    expect(result.wouldWrite).toEqual(['REC-1']);
    expect(result.refused).toBe(1);
    expect(result.because).toMatch(/Nothing was written: this command rules, and the one door writes/);
    // Every ruling is printed, admitted or refused, because a refusal is a record too.
    expect(result.rulings).toHaveLength(2);
    expect(result.rulings.map((r) => r.outcome)).toEqual(['ADMITTED', 'REFUSED']);
    expect(result.rulings[1].failed.length).toBeGreaterThan(0);
  });

  it('refuses --write rather than writing without the door', () => {
    expect(() => runAdmit({ ...ARGS, write: true }, [candidate()]))
      .toThrow(/goes through src\/db\/admitRecords\.ts/);
    expect(() => runAdmit({ ...ARGS, write: true }, [candidate()])).toThrow(/will not pretend to have written/);
  });

  it('counts a conditional admission as one that would be written, with its conditions intact', () => {
    const conditions = ['Admissible for underwriting only while the registration stays active.'];
    const result = runAdmit(ARGS, [candidate({ conditions })]);
    expect(result.rulings[0].outcome).toBe('ADMITTED_WITH_CONDITIONS');
    expect(result.rulings[0].conditions).toEqual(conditions);
    expect(result.wouldWrite).toEqual(['REC-1']);
    expect(result.refused).toBe(0);
  });
});
