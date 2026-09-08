---
title: "Scene interchange and the learned tier"
status: "ROUTED · NOTHING WRITTEN · NOTHING EMBEDDED"
group: "Projection Fabric — representations, APIs and instruments"
tags:
  - architecture-map
  - layer/projection
---

# Scene interchange and the learned tier

**State:** `ROUTED · NOTHING WRITTEN · NOTHING EMBEDDED`
**Group:** Projection Fabric — representations, APIs and instruments
**Map:** [[NotationsOS Architecture]]

> USD composition resolves opinions to one value; the corpus preserves disagreement. That single asymmetry makes USD a strong output and an impossible store. And a smooth manifold has a value everywhere, so the most beautiful surface in the system is the most efficient fabrication machine in it unless void renders void.

## What it is

- **OpenUSD as a projection target**, routed as one row: `SCENE / INTRINSIC_PHYSICAL / SCENE_GRAPH`. The mapping is data: entity to prim on a stable path, measured quantity to time-sampled attribute, declared relationship to USD relationship, release to layer, as-of to a truncated sublayer stack, admitted-only composition, and uncertainty and provenance to custom metadata USD has no native concept for.
- **The layer stack as the release ABI**: one layer per release, never edited afterwards; release order is the only thing that may set layer strength; a retraction is a new layer, never an edit.
- **Two clocks, two mechanisms**: truncation answers knowledge time, time samples answer valid time, and a valid instant outside every interval is a refusal rather than the nearest sample.
- **The Earth as a combinatorial complex**: nested cells, containment, boundary operators and signals. The geohash prefix code already gives the nesting and the upward operator.
- **The learned manifold as the tier below the corpus**: `corpus → learned manifold → render`, routed as `STRUCTURE / HYPERBOLIC / MANIFOLD`. An embedding is a compute run over one release with a two-part binding, and it does not testify.

## Where it lives

- `src/domain/usdProjection.ts`, `src/domain/usdProjection.test.ts`
- `src/domain/earthComplex.ts`, `src/domain/earthComplex.test.ts`
- Two rows in `src/domain/projection.ts`, routed by `src/projection/spec.ts`
- `/model` section "Projection fabric"; `docs/PROJECTION_FABRIC.md`

## Boundaries

- USD is never a store: a corpus stored as USD would collapse the disagreement layer silently.
- No prim without its uncertainty encoding; a stage that cannot carry it refuses the prim.
- Void renders void: a region with no admitted record is drawn absent, never smoothed.
- Neither is a new vocabulary. Both enter as rows in the existing routing table, under the same spec and the same non-claims.
- Nothing is written and nothing is embedded. No USD library and no model is installed, and both routes answer `UNAVAILABLE`.

## Connects to

- ← [[Projection spec and compiler]] — the one router and the closed spec both routes obey
- ← [[Corpus object model]] — releases become layers, records become time samples
- → [[Admission authority]] — only admitted opinions may compose, so a stage today would be empty
- → [[Correction and recall machinery]] — a retraction is a new layer, and it invalidates a manifold rather than correcting it
- ← [[Spatial key and geometric verdict]] — the cell scheme is already the complex's nesting and its upward boundary operator
- ↔ [[Earth Twin (CesiumJS)]] — two projections of one spec, not one thing to be merged

## Open questions

- [ ] What is the uncertainty encoding, concretely: sibling extent prims, material, or both?
- [ ] Does a prim path wait for the resolution decision, or start per subject and accept a migration?
- [ ] What is the interpolation mode for a time sample whose value holds over an interval and is undefined outside it?
- [ ] What renders void, visually, so absence reads as absence rather than as background?

## Notes

_Brainstorm here._
