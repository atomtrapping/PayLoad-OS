import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { LANDSHARK_CORPUS } from '@/fixtures/landshark/release';
import type { GeodeticPoint } from './corpus';
import {
  AREAL_GEOMETRY, CELL_SCHEME, CONSISTENCY_MEANING, CROSS_SUBJECT_TEST, KEY_REFUSAL_REASON, MAX_PRECISION, SEPARATION_METRIC,
  cellExtentM, cellPrecisionFor, compareSubjects, crossSubjectPairs, encodeGeohash, geodesicSeparationM,
  positionKeys, representativePointOf, spatialKeyFor, spatialKeyStanding, type PositionKey,
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

describe('the metric, and the answer it is allowed to reach', () => {
  const measured = (a: GeodeticPoint, b: GeodeticPoint) => {
    const outcome = geodesicSeparationM(a, b);
    if (outcome.state !== 'MEASURED') throw new Error(outcome.because);
    return outcome.metres;
  };

  it('measures the ellipsoidal geodesic, not a sphere', () => {
    // One degree of latitude at the equator on WGS84 is 110 574 m; a sphere would say 111 195 m.
    expect(measured(point(0, 0), point(1, 0))).toBeCloseTo(110_574, -1);
    // One degree of longitude at the equator is 111 320 m.
    expect(measured(point(0, 0), point(0, 1))).toBeCloseTo(111_320, -1);
    expect(measured(point(0, 0), point(0, 0))).toBe(0);
    expect(SEPARATION_METRIC).toBe('WGS84_ELLIPSOIDAL_GEODESIC');
  });

  it('refuses where the method does not answer, rather than returning the last iterate', () => {
    const antipodal = geodesicSeparationM(point(0, 0), point(0.5, 179.7));
    expect(antipodal.state).toBe('NOT_ASSESSABLE');
    expect(geodesicSeparationM(point(Number.NaN, 0), point(0, 0)).state).toBe('NOT_ASSESSABLE');
  });

  const keyed = (recordId: string, subjectId: string, p: GeodeticPoint): PositionKey => ({
    recordId, subjectId, subjectType: 'Lot', title: recordId, geometry: p, point: representativePointOf(p), outcome: spatialKeyFor(p),
  });

  it('refutes when the stated radii cannot contain one common point', () => {
    const pair = compareSubjects(keyed('A', 'S1', point(51.9497, 4.025, 250)), keyed('B', 'S2', point(51.9600, 4.025, 250)));
    expect(pair.state).toBe('DISJOINT');
    expect(pair.because).toMatch(/different places/);
    expect(pair.combinedRadiusM).toBe(500);
  });

  it('leaves a candidate, not a merge, when the evidence cannot separate them', () => {
    const pair = compareSubjects(keyed('A', 'S1', point(51.9497, 4.025, 250)), keyed('B', 'S2', point(51.9499, 4.0252, 250)));
    expect(pair.state).toBe('OVERLAPPING');
    expect(pair.because).toMatch(/resolution decision would be needed/);
    expect(CONSISTENCY_MEANING.OVERLAPPING).toMatch(/never a merge/);
    expect(CROSS_SUBJECT_TEST.confirmsNothing).toMatch(/not a resolution/);
  });

  it('is not assessable when either side stated no uncertainty', () => {
    const pair = compareSubjects(keyed('A', 'S1', point(51.9497, 4.025, 250)), keyed('B', 'S2', point(51.9499, 4.0252)));
    expect(pair.state).toBe('NOT_ASSESSABLE');
    expect(pair.because).toMatch(/No radius is assumed/);
    expect(pair.combinedRadiusM).toBeNull();
    expect(pair.blockingPrecision).toBeNull();
    expect(pair.blockedTogether).toBe(false);
  });

  it('blocks at the coarser of the two resolutions, and the block is not the answer', () => {
    const a = keyed('A', 'S1', point(51.9497, 4.025, 30));
    const b = keyed('B', 'S2', point(51.9497, 4.0251, 3000));
    const pair = compareSubjects(a, b);
    expect(a.outcome.keyed && b.outcome.keyed).toBe(true);
    if (!a.outcome.keyed || !b.outcome.keyed) return;
    expect(pair.blockingPrecision).toBe(Math.min(a.outcome.key.precision, b.outcome.key.precision));
    expect(pair.blockedTogether).toBe(true);
    expect(pair.blockingCells!.a).toBe(pair.blockingCells!.b);
    expect(CROSS_SUBJECT_TEST.blocking).toMatch(/never run over all pairs/);
  });

  it('asks a different question from the twin, over the same metric', () => {
    expect(CROSS_SUBJECT_TEST.asks).toMatch(/two different subjects apart/);
    expect(CROSS_SUBJECT_TEST.notThis).toMatch(/one subject’s own declarations/);
  });
});

describe('what the corpus can key today, reported rather than claimed', () => {
  it('keys every declared position and pairs only across subjects', () => {
    const keys = positionKeys(CARAVAN_CORPUS);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k.geometry.datum).toBe('WGS84');
      // Every fixture position states its uncertainty, so every one is keyable.
      expect(k.outcome.keyed).toBe(true);
    }
    for (const pair of crossSubjectPairs(CARAVAN_CORPUS)) expect(pair.a.subjectId).not.toBe(pair.b.subjectId);
  });

  it('states the standing without rounding it up', () => {
    const standing = spatialKeyStanding(CARAVAN_CORPUS);
    expect(standing.positions).toBe(positionKeys(CARAVAN_CORPUS).length);
    expect(standing.keyed).toBe(standing.positions);
    expect(standing.pairs).toBe(crossSubjectPairs(CARAVAN_CORPUS).length);
    expect(standing.answers.DISJOINT + standing.answers.OVERLAPPING + standing.answers.NOT_ASSESSABLE).toBe(standing.pairs);
    // Nothing in the demonstration corpus is co-located: the honest answer is a refutation.
    expect(standing.answers.OVERLAPPING).toBe(0);
    expect(standing.statement).toMatch(/resolution decision that does not exist/);
  });

  it('says plainly that carrying a shape is not the same as computing containment', () => {
    // The contract carries POLYGON and EXTENT now, so the state moved off
    // ABSENT. It did not move to BUILT, and the reason is the whole point:
    // nothing reads a boundary to say what is inside it.
    expect(AREAL_GEOMETRY.state).toBe('PARTIAL');
    expect(AREAL_GEOMETRY.why).toMatch(/POINT, POLYGON and EXTENT/);
    expect(AREAL_GEOMETRY.why).toMatch(/still absent is the predicate/);
    expect(AREAL_GEOMETRY.wouldNeed.length).toBe(3);
    expect(AREAL_GEOMETRY.hazard).toMatch(/inexact line/);
    expect(CELL_SCHEME.notBuiltHere).toMatch(/not a spatial database/);
  });
});

