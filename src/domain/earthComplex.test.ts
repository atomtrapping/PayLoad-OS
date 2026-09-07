import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { routeFor, routeProjection, PROJECTION_ROUTING } from './projection';
import {
  COMPLEX, COMPLEX_SEQUENCE, HYPERBOLIC, LEARNED_LAYER, MANIFOLD_TRAPS, MANIFOLD_USES,
  PROJECTION_TIER, complexStanding,
} from './earthComplex';

describe('the combinatorial half, which is the cheap one', () => {
  it('names each part once, with what exists and what does not', () => {
    const ids = COMPLEX.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const part of COMPLEX) {
      expect(part.what.trim().length).toBeGreaterThan(40);
      expect(part.here.trim().length).toBeGreaterThan(60);
      expect(part.missing.trim().length).toBeGreaterThan(60);
    }
  });

  it('claims the nesting the cell scheme actually gives, and nothing more', () => {
    const containment = COMPLEX.find((p) => p.id === 'CONTAINMENT')!;
    expect(containment.state).toBe('PARTIAL');
    expect(containment.here).toMatch(/prefix code/);
    // The honest limit: geohash nests inside geohash, not inside a district.
    expect(containment.missing).toMatch(/does not nest inside a district/);
    const boundary = COMPLEX.find((p) => p.id === 'BOUNDARY_OPERATORS')!;
    expect(boundary.here).toMatch(/prefix truncation/);
    // Downward allocation is an assertion, not a renderer's choice.
    expect(boundary.missing).toMatch(/allocation rule is an assertion/);
  });

  it('counts what the corpus puts on the structure, and calls it what it is', () => {
    const standing = complexStanding(CARAVAN_CORPUS);
    expect(standing.keyedPositions).toBeGreaterThan(0);
    expect(standing.occupiedCells).toBeGreaterThan(0);
    expect(standing.nestingLevels).toBeGreaterThan(0);
    expect(standing.learnedLayer).toBe('ABSENT');
    expect(standing.statement).toMatch(/a structure and not yet a complex/);
    expect(standing.statement).toMatch(/curve fit/);
  });
});

describe('the learned half is a projection, and says so', () => {
  it('states why hyperbolic is the right geometry and how it misleads', () => {
    expect(HYPERBOLIC.claim).toMatch(/volume grows exponentially/);
    expect(HYPERBOLIC.reading).toMatch(/Depth becomes radius/);
    expect(HYPERBOLIC.state).toBe('ABSENT');
    // A Euclidean reading of a hyperbolic picture is wrong everywhere.
    expect(HYPERBOLIC.hazard).toMatch(/Euclidean eyes/);
  });

  it('uses the vocabulary the repository already has, not a fifth one', () => {
    expect(LEARNED_LAYER.isA).toMatch(/compute run/);
    expect(LEARNED_LAYER.isA).toMatch(/derived object/);
    // Stale is not superseded, and the difference needs its own word.
    expect(LEARNED_LAYER.binding).toMatch(/does not supersede/);
    expect(LEARNED_LAYER.neverAuthoritative).toMatch(/does not testify/);
  });

  it('carries the three traps with the rule that defuses each', () => {
    expect(MANIFOLD_TRAPS).toHaveLength(3);
    const by = (id: (typeof MANIFOLD_TRAPS)[number]['id']) => MANIFOLD_TRAPS.find((t) => t.id === id)!;
    expect(by('CONTINUOUS_FABRICATION').rule).toMatch(/Void renders void/);
    expect(by('BIAS_AS_GEOGRAPHY').rule).toMatch(/declared position wins/);
    expect(by('NOT_BITEMPORAL').rule).toMatch(/invalidates it/);
    for (const trap of MANIFOLD_TRAPS) {
      expect(trap.trap.trim().length).toBeGreaterThan(80);
      expect(trap.rule.trim().length).toBeGreaterThan(60);
    }
  });

  it('gives every use a reason it earns its place', () => {
    for (const use of MANIFOLD_USES) expect(use.earnsIt.trim().length).toBeGreaterThan(40);
    expect(MANIFOLD_USES.map((u) => u.use).join(' ')).toMatch(/coverage-gap detector/i);
  });
});

describe('the tier, routed as one row and losing authority at every arrow', () => {
  it('enters the routing table beside the globe and the scene', () => {
    const view = { mode: 'STRUCTURE', coordinateSemantics: 'HYPERBOLIC', representation: 'MANIFOLD' } as const;
    expect(routeProjection(view)).toBe('Three.js');
    const route = routeFor(view)!;
    // Nothing is embedded, so the compiler cannot answer READY.
    expect(route.currentResult).toBe('UNAVAILABLE');
    expect(route.note).toMatch(/renders void/);
    expect(PROJECTION_ROUTING.filter((r) => r.coordinateSemantics === 'HYPERBOLIC')).toHaveLength(1);
  });

  it('states the chain and that no arrow gains authority', () => {
    expect(PROJECTION_TIER.chain).toBe('corpus → learned manifold → render');
    expect(PROJECTION_TIER.rule).toMatch(/none of them gains it/);
    expect(PROJECTION_TIER.rule).toMatch(/refusal at any tier is carried forward/);
  });

  it('sequences the cheap half first and the learned half behind corpus volume', () => {
    expect(COMPLEX_SEQUENCE[0]).toMatch(/combinatorial structure first/);
    expect(COMPLEX_SEQUENCE.join(' ')).toMatch(/waits on volume/);
    expect(COMPLEX_SEQUENCE.join(' ')).toMatch(/resolution is absent/);
  });
});
