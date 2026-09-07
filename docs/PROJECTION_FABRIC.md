# Projection Fabric

Status update (2026-09-05): references below to six absences or no live connectors describe this document's earlier milestone. One bounded, operator-only FMCSA Company Census connector is now implemented for internal qualification; see [Local source connectors](LOCAL_SOURCE_CONNECTORS.md). It establishes neither recurring ingestion nor customer live feeds. All other authority, storage, identity, execution and verification boundaries below remain unchanged.

The Projection Fabric gives different instruments a common, explicit interpretation of the same information substrate. It changes representation, not referent identity or source authority. Its place in the five-fabric architecture and the seven doctrine invariants is recorded in [Synthesized architecture](SYNTHESIZED_ARCHITECTURE.md).

This increment implements a closed `ProjectionSpec`, a deterministic fixture projection compiler and a read-only JSON preview endpoint. It does not install or instantiate kepler.gl, CesiumJS or Three.js, add a renderer UI, construct geometry or provide a production corpus service.

## Current path

```text
Exact fixture release + legacy commitments + full snapshot digest
→ recompute the complete release-projection source snapshot
→ enforce the complete selection's rights, visibility and time bounds
→ preserve record and subject identities
→ return records / record-subject graph, or explicit missing geometry
```

`GET /api/projections/sources/[releaseId]` returns the exact source descriptor; `POST /api/projections/preview` consumes it with explicit record ids, both times, view and viewer. These use `src/projection/spec.ts`, `source.ts` and `compile.ts`. POST carries a structured selection; it performs no write, dispatch, admission or release activation. Both routes read committed fixture corpora only. Local acquisitions, normalization candidates and unadmitted candidate-build files are not available through them, even when the coordination sandbox is writable.

## Closed request contract

All fields are required, and unknown fields are rejected:

| Field | Current v1 contract |
|---|---|
| `schema` | Literal `payload.projection-spec.v1` |
| `source.kind` | Only `CORPUS_RELEASE`; no canonical-version, inquiry-state or local-file source |
| `source.corpusId`, `source.releaseId` | One explicitly named fixture corpus and release; no latest/current alias |
| `source.releaseDigest`, `source.manifestCommitment` | Exact existing commitments, each 64 lowercase hexadecimal characters without a `sha256:` prefix |
| `source.snapshotDigest` | Required full release-projection snapshot pin, `sha256:` followed by 64 lowercase hexadecimal characters; obtain it from the source descriptor |
| `selection.recordIds` | 1–128 explicit unique record ids, sorted by the parser; no implicit expansion or similarity selection |
| `selection.knownAt` | Timezone-qualified knowledge instant, no later than the selected release cutoff |
| `selection.validAt` | Timezone-qualified world-time instant within every selected record's validity |
| `view` | Exactly `mode`, `coordinateSemantics` and `representation`, with a compatible combination below |
| `viewer` | Only `COUNTERPARTY_SHARED` or `PUBLIC_RULING` |

The parser normalizes both instants to UTC ISO milliseconds. It accepts no storage path, command, transform program, source override or caller-provided authority flags. The `viewer` is a fixture visibility projection, not authenticated identity or a production tenant grant.

### Instrument routing

These engine names describe assigned architectural roles. Routing does not load a renderer or establish that geometry exists.

| Mode | Coordinate semantics | Representation | Instrument | Current result |
|---|---|---|---|---|
| `EVIDENCE` | `NONE` | `RECORDS` | `records` | `READY`: selected safe record payloads |
| `STRUCTURE` | `GRAPH_LAYOUT` | `GRAPH` | `Three.js` | `READY`: selected records plus a record-to-subject graph data structure, without rendered layout |
| `MAP` | `GEODETIC` | `POINT` or `DENSITY` | `kepler.gl` | `READY` with `geometry.positions` when a selected record's subject has a declared position; otherwise `UNAVAILABLE` |
| `GLOBE` | `GEODETIC` | `GLOBAL_3D` | `CesiumJS` | `READY` with `geometry.positions` when a selected record's subject has a declared position; otherwise `UNAVAILABLE`. Drawn by the [Earth Twin](EARTH_TWIN.md) |
| `STRUCTURE` | `INTRINSIC_PHYSICAL`, `FEATURE_SPACE` or `ARBITRARY_MODEL_SPACE` | `MESH` or `FIELD` | `Three.js` | `UNAVAILABLE`: no fixture geometry |
| `SCENE` | `INTRINSIC_PHYSICAL` | `SCENE_GRAPH` | `OpenUSD` | `UNAVAILABLE`: no writer, no library, no fixture geometry. The interchange target — see below |
| `STRUCTURE` | `HYPERBOLIC` | `MANIFOLD` | `Three.js` | `UNAVAILABLE`: nothing is embedded. The learned tier — see below |

