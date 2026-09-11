/**
 * The spatial baseline-versus-scenario comparison, as a discovery artifact.
 *
 * `src/spatial` already does the work: a retained layout, a baseline analysis,
 * a scenario that assumes one passage closed, and a comparison of the two. What
 * it did not do was arrive anywhere. The result lived in the production root
 * as a receipt, and the discovery layer — the one place a computed claim gets
 * an identity, a lineage, a rights floor and a validation state — never saw
 * it. This module carries it across, and carries it as what it is.
 *
 * THE BASELINE IS NEVER MUTATED, AND THIS IS OBSERVED RATHER THAN PROMISED
 *
 * The scenario is a separate request whose `baselineLayoutDigest` pins the
 * layout it assumes against, and the spatial service retains every receipt as
 * an immutable file. So the run here reads the baseline's receipt digest
 * before the scenario is submitted and again after, and reports both. A
 * scenario that changed the baseline would show as two different digests, and
 * the test on this module asserts they are one. That is the whole of the
 * "scenario changes must never mutate the authoritative baseline" rule, as a
 * comparison of two values rather than as a sentence.
 *
 * WHY THIS IS NOT A RUN OF THE RECORD ENGINE
 *
 * `runWorkload` computes over corpus records. The spatial input is a retained
 * layout artifact, read by evidence reference, and the arithmetic is graph
 * traversal over declared passages. So the spec identity uses the engine's
 * recipe — method, parameters, implementation, output schema, class, kind and
 * arithmetic, and nothing else — and the execution is the spatial service's.
 * Two fingerprints from one recipe is the property that matters: a changed
 * root space or a different assumed passage is a different computation, and a
 * re-run of the same one is not a new result.
 *
 * WHAT IT READ
 *
 * One source record: the layout evidence, under the rights its registration
 * permits — the corpus's permitted uses, each derived by evaluating the
 * registration for that use at the capture instant, never the registration's
 * operation names copied across as if they were uses. The artifact's rights
 * are that one input's, which is the intersection of a set of one, and the
 * ledger's rights trigger checks it
 * anyway. The floor plan drawing is named by the layout and is not a second
 * input, because the traversal never reads geometry — `geometryUsedForTraversal`
 * is false in the result and that is the honest count.
 *
 * NOT VALIDATED, LIKE EVERYTHING ELSE THE ENGINE PRODUCES
 *
 * A comparison that ran is a fact about the run. Whether closing that passage
 * would actually cut off those rooms is a fact about a building, and the
 * fixture is a synthetic floor drawn for the purpose. The claim says so in its
 * own text.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArithmeticClass } from '@/domain/computationCard';
import { derivePermittedUses, PERMITTED_USES, sourceUseRequests, type PermittedUse } from '@/domain/corpus';
import { evaluateSourceUse } from '@/data-os/source-policy';
import type { ClaimClass, MiningKind, ValidationState } from '@/domain/discoveryLayer';
import { specFingerprint, type WorkloadDefinition } from './engine';
import { canonicalJson } from '@/fixtures/digest';
import { createHash } from 'node:crypto';
import { digest as spatialDigest, METHOD } from '@/spatial/contracts';
import { FIXTURE_TIME, fixtureManifest, preserveFixture } from '@/spatial/fixture';
import { SpatialAnalysisService } from '@/spatial/service';
import { compare } from '@/spatial/analysis';

export const SPATIAL_WORKLOAD_ID = 'spatial-baseline-scenario';
export const SPATIAL_METHOD = 'notationsos.mining.spatial-baseline-scenario.v1';
export const SPATIAL_OUTPUT_SCHEMA = 'payload.spatial-comparison.v1';

const sha256 = (value: unknown) => `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;

/**
 * The computation's identity, in the engine's terms.
 *
 * `compute` throws on purpose: this definition exists to be fingerprinted, and
 * a caller that hands it to `runWorkload` has mistaken a layout for a record
 * set. The parameters are the two things a reader would change to get a
 * different answer, and changing either changes the fingerprint.
 */
