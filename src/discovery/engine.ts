/**
 * The mining engine: the smallest thing that can honestly be called one.
 *
 * A workload is defined, run, and what it produced is recorded — three
 * identities, three functions, and nothing between them that could quietly
 * merge them. The engine is pure: it takes records and a clock and returns a
 * run with its artifacts. Nothing here reaches a source, a network or a
 * database, which is what makes it testable and what keeps acquisition on the
 * far side of the admission boundary where it belongs.
 *
 * THREE FINGERPRINTS, AND WHAT EACH ONE IS FOR
 *
 * The spec fingerprint is the identity of the computation: method, parameters,
 * implementation, output schema and produced class. Deliberately not the
 * workload id — two definitions agreeing on all of those are the same
 * computation whatever they are called, and two differing in any of them are
 * different computations however similar they look. Changing a threshold
 * changes the identity, which is the property that makes a result comparable
 * to the one before it rather than silently replacing it.
 *
 * The input fingerprint is what it read: record identities with their
 * knowledge times. A record arriving, changing or being retracted changes it.
 *
 * The output fingerprint is what came out. Same spec and same inputs give the
 * same output fingerprint, on this machine, today — and `arithmetic` says
 * whether that promise extends to another machine. The computation card grades
 * that question; this module does not answer it twice.
 *
 * WHAT A RUN IS ALLOWED TO CONCLUDE
 *
 * That it finished. Not that the result is right, and not that it is
 * validated. A run carries SUCCEEDED or FAILED with a stable failure identity,
 * and every artifact it produces starts NOT_VALIDATED, because a computation
 * exiting zero is a fact about the computation rather than about the world.
 */
import { createHash } from 'crypto';
import { canonicalJson } from '@/fixtures/digest';
import type { CorpusRecord } from '@/domain/corpus';
import type { ArithmeticClass } from '@/domain/computationCard';
import type { ClaimClass, MiningKind, ValidationState } from '@/domain/discoveryLayer';
import { inheritedRights } from '@/domain/discoveryLayer';

/** What a workload asserts about one subject. */
export interface ComputedClaim {
  subject: string;
  claim: string;
  /** Present only for a fitted class. A deterministic count has no confidence. */
  confidence?: number;
  modelId?: string;
  horizonEndsAt?: string;
  /** The records this particular claim rested on. Never the whole input set. */
  readRecordIds: readonly string[];
  /** Whatever the workload wants to carry, canonicalised into the fingerprint. */
  detail: Record<string, unknown>;
}

export interface WorkloadDefinition {
  workloadId: string;
  miningKind: MiningKind;
  producesClass: ClaimClass;
  method: string;
  parameters: Readonly<Record<string, unknown>>;
  implementation: { id: string; version: string };
  outputSchema: string;
  arithmetic: ArithmeticClass;
  /** Which records the workload asks for. A selector, not a copy. */
  select(records: readonly CorpusRecord[]): readonly CorpusRecord[];
  /** The computation itself. Deterministic, or it does not belong here. */
  compute(records: readonly CorpusRecord[], parameters: Readonly<Record<string, unknown>>): readonly ComputedClaim[];
}

const sha256 = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

/**
 * The identity of the computation. Note what is absent: the workload id, the
 * clock, and the records. A rename is not a new computation and a re-run is
 * not a new one either; a changed parameter is.
 */
export function specFingerprint(definition: WorkloadDefinition): string {
  return sha256({
    method: definition.method,
    parameters: definition.parameters,
    implementation: definition.implementation,
    outputSchema: definition.outputSchema,
    producesClass: definition.producesClass,
    miningKind: definition.miningKind,
    arithmetic: definition.arithmetic,
  });
}

/** What it read: identities with their knowledge times, order-independent. */
export function inputFingerprint(records: readonly CorpusRecord[]): string {
  return sha256([...records]
    .map((record) => [record.recordId, record.knownAt])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

export function outputFingerprint(claims: readonly ComputedClaim[]): string {
  return sha256([...claims]
    .map((claim) => ({ subject: claim.subject, claim: claim.claim, detail: claim.detail, confidence: claim.confidence ?? null }))
    .sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0)));
}

export interface ArtifactInput {
  recordId: string;
  knownAt: string;
  rights: readonly string[];
}

