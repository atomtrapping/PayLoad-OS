/**
 * The Earth as a combinatorial complex, and the learned manifold over it.
 *
 * Two halves, and only one of them is cheap.
 *
 * The first half is combinatorial and needs no neural machinery at all: nested
 * partitions of the Earth's surface as cells rather than points, containment
 * giving the complex its structure, and boundary operators moving a signal
 * between levels — parcel to district, district to region. That is the
 * receipted spatial aggregate this repository already owes itself, and part of
 * it exists today: a geohash is a nested partition, and prefix truncation is
 * the upward boundary operator. What is missing is the administrative nesting,
 * which needs boundaries the record contract cannot yet carry.
 *
 * The second half is learned, and it is a projection. Hierarchy-dominant data
 * is genuinely hyperbolic — a containment tree embeds in a Poincaré ball with
 * far less distortion than Euclidean space allows, depth becoming radius and
 * siblings diverging angularly — so the instinct is sound rather than
 * decorative. But an embedding is a computation over a release, and by the
 * fourth rule of doctrine a computation produces derived objects, not truth.
 * The manifold is belief about the corpus. It never testifies.
 *
 * That distinction is load-bearing here more than anywhere else, because a
 * smooth surface asserts a value at every point whether or not a record backs
 * it. Rendered without refusals, the most beautiful artifact in the system
 * would be the most efficient fabrication machine in it. Void renders void.
 *
 * Nothing here embeds anything. No model is trained, no library is installed,
 * and the routing table records the manifold route as UNAVAILABLE.
 */
import { CELL_SCHEME, MAX_PRECISION, positionKeys } from './spatialKey';
import type { Corpus } from './corpus';

export type HalfState = 'PARTIAL' | 'ABSENT';

/* ── The combinatorial half ── */

export interface ComplexPart {
  id: 'CELLS' | 'CONTAINMENT' | 'BOUNDARY_OPERATORS' | 'SIGNALS';
  title: string;
  what: string;
  state: HalfState;
  here: string;
  missing: string;
}

export const COMPLEX: readonly ComplexPart[] = [
  {
    id: 'CELLS',
    title: 'Cells, not points',
    what: 'A region at a stated resolution as the unit of the structure, so that a thing sits in a cell rather than at a coordinate.',
    state: 'PARTIAL',
    here: `Every keyable position carries a ${CELL_SCHEME.id} cell at the finest resolution its stated uncertainty supports. The cell is already a region and already carries its ground extent.`,
    missing: 'Cells that are not derived from a point: an administrative or cadastral region is a cell in its own right, and the record contract admits POINT only.',
  },
  {
    id: 'CONTAINMENT',
    title: 'Containment as the structure',
    what: 'A hierarchy of nested partitions — global, country, region, district, city, parcel — where each level refines the one above it.',
    state: 'PARTIAL',
    here: `The cell scheme is a prefix code, so its own levels nest exactly: a cell at precision n is contained by its prefix at n−1, for n up to ${MAX_PRECISION}. That is a real hierarchy and it is free.`,
    missing: 'The administrative hierarchy, which is the one anyone asks questions in. A geohash cell nests inside a geohash cell; it does not nest inside a district, because no district exists as a corpus object.',
  },
  {
    id: 'BOUNDARY_OPERATORS',
    title: 'Boundary operators',
    what: 'The maps that move a signal between levels: rolling facility values up to a district, pushing a district constraint down to its members.',
    state: 'PARTIAL',
    here: 'Upward within the cell scheme is prefix truncation, and it is exact. Two positions indexed against different evidence already meet at the coarser of their resolutions by exactly this operation.',
    missing: 'Downward. Distributing a regional aggregate over its members requires an allocation rule, and an allocation rule is an assertion — it must be declared, versioned and attributable, not chosen by a renderer.',
  },
  {
    id: 'SIGNALS',
    title: 'Signals on cells, edges and faces',
    what: 'Values carried by the structure rather than by a table: flows on edges, aggregates on faces, observations on nodes.',
    state: 'ABSENT',
    here: 'Records carry values against subjects, not against cells. Nothing is expressed as a signal on the complex.',
    missing: 'A declared mapping from a record to the cell it is a signal on, with the refusal for a record whose position is not keyable, so that an aggregate can report what it could not include.',
  },
];

/* ── The learned half ── */

export const HYPERBOLIC = {
  claim: 'Hierarchy-dominant data is hyperbolic. A containment tree embeds in a Poincaré ball with far lower distortion than Euclidean space permits, because hyperbolic volume grows exponentially with radius and a tree’s node count does too.',
  reading: 'Depth becomes radius and siblings diverge angularly, so a parcel’s radial position encodes its whole administrative lineage and the finest granularity lives near the boundary.',
  whyItFits: 'This corpus’s spatial structure is containment-dominant, so the geometry would be discovered rather than imposed.',
  hazard: 'A hyperbolic embedding read with Euclidean eyes is wrong everywhere. Distance near the boundary is vast and looks small; any surface that draws the ball must say which metric a viewer is looking at, or the picture lies about proximity.',
  state: 'ABSENT' as const,
  here: 'No embedding is computed anywhere in this repository, and no model is trained or served.',
} as const;

/**
 * An embedding is a computation over a release, and the fourth rule of doctrine
 * already says what that makes it. This states the binding a consumer needs,
 * in the vocabulary the repository already has — not a new one.
 */
export const LEARNED_LAYER = {
  isA: 'A compute run: a declared model and version over one exact corpus release, with a retained execution receipt and stated uncertainty. A derived object, never truth by default.',
  binding: 'Every consumer binds to the pair (model version, corpus release), the same two-part binding calibrations and adapters already use. An embedding does not supersede; it goes stale, which is a different failure and needs a different word.',
  neverAuthoritative: 'The manifold is belief about the corpus. It does not testify, it is not a second corpus, and no answer it gives is admissible without the records behind it.',
  state: 'ABSENT' as const,
} as const;

