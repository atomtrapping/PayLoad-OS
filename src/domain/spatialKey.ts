/**
 * Space as a key and a verdict, not a picture.
 *
 * The twin draws positions and the compiler places them; neither derives
 * anything from them. This module is the first derivation: it turns a declared
 * geodetic position into a cell key that two records can meet on, and it
 * decides, from the evidence alone, whether two positions can be told apart.
 *
 * Two disciplines make it honest, and both are unusual enough to state:
 *
 * A cell may never be finer than the evidence. A position the source states to
 * ±500 m indexed into a 38 m cell asserts a precision the source never claimed,
 * and the cell would then be a fabricated fact wearing a key's clothes. The
 * resolution is therefore chosen from the stated horizontal uncertainty, and a
 * position with no stated uncertainty gets no key at all — a refusal, not a
 * default.
 *
 * The cell is a blocking key; it is not the answer. Sharing a cell makes two
 * records worth comparing and establishes nothing else. The comparison is
 * metric: the geodesic on the WGS84 ellipsoid, tested against the radii the
 * sources stated, answering in one three-valued vocabulary. It refutes far
 * more often than it confirms, which is the useful direction — geometry shows
 * that two things are not in the same place far more cheaply than it shows
 * that they are — and where a radius is missing or the method does not
 * converge it declines to put the question at all.
 *
 * The metric and the vocabulary are shared, deliberately. The Earth Twin asks
 * of one subject whether its own standing declarations can all be right; this
 * module asks of two subjects whether the evidence can tell them apart. Two
 * questions, one measurement, no second implementation.
 *
 * Nothing here resolves an identity. OVERLAPPING is a candidate for a
 * resolution decision that does not exist yet (see ./identity), never a merge.
 */
import { LOCATION_POSITION_PREDICATE, currentRelease, recordStatusAt, releaseRecords } from './corpus';
import type { Corpus, CorpusRecord, GeodeticPoint } from './corpus';

/* ── The scheme ── */

/**
 * Geohash: the base-32 prefix code over WGS84 longitude and latitude. Chosen
 * because a join key has to be interoperable and truncatable, and because it is
 * a published encoding rather than a scheme of this firm's own invention.
 */
export const CELL_SCHEME = {
  id: 'geohash',
  what: 'Base-32 geohash over WGS84: each character adds five bits, alternating longitude and latitude.',
  whyThisOne: 'A cell key is only a join key if another party computes the same key from the same coordinates, and only useful if a fine key truncates to a coarse one. Geohash is published, has no library to adopt and is a prefix code, so two positions indexed at different resolutions still meet by dropping characters.',
  cost: 'Geohash cells are rectangles in degrees, so ground width shrinks with the cosine of latitude and a cell near a pole is nothing like a cell at the equator. Every extent below is therefore computed at the position’s own latitude and never quoted as a constant.',
  successor: 'S2 or H3, whose cells are near-equal-area and whose neighbour operations are defined. Adopting one is a library decision, and this scheme is the stand-in until then, not an argument against it.',
  notBuiltHere: 'This is an encoding, not a spatial database. PostGIS, S2, H3 and STAC are the purchased layer; what belongs to the firm is the discipline over them — the resolution bound, the refusal and the verdict.',
} as const;

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash characters. Beyond 12 the cell is smaller than any position's stated uncertainty. */
export const MAX_PRECISION = 12;

/** One degree of latitude on the WGS84 ellipsoid, to the metre. Longitude is this times cos(latitude). */
const METRES_PER_DEGREE_LATITUDE = 111_320;

/** Encode a WGS84 position as a geohash of the given precision. Throws on a coordinate outside the datum. */
export function encodeGeohash(latitude: number, longitude: number, precision: number): string {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError(`latitude ${latitude} is outside WGS84`);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError(`longitude ${longitude} is outside WGS84`);
  if (!Number.isInteger(precision) || precision < 1 || precision > MAX_PRECISION) throw new RangeError(`precision ${precision} is outside 1..${MAX_PRECISION}`);
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = '', bits = 0, value = 0, longitudeTurn = true;
  while (hash.length < precision) {
    if (longitudeTurn) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude >= mid) { value = value * 2 + 1; lonMin = mid; } else { value *= 2; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) { value = value * 2 + 1; latMin = mid; } else { value *= 2; latMax = mid; }
    }
    longitudeTurn = !longitudeTurn;
    if (++bits === 5) { hash += BASE32[value]; bits = 0; value = 0; }
  }
  return hash;
}

