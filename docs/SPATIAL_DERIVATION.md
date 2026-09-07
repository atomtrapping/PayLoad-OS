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
separation against combined stated uncertainty, with the distance model's own
error folded in, so the arithmetic is never allowed to decide what the geometry
cannot.

That verdict refutes far more often than it confirms, and that is the useful
direction. Geometry shows that two things are *not* in the same place far more
cheaply than it shows that they are.

| Verdict | Meaning |
|---|---|
| `DISTINGUISHABLE` | Separation exceeds combined stated uncertainty: not the same place |
| `INDISTINGUISHABLE` | Inside it: this evidence cannot separate them — a **candidate** for a resolution decision, never a merge |
| `UNDECIDABLE` | An uncertainty is missing, or the two quantities differ by less than the distance model's own error |

## What the demonstration corpus actually yields

Two subjects declare a position: a loading terminal at Rotterdam stated to
±250 m, and an origination yard at Santos stated to ±500 m. Both are keyable, both
at geohash precision 6 — the finest resolution their own uncertainty supports —
giving `u14ze9` and `6gxpdp`, cells roughly 754 × 611 m and 1 118 × 611 m at
their respective latitudes. They do not block together. Their separation is
9 753 910 m against 750 m of combined stated uncertainty, so the verdict is
`DISTINGUISHABLE`.

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

- **Areal geometry.** `CorpusRecord.geometry` admits `POINT` and nothing else, so
  containment, adjacency and overlap — the strong geometric joins — are absent. A
  point can be near another point; it cannot contain one. Four of the five
  derivations wait on this.
- **A resolution decision object.** An `INDISTINGUISHABLE` pair stops at
  candidate. Carrying two identifiers to one subject with evidence, method,
  version and both clocks is the identity core's job, not a spatial one.
- **A geodesic.** Haversine on a sphere is not a distance on the WGS84 ellipsoid.
  The module says so and folds the difference into the verdict rather than
  implying survey precision.
- **A spatial database.** PostGIS, S2, H3 and STAC are the purchased layer. What
  belongs to the firm is the resolution bound, the refusal where the evidence is
  silent, and the recorded judgment where two boundaries disagree.

## The order

1. The cell key, because every other derivation presupposes it and it needs no
   new source. **Done.**
2. Areal geometry, because containment is the strong join. A change to the record
   contract and a registered boundary source, not a database.
3. The resolution decision object, so a candidate can become one subject with
   evidence behind it and be undone without rewriting history.
4. The flow-through-geometry demonstration over one place and one week, end to
   end with digests.
5. Imagery last of the sources, because its rights are the strictest and its
   value depends on everything above being in place.

## Where it lives

| Part | Path |
|---|---|
| Cell key, extent, verdict | `src/domain/spatialKey.ts`, `src/domain/spatialKey.test.ts` |
| Roles, derivations, capabilities, discipline | `src/domain/spatialDerivation.ts`, `src/domain/spatialDerivation.test.ts` |
| The derivation beneath the globe | `src/components/earth/SpatialKeys.tsx`, at `/earth` |
| The programme | `/model`, section "Space: the display was the easy half" |
| The join key it supplies | `SPATIAL_CELL` in `src/domain/identity.ts` |
