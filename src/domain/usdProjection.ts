/**
 * OpenUSD as a projection target, and deliberately not as a store.
 *
 * The asymmetry is the whole point. USD's composition model is this
 * architecture's photographic negative: layers carry opinions, composition
 * resolves them to a single value, the strongest opinion wins and the renderer
 * receives one coherent world. The corpus refuses exactly that. Disagreement is
 * preserved, a belief can be multi-valued, and supersession is a recorded event
 * rather than a silent overwrite. Storing the corpus as USD would collapse the
 * disagreement layer without saying so, which is the named failure mode: the
 * screen implying what the corpus does not assert.
 *
 * As an output it is a strong choice, because the layer stack accidentally
 * embodies the release ABI. One layer per release, sublayers in release order,
 * and an as-of answer becomes a deterministic composition over a truncated
 * stack whose composed result can be digested like any other receipt. The
 * rhyme is real and the difference matters: USD resolves forward to one truth,
 * the corpus resolves backward to dated beliefs.
 *
 * Two clocks, two mechanisms, and they must not be conflated. Truncating the
 * sublayer stack reproduces knowledge time. Valid time is carried by time
 * samples inside a layer. A scene that used layer order for both would answer
 * the wrong question and look right doing it.
 *
 * Nothing here writes a stage. No USD library is installed, no writer exists,
 * and the routing table records the route as UNAVAILABLE. This module is the
 * spec: the mapping, the conventions, the encodings that must be decided
 * before a byte is written, and what the target must never become.
 */
import { IDENTITY_LINK_PREDICATE, LOCATION_POSITION_PREDICATE, currentRelease, releaseRecords } from './corpus';
import type { Corpus } from './corpus';

/* ── Target, not store ── */

export const USD_ROLE = {
  asTarget: 'ACCEPTED' as const,
  asStore: 'REJECTED' as const,
  whyTarget: 'The layer stack embodies the release ABI: one layer per release, an as-of answer as a truncated composition, and a composed result that digests like any other receipt. It is also where the eventual surfaces already interchange — digital twins, robotics simulation, industrial visualization — and the IFC material this repository already audits has conversion routes into it.',
  whyNotStore: 'USD composition resolves opinions to one value, strongest opinion wins. The corpus preserves disagreement, keeps beliefs multi-valued and records supersession as an event. A corpus stored as USD would lose the disagreement layer silently, and the screen would begin implying what the corpus does not assert.',
  theRhyme: 'USD opinions resolving by layer strength and admission priority resolving by authority share a grammar and invert an intent: USD resolves forward to one present truth, the corpus resolves backward to dated beliefs.',
} as const;

/* ── The mapping ── */

/** Whether the corpus side of a mapping row exists here today. */
export type MappingState = 'AVAILABLE' | 'PARTIAL' | 'BLOCKED';

export const MAPPING_STATE_LABEL: Record<MappingState, string> = {
  AVAILABLE: 'The corpus already carries what this row needs',
  PARTIAL: 'Partly carried, with the missing half named',
  BLOCKED: 'The corpus does not carry it, and something else must exist first',
};

export interface UsdMappingRow {
  corpus: string;
  usd: string;
  state: MappingState;
  /** What is true here, checkable against the code. */
  here: string;
  /** The mistake this row invites. */
  hazard: string;
}