export interface CellExtent {
  /** East-west ground extent at this latitude, in metres. */
  widthM: number;
  /** North-south ground extent, in metres. */
  heightM: number;
  /** The smaller of the two: what the cell can actually separate. */
  shortestM: number;
}

/** The ground extent of a cell at a given precision and latitude. Width is not a constant. */
export function cellExtentM(precision: number, latitude: number): CellExtent {
  const totalBits = precision * 5;
  const longitudeBits = Math.ceil(totalBits / 2);
  const latitudeBits = Math.floor(totalBits / 2);
  const heightM = (180 / 2 ** latitudeBits) * METRES_PER_DEGREE_LATITUDE;
  const widthM = (360 / 2 ** longitudeBits) * METRES_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
  return { widthM, heightM, shortestM: Math.min(widthM, heightM) };
}

/**
 * The finest precision whose cell is still at least as large as the stated
 * uncertainty. Indexing more finely than the evidence supports would invent
 * precision, so this is a bound rather than a preference.
 */
export function cellPrecisionFor(uncertaintyM: number, latitude: number): number {
  let chosen = 1;
  for (let precision = 1; precision <= MAX_PRECISION; precision += 1) {
    if (cellExtentM(precision, latitude).shortestM >= uncertaintyM) chosen = precision;
    else break;
  }
  return chosen;
}

/* ── The key, and the refusals ── */

export type KeyRefusal = 'NO_GEOMETRY' | 'UNSUPPORTED_DATUM' | 'INVALID_COORDINATES' | 'NO_STATED_UNCERTAINTY';

export const KEY_REFUSAL_REASON: Record<KeyRefusal, string> = {
  NO_GEOMETRY: 'The record declares no position, so there is nothing to key.',
  UNSUPPORTED_DATUM: 'The position is declared in a datum other than WGS84, and no transform to WGS84 is declared. A datum shift is metres; guessing it would put the position in the wrong cell.',
  INVALID_COORDINATES: 'The declared coordinates are not a point on the datum.',
  NO_STATED_UNCERTAINTY: 'The source stated no horizontal uncertainty, so no resolution is supportable. A cell chosen anyway would assert a precision no evidence backs.',
};

export interface SpatialKey {
  scheme: typeof CELL_SCHEME.id;
  datum: 'WGS84';
  cell: string;
  precision: number;
  extent: CellExtent;
  /** The stated uncertainty that bounded the resolution. */
  boundedByM: number;
}

export type SpatialKeyOutcome = { keyed: true; key: SpatialKey } | { keyed: false; refusal: KeyRefusal };

/** Pure: a key, or the exact reason there is none. Never a default cell. */
export function spatialKeyFor(point: GeodeticPoint | undefined): SpatialKeyOutcome {
  if (!point) return { keyed: false, refusal: 'NO_GEOMETRY' };
  if (point.datum !== 'WGS84') return { keyed: false, refusal: 'UNSUPPORTED_DATUM' };
  const { latitude, longitude } = point;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { keyed: false, refusal: 'INVALID_COORDINATES' };
  }
  const uncertaintyM = point.horizontalUncertaintyM;
  if (typeof uncertaintyM !== 'number' || !Number.isFinite(uncertaintyM) || uncertaintyM <= 0) {
    return { keyed: false, refusal: 'NO_STATED_UNCERTAINTY' };
  }
  const precision = cellPrecisionFor(uncertaintyM, latitude);
  return {
    keyed: true,
    key: {
      scheme: CELL_SCHEME.id,
      datum: 'WGS84',
      cell: encodeGeohash(latitude, longitude, precision),
      precision,
      extent: cellExtentM(precision, latitude),
      boundedByM: uncertaintyM,
    },
  };
}

