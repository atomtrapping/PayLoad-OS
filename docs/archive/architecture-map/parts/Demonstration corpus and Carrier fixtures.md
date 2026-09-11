---
title: "Demonstration corpus and Carrier fixtures"
status: "FIXTURE · SYNTHETIC"
group: "World: sources, rights and recorded material"
tags:
  - architecture-map
  - layer/world
---

# Demonstration corpus and Carrier fixtures

**State:** `FIXTURE · SYNTHETIC`  
**Group:** World: sources, rights and recorded material  
**Map:** [[NotationsOS Architecture]]

> Three demonstration corpora — Caravan specialty cargo (three releases, nineteen records, two retractions, seven sources with rights), Tradewind freight rates (two releases, six records, one correction) and Landshark terminal parcels (two releases, nine records, one withdrawal, and the corpus's only boundary and extent) — plus the synthetic Carrier JSON contract, drive every screen and the local rail's demonstration.

## What it is

- Demonstrates an as-of answer that changes with knowledge time, a fact reached through an identity link, a typed refusal, and a correction shown as the same question at two knowledge times.
- Every fixture-mode surface is banner-marked as fixture and says what would make it real.
- The two newer corpora carry no captured bytes, so their records carry a source, an artifact and a producer and no content digest: a digest over bytes that were never seen would be a fabricated commitment.
- Landshark deliberately includes one position the registry published without a precision, so the unkeyable case is demonstrated rather than described.
- Landshark also carries the only two shapes in the corpus: a five-vertex cadastral ring whose enclosed area matches the registry's separately stated cadastral area to within its published tolerance, and a containing rectangle for a registry that will commit to a box and no further. Each supersedes the centroid it replaced, so the earlier release still shows the centroid.

## Where it lives

- `src/fixtures/caravan/`, `src/fixtures/tradewind/`, `src/fixtures/landshark/`
- `src/fixtures/production/`, `src/fixtures/notations/`
- `src/fixtures/index.ts` — `FIXTURE_CORPORA`
- `examples/carrier/`, `examples/evidence/`
- `docs/DEMO_CASE.md`, `docs/CROSS_LINE_JOIN.md`

## Boundaries

- Fixtures are not sources; nothing synthetic is ever labelled as observed.

## Connects to

- → [[Local production rail]] — Carrier bytes for the demonstration
- → [[Corpus object model]] — demonstration releases

## Open questions

- [ ] Which fixture should be replaced first by real captured material, and what breaks when it is?

## Notes

_Brainstorm here._
