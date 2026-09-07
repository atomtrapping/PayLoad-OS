---
title: "Spatial key and geometric verdict"
status: "BUILT · POINTS ONLY · NO RESOLUTION DECISION"
group: "Space as a working dimension"
tags:
  - architecture-map
  - layer/corpus
  - layer/identity
---

# Spatial key and geometric verdict

**State:** `BUILT · POINTS ONLY · NO RESOLUTION DECISION`
**Group:** Space as a working dimension
**Map:** [[Payload OS Architecture]]

> A cell may never be finer than the evidence, and the cell is not the answer. The key decides which pairs are worth comparing; the comparison is metric, and it refutes far more often than it confirms.

## What it is

- A geohash cell key over every declared WGS84 position, at the finest resolution the source's own stated horizontal uncertainty supports and no finer. A position with no stated uncertainty is refused a key rather than given a default one.
- Cell extent computed at the position's own latitude, because a geohash rectangle's ground width shrinks with the cosine of latitude and quoting a constant would be wrong by a factor of six near the poles.
- Blocking at the coarser of two resolutions, using the prefix property: a fine key truncates to a coarse one, so two positions indexed against different evidence still meet.
- A metric verdict per cross-subject pair — `DISTINGUISHABLE`, `INDISTINGUISHABLE`, `UNDECIDABLE` — from the separation against the combined stated uncertainty, with the distance model's own error folded in so the arithmetic never decides what the geometry cannot.

## Where it lives

- `src/domain/spatialKey.ts`, `src/domain/spatialKey.test.ts`
- `src/components/earth/SpatialKeys.tsx`, shown beneath the globe at `/earth`
- Join key `SPATIAL_CELL` in `src/domain/identity.ts`

## Boundaries

- `INDISTINGUISHABLE` is a candidate for a resolution decision, never a merge. No resolution decision object exists.
- Containment and adjacency — the strong geometric joins — are absent: the record contract admits `POINT` and nothing else.
- Haversine on a sphere is not a geodesic on the ellipsoid, and the module says so rather than implying survey precision.
- This is an encoding, not a spatial database. S2 or H3 is the equal-area successor and a library decision.

## Connects to

- ← [[Corpus object model]] — reads `location.position` records and their stated uncertainty
- → [[Identity core and cross-line join]] — supplies the blocking key the cross-line join needs, and nothing more
- → [[Earth Twin (CesiumJS)]] — the derivation shown beneath the display it derives from
- → [[Spatial derivation programme]] — the first of the five derivations, and the one the rest presuppose

## Open questions

- [ ] Does the resolution bound belong on the key, or should a record carry its supportable precision as a field?
- [ ] When areal geometry arrives, is a boundary keyed by its covering cells or by a single containing cell?
- [ ] Should a `DISTINGUISHABLE` verdict be retained as a recorded negative decision, or recomputed each time?

## Notes

_Brainstorm here._