All other combinations are rejected. In particular, the current graph mode is expressed as `STRUCTURE / GRAPH_LAYOUT / GRAPH`, not as a separately implemented GRAPH screen.

kepler.gl is assigned analytical geospatial patterns, CesiumJS geographic-world realization, Three.js intrinsic or computational structure, and OpenUSD scene interchange. None is a separate information system. `GEODETIC` is not interchangeable with graph layout, feature-space coordinates or arbitrary model space. Missing coordinates stay absent; the compiler invents no latitude/longitude, mesh, field or spatial transform.

## OpenUSD: a target, never a store

USD's composition model is this architecture's photographic negative. Layers
carry opinions, composition resolves them to a single value, the strongest
opinion wins and the renderer receives one coherent world. The corpus refuses
exactly that: disagreement is preserved, a belief can be multi-valued, and
supersession is a recorded event. **A corpus stored as USD would collapse the
disagreement layer without saying so** — the screen implying what the corpus does
not assert.

As an output it is a strong choice, because the layer stack embodies the release
ABI.

| Corpus | USD | State here |
|---|---|---|
| Entity, identity-resolved | Prim on a stable path | Partial — a path per subject is mintable; a path per *resolved entity* needs resolution, which is absent |
| Measured quantity over a validity interval | Time-sampled attribute | Available — the interpolation mode is part of the mapping, not a renderer preference |
| Declared relationship | USD relationship | Partial — one evidence-bearing predicate exists |
| Corpus release | Layer in the sublayer stack | Available — release order is the only thing that may set layer strength |
| As-of query | Sublayer stack truncated at that release | Available — and it answers **knowledge time only** |
| Admitted state only | Only admitted opinions compose | **Blocked** — no admission authority, so a stage today would be empty by its own rule |
| Uncertainty, provenance, rights, visibility | Custom metadata | **Blocked** — USD has no native concept, and metadata is droppable |

Two clocks, two mechanisms, and they must not be conflated: truncating the
sublayer stack reproduces knowledge time; valid time lives in the time samples
inside a layer. A scene that used layer order for both would answer the wrong
question convincingly. A valid instant outside every sample's interval is a
refusal, not the nearest sample.

**Uncertainty has to reach the eye.** A crisp scene asserts, visually, that the
geometry is known, while the corpus may hold an estimate with metres of stated
uncertainty. The rule is that no prim is emitted without its uncertainty
encoding, and a stage that cannot carry the encoding refuses the prim rather
than emitting a confident one. Putting the uncertainty in a metadata field only
does not count: metadata does not reach the eye, and the eye is what a scene is
for. No encoding is decided yet.

OpenUSD enters as one row in the routing table with a defined role — not a new
architecture, not a second corpus, and not a new vocabulary for corpus concepts.
The Earth Twin and a USD stage are two projections of one spec, not one thing to
be merged. The mapping, the conventions and the blockers are data in
`src/domain/usdProjection.ts`, held by `src/domain/usdProjection.test.ts`.

## The Earth as a complex, and the tier below the corpus

The chain is **corpus → learned manifold → render**. Each arrow loses authority
and none of them gains it: the corpus admits, the manifold derives, the render
shows, and a refusal at any tier is carried forward rather than resolved by the
next one.

The combinatorial half is cheap and partly built. Nested partitions as cells,
containment as the structure, boundary operators moving a signal between levels
— and a geohash is already a nested partition whose prefix truncation *is* the
upward boundary operator. What is missing is the administrative hierarchy anyone
actually asks questions in, which needs boundaries as corpus objects, and any
signal carried on the cells at all.

The learned half is a projection. Hierarchy-dominant data is genuinely
hyperbolic — a containment tree embeds in a Poincaré ball with far lower
distortion than Euclidean space permits, depth becoming radius and siblings
diverging angularly — so the instinct is sound. But an embedding is a compute run
over one release, and by the fourth rule of doctrine a computation produces
derived objects, not truth. It does not testify.

Three traps, each with the rule that defuses it:

- **Continuous fabrication.** A smooth manifold has a value at every point,
  whether or not any admitted record backs it. *Void renders void*, and every
  rendered value is attributable to the release that produced it.
- **Bias as geography.** Learned geometry can encode model bias as a claim about
  the world. Distortion against declared geography is audited and reported as a
  disagreement; where they disagree, the declared position wins.
- **Not bitemporal.** A model frozen at training time cannot be corrected, only
  go stale while continuing to answer. The binding is the pair (model version,
  corpus release), and a retraction against that release invalidates the
  manifold rather than correcting it.

A learned layer over one carrier is a curve fit. The value of a manifold scales
with the corpus it embeds, so the combinatorial structure comes first and the
embedding waits on volume and on the identity layer. `src/domain/earthComplex.ts`
carries this as data.

