/**
 * The projection fabric's engines and routing table as data, over the
 * implemented contract in src/projection (payload.projection-spec.v1: a
 * closed spec, a source-pinned compiler, read-only endpoints). There is one
 * router, src/projection/spec.ts; this module names the instruments'
 * questions and roles and records the routing table that
 * docs/PROJECTION_FABRIC.md states, and projection.test.ts asserts the table
 * agrees with the router for every combination. Nothing here renders.
 */
import { routeProjection, type ProjectionView } from '@/projection/spec';

export type { ProjectionSpec, ProjectionView } from '@/projection/spec';
export { routeProjection };

export const PROJECTION_MODES = ['EVIDENCE', 'MAP', 'GLOBE', 'STRUCTURE', 'SCENE'] as const satisfies readonly ProjectionView['mode'][];
export const COORDINATE_SEMANTICS = ['NONE', 'GEODETIC', 'GRAPH_LAYOUT', 'INTRINSIC_PHYSICAL', 'FEATURE_SPACE', 'ARBITRARY_MODEL_SPACE', 'HYPERBOLIC'] as const satisfies readonly ProjectionView['coordinateSemantics'][];
export const REPRESENTATIONS = ['RECORDS', 'POINT', 'DENSITY', 'GLOBAL_3D', 'GRAPH', 'MESH', 'FIELD', 'SCENE_GRAPH', 'MANIFOLD'] as const satisfies readonly ProjectionView['representation'][];

export const PROJECTION_ENGINES = ['kepler.gl', 'CesiumJS', 'Three.js', 'OpenUSD', 'records'] as const;
export type ProjectionEngine = (typeof PROJECTION_ENGINES)[number];

export const ENGINE_ROLE: Record<ProjectionEngine, { question: string; role: string; runtime: string }> = {
  'kepler.gl': { question: 'Where is the pattern?', role: 'Analytical cartography over many geospatial observations: density, aggregation, flows, time filters.', runtime: 'Browser, deck.gl / WebGL' },
  CesiumJS: { question: 'Where does this exist, and how does it move through geographic space and time?', role: 'Geodetic realization on a WGS84 globe: terrain, imagery, 3D Tiles, trajectories.', runtime: 'Browser, WebGL' },
  'Three.js': { question: 'How is the system constituted, in whatever space it lives in?', role: 'Structural and computational geometry: meshes, fields, graphs, state spaces, Morpho.', runtime: 'Browser, WebGL / WebGPU' },
  OpenUSD: { question: 'What does this look like as a scene another tool can open?', role: 'Interchange of an admitted release as a scene graph: prims on stable paths, quantities as time samples, declared relationships as USD relationships, one layer per release. A target, never a store — see src/domain/usdProjection.ts.', runtime: 'None here. A writer would run outside the browser; no USD library is installed.' },
  records: { question: 'What are the records?', role: 'Selected safe record payloads, the evidence view and the workbench default.', runtime: 'JSON, HTML' },
};

export interface ProjectionRoute extends ProjectionView {
  engine: ProjectionEngine;
  /** What the fixture compiler returns today for this route when the selection can be placed; geodetic routes still return UNAVAILABLE for a record without a declared position. */
  currentResult: 'READY' | 'UNAVAILABLE';
  note: string;
}