export function spatialKeyForRecord(record: CorpusRecord): SpatialKeyOutcome {
  return spatialKeyFor(record.geometry);
}

/* ── The metric, and the vocabulary the answer is given in ── */

/** The distance model, declared rather than assumed: the geodesic on the WGS84 ellipsoid, by Vincenty's inverse solution. */
export const SEPARATION_METRIC = 'WGS84_ELLIPSOIDAL_GEODESIC';

const WGS84 = { a: 6378137, f: 1 / 298.257223563 } as const;
const RAD = Math.PI / 180;

export type SeparationOutcome =
  | { state: 'MEASURED'; metres: number }
  | { state: 'NOT_ASSESSABLE'; because: string };

/**
 * Vincenty's inverse solution on the WGS84 ellipsoid: the length of the
 * shortest path over the ellipsoid surface between two points. It is not a
 * route, not a distance through anything and not a straight line in space.
 * The solution does not converge for very nearly antipodal points; there it
 * refuses rather than returning the last iterate.
 */
export function geodesicSeparationM(
  from: { longitude: number; latitude: number },
  to: { longitude: number; latitude: number },
): SeparationOutcome {
  const coordinates = [from.longitude, from.latitude, to.longitude, to.latitude];
  if (coordinates.some((value) => !Number.isFinite(value))) return { state: 'NOT_ASSESSABLE', because: 'A coordinate is not a finite number.' };
  if (Math.abs(from.latitude) > 90 || Math.abs(to.latitude) > 90) return { state: 'NOT_ASSESSABLE', because: 'A latitude is outside the range the datum defines.' };
  const { a, f } = WGS84;
  const b = a * (1 - f);
  const L = (to.longitude - from.longitude) * RAD;
  const U1 = Math.atan((1 - f) * Math.tan(from.latitude * RAD));
  const U2 = Math.atan((1 - f) * Math.tan(to.latitude * RAD));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, sinSigma = 0, cosSigma = 1, sigma = 0, cos2SigmaM = 1, cosSqAlpha = 1, converged = false;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const sinLambda = Math.sin(lambda), cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2);
    if (sinSigma === 0) return { state: 'MEASURED', metres: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const previous = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda) > Math.PI) break;
    if (Math.abs(lambda - previous) < 1e-12) { converged = true; break; }
  }
  if (!converged) return { state: 'NOT_ASSESSABLE', because: 'The geodesic between these two points did not converge: they are very nearly antipodal, and this method does not answer there.' };
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma = B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return { state: 'MEASURED', metres: b * A * (sigma - deltaSigma) };
}

/** Metres at the precision the number deserves; never more digits than the measurement carries meaning for. */
export function formatMetres(metres: number): string {
  if (metres >= 10_000) return `${(metres / 1000).toFixed(1)} km`;
  if (metres >= 10) return `${metres.toFixed(0)} m`;
  return `${metres.toFixed(2)} m`;
}

/**
 * `DISJOINT`: the stated uncertainties cannot both contain one common
 * point, so the accounts contradict and something must adjudicate them.
 * `OVERLAPPING`: they can. `NOT_ASSESSABLE`: the question was not put,
 * because something needed to put it is missing.
 */
export type PositionConsistency = 'DISJOINT' | 'OVERLAPPING' | 'NOT_ASSESSABLE';

export const CONSISTENCY_MEANING: Record<PositionConsistency, string> = {
  DISJOINT: 'The stated uncertainties cannot both contain one common point: on this evidence these are not the same place. This is the direction geometry answers cheaply.',
  OVERLAPPING: 'They can contain one common point: this evidence cannot separate them. Across two subjects that is a candidate for a resolution decision, never a merge, and no such decision exists here.',
  NOT_ASSESSABLE: 'The question was not put, because something needed to put it is missing: a stated uncertainty, or a geodesic this method answers for.',
};

/* ── The cross-subject question ── */

/**
 * Two questions share this metric and must not be confused.
 *
 * The twin asks the *intra-subject* one in ./earth: can a subject's own
 * standing declarations all be right at once? A DISJOINT answer there is a
 * contradiction between sources and a question for adjudication.
 *
 * This module asks the *cross-subject* one: can the evidence tell two
 * different subjects apart? A DISJOINT answer here refutes a co-location
 * claim. An OVERLAPPING answer establishes nothing on its own — it is a
 * candidate for a resolution decision that does not exist.
 */