export const USD_MAPPING: readonly UsdMappingRow[] = [
  {
    corpus: 'Entity, identity-resolved',
    usd: 'Prim on a stable path',
    state: 'PARTIAL',
    here: 'Every record carries a stable notation:// canonical identity for its subject, so a prim path per subject is mintable today. A path per resolved entity is not: resolution is absent, so two identifiers naming one thing would become two prims.',
    hazard: 'A prim path is a promise of stability. Minting one per subject and later resolving two subjects into one is a path change, which downstream references break on — so the path must come from the resolution decision, not from whichever identifier arrived first.',
  },
  {
    corpus: 'Measured quantity over a validity interval',
    usd: 'Time-sampled attribute',
    state: 'AVAILABLE',
    here: 'Records carry a value, a unit, a basis and explicit validity bounds, which is exactly a time sample with an interval. The unit is carried; USD would need it as metadata beside the sample.',
    hazard: 'Time samples interpolate between them by default. A corpus value holds over an interval and is undefined outside it, so an interpolating scene invents readings the corpus never asserted. The interpolation mode is part of the mapping, not a renderer preference.',
  },
  {
    corpus: 'Declared relationship between subjects',
    usd: 'USD relationship',
    state: 'PARTIAL',
    here: `One evidence-bearing predicate exists, ${IDENTITY_LINK_PREDICATE}, authored as a record like any other. A richer link vocabulary does not.`,
    hazard: 'USD relationships are cheap to author and carry no evidence. Only an edge some record asserts may become one; a relationship added for scene convenience is an invented edge wearing the corpus’s clothes.',
  },
  {
    corpus: 'Corpus release',
    usd: 'Layer in the sublayer stack',
    state: 'AVAILABLE',
    here: 'Releases are ordered, digested and carry a knowledge cutoff and a build record, which is what a layer identity needs.',
    hazard: 'Layer strength is not release authority. USD gives the strongest opinion to the layer nearest the top; that must be the newest release and nothing else, or composition silently re-ranks the corpus.',
  },
  {
    corpus: 'As-of query at a knowledge instant',
    usd: 'Sublayer stack truncated at that release',
    state: 'AVAILABLE',
    here: 'The as-of query already clamps knowledge time to the release cutoff, so the truncation point is exactly the release the query names.',
    hazard: 'Truncation answers knowledge time only. Valid time lives in the time samples inside a layer, and a scene that used layer order for both would answer the wrong question convincingly.',
  },
  {
    corpus: 'Admitted state only',
    usd: 'Only admitted opinions compose; candidates never enter the stack',
    state: 'BLOCKED',
    here: 'No admission authority exists, so nothing in this repository is admitted. A stage built under this rule today would be empty, which is the honest outcome and not a reason to relax the rule.',
    hazard: 'A candidate composed into a layer is indistinguishable, once composed, from an admitted fact. The stack is the wrong place to discover that a record was never admitted.',
  },
  {
    corpus: 'Uncertainty, provenance, rights and visibility',
    usd: 'Custom metadata on the prim and the attribute',
    state: 'BLOCKED',
    here: 'USD has no native concept for any of them. Nothing here encodes them into a scene, and no encoding has been decided.',
    hazard: 'Metadata is droppable. A pipeline that flattens or re-authors a stage can lose custom fields while keeping the geometry, leaving a confident scene with no provenance — so the encoding must be decided as a contract, and a stage that cannot carry it must refuse the prim rather than emit a bare one.',
  },
];

/* ── Layer and as-of conventions ── */

export const LAYER_CONVENTION = {
  oneLayerPerRelease: 'A release composes to exactly one layer. A layer is never edited after the release it carries is published, because a release is immutable and a layer that changed would make the composed digest meaningless.',
  order: 'Sublayers are ordered by release order, newest strongest. Release order is the only thing that may set layer strength.',
  identity: 'The layer identifier carries the corpus id and the release id, and the stage carries the release digest and manifest commitment as metadata, so a composed scene names the exact release it came from.',
  correction: 'A retraction is a new release and therefore a new layer, never an edit to an existing one. A scene that was composed before the retraction stays composable and stays wrong, which is what makes it auditable; the delivery ledger is what tells its holder.',
} as const;

export const AS_OF_COMPOSITION = {
  knowledgeTime: 'Truncate the sublayer stack after the layer for the release whose knowledge cutoff answers the query. Nothing later composes.',
  validTime: 'Read the time samples at the asked-for valid instant, inside the layers that remain. Valid time is never expressed by layer order.',
  receipt: 'The composed result is digested and the digest is the receipt: the release, the truncation point, the valid instant and the digest together reproduce the scene exactly.',
  refusal: 'A valid instant outside every sample’s interval is a refusal, not the nearest sample. The corpus says nothing there and the scene must say nothing too.',
} as const;