export interface ProducedArtifact {
  artifactId: string;
  claimClass: ClaimClass;
  subject: string;
  claim: string;
  computedAt: string;
  /*
   * Always NOT_VALIDATED here, and a field rather than an omission. The engine
   * finished a computation; it did not check a claim, and it has nothing to
   * check one against. Anything that later validates writes a validation
   * record and moves this — the run never gets to.
   */
  validation: ValidationState;
  confidence: number | null;
  modelId: string | null;
  horizonEndsAt: string | null;
  /** The intersection of its inputs'. Computed, never declared. */
  rights: readonly string[];
  inputs: readonly ArtifactInput[];
  detail: Record<string, unknown>;
}

export interface WorkloadRunResult {
  runId: string;
  workloadId: string;
  producesClass: ClaimClass;
  specFingerprint: string;
  startedAt: string;
  completedAt: string;
  status: 'SUCCEEDED' | 'FAILED';
  inputFingerprint: string;
  outputFingerprint: string | null;
  /** A stable identity, never a message. Null on success. */
  failureIdentity: string | null;
  artifacts: readonly ProducedArtifact[];
}

/** What may go wrong, named so that failures can be grouped rather than read. */
export const FAILURE_IDENTITIES = [
  'MINING_NO_INPUT_SELECTED',
  'MINING_COMPUTE_THREW',
  'MINING_CLAIM_READ_NOTHING',
  'MINING_CONFIDENCE_ON_DETERMINISTIC_RESULT',
] as const;
export type FailureIdentity = typeof FAILURE_IDENTITIES[number];

class MiningFailure extends Error {
  constructor(readonly identity: FailureIdentity) { super(identity); }
}

/**
 * Run one workload over one set of records.
 *
 * `rightsOf` is supplied rather than derived here so the engine does not carry
 * a second opinion about the rights model. The floor it computes is the
 * intersection of the records each claim actually read — not of the whole
 * input set, because a claim that never touched the restricted record is not
 * restricted by it.
 */
export function runWorkload(
  definition: WorkloadDefinition,
  records: readonly CorpusRecord[],
  context: {
    runId: string;
    startedAt: string;
    completedAt: string;
    rightsOf: (record: CorpusRecord) => readonly string[];
  },
): WorkloadRunResult {
  const selected = definition.select(records);
  const base = {
    runId: context.runId,
    workloadId: definition.workloadId,
    producesClass: definition.producesClass,
    specFingerprint: specFingerprint(definition),
    startedAt: context.startedAt,
    completedAt: context.completedAt,
    inputFingerprint: inputFingerprint(selected),
  };
  const failed = (identity: FailureIdentity): WorkloadRunResult => ({
    ...base, status: 'FAILED', outputFingerprint: null, failureIdentity: identity, artifacts: [],
  });

  if (selected.length === 0) return failed('MINING_NO_INPUT_SELECTED');

  let claims: readonly ComputedClaim[];
  try {
    claims = definition.compute(selected, definition.parameters);
  } catch (error) {
    return failed(error instanceof MiningFailure ? error.identity : 'MINING_COMPUTE_THREW');
  }

  const byId = new Map(selected.map((record) => [record.recordId, record]));
  const artifacts: ProducedArtifact[] = [];
  for (const [index, claim] of claims.entries()) {
    const read = claim.readRecordIds.map((id) => byId.get(id)).filter((r): r is CorpusRecord => r !== undefined);
    /* A claim that read nothing is not a finding about the corpus. */
    if (read.length === 0) return failed('MINING_CLAIM_READ_NOTHING');
    /* And a deterministic result does not get to carry a confidence. */
    if (claim.confidence !== undefined && definition.producesClass === 'COMPUTED_RESULT') {
      return failed('MINING_CONFIDENCE_ON_DETERMINISTIC_RESULT');
    }
    artifacts.push({
      artifactId: `${context.runId}-A${String(index + 1).padStart(3, '0')}`,
      claimClass: definition.producesClass,
      subject: claim.subject,
      claim: claim.claim,
      computedAt: context.completedAt,
      validation: 'NOT_VALIDATED',
      confidence: claim.confidence ?? null,
      modelId: claim.modelId ?? null,
      horizonEndsAt: claim.horizonEndsAt ?? null,
      rights: inheritedRights(read.map((record) => context.rightsOf(record))),
      inputs: read.map((record) => ({ recordId: record.recordId, knownAt: record.knownAt, rights: context.rightsOf(record) })),
      detail: claim.detail,
    });
  }

  return { ...base, status: 'SUCCEEDED', outputFingerprint: outputFingerprint(claims), failureIdentity: null, artifacts };
}