export function spatialWorkloadDefinition(parameters: { rootSpaceId: string; passageId: string; assumedState: 'OPEN' | 'CLOSED' }): WorkloadDefinition {
  return {
    workloadId: SPATIAL_WORKLOAD_ID,
    miningKind: 'DESCRIPTIVE' satisfies MiningKind,
    producesClass: 'COMPUTED_RESULT' satisfies ClaimClass,
    method: SPATIAL_METHOD,
    parameters,
    implementation: { id: 'notationsos.spatial', version: METHOD.version },
    outputSchema: SPATIAL_OUTPUT_SCHEMA,
    // Integer depths over declared passages. Reproduces byte for byte anywhere.
    arithmetic: 'FIXED_POINT' satisfies ArithmeticClass,
    select: (records) => records,
    compute: () => { throw new Error('The spatial comparison runs through runSpatialComparison, not the record engine.'); },
  };
}

export interface SpatialChange {
  id: string;
  baseline: { reachability: string; confirmedDepth: number | null; possibleDepth: number | null };
  scenario: { reachability: string; confirmedDepth: number | null; possibleDepth: number | null };
}

export interface SpatialComparisonRun {
  readonly fixture_only: true;
  readonly spec: {
    workloadId: string; miningKind: MiningKind; producesClass: ClaimClass; method: string;
    parameters: Readonly<Record<string, unknown>>; implementation: { id: string; version: string };
    outputSchema: string; arithmetic: ArithmeticClass; specFingerprint: string;
  };
  readonly run: {
    runId: string; startedAt: string; completedAt: string; status: 'SUCCEEDED';
    inputFingerprint: string; outputFingerprint: string;
  };
  /** The source record the artifact read, as the corpus tables need it. The release is the caller's to name. */
  readonly sourceRecord: { recordId: string; subjectId: string; predicate: string; knownAt: string; rights: readonly PermittedUse[] };
  /**
   * What the registration says and what that permits, use by use, so a reader
   * of the receipt can see why the rights list is as short as it is.
   */
  readonly registrationTerms: {
    registrationId: string; sourceId: string;
    permittedPurposes: readonly string[]; allowedOperations: readonly string[]; allowedAudiences: readonly string[];
    evaluatedAt: string;
    decisions: readonly { use: PermittedUse; state: string; reasons: readonly string[] }[];
  };
  readonly baseline: {
    requestId: string; layoutDigest: string; resultDigest: string;
    /** The baseline receipt's digest read before the scenario ran, and after. */
    receiptDigestBefore: string; receiptDigestAfter: string; unchanged: boolean;
  };
  readonly scenario: {
    requestId: string; baselineLayoutDigest: string; passageId: string; assumedState: string;
    provenanceKind: string; resultDigest: string;
  };
  readonly comparison: { schema: string; baselineDigest: string; scenarioDigest: string; changes: readonly SpatialChange[] };
  readonly artifact: {
    artifactId: string; claimClass: ClaimClass; subject: string; claim: string; computedAt: string;
    validation: ValidationState; confidence: null; modelId: null; horizonEndsAt: null;
    rights: readonly PermittedUse[];
    inputs: readonly { recordId: string; knownAt: string; rights: readonly PermittedUse[] }[];
    detail: Record<string, unknown>;
  };
}

/**
 * Run it. Synchronous, over a temporary root that is removed afterwards; what
 * comes back is the run and nothing on disk.
 */
