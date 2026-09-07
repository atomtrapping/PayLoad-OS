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
 * metric: the separation against the combined stated uncertainty, with the
 * distance model's own error included, so that the verdict is never finer than
 * the arithmetic behind it. That verdict refutes far more often than it
 * confirms, which is the useful direction: geometry can show that two things
 * are not in the same place far more cheaply than it can show that they are.
 *
 * Nothing here resolves an identity. INDISTINGUISHABLE is a candidate for a
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

/* ── The comparison ── */

/**
 * Haversine on a sphere of the IUGG mean radius. It is not the ellipsoid, and
 * the difference matters here because the separation is compared against metres
 * of stated uncertainty: a verdict decided inside the model's own error is not
 * a verdict.
 */
export const SEPARATION_METHOD = {
  method: 'haversine',
  figure: 'sphere of the IUGG mean radius, 6 371 008.8 m',
  notThis: 'The WGS84 ellipsoid. A geodesic on the ellipsoid (Vincenty, Karney) is the correct distance and is not computed here.',
  relativeError: 0.003,
  consequence: 'Where the separation and the combined uncertainty differ by less than this model’s own error, the pair is UNDECIDABLE. The arithmetic is not allowed to decide what the geometry cannot.',
} as const;

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle separation in metres, under SEPARATION_METHOD. */
export function separationM(a: GeodeticPoint, b: GeodeticPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ColocationVerdict = 'INDISTINGUISHABLE' | 'DISTINGUISHABLE' | 'UNDECIDABLE';

export const VERDICT_MEANING: Record<ColocationVerdict, string> = {
  INDISTINGUISHABLE: 'The separation is inside the combined stated uncertainty: this evidence cannot tell the two positions apart. A candidate for a resolution decision, not a resolution.',
  DISTINGUISHABLE: 'The separation exceeds the combined stated uncertainty: on this evidence the two positions are not the same place. This is the direction geometry answers cheaply.',
  UNDECIDABLE: 'Either a stated uncertainty is missing, or the two quantities differ by less than the distance model’s own error. Nothing is concluded.',
};

export interface PositionKey {
  recordId: string;
  subjectId: string;
  subjectType: string;
  title: string;
  point: GeodeticPoint;
  outcome: SpatialKeyOutcome;
}

export interface PositionPair {
  a: PositionKey;
  b: PositionKey;
  /** The coarser of the two resolutions: the finest at which both are supportable. */
  blockingPrecision: number | null;
  /** Whether both truncate to the same cell at that precision, which is what makes them worth comparing. */
  blockedTogether: boolean;
  blockingCells: { a: string; b: string } | null;
  separationM: number;
  combinedUncertaintyM: number | null;
  verdict: ColocationVerdict;
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
 * Cross-subject pairs, with the blocking decision and the metric verdict shown
 * separately. Two positions of the same subject are a trajectory, not an
 * identity question, so they are not paired here.
 *
 * At corpus scale the blocking key is what keeps this from being all-pairs;
 * with a handful of positions the full set is returned so that the blocking
 * decision itself stays inspectable rather than implicit.
 */
export function positionPairs(corpus: Corpus): PositionPair[] {
  const keys = positionKeys(corpus);
  const pairs: PositionPair[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i], b = keys[j];
      if (a.subjectId === b.subjectId) continue;
      pairs.push(comparePositions(a, b));
    }
  }
  return pairs;
}

