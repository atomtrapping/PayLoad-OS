import { describe, expect, it } from 'vitest';
import { specFingerprint } from './engine';
import { runSpatialComparison, spatialWorkloadDefinition, SPATIAL_METHOD } from './spatialComparison';

describe('the spatial comparison as a discovery artifact', () => {
  const run = runSpatialComparison();

  it('reproduces: the same fixture gives the same three fingerprints', () => {
    const again = runSpatialComparison();
    expect(again.spec.specFingerprint).toBe(run.spec.specFingerprint);
    expect(again.run.inputFingerprint).toBe(run.run.inputFingerprint);
    expect(again.run.outputFingerprint).toBe(run.run.outputFingerprint);
    expect(again.artifact).toEqual(run.artifact);
  });

  /*
   * The rule, as two values. The baseline's retained receipt has the same
   * digest before and after the scenario was submitted, and both results were
   * computed over the same layout digest.
   */
  it('never mutates the baseline', () => {
    expect(run.baseline.receiptDigestBefore).toBe(run.baseline.receiptDigestAfter);
    expect(run.baseline.unchanged).toBe(true);
    expect(run.scenario.baselineLayoutDigest).toBe(run.baseline.layoutDigest);
    expect(run.comparison.baselineDigest).toBe(run.baseline.resultDigest);
    expect(run.comparison.scenarioDigest).toBe(run.scenario.resultDigest);
    expect(run.scenario.resultDigest).not.toBe(run.baseline.resultDigest);
  });

  it('carries the scenario as a declared assumption, not an observation', () => {
    expect(run.scenario.provenanceKind).toBe('SCENARIO_ASSUMPTION');
    expect(run.scenario.passageId).toBe('P-07');
    expect(run.scenario.assumedState).toBe('CLOSED');
  });

  it('names what changed, and only what changed', () => {
    for (const change of run.comparison.changes) expect(change.baseline).not.toEqual(change.scenario);
    // Closing the Hall–Studio bridge: Studio and Office lose confirmed access,
    // and Store — reachable only through Office, over an unknown passage —
    // loses its possible access with them.
    expect(run.comparison.changes.map((change) => change.id)).toEqual(['S-3', 'S-4', 'S-5']);
    expect(run.artifact.claim).toMatch(/3 of 5 spaces/);
    expect(run.artifact.claim).toMatch(/about no building/);
  });

  it('is a computed result that read one source record, not validated, at that record’s rights', () => {
    expect(run.artifact.claimClass).toBe('COMPUTED_RESULT');
    expect(run.artifact.validation).toBe('NOT_VALIDATED');
    expect(run.artifact.confidence).toBeNull();
    expect(run.artifact.inputs).toHaveLength(1);
    expect(run.artifact.inputs[0].recordId).toBe(run.sourceRecord.recordId);
    expect(run.artifact.rights).toEqual(run.sourceRecord.rights);
    expect(run.artifact.rights).toEqual(['DERIVE', 'INGEST']);
    expect(run.artifact.detail.geometryUsedForTraversal).toBe(false);
  });

  it('takes its spec identity from the engine’s recipe, so a changed parameter is a different computation', () => {
    const parameters = { rootSpaceId: 'S-1', passageId: 'P-07', assumedState: 'CLOSED' as const };
    expect(run.spec.specFingerprint).toBe(specFingerprint(spatialWorkloadDefinition(parameters)));
    expect(specFingerprint(spatialWorkloadDefinition({ ...parameters, passageId: 'P-08' }))).not.toBe(run.spec.specFingerprint);
    expect(run.spec.method).toBe(SPATIAL_METHOD);
    expect(run.spec.arithmetic).toBe('FIXED_POINT');
  });

  it('refuses to be run as a record workload', () => {
    expect(() => spatialWorkloadDefinition({ rootSpaceId: 'S-1', passageId: 'P-07', assumedState: 'CLOSED' }).compute([], {})).toThrow(/not the record engine/);
  });
});