describe('a shape is keyed as a shape, and its own size bounds the cell', () => {
  const ring = LANDSHARK_CORPUS.records.find((r) => r.recordId === 'LS-0123')!.geometry!;
  const extent = LANDSHARK_CORPUS.records.find((r) => r.recordId === 'LS-0124')!.geometry!;

  it('keys a boundary at the centre of its containing rectangle, reproducibly', () => {
    // Not an area centroid: an area centroid moves when the ring is re-ordered
    // or re-sampled, and a key a counterparty cannot recompute is not a key.
    expect(ring.kind).toBe('POLYGON');
    const centre = representativePointOf(ring);
    expect(centre.longitude).toBeCloseTo(4.025, 4);
    expect(centre.latitude).toBeCloseTo(51.9497, 4);
    const reversed = { ...ring, ring: [...(ring as { ring: readonly { longitude: number; latitude: number }[] }).ring].reverse() };
    expect(representativePointOf(reversed)).toEqual(centre);
  });

  it('bounds the cell by the stated uncertainty PLUS the feature’s own reach', () => {
    const outcome = spatialKeyFor(ring);
    expect(outcome.keyed).toBe(true);
    if (!outcome.keyed) return;
    expect(outcome.key.of).toBe('POLYGON');
    expect(outcome.key.bound.statedUncertaintyM).toBe(30);
    // The parcel is roughly 297 x 291 m, so the furthest vertex is ~208 m out.
    expect(outcome.key.bound.featureReachM).toBeGreaterThan(150);
    expect(outcome.key.bound.featureReachM).toBeLessThan(260);
    expect(outcome.key.boundedByM).toBeCloseTo(30 + outcome.key.bound.featureReachM, 6);
    // And the cell is no finer than that total, which is the whole discipline.
    expect(outcome.key.extent.shortestM).toBeGreaterThanOrEqual(outcome.key.boundedByM);
  });

  it('keys a 30 m survey more finely than a 30 m survey of a whole parcel', () => {
    // Same stated accuracy, different features. The parcel keys coarser because
    // reducing an extended thing to one cell means the cell must contain it.
    const mark = spatialKeyFor({ kind: 'POINT', datum: 'WGS84', longitude: 4.025, latitude: 51.9497, horizontalUncertaintyM: 30 });
    const parcel = spatialKeyFor(ring);
    expect(mark.keyed && parcel.keyed).toBe(true);
    if (!mark.keyed || !parcel.keyed) return;
    expect(mark.key.bound.featureReachM).toBe(0);
    expect(mark.key.precision).toBeGreaterThan(parcel.key.precision);
  });

  it('keys an extent, and never confuses it with a boundary', () => {
    const outcome = spatialKeyFor(extent);
    expect(extent.kind).toBe('EXTENT');
    expect(outcome.keyed).toBe(true);
    if (!outcome.keyed) return;
    expect(outcome.key.of).toBe('EXTENT');
    expect(outcome.key.bound.featureReachM).toBeGreaterThan(0);
  });

  it('refuses a shape that encloses nothing, and a boundary with no stated accuracy', () => {
    const two = spatialKeyFor({ kind: 'POLYGON', datum: 'WGS84', horizontalUncertaintyM: 10, ring: [{ longitude: 4, latitude: 52 }, { longitude: 4.001, latitude: 52 }] });
    expect(two).toEqual({ keyed: false, refusal: 'DEGENERATE_BOUNDARY' });
    const flat = spatialKeyFor({ kind: 'EXTENT', datum: 'WGS84', horizontalUncertaintyM: 10, west: 4, east: 4, south: 52, north: 52.01 });
    expect(flat).toEqual({ keyed: false, refusal: 'DEGENERATE_BOUNDARY' });
    // A ring bounds how big the feature is. It says nothing about how far the
    // whole ring might be displaced, so it does not escape the uncertainty rule.
    const unstated = spatialKeyFor({ ...(ring as { kind: 'POLYGON'; datum: 'WGS84'; ring: readonly { longitude: number; latitude: number }[] }), horizontalUncertaintyM: undefined });
    expect(unstated).toEqual({ keyed: false, refusal: 'NO_STATED_UNCERTAINTY' });
  });
});
