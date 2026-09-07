---
title: "Estimation, constraints and invariant scoring"
status: "SPECIFIED · NOTHING SOLVED · NOTHING SCORED"
group: "Compute / Decision Fabric — derived objects, never truth by default"
tags:
  - architecture-map
  - layer/compute
---

# Estimation, constraints and invariant scoring

**State:** `SPECIFIED · NOTHING SOLVED · NOTHING SCORED`
**Group:** Compute / Decision Fabric — derived objects, never truth by default
**Map:** [[Payload OS Architecture]]

> A hard constraint is a measurement with R = 0, so constraints are beliefs with provenance rather than solver settings. A wrong hard constraint is the most efficient certainty-forgery device an estimator can own. And no filter set, however good, can tell you the frame is the world.

## What it is

- **Constraints as observations.** `Cx = c` is an update with `H = C`, `R = 0`, `z = c`; soft is the same with `R > 0`. Declared, versioned, bitemporal, sourced, and carried in the release manifest. Projection with Joseph form is recommended; clipping is forbidden because it ignores the covariance and corrupts the posterior silently.
- **Harvest certainty in proportion to declared confidence.** Hard is for definitional identities only; real-world laws are stiff-soft with a declared residual; everything measured or regulatory is soft with `R_c` from one minus confidence.
- **The violation tape.** A repeatedly violated constraint is evidence the constraint is wrong, entering the ordinary adjudication path with its violations as proof — an estate, not a log.
- **The factor graph** as the name for what the estimator, the constraint stack, the cell complex's aggregation and the measurement economy all already are. Disagreement is representable, marginals are free so VOI is a query, and an as-of answer is elimination over retained factors.
- **Four tiers of invariant scoring** — structural, cross-source, model, fitted reliability — with what a pass at each is actually worth, and the reference channel that must never be fed by them.

## Where it lives

- `src/domain/constraints.ts`, `src/domain/factorGraph.ts`, `src/domain/invariantScoring.ts` with their tests
- `/model` sections "Estimation" and "Scoring by what a record survives"
- `docs/ESTIMATION.md`

## Boundaries

- Nothing solves. No factor is declared, no constraint enforced, no verdict retained, no reliability fitted, no reference exists.
- Correct is not reproducible: elimination ordering and solver version are pinned and recorded, or a posterior digest means nothing.
- A solver never decides an identity. It supplies scored evidence; the decision stays in the identity estate.
- Corroboration is weighted by independent provenance paths, never by the count of agreeing sources.
- A reference must never become an invariant input, or the benchmark trains the test.

## Connects to

- ← [[Corpus object model]] — records with bounds are the priors; authored relations are the between factors
- → [[Identity core and cross-line join]] — the solver informs resolution and never performs it
- → [[Correction and recall machinery]] — a corrected invariant set invalidates the scores derived under it
- ← [[Spatial key and geometric verdict]] — the geometric answer is one of the cross-source invariants
- ← [[Scene interchange and the learned tier]] — the cell hierarchy the restriction factors would run over
- → [[Verification tiers V0–V5]] — V3 is the reference channel, and it is not reached

## Open questions

- [ ] Which constraint family is declared first, and does the parcel-split identity earn it by doubling as an anomaly detector?
- [ ] What is the retained shape of a filter verdict, so a reliability can be fitted from it later?
- [ ] What independent reference is actually reachable, given that no live source is acquired?
- [ ] Does the elimination ordering belong in the parameter registry beside the other pinned parameters?

## Notes

_Brainstorm here._