export const CROSS_SUBJECT_TEST = {
  asks: 'Can this evidence tell two different subjects apart?',
  notThis: 'Whether one subject’s own declarations agree, which the Earth Twin asks separately over the same metric.',
  refutes: 'A DISJOINT answer is a real negative: the sources place two subjects in different places, with no name matching involved.',
  confirmsNothing: 'An OVERLAPPING answer is not a resolution and not a merge. It says the geometry cannot separate them, and the resolution decision that could carry two identifiers to one subject does not exist.',
  blocking: 'The cell key decides which pairs are worth this test at all. At corpus scale the metric is never run over all pairs; here the full set is shown so that the blocking decision itself stays inspectable.',
} as const;

export interface PositionKey {
  recordId: string;
  subjectId: string;
  subjectType: string;
  title: string;
  point: GeodeticPoint;
  outcome: SpatialKeyOutcome;
}

export interface CrossSubjectPair {
  a: PositionKey;
  b: PositionKey;
  /** The coarser of the two resolutions: the finest at which both are supportable. */
  blockingPrecision: number | null;
  /** Whether both truncate to the same cell at that precision, which is what makes them worth comparing. */
  blockedTogether: boolean;
  blockingCells: { a: string; b: string } | null;
  separation: SeparationOutcome;
  /** The sum of the two stated radii, or null when the test could not be put. */
  combinedRadiusM: number | null;
  state: PositionConsistency;
  because: string;
}

/** Position records of the corpus's current release, retracted ones dropped. */
export function positionRecords(corpus: Corpus): CorpusRecord[] {
  const release = currentRelease(corpus);
  return releaseRecords(corpus, release)
    .filter((r) => r.predicate === LOCATION_POSITION_PREDICATE && r.geometry)
    .filter((r) => recordStatusAt(corpus, r, release.knownAt) !== 'RETRACTED');
}

export function positionKeys(corpus: Corpus): PositionKey[] {
  return positionRecords(corpus).map((r) => ({
    recordId: r.recordId,
    subjectId: r.subjectId,
    subjectType: r.subjectType,
    title: r.title,
    point: r.geometry as GeodeticPoint,
    outcome: spatialKeyForRecord(r),
  }));
}

/**
 * Cross-subject pairs, with the blocking decision and the metric answer shown
 * separately. Two positions of the same subject are the twin's question, not
 * this one, so they are not paired here.
 */
export function crossSubjectPairs(corpus: Corpus): CrossSubjectPair[] {
  const keys = positionKeys(corpus);
  const pairs: CrossSubjectPair[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i], b = keys[j];
      if (a.subjectId === b.subjectId) continue;
      pairs.push(compareSubjects(a, b));
    }
  }
  return pairs;
}

/** Pure: the blocking decision and the answer for one cross-subject pair. */
export function compareSubjects(a: PositionKey, b: PositionKey): CrossSubjectPair {
  const separation = geodesicSeparationM(a.point, b.point);
  const keyA = a.outcome.keyed ? a.outcome.key : null;
  const keyB = b.outcome.keyed ? b.outcome.key : null;
  const blockingPrecision = keyA && keyB ? Math.min(keyA.precision, keyB.precision) : null;
  const blockingCells = keyA && keyB && blockingPrecision
    ? { a: keyA.cell.slice(0, blockingPrecision), b: keyB.cell.slice(0, blockingPrecision) }
    : null;
  const blockedTogether = blockingCells !== null && blockingCells.a === blockingCells.b;
  const base = { a, b, blockingPrecision, blockedTogether, blockingCells, separation };

  if (separation.state === 'NOT_ASSESSABLE') {
    return { ...base, combinedRadiusM: null, state: 'NOT_ASSESSABLE', because: separation.because };
  }
  const missing = [keyA === null ? a.recordId : null, keyB === null ? b.recordId : null].filter((id): id is string => id !== null);
  if (missing.length) {
    return { ...base, combinedRadiusM: null, state: 'NOT_ASSESSABLE',
      because: `${missing.join(' and ')} state${missing.length === 1 ? 's' : ''} no usable horizontal uncertainty. No radius is assumed for a declaration that does not carry one, so the two cannot be tested against each other.` };
  }
  const combinedRadiusM = keyA!.boundedByM + keyB!.boundedByM;
  const disjoint = separation.metres > combinedRadiusM;
  return { ...base, combinedRadiusM, state: disjoint ? 'DISJOINT' : 'OVERLAPPING',
    because: disjoint
      ? `${formatMetres(separation.metres)} apart, against a combined ${formatMetres(combinedRadiusM)} of stated uncertainty: the sources place these two subjects in different places.`
      : `${formatMetres(separation.metres)} apart, within a combined ${formatMetres(combinedRadiusM)} of stated uncertainty: this evidence cannot separate them. A resolution decision would be needed to say more, and none exists.` };
}

