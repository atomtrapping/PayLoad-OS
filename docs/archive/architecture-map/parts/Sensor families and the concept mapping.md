---
title: "Sensor families and the concept mapping"
status: "CONTRACT ONLY · NOTHING REGISTERED · NOTHING FUSED"
group: "Acquisition Fabric — world → evidence"
tags:
  - architecture-map
  - layer/acquisition
---

# Sensor families and the concept mapping

**State:** `CONTRACT ONLY · NOTHING REGISTERED · NOTHING FUSED`
**Group:** Acquisition Fabric — world → evidence
**Map:** [[NotationsOS Architecture]]

> The sensor convergence is free — two observation models over one state. The semantic one is the work: neither family emits corpus concepts, so fusion at the fact level is blocked however good the estimator is. And meteorology is not a third sensor; it drives the state the others observe and decides whether they can observe at all.

## What it is

- **Three families with their frames**: satellite optical and radar (plan position and extent, cloud-vulnerable), LiDAR (elevation and structure, cloud-immune), meteorology (forcing and gating). Each carries the frame fields a record from it must have — datum, epoch, acquisition instant, model and version, and for meteorology the product, grid, vintage and interpolation method.
- **The concept mapping in four stages**: feature outputs as candidate observations with noise models; source vocabularies mapped onto corpus concepts as versioned mappings with receipts; reconciliation where families disagree, encoded rather than averaged; and admission. Each is an instance of a discipline the repository already has, and stage two is where the estate lives.
- **Attributed absence**: weather gates the sensors, so a coverage gap is explained missing data. An as-of answer over a cloudy week says "optical unavailable, cloud fraction 0.9" rather than falling silent.
- **The reanalysis as a witness**: a gridded value at a point is a model output with its own noise model and its own vintage, never ground truth.
- **The vertical datum**, required wherever an elevation appears, written into the contract before the first elevation exists.

## Where it lives

- `src/domain/sensorFamilies.ts`, `src/domain/sensorFamilies.test.ts`
- `/model`, in the section "Space: the display was the easy half"
- `docs/SPATIAL_DERIVATION.md`

## Boundaries

- Nothing is acquired. No imagery, no point cloud, no reanalysis, no forecast. Acquisition is an operator decision with a rights and cost dimension, and none is made here.
- Cross-family agreement is worth more than syndicated agreement only because the error physics are independent — which is the independence weighting, not a bonus.
- A detection is an assertion by a model, so it enters as a candidate with its producer.
- Two families on different vertical data are consistent within frame and wrong across it, by tens of metres.

## Connects to

- → [[Source rights and use evaluation]] — imagery terms are the strictest in the inventory, and gate everything downstream
- → [[Normalization adapters]] — the concept mapping is the same discipline, for a spatial family
- → [[Estimation, constraints and invariant scoring]] — weather supplies the leak terms that keep conservation residuals from blaming the constraint for the rain
- ← [[Spatial derivation programme]] — change detection is the derivation this contract exists to make honest
- → [[Admission authority]] — fused, concept-typed candidates cross it or they are not facts

## Open questions

- [ ] What is the first corpus concept the mapping declares, and which family's vocabulary meets it first?
- [ ] Does the vertical datum go on the geometry, or on a separate elevation object with its own transform?
- [ ] Which reanalysis product, and is its revision schedule recorded as a source property before anything is captured?
- [ ] What is the gating threshold that turns "cloudy" into "optical unavailable", and who declares it?

## Notes

_Brainstorm here._
