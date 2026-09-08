# Space as a working dimension

Everything spatial in this repository was, until this increment, a surface. The
Earth Twin draws declared positions. The projection compiler resolves them under
rights, visibility and both clocks. Spatial Inquiry draws a floor plan and its
access graph. All three show space; none of them derived anything from it.

That is the gap. Space is not a display attribute — it is the one dimension that
runs through every product line, and it can do four jobs the corpus currently
asks other machinery to do badly or not at all.

`src/domain/spatialKey.ts` builds the first of them. `src/domain/spatialDerivation.ts`
states the rest as data. `/earth` shows the derivation beneath the globe it
derives from; `/model` carries the programme.

## The five jobs, and which one is built

| Job | What space would do | State |
|---|---|---|
| Display | Draw what is known at a place | **Built** — and on its own it derives nothing. The windshield, not the engine. |
| Resolver | Decide from measured geometry whether two records are about one thing | **Partly built** — geometry refutes; it cannot yet confirm |
| Join key | Let two records with no shared identifier meet at a stated resolution | **Partly built** — the key exists; there is no second line to join to |
| Validity clock | Answer where a boundary ran as of a stated moment | **Partly built** — points are bitemporal; no boundary exists |
| Inference engine | Derive candidate facts from imagery over a place | **Absent** — the shape is declared, nothing implements it |
| Tasking | Choose which observation to buy over which place | **Partly built** — instruments are priced; no site to point them at |

## The two disciplines that make the key honest

**A cell may never be finer than the evidence.** A position a source states to
±500 m, indexed into a 38 m cell, asserts a precision the source never claimed —
the cell would be a fabricated fact wearing a key's clothes. The resolution is
therefore chosen from the stated horizontal uncertainty. A position with no
stated uncertainty gets **no key at all**: a refusal, not a default.

**The cell is a blocking key; it is not the answer.** Sharing a cell makes two
records worth comparing and establishes nothing else. The comparison is metric:
the geodesic on the WGS84 ellipsoid, by Vincenty's inverse solution — which
refuses rather than returning the last iterate where it does not converge —
tested against the radii the sources stated. One metric and one three-valued
vocabulary serve two different questions: the Earth Twin asks whether one
subject's own standing declarations can all be right at once, and this asks
whether the evidence can tell two *different* subjects apart.

That verdict refutes far more often than it confirms, and that is the useful
direction. Geometry shows that two things are *not* in the same place far more
cheaply than it shows that they are.

| Answer | Meaning |
|---|---|
| `DISJOINT` | The stated radii cannot contain one common point: not the same place |
| `OVERLAPPING` | They can: this evidence cannot separate them — a **candidate** for a resolution decision, never a merge |
| `NOT_ASSESSABLE` | A stated uncertainty is missing, or the geodesic does not converge there. No radius is assumed and nothing is concluded |

## What the demonstration corpus actually yields

Two subjects declare a position: a loading terminal at Rotterdam stated to
±250 m, and an origination yard at Santos stated to ±500 m. Both are keyable, both
at geohash precision 6 — the finest resolution their own uncertainty supports —
giving `u14ze9` and `6gxpdp`, cells roughly 754 × 611 m and 1 118 × 611 m at
their respective latitudes. They do not block together. Their geodesic
separation is 9 754 km against 750 m of combined stated uncertainty, so the
answer is `DISJOINT`.

Nothing is co-located, so nothing is even a candidate. That is the honest
result, and it is the one the surface reports.

## The scheme, and why it is a stand-in

Geohash: the base-32 prefix code over WGS84. Chosen because a join key is only a
join key if another party computes the same key from the same coordinates, and
only useful if a fine key truncates to a coarse one — so two positions indexed
against different evidence still meet at the coarser resolution. It is a
published encoding with no library to adopt.

Its cost is stated rather than hidden: geohash cells are rectangles in degrees,
so ground width shrinks with the cosine of latitude. Every extent is therefore
computed at the position's own latitude and never quoted as a constant. S2 or H3,
whose cells are near-equal-area and whose neighbour operations are defined, is
the successor; adopting one is a library decision, and this is the stand-in until
then.