/* ── Uncertainty in the visual channel ── */

/**
 * The caution that matters most. A crisp scene asserts, visually, that the
 * geometry is known. The corpus may hold an estimate with metres of stated
 * uncertainty, so the projection contract has to carry uncertainty into the
 * visual channel deliberately or the render becomes a lying layer of exactly
 * the kind the doctrine exists to prevent.
 */
export const UNCERTAINTY_ENCODING = {
  rule: 'No prim is emitted without its uncertainty encoding. A stage that cannot carry the encoding refuses the prim rather than emitting a confident one.',
  candidates: [
    'Stated positional uncertainty as geometry: an explicit extent around the prim, authored as a sibling prim so that flattening cannot silently drop it.',
    'Confidence as material, never as opacity alone, because opacity is the first thing a downstream pipeline re-authors.',
    'A declaration with no stated uncertainty carries a marker prim, so that the absence of a claim is visible rather than rendered as precision.',
  ],
  notThis: 'Drawing the estimate and putting the uncertainty in a metadata field only. Metadata does not reach the eye, and the eye is what a scene is for.',
  decided: false,
} as const;

/* ── The boundary ── */

export const USD_BOUNDARY = {
  oneRow: 'OpenUSD enters as one row in the routing table with a defined role, not as a new architecture and not as a second corpus.',
  notAVocabulary: 'It introduces no new names for corpus concepts. The mapping above is the translation, and USD’s names stay on USD’s side of it.',
  notARenderer: 'A stage is interchange. Nothing here executes a renderer, and the compiled projection still states rendererExecuted: false.',
  separateFromTheGlobe: 'The Earth Twin and a USD stage are two projections of one spec, not one thing to be merged: CesiumJS is web-native and geodetic, USD is scene interchange in the stage’s own physical units.',
} as const;

/* ── What the corpus could offer a writer today ── */

export interface UsdReadiness {
  /** Subjects that would become prims, on today's per-subject identity. */
  prims: number;
  /** Records with validity bounds that would become time samples. */
  timeSamples: number;
  /** Authored, evidence-bearing edges that would become USD relationships. */
  relationships: number;
  /** Releases that would become layers. */
  layers: number;
  /** Declared positions, and how many state the uncertainty a scene would have to encode. */
  positions: { total: number; withStatedUncertainty: number };
  /** Everything that must exist before a stage may be written. */
  blockers: readonly string[];
  statement: string;
}

/** Pure: what a writer would find, and what would stop it. Nothing is written. */
export function usdReadiness(corpus: Corpus): UsdReadiness {
  const release = currentRelease(corpus);
  const records = releaseRecords(corpus, release);
  const positions = records.filter((r) => r.predicate === LOCATION_POSITION_PREDICATE && r.geometry);
  const blockers = [
    'No admission authority: nothing is admitted, and only admitted opinions may compose. A stage written today would be empty by its own rule.',
    'No resolution decision object: prim paths would be minted per subject, and a later resolution would change a path that downstream references depend on.',
    'No encoding decided for uncertainty, provenance, rights or visibility, which USD has no native concept for.',
    'No writer, and no USD library installed. The routing table records the route as UNAVAILABLE and the compiler answers GEOMETRY_NOT_AVAILABLE.',
    'No areal or mesh geometry: the record contract admits POINT, so a stage would carry markers and no shapes.',
  ];
  return {
    prims: new Set(records.map((r) => r.subjectCanonicalId)).size,
    timeSamples: records.filter((r) => Boolean(r.validFrom)).length,
    relationships: records.filter((r) => r.predicate === IDENTITY_LINK_PREDICATE).length,
    layers: corpus.releases.length,
    positions: { total: positions.length, withStatedUncertainty: positions.filter((r) => typeof r.geometry?.horizontalUncertaintyM === 'number').length },
    blockers,
    statement: `The corpus could offer a writer ${new Set(records.map((r) => r.subjectCanonicalId)).size} prims over ${corpus.releases.length} layers, and it will not: ${blockers.length} things must exist first, beginning with an admission authority, because only admitted opinions may compose.`,
  };
}