/* ── What the corpus can key today ── */

export interface SpatialKeyStanding {
  positions: number;
  keyed: number;
  refusals: readonly { refusal: KeyRefusal; count: number }[];
  precisions: readonly number[];
  pairs: number;
  blocked: number;
  answers: Record<PositionConsistency, number>;
  statement: string;
}

/** Pure: counts what is keyed and what the comparison answered, asserting nothing further. */
export function spatialKeyStanding(corpus: Corpus): SpatialKeyStanding {
  const keys = positionKeys(corpus);
  const refusalCounts = new Map<KeyRefusal, number>();
  for (const k of keys) if (!k.outcome.keyed) refusalCounts.set(k.outcome.refusal, (refusalCounts.get(k.outcome.refusal) ?? 0) + 1);
  const pairs = crossSubjectPairs(corpus);
  const answers: Record<PositionConsistency, number> = { DISJOINT: 0, OVERLAPPING: 0, NOT_ASSESSABLE: 0 };
  for (const p of pairs) answers[p.state] += 1;
  const keyed = keys.filter((k) => k.outcome.keyed).length;
  return {
    positions: keys.length,
    keyed,
    refusals: [...refusalCounts.entries()].map(([refusal, count]) => ({ refusal, count })).sort((x, y) => x.refusal.localeCompare(y.refusal)),
    precisions: [...new Set(keys.flatMap((k) => (k.outcome.keyed ? [k.outcome.key.precision] : [])))].sort((x, y) => x - y),
    pairs: pairs.length,
    blocked: pairs.filter((p) => p.blockedTogether).length,
    answers,
    statement: keys.length === 0
      ? 'No record in this release declares a position, so nothing is keyed.'
      : `${keyed} of ${keys.length} declared position${keys.length === 1 ? '' : 's'} carry a stated uncertainty and are keyed. ${pairs.length} cross-subject pair${pairs.length === 1 ? '' : 's'} tested: ${answers.DISJOINT} refuted by geometry, ${answers.OVERLAPPING} left as candidates for a resolution decision that does not exist, ${answers.NOT_ASSESSABLE} not assessable.`,
  };
}

/* ── What a point cannot do ── */

/**
 * Containment and adjacency are the strong geometric joins — a berth inside a
 * terminal, a facility on a parcel — and none of them is available, because the
 * corpus carries points and nothing else.
 */
export const AREAL_GEOMETRY = {
  state: 'ABSENT' as const,
  why: 'CorpusRecord.geometry admits one kind, POINT. A point can be near another point; it cannot contain one.',
  wouldNeed: [
    'A polygon geometry kind on the record contract, with its datum and its own stated positional uncertainty, so a boundary is evidence like any other record.',
    'A declared source for boundaries — cadastral, berth or administrative — registered with its rights, because a boundary is somebody’s survey and carries its terms.',
    'Predicates for containment, adjacency and overlap in the link vocabulary, each naming the evidence its kind demands, so that a computed overlap enters as a candidate rather than as an edge.',
  ],
  hazard: 'A digitized boundary is a line somebody drew, at a scale, on a date. Containment computed against it is exact arithmetic over an inexact line, and reporting the arithmetic’s precision as the answer’s precision is the characteristic GIS error.',
} as const;