## The five derivations, ranked

1. **Flow through geometry.** A movement resolved to a facility, the facility to
   the parcel it sits on, the parcel's own events attached — one sentence across
   three lines, every step a spatial predicate. The flow vendors stop at "the
   vessel visited the port"; the parcel vendors stop at "the parcel exists".
   *Hazard:* a chain of predicates each true at its own tolerance is not true at
   the tolerance of the tightest one.
2. **Change over a place, as a candidate observation.** Construction stage,
   stockpile volume, yard utilization, derived from imagery and entering as
   candidates with their scene and model. The doctrine already handles it: a
   detector is an extraction adapter. *Hazard:* a detection is an assertion by a
   model, and a model is an interested party.
3. **One receipted spatial aggregate, reused by all three lines.** Every product
   question is a spatial aggregate wearing a domain's clothes. *Hazard:* an
   aggregate that hides its refusals reads as coverage the corpus does not have.
4. **Versioned boundaries.** What the flood zone or the zoning line said on the
   date a decision relied on it. Everything else here is already bitemporal;
   geometry is the one class the industry overwrites. *Hazard:* a revised
   boundary is a correction, so it must reach the retraction ledger.
5. **Movement signatures.** Patterns over repeated positions. Ranked last because
   it is the most inferential. *Hazard:* a behavioural inference about an
   identified party is where a record stops being a record.

## What is deliberately not built

- **The containment predicate.** `CorpusRecord.geometry` admits `POINT`,
  `POLYGON` and `EXTENT` now, so a boundary is a record like any other, with its
  datum, its own stated positional uncertainty and both clocks. What is absent
  is the predicate: nothing computes containment, adjacency or overlap, so a
  parcel and a lot inside it block into one cell and the corpus still cannot
  say that one contains the other. Carrying the shape is what makes the
  characteristic GIS error reachable — exact arithmetic over an inexact line —
  which is why the predicate was not added in the same step as the geometry. It
  needs a rule for what containment means when the container's own vertices
  carry an uncertainty: a lot 20 m inside a boundary surveyed to ±30 m is not
  inside it in any sense the evidence supports.
- **A resolution decision object.** An `OVERLAPPING` pair stops at
  candidate. Carrying two identifiers to one subject with evidence, method,
  version and both clocks is the identity core's job, not a spatial one.
- **A route.** The geodesic is the shortest path over the ellipsoid surface. It
  is not a route, not a travelled distance and not a distance through anything.
  A stated radius carries no distribution either, so no probability is computed
  and none is implied.
- **A spatial database.** PostGIS, S2, H3 and STAC are the purchased layer. What
  belongs to the firm is the resolution bound, the refusal where the evidence is
  silent, and the recorded judgment where two boundaries disagree.

## The order

1. The cell key, because every other derivation presupposes it and it needs no
   new source. **Done.**
2. Areal geometry on the record contract. **Done.** `POLYGON` and `EXTENT` sit
   beside `POINT`, keyed by the same rule with one term added: a shape's cell is
   bounded by its stated uncertainty plus its own reach, because reducing an
   extended feature to one cell means the cell has to contain it. A boundary
   with no stated accuracy is refused a key exactly as a point with none is.
3. The containment predicate, with its rule for an uncertain container. This is
   now the only thing between the corpus and the strong join.
4. The resolution decision object, so a candidate can become one subject with
   evidence behind it and be undone without rewriting history.
5. The flow-through-geometry demonstration over one place and one week, end to
   end with digests.
5. Imagery last of the sources, because its rights are the strictest and its
   value depends on everything above being in place.

## Where it lives

| Part | Path |
|---|---|
| Cell key, extent, the geodesic and the answer | `src/domain/spatialKey.ts`, `src/domain/spatialKey.test.ts` |
| The twin's reading of one subject's own declarations, over the same metric | `positionSeparations` in `src/domain/earth.ts` |
| Roles, derivations, capabilities, discipline | `src/domain/spatialDerivation.ts`, `src/domain/spatialDerivation.test.ts` |
| The derivation beneath the globe | `src/components/earth/SpatialKeys.tsx`, at `/earth` |
| The programme | `/model`, section "Space: the display was the easy half" |
| The join key it supplies | `SPATIAL_CELL` in `src/domain/identity.ts` |