## Exercise the preview

Start the ordinary application with `npm run dev`; writable coordination mode is not required. First obtain a source descriptor for one explicit release. Its schema is `payload.projection-source.v1`; it returns `fixture_only: true`, the complete request-ready `source`, `domain`, `buildId`, `knownAt` and `snapshotCodec: "payload.fixture-projection-source.v1"`. It returns no record rows, private fields or storage references. An unavailable source returns 404; failed source recomputation returns 503.

In a Node interpreter at the repository root, read that descriptor and reuse `descriptor.source` rather than hardcoding or reconstructing hashes:

```javascript
const base = 'http://127.0.0.1:3000';
const descriptor = await fetch(`${base}/api/projections/sources/REL-CAR-2026.09.01`).then(r => r.json());
const spec = {
  schema: 'payload.projection-spec.v1',
  source: descriptor.source,
  selection: {
    recordIds: ['REC-0101'],
    knownAt: descriptor.knownAt,
    validAt: '2026-08-03T10:00:00Z',
  },
  view: { mode: 'EVIDENCE', coordinateSemantics: 'NONE', representation: 'RECORDS' },
  viewer: 'COUNTERPARTY_SHARED',
};
const response = await fetch(`${base}/api/projections/preview`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(spec),
});
const projection = await response.json();
console.log(response.status, projection);
```

This selects an existing synthetic record, not a local Carrier candidate. To request its structural incidence graph, replace `view` with `{ mode: 'STRUCTURE', coordinateSemantics: 'GRAPH_LAYOUT', representation: 'GRAPH' }` and send another preview. Reusing the same source and selection preserves record and subject identities. A map request using `{ mode: 'MAP', coordinateSemantics: 'GEODETIC', representation: 'POINT' }` instead returns `READY` with `geometry.positions` only where the record's own subject declares an admissible `location.position` record ([Declared geometry](#declared-geometry)), and `UNAVAILABLE` with `GEOMETRY_NOT_AVAILABLE` otherwise, rather than fabricating a position.

## Rights, time and identity

Every selected record must exist unambiguously, be knowable by the requested knowledge instant and release cutoff, have source permission for `customer_delivery`, and be visible at the requested viewer. `COUNTERPARTY_SHARED` permits that class and `PUBLIC_RULING`; `PUBLIC_RULING` permits only its own class. Internal/private classes are never selectable through this endpoint.

World-time bounds are inclusive at `validFrom` and exclusive at `validTo`; an absent end is open-ended. A knowledge instant after the release cutoff is rejected, not silently clamped. If any requested member is unavailable, the whole selection fails with the same `SELECTION_NOT_AVAILABLE` response for absent, hidden, ambiguous, too-new or out-of-validity records. No partial subset or withheld identities are returned.

An invalid source snapshot, including duplicate committed record ids, fails earlier as `SOURCE_INTEGRITY_FAILED`; it is not treated as an available source with a partial selection.

Available records preserve value, unit, basis, uncertainty, evidence class, provenance, rights and both time roles. `statusAtKnownAt` reconstructs CURRENT, SUPERSEDED or RETRACTED status at the selected knowledge time. This is explicit record inspection, not automatic selection of a current replacement: a historically superseded or retracted record may still be returned with its status. Correction-pointer fields `supersedesRecordId`, `supersededByRecordId` and `retractedByRetractionId` are omitted so they cannot disclose later or withheld identities.

Graph nodes retain the records' canonical ids and subjects' canonical ids, with original record/subject identifiers alongside them. The only generated edge kind is `RECORD_ABOUT_SUBJECT`, from the record to the subject it already names. This is an incidence graph, not an inferred supply, causal, spatial or semantic network. It does not turn a record's text/value into an additional relation. Conflicting canonical referents fail integrity checks rather than being silently merged.

## Response, provenance and limitations

A successful HTTP response has schema `payload.projection.v1`, `fixture_only: true`, the normalized `spec`, selected `engine` and `authority: "REPLACEABLE_PROJECTION"`. It includes safe `records`, `graph` only when GRAPH is requested, and either `status: "READY"` with `error: null` or `status: "UNAVAILABLE"` with `error: "GEOMETRY_NOT_AVAILABLE"`.

## Declared geometry

