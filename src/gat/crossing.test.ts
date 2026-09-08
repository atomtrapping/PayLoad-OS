/**
 * The crossing, tested against the shapes both sides actually declare.
 *
 * The receipt here is hand-built and typed as `GatReceipt`, so it cannot drift
 * from the adapter's interface without failing to compile — which is the point
 * of a consumer-side contract test. The check coverage is asserted against
 * `CHECK_MEANING` itself rather than a copy, so a tenth gate check arriving in
 * the corpus fails here until the crossing has read it.
 */
import { describe, expect, it } from 'vitest';
import { CHECK_MEANING, RECORD_PROVENANCE } from '../domain/admission';
import { cardGrade } from '../domain/computationCard';
import {
  CROSSING_DECLARED_BY, CROSSING_LOSS, ENGINE_ARITHMETIC, ENVELOPE_FACTS,
  admissionStanding, computationArtifactFor, envelopeDropped, readCrossing,
  replayQualification, structuralRefusals,
} from './crossing';
import type { GatReceipt } from './contracts';
import { GAT_ADAPTER_VERSION, GAT_RUNTIME_IDENTITY } from './pin';

const DIGEST = (tag: string) => `sha256:${tag.repeat(64).slice(0, 64)}`;

function receipt(overrides: Partial<GatReceipt> = {}): GatReceipt {
  return {
    schema: 'payload.gat-execution-receipt.v1',
    request: {
      schema: 'payload.gat-audit-request.v1', requestId: 'gat-audit-1', operation: 'IFC_AUDIT',
      adapterVersion: GAT_ADAPTER_VERSION, purpose: 'GAT_TEST',
      source: { acquisition: { id: 'acq-1', digest: DIGEST('a') }, evidence: { id: 'ev-1', contentDigest: DIGEST('b') } },
    },
    requestDigest: DIGEST('c'), reservationDigest: DIGEST('d'),
    startedAt: '2026-09-05T12:00:00.000Z', completedAt: '2026-09-05T12:00:04.000Z',
    engine: { repository: 'https://github.com/notationsystems/BIM-State-Transformer-Engine', commit: '80272f94107cce4f70c81e57915800b04c5944a6', sourceTreeDigest: DIGEST('e'), adapterVersion: GAT_ADAPTER_VERSION, pinDigest: DIGEST('f') },
    runtime: GAT_RUNTIME_IDENTITY,
    outcome: 'SUPPORTED_SCOPE_AUDIT', sourceVerified: true,
    sourcePolicy: { id: 'gat-policy-1', digest: DIGEST('0'), policyVersion: '1.0.0' },
    deriveDecision: {
      decisionId: 'dec-1', requestId: 'gat-audit-1', registrationId: 'gat-policy-1', sourceId: 'notation://source/local/gat-demo',
      request: { purpose: 'GAT_TEST', operation: 'DERIVE', audience: 'INTERNAL', requestedAt: '2026-09-05T12:00:00.000Z' },
      state: 'ALLOWED', reasons: [], evaluatedAt: '2026-09-05T12:00:00.000Z',
    },
    report: { id: 'rep-1', contentDigest: DIGEST('1'), byteLength: 4096 },
    projection: { id: 'proj-1', contentDigest: DIGEST('2'), byteLength: 2048 },
    stages: { evidence: 'PASS', processingPermission: 'ALLOWED', execution: 'COMPLETED', report: 'RETAINED', parse: 'PASS', lowering: 'PASS', compilation: 'PASS', verification: 'PASS' },
    mode: 'LOCAL_DEVELOPMENT', policyAuthority: 'OPERATOR_DECLARATION',
    canonicalAdmission: false, independentlyVerified: false, sourceTruthClaimed: false, physicalActionAuthorized: false,
    digest: DIGEST('3'),
    ...overrides,
  };
}

