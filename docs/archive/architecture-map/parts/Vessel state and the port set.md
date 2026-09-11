---
title: "Vessel state and the port set"
status: "TYPED · NOTHING ACQUIRED · NOTHING ADJUDICATED"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - layer/corpus
---

# Vessel state and the port set

**State:** `TYPED · NOTHING ACQUIRED · NOTHING ADJUDICATED`
**Group:** Corpus Fabric — evidence → candidates, releases, products
**Map:** [[NotationsOS Architecture]]

> The vessel is not a fifth source; it is the state the other four were defined around. And a port is not a polygon — it is a time-indexed set whose membership is adjudicated, not observed.

## What it is

- **Vessel state**: position, course and speed, heading, draft, and set-and-drift estimated as state rather than treated as nuisance. Only position is carriable today; draft has the highest ratio of signal to acquisition cost, because a draft change at a berth is the cargo event without a cargo document.
- **Four observing channels and one prior.** AIS is a self-report; radar fixes a hull without naming it; optical is weather-gated so its absence is explained; port-call records are latent and not independent of the terminal's own berth declarations. Dispatch is typed as a **prior**, so the intent-versus-track divergence stays signal instead of becoming a correction.
- **Five joins, five different epistemic operations**, each with the mistake it invites — including the one where a well-tracked vessel calibrates the imagery that would otherwise confirm it, which must not close the loop.
- **The port as a time-indexed set**: membership as a ruling with an evidence class, a confidence and a supersession path; both clocks, because they differ by hours per channel and that difference is what makes a set series backtestable.
- **Six set objects** — occupancy, queue depth, turnaround, composition, draft transitions, arrivals against departures — each a series the estimator reads directly, and each a projection over the membership ledger rather than stored state.
- **The construction lifts**: port, corridor, lane, network. One grammar, one correction path, four scales.

## Where it lives

- `src/domain/vessel.ts`, `src/domain/portSet.ts` with their tests
- `/model` section "Caravan: the vessel is the state, the port is a set"
- `docs/MARITIME.md`

## Boundaries

- Nothing is acquired: no position feed, no imagery, no port-call record, no charter, and acquisition is the operator's decision.
- Dispatch never becomes an observation; adjudicating the divergence destroys the signal.
- A coverage gap renders void as void. A set member not imaged is not an absent vessel.
- Coincidence in time is not attribution, and a corridor inferred from timing alone is a correlation.
- The defence under adversary is resolved longitudinal identity, not ingestion — and the resolution decision it needs is absent.

## Connects to

- ← [[Sensor families and the concept mapping]] — the families that would observe and force it
- ← [[Estimation, constraints and invariant scoring]] — the constraint families, at their declared hardness
- → [[Identity core and cross-line join]] — every set operation bottoms out in resolution
- → [[Correction and recall machinery]] — a superseded membership moves every aggregate that depended on it
- ← [[Spatial key and geometric verdict]] — containment and approach are computed against declared geometry

## Open questions

- [ ] Which port is the base case, and what declares its berths and anchorages?
- [ ] Does a membership ruling live as a corpus record, or as its own ledger with a record projection?
- [ ] What is the minimum channel set that makes a closure residual worth retaining?

## Notes

_Brainstorm here._
