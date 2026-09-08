---
title: "Identity core and cross-line join"
status: "KEYS RUN ACROSS THREE LINES · RESOLUTION ABSENT"
group: "Corpus Fabric — evidence → candidates, releases, products"
tags:
  - architecture-map
  - fabric/corpus
---

# Identity core and cross-line join

**State:** `KEYS RUN ACROSS THREE LINES · RESOLUTION ABSENT`  
**Group:** Corpus Fabric — evidence → candidates, releases, products  
**Map:** [[NotationsOS Architecture]]

> Identity is line-agnostic; the verticals are not. One core solves resolution, provenance, bitemporality and linkage for every line; the identifiers beneath belong to their line. The moat is the cross-line join. Two of its three keys now run across three corpora that carry records; the third, resolution, is absent, and running the first two does not bring it closer.

## What it is

- The core, with the state that is true here: bitemporality present, provenance and linkage partial with the missing half named, resolution absent.
- Three identifier families: Caravan carries USDOT and lot/sample and declares IMO/MMSI; Tradewind declares LEI and an instrument identifier; Landshark declares APN and a cadastral identifier. Each says why its identifiers cannot be the next line's.
- Three join keys with the mistake each invites: spatial cell (present and exercised), time interval (present, because both clocks exist), resolved entity (absent).
- `crossLineStanding(corpora, seat)` runs the two present keys over every cross-line pair and reports the outcome of each: 11 pairs, 4 co-located, 3 unkeyable, `resolved: 0`, `resolutionState: ABSENT`. The zero is held there by a test.
- `identityStanding(corpus)` counts subjects, identity links and linked subjects from the corpus, asserting nothing beyond it.

## Where it lives

- `src/domain/identity.ts`, `src/domain/identity.test.ts`
- `src/domain/crossLineJoin.ts`, `src/domain/crossLineJoin.test.ts`
- `/model` — "Identity: one core, three families, one join"
- `docs/CORRECTION_AND_IDENTITY.md`, `docs/CROSS_LINE_JOIN.md`

## Boundaries

- A matching name is not a resolution, and a matching label across two lines is the cheapest way to manufacture a moat that is not there.
- A shared spatial cell is co-location at a resolution, not a relationship. Three subjects in cell `u14ze9` are three subjects in one cell.
- A position whose source stated no precision is refused a key rather than given a default one: unkeyable is neither co-located nor apart.
- Two keys block at the coarser of their two precisions, never the finer.
- The join reads the seat’s deliverable set, never the release. A position you may not deliver is not a position you may join on.
- Overlapping in valid time is coincidence in the world; overlapping in knowledge time is only coincidence in what was known.
- A join built per line is not a join: solving the core for one line makes the second and third pay the whole cost again.

## Connects to

- ← [[Corpus object model]] — subjects, identity links and both clocks
- ← [[Domain products (Caravan, Tradewind, Landshark)]] — the three families
- → [[Storage (polyglot persistence)]] — the graph store waits on one identity authority
- → [[Correction and recall machinery]] — resolution recorded as a decision is what lets a link be wrong later

## Open questions

- [ ] What exactly is in a resolution decision object, and who may issue one?
- [ ] Which link types earn their own evidence requirements first?
- [ ] At what resolution is a spatial cell useful without implying a relationship?
- [ ] Which of the four co-located pairs would a resolution decision actually be issued for, and on what evidence?

## Notes

_Brainstorm here._