/* ── The three traps this construction invites ── */

export interface ManifoldTrap {
  id: 'CONTINUOUS_FABRICATION' | 'BIAS_AS_GEOGRAPHY' | 'NOT_BITEMPORAL';
  trap: string;
  rule: string;
}

export const MANIFOLD_TRAPS: readonly ManifoldTrap[] = [
  {
    id: 'CONTINUOUS_FABRICATION',
    trap: 'A smooth manifold has a value at every point. Every point on the shell would carry an embedding whether or not any admitted record backs it, which is the interpolation fabrication made continuous — the same failure as a time sample interpolating between declared readings, scaled to a surface.',
    rule: 'Void renders void. A region with no admitted record is drawn as absent, never smoothed over, and every rendered value is attributable to the release that produced it.',
  },
  {
    id: 'BIAS_AS_GEOGRAPHY',
    trap: 'Learned geometry encodes model bias as geography. If an embedding clusters two facilities because its training data co-occurred them, the map is making a claim about the world that no source made.',
    rule: 'Distortion against declared geography is audited and reported as a disagreement, exactly as two sources disagreeing are. Where the embedding and the declared position disagree, the declared position wins and the disagreement is the finding.',
  },
  {
    id: 'NOT_BITEMPORAL',
    trap: 'A neural model is frozen at training time against one release. It has no valid time and no knowledge time, so it cannot be corrected — it can only become stale, silently, while continuing to answer.',
    rule: 'The binding is the pair, and a manifold answer carries the release it was trained against. A retraction against that release does not correct the manifold; it invalidates it, and the manifold is a derived artifact in the correction machinery like any other.',
  },
];

/* ── What it would be for ── */

export const MANIFOLD_USES = [
  { use: 'A learned accelerator for the join engine', what: 'Containment queries and hierarchical rollups expressed as message passing over the complex, with boundary operators doing what hand-written spatial joins do today.', earnsIt: 'It replaces work that exists, rather than adding a capability nobody asked for.' },
  { use: 'A hierarchical blocking structure for identity', what: 'Nearest neighbours in the ball share administrative lineage and context, which is a candidate set for resolution — learned, but attributable to the run that produced it.', earnsIt: 'It is the same role the cell key plays, one level richer: a blocking key that concludes nothing.' },
  { use: 'A coverage-gap detector', what: 'A neighbourhood with nothing in it is a place the corpus is ignorant about, stated as a position on the map rather than as an absence in a table.', earnsIt: 'The absence becomes visible, which is the one thing a smooth surface is genuinely good at once void renders void.' },
  { use: 'Uncertainty as geometry', what: 'High posterior variance sits far from its district’s centroid and source disagreement stretches a region, so confidence and dispute are topological rather than annotated.', earnsIt: 'It is the uncertainty-in-the-visual-channel rule from the scene target, one tier up.' },
] as const;

/* ── The tier, and the order ── */

export const PROJECTION_TIER = {
  chain: 'corpus → learned manifold → render',
  rule: 'Each arrow loses authority and none of them gains it. The corpus admits; the manifold derives; the render shows. A refusal at any tier is carried forward, never resolved by the next one.',
  routing: 'The manifold enters the projection fabric as one row, beside the globe and the scene, under the same spec and the same non-claims.',
} as const;

export const COMPLEX_SEQUENCE: readonly string[] = [
  'The combinatorial structure first, because it is cheap, useful today for joins and aggregation, and needs no neural machinery: cells, containment and the upward boundary operator already exist in the cell scheme.',
  'Areal geometry next, because the administrative hierarchy anyone actually asks questions in cannot exist without boundaries as corpus objects.',
  'Signals on cells after that: a declared mapping from record to cell, with the refusal for a record that cannot be keyed, so an aggregate reports what it excluded.',
  'The learned layer waits on volume. An embedding over one carrier is a curve fit, and the value of a manifold scales with the corpus it embeds.',
  'Hyperbolic embedding waits on the identity layer, because what it would embed is resolved entities and resolution is absent.',
  'Sheaf-theoretic message passing stays research: it is the unit and basis discipline made geometric, and nothing here needs that generality yet.',
];

/* ── What the corpus offers the structure today ── */

export interface ComplexStanding {
  keyedPositions: number;
  /** Distinct cells occupied at each position's own supportable resolution. */
  occupiedCells: number;
  /** The nesting the prefix code already gives, from the coarsest occupied level down. */
  nestingLevels: number;
  learnedLayer: 'ABSENT';
  statement: string;
}

/** Pure: what exists of the complex, and the honest scale of it. */
export function complexStanding(corpus: Corpus): ComplexStanding {
  const keys = positionKeys(corpus).flatMap((k) => (k.outcome.keyed ? [k.outcome.key] : []));
  const cells = new Set(keys.map((k) => k.cell));
  const precisions = keys.map((k) => k.precision);
  const nestingLevels = precisions.length ? Math.max(...precisions) : 0;
  return {
    keyedPositions: keys.length,
    occupiedCells: cells.size,
    nestingLevels,
    learnedLayer: 'ABSENT',
    statement: keys.length === 0
      ? 'No position is keyable, so no cell is occupied and the complex has nothing to stand on.'
      : `${cells.size} cell${cells.size === 1 ? '' : 's'} occupied by ${keys.length} keyed position${keys.length === 1 ? '' : 's'}, nesting ${nestingLevels} levels by prefix. That is a structure and not yet a complex: no signal is carried on it, no administrative cell exists, and a learned layer over this much corpus would be a curve fit.`,
  };
}