A position is a record like any other. A `location.position` record declares, for its subject and over its validity interval, a WGS84 point (`geometry: { kind: 'POINT', datum: 'WGS84', longitude, latitude, horizontalUncertaintyM? }`) with its own evidence class, provenance, rights, visibility and both clocks; the release digest commits to it. For a geodetic view the compiler resolves, for each selected record, every `location.position` record of the same subject that passes the same gate as the record itself (committed in the release, deliverable, visible to the viewer, knowable at `knownAt`, valid at `validAt`) and returns them as `geometry.positions`, each carrying `positionRecordId`, `canonicalId`, the point, the stated value and basis, validity, `knownAt`, `evidenceClass`, `source` and `statusAtKnownAt`. Two sources that disagree are both returned. A selected record whose subject declares nothing admissible is listed in `geometry.unplaced`; a position the viewer may not see is simply absent, never disclosed. `status` is `READY` when at least one position resolved and `UNAVAILABLE` with `GEOMETRY_NOT_AVAILABLE` otherwise. Nothing is inferred: a sample is not placed at its lot, and no position is interpolated, geocoded or estimated; the `positionInferred: false` non-claim records that. The demonstration corpus declares two positions, both synthetic declarations at real port coordinates that assert nothing about any real cargo: lot 5B-221 at its loading terminal from the port custody record (disinterested), and lot 7C-104 at the claimant's origination yard from the yard log (self-reported).

`UNAVAILABLE` geometry responses still contain the permitted selected records and source bindings; they do not contain usable geometry. `READY` means the record, graph or position data structure was compiled, not that a renderer ran.

Provenance includes compiler id `payload.fixture-projection`, version `1.0.0`, a representation-specific `transformIdentity`, `specDigest` and `sourceSelectionDigest`. The last binds the complete safe returned record payloads, including historical status. The result `digest` covers the entire projection, including view, engine, status, graph and nonclaims. These new projection digests use the `sha256:` prefix, unlike the existing release commitments supplied in the request.

The compiler recomputes the legacy release digest and release manifest commitment without altering their schemas or committed values. The legacy release digest covers its existing canonical record-field subset, not every output-relevant field. The required `snapshotDigest` separately closes that version-binding gap: codec `payload.fixture-projection-source.v1` binds complete committed member records, full release metadata and governance, relevant known retraction bodies and status at the release cutoff. It includes stored correction pointers in the hash input but never delivers those pointers as record rows; future record/retraction bodies are excluded.

A changed snapshot fails `SOURCE_VERSION_MISMATCH` even when the legacy commitments still match. `sourceSelectionDigest` then binds the safe selected payloads and historical status within that pinned source, while the outer digest binds the whole resulting projection except its own digest field. This full snapshot pin is a local fixture-version check, not an immutable VersionStore, authenticated origin or independently signed proof. None of these digests establishes empirical source truth or source rights beyond the fixture's declarations.

The response's nested `nonclaims` are:

```json
{
  "sourceMutated": false,
  "canonicalAdmission": false,
  "relationInferred": false,
  "sourceTruthClaimed": false,
  "independentlyVerified": false,
  "rendererExecuted": false
}
```

The compiler returns detached data rather than references to mutable fixture objects. Camera position, view filters and renderer selections do not write back into corpus records or canonical state.

### HTTP outcomes

The route requires `Content-Type: application/json`, bounds the actual body stream at 32 KiB and decodes UTF-8 strictly. Responses use `Cache-Control: no-store` and `X-Payload-Fixture-Only: true`. Refusals contain only `fixture_only: true` and the error code, without exception text.

| HTTP status | Outcome |
|---|---|
| `200` | A compiled projection, including explicit `UNAVAILABLE` geometry |
| `400` | `INVALID_JSON`, `INVALID_PROJECTION_SPEC` or `KNOWLEDGE_AFTER_RELEASE` |
| `404` | `SOURCE_NOT_AVAILABLE` or `SELECTION_NOT_AVAILABLE` |
| `409` | `SOURCE_VERSION_MISMATCH` |
| `413` | `BODY_TOO_LARGE` |
| `415` | `INVALID_CONTENT_TYPE` |
| `503` | `SOURCE_INTEGRITY_FAILED` or `PROJECTION_UNAVAILABLE` |

## Bench grounding and remaining work

The sibling `Notations Kernel`'s `src/control-plane-visualizer.js` requires a verified universe envelope before constructing its visual model (`toControlPlaneVisualModel`). Its model explicitly declares `REPLACEABLE_VISUAL_PROJECTION`, `LOGICAL_NON_GEOGRAPHIC` and `geographicTruthClaimed: false`. That supplies a concrete precedent for replaceable projections and refusing invented geography. This fixture compiler does not import the Bench universe closure or emit its verification envelope; it recomputes existing fixture commitments, pins the full projection-source snapshot and binds its safe selection.

The supplied synthesis's broader `ProjectionSpec` may eventually select canonical versions or `InquiryState`, carry richer typed geometry and feed Morpho or spatial adapters. Those are not implemented source kinds or transformation runtimes here. kepler.gl, CesiumJS and Three.js dependencies, renderer instances and workbench modes are not built in this increment. The six stated absences remain: live source connectors, production storage and identity, deployed customer delivery, managed execution of customer workloads, independent verification, and a completed pilot.