## Three sensor families, two convergences

The families that would fill the derivations above are satellite, LiDAR and
meteorology, and only one of the two convergences between them is work.

**The sensor convergence is already free.** Satellite and LiDAR are two
observation models over one state: imagery constrains plan position and extent,
LiDAR constrains elevation and structure. Complementary observability is what a
filter is for, and the estimator grammar fuses them without modification. What
blocks it is not the fusion — it is that no estimator runs over corpus records.

**The semantic convergence is the actual gap.** Imagery segmentation emits
spectral classes and detector labels; point-cloud classification emits ground,
building, vegetation, wire; and neither emits the corpus's own concepts. Fusing
at the pixel and the point yields "there is a thing here", not "this unit grew".
The missing piece is a shared feature-to-concept mapping, in four stages that are
each an instance of a discipline this repository already has:

1. **Feature** — detector outputs per source and per model version, as candidate
   observations with noise models. A vision model is an extraction adapter.
2. **Concept mapping** — source vocabularies onto corpus concepts, as versioned
   mappings with receipts. This is where the judgment, and therefore the estate,
   lives.
3. **Reconciliation** — where two families disagree, the disagreement is encoded,
   not averaged. Cross-family disagreement is unusually informative because the
   error physics are genuinely independent.
4. **Admission** — fused, concept-typed, uncertainty-carrying candidates cross the
   boundary, or they do not become facts.

Two families with independent error physics agreeing is worth more than five
syndicated sources agreeing — which is the independence weighting the invariant
scoring already requires, over the one population where independence is physical
rather than contractual.

### Meteorology is not a third sensor

Satellite and LiDAR constrain the state; **meteorology drives it and gates the
observations**. Structure, motion, and cause.

| Quantity | Acts on | Slot in the machinery |
|---|---|---|
| Precipitation, snowpack | Stockpiles, river stages, flood exposure, access | Process-model input, and a constraint family |
| Wind | Vessel speed, crane operations, flyability, generation | State-space coupling, and a term in a position's noise model |
| Cloud, fog | Whether an optical sensor can observe at all | **Observation-model gating**: the optical rows of `H` switch off |
| Temperature extremes | Pours, speed restrictions, grid load, expansion | Validity bounds on operational facts |
| Storm tracks | Berth occupancy, closure, event onset | The event clock a parametric trigger needs |

The row people skip is the third. **Weather gates the sensors, not only the
world**, which changes what an absence means: a gap in optical coverage is not
silence, it is explained missing data, and an as-of answer over it should return
"optical unavailable, cloud fraction 0.9" rather than an empty result that reads
as nothing happening. Provenance applied to void.

And the reanalysis is a witness, not the weather. A gridded value at a facility's
coordinates is a model output interpolated to a point, with its own observation
model and its own uncertainty — ingested as an observation with a noise model and
a lineage, never as ground truth. Reanalyses revise, so valid time is the
weather's and knowledge time is the product release's, which is the two-clock
discipline verbatim. Treating a grid cell as a measurement is how the frame
problem arrives through the weather door.

### The vertical datum, before the first elevation

Two families referencing different vertical data — ellipsoidal height against an
orthometric height above a geoid — are each internally consistent and wrong
against each other by tens of metres. A vertical datum is therefore a required
field wherever an elevation appears, and a transform between two of them is a
declared object with evidence, not an offset applied in a script.

The record contract carries a horizontal datum and no elevation at all, so the
trap is not yet reachable. It becomes reachable the day the first elevation is
recorded, which is exactly why the field belongs in the contract before that day.
The contract is days of work now and a migration later; the ingestion, the fusion
and the storm-event ledger all queue behind corpus volume and behind acquisition
decisions that are the operator's, not this repository's.

`src/domain/sensorFamilies.ts` carries all of it as data.