/** The routing table of docs/PROJECTION_FABRIC.md. Every other combination is rejected by the router. */
export const PROJECTION_ROUTING: readonly ProjectionRoute[] = [
  { mode: 'EVIDENCE', coordinateSemantics: 'NONE', representation: 'RECORDS', engine: 'records', currentResult: 'READY', note: 'Selected safe record payloads with status at the knowledge instant.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'GRAPH', engine: 'Three.js', currentResult: 'READY', note: 'Records plus a record-to-subject incidence graph; no layout, no inferred edge.' },
  { mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'POINT', engine: 'kepler.gl', currentResult: 'READY', note: 'Declared positions of the selected records’ subjects (location.position records under the same gate); GEOMETRY_NOT_AVAILABLE when none resolves. No kepler.gl instance renders it.' },
  { mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'DENSITY', engine: 'kepler.gl', currentResult: 'READY', note: 'The same declared positions; density is the engine’s to compute, and no engine is installed.' },
  { mode: 'GLOBE', coordinateSemantics: 'GEODETIC', representation: 'GLOBAL_3D', engine: 'CesiumJS', currentResult: 'READY', note: 'Declared positions of the selected records’ subjects, each with its own evidence class and source; GEOMETRY_NOT_AVAILABLE when none resolves. The Earth Twin at /earth draws them and shows the refusal for records without one.' },
  { mode: 'SCENE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'SCENE_GRAPH', engine: 'OpenUSD', currentResult: 'UNAVAILABLE', note: 'The interchange target: an admitted release composed as one USD layer, prims on stable paths from resolved identity, quantities as time samples. No writer exists and no fixture geometry does, so the compiler answers GEOMETRY_NOT_AVAILABLE. The mapping and its boundaries are data in src/domain/usdProjection.ts.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'HYPERBOLIC', representation: 'MANIFOLD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'The learned tier: a hyperbolic embedding of the containment hierarchy, drawn as a shell. It projects a computation over a release, not the release, so it never testifies and a region with no admitted record renders void. No model is trained and nothing is embedded; the structure and its traps are data in src/domain/earthComplex.ts.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'MESH', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'The seat the pinned IFC engine would fill: a building’s own geometry, in the building’s own frame. The record contract carries POLYGON and EXTENT now, so this route is no longer blocked on the corpus having no geometry at all — it is blocked on the corpus having no surface. A cadastral ring is a flat curve, and a mesh needs an elevation and a face. See STRUCTURE_SOURCE below for what the engine would supply and why it cannot supply it here.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'INTRINSIC_PHYSICAL', representation: 'FIELD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'A quantity over a building’s own volume. Needs the mesh above and a value defined across it; the corpus carries values against subjects, not against places.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'FEATURE_SPACE', representation: 'MESH', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'A surface in a space of derived features rather than in the world. Needs a feature vocabulary the corpus does not carry: the concept mapping between a detector’s output and a corpus predicate is declared ABSENT in src/domain/sensorFamilies.ts.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'FEATURE_SPACE', representation: 'FIELD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'A quantity over that same space. Blocked on the mesh above before anything else.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'ARBITRARY_MODEL_SPACE', representation: 'MESH', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'A surface in a space a model defined for itself. Nothing here trains a model, and a projection of a model’s space would be a projection of a belief rather than of the release.' },
  { mode: 'STRUCTURE', coordinateSemantics: 'ARBITRARY_MODEL_SPACE', representation: 'FIELD', engine: 'Three.js', currentResult: 'UNAVAILABLE', note: 'A quantity over that same space. Blocked on the mesh above before anything else.' },
];

/**
 * WHO WOULD FILL THE STRUCTURE SEAT, AND WHY THEY CANNOT HERE
 *
 * Six of the thirteen routes are STRUCTURE routes waiting on a surface, and
 * this repository already pins an engine that produces one: the BIM State
 * Transformer Engine, at an exact commit with a SHA-256 for each of its 96
 * source files, behind the GAT IFC audit at src/gat/. It reads an IFC file and
 * reports each entity's geometry representation.
 *
 * It is named here rather than routed to, and the distinction is the point.
 * Three things stand between the audit and this seat, and none of them is
 * work anyone has decided to do:
 *
 * The engine cannot run on this platform. The pin fixes Windows x64, Python
 * 3.12.14 and one NumPy wheel by digest, and a run on anything else is
 * ENGINE_UNAVAILABLE before a path is even checked. That is the pin working,
 * not failing.
 *
 * Its output is not a candidate. `readCrossing` in src/gat/crossing.ts already
 * reads an audit receipt against the admission gate and answers
 * `mayBecomeARecord: false`, because RECORD_PROVENANCE has no member for a
 * derivation: a candidate declares LIVE_CAPTURE or BACKFILLED and a computed
 * finding is neither.
 *
 * And a geometry drawn from an audit would be a projection of a computation
 * over a source, not of the release. The manifold route already carries that
 * distinction and renders void where no admitted record stands; this seat
 * would owe the same discipline before it drew anything.
 */
export const STRUCTURE_SOURCE = {
  engine: 'BIM State Transformer Engine',
  pin: 'src/gat/engine-pin.json',
  reachableFrom: 'POST /api/gat/audits, behind PAYLOAD_PRODUCTION_LOCAL=1 and a loopback check',
  wouldSupply: 'Per-entity geometry representation over a preserved IFC artifact, with the beam quantities the adapter derives and the entities it marks NEEDS_GEOMETRY_DERIVATION.',
  blockedBy: [
    'The runtime pin is Windows x64 with Python 3.12.14 and one NumPy wheel by digest; anything else is ENGINE_UNAVAILABLE before a source is read.',
    'An audit finding is not a candidate: RECORD_PROVENANCE has no member for a derivation, and src/gat/crossing.ts answers mayBecomeARecord: false for exactly that reason.',
    'A mesh drawn from an audit would project a computation over a source rather than the release, and would owe the same never-testifies discipline the manifold route carries.',
  ],
  notThis: 'Naming the engine is not routing to it. Nothing in the compiler reaches src/gat, and the six STRUCTURE routes answer UNAVAILABLE exactly as they did before.',
} as const;

/** What every compiled projection states it did not do. */
export const PROJECTION_NONCLAIMS = ['sourceMutated', 'canonicalAdmission', 'relationInferred', 'positionInferred', 'sourceTruthClaimed', 'independentlyVerified', 'rendererExecuted'] as const;

export function routeFor(view: ProjectionView): ProjectionRoute | undefined {
  return PROJECTION_ROUTING.find((r) => r.mode === view.mode && r.coordinateSemantics === view.coordinateSemantics && r.representation === view.representation);
}
