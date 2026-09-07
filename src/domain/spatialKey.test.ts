import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import type { GeodeticPoint } from './corpus';
import {
  AREAL_GEOMETRY, CELL_SCHEME, KEY_REFUSAL_REASON, MAX_PRECISION, SEPARATION_METHOD, VERDICT_MEANING,
  cellExtentM, cellPrecisionFor, comparePositions, encodeGeohash, positionKeys, positionPairs,
  separationM, spatialKeyFor, spatialKeyStanding, type PositionKey,
} from './spatialKey';

const point = (latitude: number, longitude: number, horizontalUncertaintyM?: number): GeodeticPoint => ({
  kind: 'POINT', datum: 'WGS84', latitude, longitude, ...(horizontalUncertaintyM === undefined ? {} : { horizontalUncertaintyM }),
});

describe('geohash, as a published encoding rather than one of our own', () => {
  it('reproduces the reference encodings', () => {
    // The canonical examples: any other implementation must agree, or it is not a join key.
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(encodeGeohash(42.6, -5.6, 5)).toBe('ezs42');
    expect(encodeGeohash(0, 0, 6)).toBe('s00000');
  });

  it('is a prefix code, which is what lets two resolutions meet', () => {
    const fine = encodeGeohash(51.9497, 4.025, 9);
    for (let p = 1; p < 9; p += 1) expect(encodeGeohash(51.9497, 4.025, p)).toBe(fine.slice(0, p));
  });

  it('refuses a coordinate outside the datum and a precision outside the scheme', () => {
    expect(() => encodeGeohash(91, 0, 6)).toThrow(/latitude/);
    expect(() => encodeGeohash(0, 181, 6)).toThrow(/longitude/);
    expect(() => encodeGeohash(0, 0, 0)).toThrow(/precision/);
    expect(() => encodeGeohash(0, 0, MAX_PRECISION + 1)).toThrow(/precision/);
  });
});

describe('cell extent is computed at the latitude, never quoted as a constant', () => {
  it('narrows east-west as latitude rises, while north-south does not move', () => {
    const equator = cellExtentM(6, 0);
    const rotterdam = cellExtentM(6, 51.9497);
    const arctic = cellExtentM(6, 80);
    expect(equator.heightM).toBeCloseTo(rotterdam.heightM, 6);
    expect(rotterdam.widthM).toBeLessThan(equator.widthM);
    expect(arctic.widthM).toBeLessThan(rotterdam.widthM);
    expect(rotterdam.shortestM).toBe(Math.min(rotterdam.widthM, rotterdam.heightM));
  });

  it('halves at every five bits', () => {
    const coarse = cellExtentM(4, 0), fine = cellExtentM(5, 0);
    expect(coarse.widthM * coarse.heightM).toBeCloseTo(fine.widthM * fine.heightM * 32, 0);
  });

  // The discipline: a cell may never be finer than the evidence behind the position.
  it('bounds the resolution by the stated uncertainty', () => {
    for (const [uncertainty, latitude] of [[250, 51.9497], [500, -23.9535], [10, 0], [5000, 45]] as const) {
      const precision = cellPrecisionFor(uncertainty, latitude);
      expect(cellExtentM(precision, latitude).shortestM).toBeGreaterThanOrEqual(uncertainty);
      if (precision < MAX_PRECISION) {
        expect(cellExtentM(precision + 1, latitude).shortestM).toBeLessThan(uncertainty);
      }
    }
  });
});

describe('the key, and the refusals that are not defaults', () => {
  it('keys a position that states its uncertainty, at the resolution that uncertainty supports', () => {
    const outcome = spatialKeyFor(point(51.9497, 4.025, 250));
    expect(outcome.keyed).toBe(true);
    if (!outcome.keyed) return;
    expect(outcome.key.scheme).toBe(CELL_SCHEME.id);
    expect(outcome.key.boundedByM).toBe(250);
    expect(outcome.key.cell).toBe(encodeGeohash(51.9497, 4.025, outcome.key.precision));
    expect(outcome.key.extent.shortestM).toBeGreaterThanOrEqual(250);
  });

  it('gives a coarser key to a less certain position at the same place', () => {
    const certain = spatialKeyFor(point(51.9497, 4.025, 30));
    const vague = spatialKeyFor(point(51.9497, 4.025, 3000));
    expect(certain.keyed && vague.keyed).toBe(true);
    if (!certain.keyed || !vague.keyed) return;
    expect(vague.key.precision).toBeLessThan(certain.key.precision);
    // The coarse key is a prefix of the fine one: the same place, said less precisely.
    expect(certain.key.cell.startsWith(vague.key.cell)).toBe(true);
  });

  it('refuses rather than defaulting, and says which refusal it is', () => {
    expect(spatialKeyFor(undefined)).toEqual({ keyed: false, refusal: 'NO_GEOMETRY' });
    expect(spatialKeyFor(point(51.9497, 4.025))).toEqual({ keyed: false, refusal: 'NO_STATED_UNCERTAINTY' });
    expect(spatialKeyFor({ ...point(51.9497, 4.025, 250), datum: 'NAD27' as unknown as 'WGS84' })).toEqual({ keyed: false, refusal: 'UNSUPPORTED_DATUM' });
    expect(spatialKeyFor(point(Number.NaN, 4.025, 250))).toEqual({ keyed: false, refusal: 'INVALID_COORDINATES' });
    for (const reason of Object.values(KEY_REFUSAL_REASON)) expect(reason.trim().length).toBeGreaterThan(40);
  });
});

