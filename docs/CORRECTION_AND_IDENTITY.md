# Correction, recall and identity

Two pieces of machinery get expensive to retrofit: the correction and as-of
machinery, and the cross-vertical identity model. Both are modelled here as
data with the state that is true in this repository, so that adopting either is
a decision made against a stated constraint. `src/domain/correction.ts` and
`src/domain/identity.ts` carry them; `/retractions` and `/model` render them.

## Correction and recall

A corpus that corrects itself owes three things.

### Downstream invalidation

For one retraction, which derived artifacts does a corrected fact taint? Seven
classes of derived artifact exist here, and each is decided by whether its
producer retained the reference that would answer:

| Derived artifact | Traceability | Today |
|---|---|---|
| Rulings | Recorded | The corpus names the rulings that relied on an affected record; every ruling names the release and build it was evaluated against. Closed. |
| Projections | Recorded | A projection is pinned to one exact release, so a later retraction never silently changes it. Recompiling against the corrected release is the invalidation. |
| Compute runs | Recorded | Every run retains acquisition and content digests for each dependency, but runs reference evidence artifacts while retractions name corpus records. The two vocabularies cannot meet until extraction lineage exists. |
| Information products | Derivable | Coverage is recomputed rather than retained, so the question is answered by asking it again at the corrected knowledge time. |
| Delivered records | Absent | The distribution surfaces are stateless; no delivery is retained. |
| Candidate builds | Absent | No candidate has ever been admitted, so no released record descends from a build. |
| Notations | Absent | The notation kernel has no attach command, so a saved notation carries no evidence reference. |

`correctionImpact(corpus, retraction)` computes this. A class it cannot decide
returns UNDETERMINED with the reason, never CLEAN. That distinction is the
whole point: "we cannot tell" and "nothing is affected" are different answers,
and only one of them is safe to act on.

### The delivery ledger

"Which supersessions shipped to which customers, when" needs a delivery entry
written at the instant of delivery: recipient, channel, release, the question
answered, the record identifiers, the time. The contract is specified and the
ledger is **empty**. No customer exists, and populating it with invented
recipients would be a fabricated record rather than a design.

The obligation it creates is worth stating before it exists: a retraction is
not complete when it is published. It is complete when every recipient of an
affected record has been told, and the ledger is what makes that checkable.

### As-of as a contract feature

Present: valid time and knowledge time are separate on every record; an as-of
answer is the newest record knowable by the knowledge time whose validity
covers the world time, reached directly or through a current identity link; the
knowledge time is clamped to the release cutoff; a question with no answer
returns a typed refusal with a remedy rather than a null; an earlier release
still shows a record as it stood; and the feed endpoint returns the same answer
the stream page shows.

Absent: the delivery ledger, extraction lineage from a released record back to
the artifact it came from, and admission ancestry from a released record back
to the candidate build that proposed it.

## Identity: one core, three families, one join

Identity is line-agnostic; the verticals are not.

### The core

| Facility | State | Missing |
|---|---|---|
| Bitemporality | Present | — |
| Provenance | Partial | Extraction lineage: provenance names the artifact but not the place inside it |
| Linkage | Partial | A general link vocabulary; one predicate and one hop is the honest shape of one line |
| Resolution | Absent | A resolution decision object: two identifiers, the evidence, the method and version, the decision, both clocks |

Resolution recorded as a decision rather than a merge is what lets a link be
wrong later without rewriting history.

### The families

Caravan carries USDOT and lot/sample identifiers today and declares IMO/MMSI.
Tradewind declares LEI and an instrument identifier. Landshark declares APN and
a cadastral identifier. Each line states why its identifiers cannot simply be
the next line's: a mover changes hands mid-voyage, exposure attaches to an
entity while an instrument attaches to an issue, and a parcel number is unique
only inside one jurisdiction and is re-cut when parcels split.

### The join

The moat is the cross-line join: a Tradewind position resolved to a Landshark
parcel exposure through a Caravan flow. It is **absent**, and it needs exactly
three things: a resolution decision object, a link vocabulary richer than one
predicate, and a line-agnostic key for the cases where no identifier is shared.

Three join keys, each with the mistake it invites:

- **Spatial cell** — present, and now exercised across three lines. A shared
  cell is co-location at a resolution, not a relationship. Two keys block at
  the coarser of their two precisions, never the finer, and a position whose
  source stated no precision is refused a key rather than given a default one.
- **Time interval** — present, because both clocks exist. Overlapping in valid
  time is coincidence in the world; overlapping in knowledge time is only
  coincidence in what was known, and confusing them invents causation from a
  reporting schedule.
- **Resolved entity** — absent. A matching name is not a resolution, and a
  matching label across two lines is the cheapest way to manufacture a moat
  that is not there.

### Running the two present keys

Until 2026-09-08 the join could not be exercised, because two of the three
lines held nothing. All three carry records now, so `src/domain/crossLineJoin.ts`
runs the spatial cell and the time interval over every cross-line pair. At the
counterparty seat and knowledge time `2026-09-01T12:00:00Z` it returns 11
cross-line pairs: 4 co-located, 4 apart, 3 unkeyable, and `resolved: 0` with
`resolutionState: ABSENT`.

The zero is the finding, not a shortfall. Blocking decides which pairs are
worth comparing; it is not the comparison and it is not the decision. Three
subjects sharing cell `u14ze9` over one interval — a Caravan lot, a Tradewind
route's discharge point and a Landshark parcel — are three subjects in one
cell, and no number of co-located pairs becomes a resolution.

`docs/CROSS_LINE_JOIN.md` records the run in full.

A join built per line is not a join. If resolution, provenance and
bitemporality are solved once for Caravan alone, the second line pays the whole
cost again and the third pays it a third time, and the cross-line answer is
never reachable from any of them.