describe('the first question: is the run recoverable', () => {
  it('grades a complete run as replayable here, never card grade, because the arithmetic is floating point', () => {
    const verdict = cardGrade(computationArtifactFor(receipt()));
    expect(verdict.grade).toBe('REPLAYABLE_HERE');
    expect(ENGINE_ARITHMETIC).toBe('FLOATING_POINT');
    expect(verdict.missing.join(' ')).toMatch(/BLAS dispatch/);
  });

  it('carries every input by content digest, so none is referenced by a location', () => {
    const artifact = computationArtifactFor(receipt());
    expect(artifact.inputs).toHaveLength(4);
    for (const input of artifact.inputs) {
      expect(input.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(input.reference).toBe(input.digest);
    }
  });

  it('names the method and executor at exact versions rather than ranges or moving targets', () => {
    const artifact = computationArtifactFor(receipt());
    expect(artifact.method).toEqual({ id: 'payload.gat-ifc-audit', version: GAT_ADAPTER_VERSION });
    expect(artifact.executor?.version).toMatch(/^[0-9a-f]{40}$/);
    expect(cardGrade(artifact).missing.join(' ')).not.toMatch(/version|moving target/);
  });

  it('drops to a note when the report was not retained, because a replay has nothing to compare against', () => {
    const verdict = cardGrade(computationArtifactFor(receipt({ report: null })));
    expect(verdict.grade).toBe('LOG_ONLY');
    expect(verdict.missing).toContain('no output digest, so a replay could not be compared against anything');
  });
});

describe('what the boundary drops', () => {
  it('loses the BLAS build and every dispatch control the engine recorded', () => {
    const dropped = envelopeDropped();
    expect(dropped).toContain('libraries.blas');
    expect(dropped).toContain('controls.OPENBLAS_CORETYPE');
    expect(dropped).toContain('controls.OPENBLAS_NUM_THREADS');
  });

  it('does not count a fact that describes a run rather than deciding it', () => {
    const qualified = ENVELOPE_FACTS.find((entry) => entry.fact === 'qualified_numpy');
    expect(qualified?.decidesBytes).toBe(false);
    expect(envelopeDropped()).not.toContain('qualified_numpy');
  });

  it('qualifies the grade rather than overruling it, and counts what is missing', () => {
    const qualification = replayQualification(GAT_RUNTIME_IDENTITY);
    expect(qualification).toMatch(new RegExp(`${envelopeDropped().length} facts that decide the bytes did not cross`));
    expect(qualification).toContain(GAT_RUNTIME_IDENTITY.numpyVersion);
  });

  it('says "here" names nothing when no runtime was recorded at all', () => {
    expect(replayQualification(null)).toMatch(/"here" names nothing/);
  });
});

describe('the second question: may the output become a record', () => {
  it('reads every check the corpus asks, so none is quietly dropped', () => {
    const read = admissionStanding(receipt()).map((reading) => reading.check).sort();
    expect(read).toEqual(Object.keys(CHECK_MEANING).sort());
  });

  it('answers no, and the no is structural rather than a policy this run failed', () => {
    const reading = readCrossing(receipt());
    expect(reading.mayBecomeARecord).toBe(false);
    expect(structuralRefusals(receipt()).map((entry) => entry.check).sort())
      .toEqual(['AUTHORITY_IS_NOT_THE_PROCESS', 'BOTH_CLOCKS', 'PROVENANCE_DECLARED', 'SOURCE_CLOCK_COHERENT']);
  });

  it('refuses on provenance because the vocabulary has no member for a derivation', () => {
    const provenance = admissionStanding(receipt()).find((entry) => entry.check === 'PROVENANCE_DECLARED');
    expect(provenance?.standing).toBe('UNMET_STRUCTURAL');
    expect(provenance?.because).toContain(`${RECORD_PROVENANCE.length} members`);
    expect(RECORD_PROVENANCE).not.toContain('DERIVED');
  });

  it('refuses on the clocks because an execution time is not a knowledge time', () => {
    const clocks = admissionStanding(receipt()).find((entry) => entry.check === 'BOTH_CLOCKS');
    expect(clocks?.standing).toBe('UNMET_STRUCTURAL');
    expect(clocks?.because).toMatch(/recomputation/);
  });

  it('never lets the engine be its own admitting authority, whatever the receipt carries', () => {
    const authority = admissionStanding(receipt({ policyAuthority: 'OPERATOR_DECLARATION' }))
      .find((entry) => entry.check === 'AUTHORITY_IS_NOT_THE_PROCESS');
    expect(authority?.standing).toBe('UNMET_STRUCTURAL');
  });

  it('meets the one check an engine meets easily, and only when the bytes were verified', () => {
    const met = admissionStanding(receipt()).find((entry) => entry.check === 'EVIDENCE_ARTIFACT_BOUND');
    expect(met?.standing).toBe('MET');
    const unverified = admissionStanding(receipt({ sourceVerified: false })).find((entry) => entry.check === 'EVIDENCE_ARTIFACT_BOUND');
    expect(unverified?.standing).toBe('UNMET_CONTINGENT');
  });

  it('reads a permission to derive as permission to compute and never as permission to admit', () => {
    const rights = admissionStanding(receipt()).find((entry) => entry.check === 'RIGHTS_DECIDED');
    expect(rights?.standing).toBe('MET');
    expect(rights?.because).toMatch(/different operation from admitting the result/);
    const undecided = admissionStanding(receipt({ deriveDecision: null })).find((entry) => entry.check === 'RIGHTS_DECIDED');
    expect(undecided?.standing).toBe('UNMET_CONTINGENT');
  });

  it('invents no standing where nothing bears on the question', () => {
    const supersession = admissionStanding(receipt()).find((entry) => entry.check === 'SUPERSESSION_IS_ABOUT_THIS_RECORD');
    expect(supersession?.standing).toBe('NOT_IN_QUESTION');
  });
});

describe('the reading as a whole', () => {
  it('keeps the two answers apart and neither stands in for the other', () => {
    const reading = readCrossing(receipt());
    expect(reading.card.grade).toBe('REPLAYABLE_HERE');
    expect(reading.mayBecomeARecord).toBe(false);
    // A run that grades well is still not admissible, which is the whole point.
    // Named rather than counted: a check that changes standing should say which.
    expect(reading.gate.filter((entry) => entry.standing === 'MET').map((entry) => entry.check).sort())
      .toEqual(['EVIDENCE_ARTIFACT_BOUND', 'RIGHTS_DECIDED']);
  });

  it('names the route that does exist, so the refusal is not read as a dead end', () => {
    expect(readCrossing(receipt()).theRouteThatExists).toMatch(/under their own authority/);
  });

  it('claims no authority for itself, in the reading and in what it holds', () => {
    expect(readCrossing(receipt()).declaredBy).toBe(CROSSING_DECLARED_BY);
    expect(CROSSING_DECLARED_BY).toMatch(/nobody’s authority/);
    expect(CROSSING_LOSS.join(' ')).toMatch(/Two questions, kept apart/);
    expect(CROSSING_LOSS.join(' ')).toMatch(/boundary drops the envelope/);
  });
});
