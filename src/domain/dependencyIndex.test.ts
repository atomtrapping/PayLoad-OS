import { describe, expect, it } from 'vitest';
import { CONSEQUENCE_MEANING, FAN_OUT_LOSS, buildDependencyIndex, fanOut, standsOn, type DependencyEdge } from './dependencyIndex';

const edge = (kind: DependencyEdge['dependent']['kind'], id: string, dependsOn: string, because = 'declared at the moment it came to depend'): DependencyEdge =>
  ({ dependent: { kind, id }, dependsOn, declaredAt: '2026-09-01T00:00:00Z', because });

/**
 * REC-A is carried by a release, cited by a ruling, and feeds a derived record
 * which itself feeds another and is served in an answer.
 */
const EDGES: DependencyEdge[] = [
  edge('RELEASE', 'REL-1', 'REC-A'),
  edge('RULING', 'RUL-1', 'REC-A'),
  edge('DERIVED_RECORD', 'REC-D1', 'REC-A'),
  edge('DERIVED_RECORD', 'REC-D2', 'REC-D1'),
  edge('SERVED_ANSWER', 'ANS-1', 'REC-D2'),
  edge('ATTESTATION', 'ATT-1', 'REC-D2'),
  edge('RELEASE', 'REL-2', 'REC-UNRELATED'),
];

describe('a correction reaches what stands on it', () => {
  it('walks the closure transitively through derived records', () => {
    const out = fanOut(buildDependencyIndex(EDGES), ['REC-A'], 'CORRECTION');
    expect(out.reached.map((r) => r.dependent.id).sort()).toEqual(['ANS-1', 'ATT-1', 'REC-D1', 'REC-D2', 'REL-1', 'RUL-1']);
    // Nothing unrelated is dragged in.
    expect(out.reached.some((r) => r.dependent.id === 'REL-2')).toBe(false);
    // Depth is the hop count, and the served answer is three hops out.
    expect(out.reached.find((r) => r.dependent.id === 'REC-D1')!.depth).toBe(1);
    expect(out.reached.find((r) => r.dependent.id === 'ANS-1')!.depth).toBe(3);
    expect(out.maxDepth).toBe(3);
  });

  it('records the path each dependent was reached through', () => {
    const out = fanOut(buildDependencyIndex(EDGES), ['REC-A'], 'CORRECTION');
    expect(out.reached.find((r) => r.dependent.id === 'ANS-1')!.through).toEqual(['REC-D2', 'REC-D1', 'REC-A']);
  });

  it('reports a consequence and never a verdict, and keeps withdrawal apart from correction', () => {
    const corrected = fanOut(buildDependencyIndex(EDGES), ['REC-A'], 'CORRECTION');
    expect(corrected.reached.every((r) => r.consequence === 'RESTATED')).toBe(true);
    expect(corrected.reached[0].because).toContain('re-evaluated');

    const withdrawn = fanOut(buildDependencyIndex(EDGES), ['REC-A'], 'WITHDRAWAL');
    expect(withdrawn.reached.every((r) => r.consequence === 'UNSUPPORTED')).toBe(true);
    // WITHDRAWN IS NOT FALSE, one hop out.
    expect(CONSEQUENCE_MEANING.UNSUPPORTED.andSo).toContain('nothing contrary has been established');
    expect(withdrawn.reached[0].because).toContain('manufacture a fact the corpus did not supply');
  });

  it('terminates on a cycle instead of walking it forever', () => {
    const cyclic: DependencyEdge[] = [
      edge('DERIVED_RECORD', 'REC-X', 'REC-Y'),
      edge('DERIVED_RECORD', 'REC-Y', 'REC-X'),
    ];
    const out = fanOut(buildDependencyIndex(cyclic), ['REC-X'], 'CORRECTION');
    expect(out.reached.map((r) => r.dependent.id).sort()).toEqual(['REC-X', 'REC-Y']);
    // Each is visited once, at the shallowest depth it is reached.
    expect(out.reached.find((r) => r.dependent.id === 'REC-Y')!.depth).toBe(1);
    expect(out.maxDepth).toBe(2);
  });

  it('reaches a diamond once, by its shortest path', () => {
    const diamond: DependencyEdge[] = [
      edge('DERIVED_RECORD', 'REC-L', 'REC-ROOT'),
      edge('DERIVED_RECORD', 'REC-R', 'REC-ROOT'),
      edge('RULING', 'RUL-BOTH', 'REC-ROOT'),
      edge('RULING', 'RUL-BOTH', 'REC-L'),
    ];
    const out = fanOut(buildDependencyIndex(diamond), ['REC-ROOT'], 'CORRECTION');
    expect(out.reached.filter((r) => r.dependent.id === 'RUL-BOTH')).toHaveLength(1);
    expect(out.reached.find((r) => r.dependent.id === 'RUL-BOTH')!.depth).toBe(1);
  });

  it('states its own coverage rather than implying completeness', () => {
    const out = fanOut(buildDependencyIndex(EDGES), ['REC-A'], 'CORRECTION');
    expect(out.coverage).toContain('declared');
    expect(out.coverage).toContain('turn an unknown into a clean bill');

    // Nothing declared is not nothing depending.
    const none = fanOut(buildDependencyIndex(EDGES), ['REC-NOBODY'], 'CORRECTION');
    expect(none.reached).toEqual([]);
    expect(none.because).toContain('not about the world');
  });

  it('answers the backward question too, for a dispute', () => {
    expect(standsOn(EDGES, 'RUL-1').map((e) => e.dependsOn)).toEqual(['REC-A']);
    expect(standsOn(EDGES, 'REC-D2').map((e) => e.dependsOn)).toEqual(['REC-D1']);
  });

  it('says what reaching a dependent is not', () => {
    expect(FAN_OUT_LOSS.some((l) => l.includes('Reaching a dependent is not notifying it'))).toBe(true);
    expect(FAN_OUT_LOSS.some((l) => l.includes('served answer cannot be recalled'))).toBe(true);
  });

  it('costs its own closure rather than the size of the graph', () => {
    // The index is prepared once. Walking it must not depend on how many edges
    // exist elsewhere — which is what a benchmark caught: reaching fourteen
    // dependents out of a million edges spent almost all its time rebuilding an
    // adjacency the previous correction had already built.
    const many: DependencyEdge[] = [edge('RULING', 'RUL-NEAR', 'REC-A')];
    for (let i = 0; i < 50_000; i += 1) many.push(edge('RULING', `RUL-FAR-${i}`, `REC-FAR-${i}`));
    const index = buildDependencyIndex(many);

    const started = performance.now();
    const out = fanOut(index, ['REC-A'], 'CORRECTION');
    const elapsed = performance.now() - started;

    expect(out.reached.map((r) => r.dependent.id)).toEqual(['RUL-NEAR']);
    // A one-dependent closure over fifty thousand unrelated edges is a lookup.
    expect(elapsed).toBeLessThan(5);
    expect(out.coverage).toContain('50001 declared edges');
  });
});