/** Pure: the blocking decision and the verdict for one pair. */
export function comparePositions(a: PositionKey, b: PositionKey): PositionPair {
  const separation = separationM(a.point, b.point);
  const keyA = a.outcome.keyed ? a.outcome.key : null;
  const keyB = b.outcome.keyed ? b.outcome.key : null;
  const blockingPrecision = keyA && keyB ? Math.min(keyA.precision, keyB.precision) : null;
  const blockingCells = keyA && keyB && blockingPrecision
    ? { a: keyA.cell.slice(0, blockingPrecision), b: keyB.cell.slice(0, blockingPrecision) }
    : null;
  const blockedTogether = blockingCells !== null && blockingCells.a === blockingCells.b;
  const combined = keyA && keyB ? keyA.boundedByM + keyB.boundedByM : null;

  let verdict: ColocationVerdict = 'UNDECIDABLE';
  let because: string;
  if (combined === null) {
    because = 'One of the two positions carries no stated horizontal uncertainty, so there is nothing to compare the separation against.';
  } else {
    const margin = separation - combined;
    const tolerance = separation * SEPARATION_METHOD.relativeError;
    if (Math.abs(margin) <= tolerance) {
      because = `The separation (${round(separation)} m) and the combined stated uncertainty (${round(combined)} m) differ by less than the distance model’s own error (±${round(tolerance)} m), so this arithmetic decides nothing.`;
    } else if (margin > 0) {
      verdict = 'DISTINGUISHABLE';
      because = `${round(separation)} m apart, against ${round(combined)} m of combined stated uncertainty: the sources place these in different places.`;
    } else {
      verdict = 'INDISTINGUISHABLE';
      because = `${round(separation)} m apart, inside ${round(combined)} m of combined stated uncertainty: this evidence cannot separate them. A resolution decision would be needed to say more, and none exists.`;
    }
  }
  return { a, b, blockingPrecision, blockedTogether, blockingCells, separationM: separation, combinedUncertaintyM: combined, verdict, because };
}

/** Metres, grouped, to the metre. The verdict is about metres, so it is stated in metres. */
const round = (metres: number) => Math.round(metres).toLocaleString('en-US');

/* ── What the corpus can key today ── */

export interface SpatialKeyStanding {
  positions: number;
  keyed: number;
  refusals: readonly { refusal: KeyRefusal; count: number }[];
  precisions: readonly number[];
  pairs: number;
  blocked: number;
  verdicts: Record<ColocationVerdict, number>;
  statement: string;
}

/** Pure: counts what is keyed and what the comparison decided, asserting nothing further. */
export function spatialKeyStanding(corpus: Corpus): SpatialKeyStanding {
  const keys = positionKeys(corpus);
  const refusalCounts = new Map<KeyRefusal, number>();
  for (const k of keys) if (!k.outcome.keyed) refusalCounts.set(k.outcome.refusal, (refusalCounts.get(k.outcome.refusal) ?? 0) + 1);
  const pairs = positionPairs(corpus);
  const verdicts: Record<ColocationVerdict, number> = { INDISTINGUISHABLE: 0, DISTINGUISHABLE: 0, UNDECIDABLE: 0 };
  for (const p of pairs) verdicts[p.verdict] += 1;
  const keyed = keys.filter((k) => k.outcome.keyed).length;
  return {
    positions: keys.length,
    keyed,
    refusals: [...refusalCounts.entries()].map(([refusal, count]) => ({ refusal, count })).sort((x, y) => x.refusal.localeCompare(y.refusal)),
    precisions: [...new Set(keys.flatMap((k) => (k.outcome.keyed ? [k.outcome.key.precision] : [])))].sort((x, y) => x - y),
    pairs: pairs.length,
    blocked: pairs.filter((p) => p.blockedTogether).length,
    verdicts,
    statement: keys.length === 0
      ? 'No record in this release declares a position, so nothing is keyed.'
      : `${keyed} of ${keys.length} declared position${keys.length === 1 ? '' : 's'} carry a stated uncertainty and are keyed. ${pairs.length} cross-subject pair${pairs.length === 1 ? '' : 's'} compared: ${verdicts.DISTINGUISHABLE} refuted by geometry, ${verdicts.INDISTINGUISHABLE} left as candidates for a resolution decision that does not exist, ${verdicts.UNDECIDABLE} undecidable.`,
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