export function runSpatialComparison(): SpatialComparisonRun {
  const root = mkdtempSync(join(tmpdir(), 'spatial-governance-'));
  try {
    const fixture = preserveFixture(root);
    const service = new SpatialAnalysisService(root, () => FIXTURE_TIME);
    const layoutManifest = fixtureManifest('layout', 'application/json');
    const registration = layoutManifest.sourceRegistration;
    // Evaluated as the caravan corpus would evaluate any source: the fixture is
    // a demonstration of that corpus's discovery layer, not a corpus of its own.
    const rights = derivePermittedUses(registration, layoutManifest.capturedAt, registration.sourceId, 'CARAVAN');
    const requests = sourceUseRequests('CARAVAN');
    const registrationTerms: SpatialComparisonRun['registrationTerms'] = {
      registrationId: registration.registrationId, sourceId: registration.sourceId,
      permittedPurposes: [...registration.permittedPurposes], allowedOperations: [...registration.allowedOperations],
      allowedAudiences: [...registration.allowedAudiences],
      evaluatedAt: layoutManifest.capturedAt,
      decisions: PERMITTED_USES.map((use) => {
        const r = requests[use];
        const decision = evaluateSourceUse(registration, {
          requestId: `${registration.sourceId}:${use}:${layoutManifest.capturedAt}`, registrationId: registration.registrationId,
          purpose: r.purpose, operation: r.operation, audience: r.audience, requestedAt: layoutManifest.capturedAt,
        });
        return { use, state: decision.state, reasons: [...decision.reasons] };
      }),
    };

    const baseline = service.submit(fixture.baseline);
    const before = service.inspect(fixture.baseline.requestId)!.receipt.digest;
    const scenario = service.submit(fixture.scenario);
    const after = service.inspect(fixture.baseline.requestId)!.receipt.digest;
    const comparison = compare(baseline.receipt.result, scenario.receipt.result);

    const parameters = { rootSpaceId: fixture.baseline.rootSpaceId, passageId: fixture.scenario.scenario!.passageId, assumedState: fixture.scenario.scenario!.assumedState };
    const definition = spatialWorkloadDefinition(parameters);
    const sourceRecord = {
      recordId: layoutManifest.evidenceId,
      subjectId: `notation://subject/spatial/${fixture.layout.id}`,
      predicate: 'spatial.layout',
      knownAt: layoutManifest.capturedAt,
      rights,
    };
    const startedAt = FIXTURE_TIME;
    const completedAt = new Date(Date.parse(FIXTURE_TIME) + 4_000).toISOString();
    const changed = comparison.changes.map((change) => `${change.id} ${change.baseline.reachability}→${change.scenario.reachability}`);
    const artifactId = `SPATIAL-${fixture.layout.id}-${parameters.passageId}-${parameters.assumedState}`;

    return {
      fixture_only: true,
      spec: {
        workloadId: definition.workloadId, miningKind: definition.miningKind, producesClass: definition.producesClass,
        method: definition.method, parameters, implementation: definition.implementation,
        outputSchema: definition.outputSchema, arithmetic: definition.arithmetic, specFingerprint: specFingerprint(definition),
      },
      run: {
        runId: `SPATIAL-RUN-${parameters.passageId}-${parameters.assumedState}`, startedAt, completedAt, status: 'SUCCEEDED',
        // The engine's input recipe: identities with their knowledge times.
        inputFingerprint: sha256([[sourceRecord.recordId, sourceRecord.knownAt]]),
        outputFingerprint: spatialDigest(comparison),
      },
      sourceRecord,
      registrationTerms,
      baseline: {
        requestId: fixture.baseline.requestId, layoutDigest: baseline.receipt.result.layoutDigest, resultDigest: baseline.receipt.result.digest,
        receiptDigestBefore: before, receiptDigestAfter: after, unchanged: before === after,
      },
      scenario: {
        requestId: fixture.scenario.requestId, baselineLayoutDigest: fixture.scenario.scenario!.baselineLayoutDigest,
        passageId: parameters.passageId, assumedState: parameters.assumedState,
        provenanceKind: fixture.scenario.scenario!.provenance.kind, resultDigest: scenario.receipt.result.digest,
      },
      comparison,
      artifact: {
        artifactId,
        claimClass: 'COMPUTED_RESULT',
        subject: sourceRecord.subjectId,
        claim: `Assuming ${parameters.passageId} ${parameters.assumedState} changes reachability from ${parameters.rootSpaceId} for ${comparison.changes.length} of ${baseline.receipt.result.coverage.spaceCount} spaces: ${changed.join(', ')}. A statement about the synthetic demonstration floor and about no building.`,
        computedAt: completedAt,
        validation: 'NOT_VALIDATED',
        confidence: null, modelId: null, horizonEndsAt: null,
        rights,
        inputs: [{ recordId: sourceRecord.recordId, knownAt: sourceRecord.knownAt, rights }],
        detail: { comparison, baselineLayoutDigest: baseline.receipt.result.layoutDigest, geometryUsedForTraversal: baseline.receipt.result.coverage.geometryUsedForTraversal },
      },
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