describe('separation, and the verdict the arithmetic is allowed to reach', () => {
  it('measures a known great-circle distance to within the stated model error', () => {
    // Rotterdam to Santos, ~9 500 km. The check is the model, not a geodesy library.
    const metres = separationM(point(51.9497, 4.025), point(-23.9535, -46.313));
    expect(metres).toBeGreaterThan(9_400_000);
    expect(metres).toBeLessThan(9_800_000);
    expect(separationM(point(0, 0), point(0, 0))).toBe(0);
  });

  const keyed = (recordId: string, subjectId: string, p: GeodeticPoint): PositionKey => ({
    recordId, subjectId, subjectType: 'Lot', title: recordId, point: p, outcome: spatialKeyFor(p),
  });

  it('refutes when the separation exceeds the combined stated uncertainty', () => {
    const pair = comparePositions(keyed('A', 'S1', point(51.9497, 4.025, 250)), keyed('B', 'S2', point(51.9600, 4.025, 250)));
    expect(pair.verdict).toBe('DISTINGUISHABLE');
    expect(pair.because).toMatch(/different places/);
  });

  it('leaves a candidate, not a merge, when the evidence cannot separate them', () => {
    const pair = comparePositions(keyed('A', 'S1', point(51.9497, 4.025, 250)), keyed('B', 'S2', point(51.9499, 4.0252, 250)));
    expect(pair.verdict).toBe('INDISTINGUISHABLE');
    expect(pair.because).toMatch(/resolution decision would be needed/);
    expect(VERDICT_MEANING.INDISTINGUISHABLE).toMatch(/never a merge|not a resolution/);
  });

  // The unusual one: the distance model's own error is part of the verdict.
  it('declines to decide inside the distance model’s own error', () => {
    const a = point(0, 0, 1_000_000);
    const b = point(0, 18, 1_000_000);
    const separation = separationM(a, b);
    // Combined uncertainty set exactly at the separation: the margin is zero, well inside tolerance.
    const tuned = comparePositions(
      keyed('A', 'S1', { ...a, horizontalUncertaintyM: separation / 2 }),
      keyed('B', 'S2', { ...b, horizontalUncertaintyM: separation / 2 }),
    );
    expect(tuned.verdict).toBe('UNDECIDABLE');
    expect(tuned.because).toMatch(/distance model/);
    expect(SEPARATION_METHOD.relativeError).toBeGreaterThan(0);
    expect(SEPARATION_METHOD.notThis).toMatch(/ellipsoid/);
  });

  it('is undecidable when either side stated no uncertainty', () => {
    const pair = comparePositions(keyed('A', 'S1', point(51.9497, 4.025, 250)), keyed('B', 'S2', point(51.9499, 4.0252)));
    expect(pair.verdict).toBe('UNDECIDABLE');
    expect(pair.combinedUncertaintyM).toBeNull();
    expect(pair.blockingPrecision).toBeNull();
    expect(pair.blockedTogether).toBe(false);
  });

  it('blocks at the coarser of the two resolutions', () => {
    const a = keyed('A', 'S1', point(51.9497, 4.025, 30));
    const b = keyed('B', 'S2', point(51.9497, 4.0251, 3000));
    const pair = comparePositions(a, b);
    expect(a.outcome.keyed && b.outcome.keyed).toBe(true);
    if (!a.outcome.keyed || !b.outcome.keyed) return;
    expect(pair.blockingPrecision).toBe(Math.min(a.outcome.key.precision, b.outcome.key.precision));
    expect(pair.blockedTogether).toBe(true);
    expect(pair.blockingCells!.a).toBe(pair.blockingCells!.b);
    // Blocking is not the answer: the verdict is still the metric one.
    expect(['INDISTINGUISHABLE', 'DISTINGUISHABLE', 'UNDECIDABLE']).toContain(pair.verdict);
  });
});

describe('what the corpus can key today, reported rather than claimed', () => {
  it('keys every declared position and pairs only across subjects', () => {
    const keys = positionKeys(CARAVAN_CORPUS);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.point.datum).toBe('WGS84');
      // Every fixture position states its uncertainty, so every one is keyable.
      expect(k.outcome.keyed).toBe(true);
    }
    for (const pair of positionPairs(CARAVAN_CORPUS)) expect(pair.a.subjectId).not.toBe(pair.b.subjectId);
  });

  it('states the standing without rounding it up', () => {
    const standing = spatialKeyStanding(CARAVAN_CORPUS);
    expect(standing.positions).toBe(positionKeys(CARAVAN_CORPUS).length);
    expect(standing.keyed).toBe(standing.positions);
    expect(standing.pairs).toBe(positionPairs(CARAVAN_CORPUS).length);
    expect(standing.verdicts.INDISTINGUISHABLE + standing.verdicts.DISTINGUISHABLE + standing.verdicts.UNDECIDABLE).toBe(standing.pairs);
    // Nothing in the demonstration corpus is co-located: the honest answer is a refutation.
    expect(standing.verdicts.INDISTINGUISHABLE).toBe(0);
    expect(standing.statement).toMatch(/resolution decision that does not exist/);
  });

  it('says plainly that a point cannot contain anything', () => {
    expect(AREAL_GEOMETRY.state).toBe('ABSENT');
    expect(AREAL_GEOMETRY.wouldNeed.length).toBe(3);
    expect(AREAL_GEOMETRY.hazard).toMatch(/inexact line/);
    expect(CELL_SCHEME.notBuiltHere).toMatch(/not a spatial database/);
  });
});
