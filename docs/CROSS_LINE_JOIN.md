# The cross-line join, run

The firm's stated moat is one sentence: *a Tradewind position resolved to a
Landshark parcel exposure through a Caravan flow.* Until 2026-09-08 that
sentence could not be exercised at all, because two of its three lines held
nothing. `src/domain/spatialDerivation.ts` said so in as many words — the
cross-line join "remains a claim about a key rather than a demonstrated
answer."

Three corpora carry records now. This document is what happened when the keys
were actually run across them, and it is deliberately not a success story.

## The three lines

| Corpus | Line | Releases | Records | Retraction |
|---|---|---|---|---|
| `caravan.specialty-cargo` | Logistics, freight, cargo | 3 | 19 | 2 |
| `tradewind.freight-rates` | Markets, pricing, risk | 2 | 6 | 1 correction (`RET-TW-0001`) |
| `landshark.terminal-parcels` | Parcels, zoning, entitlements | 2 | 7 | 1 withdrawal (`RET-LS-0001`) |

All three are `fixture_only` and every response that carries them says so. A
line becomes servable by appearing in `FIXTURE_CORPORA`, because the feed, the
MCP tools, the release pages, the retraction pages and the corpus surfaces are
all corpus-generic and read that one list. That is the entire meaning of
"operational" here. It does not mean live data, and no admission has occurred.

Provenance on the two new lines carries a source, an artifact and a producer,
and **no content digest**. A digest is a commitment to bytes that were seen. No
bytes were captured for these corpora, so a digest over them would be a
fabricated commitment, and the value of the digest everywhere else is precisely
that it is never one.

## The three keys and their states

| Key | State | What running it establishes |
|---|---|---|
| Spatial cell | Present, exercised | Which cross-line pairs share a cell at the coarser of their two stated precisions |
| Time interval | Present, exercised | Which of those pairs share a validity interval |
| Resolved entity | **Absent** | Nothing. There is no resolution decision object and nothing here produces one |

`src/domain/crossLineJoin.ts` runs the first two. It cannot run the third, and
running the first two does not bring the third any closer.

## What it returns

Read at knowledge time `2026-09-01T12:00:00Z`, at the `COUNTERPARTY_SHARED`
seat:

| Line | Positions | Keyed | Unkeyable |
|---|---|---|---|
| Caravan | 2 | 2 | 0 |
| Tradewind | 1 | 1 | 0 |
| Landshark | 3 | 2 | 1 |

| Measure | Value |
|---|---|
| Cross-line pairs | 11 |
| `CO_LOCATED` | 4 |
| `NOT_CO_LOCATED` | 4 |
| `NOT_KEYABLE` | 3 |
| `resolved` | **0** |
| `resolutionState` | **`ABSENT`** |

Same-line pairs are not counted. Two Caravan positions in one cell are not a
cross-line join, and calling them one would be the arithmetic equivalent of
buying your own inventory.

### The four co-located pairs

Three subjects fall in geohash cell `u14ze9` over overlapping intervals: the
Caravan lot `LOT-5B-221`, the Tradewind instrument `INST-TW-C5` by way of its
designated discharge point, and the Landshark parcel `PARCEL-NL-0442`. That is
a triangle, and the fourth pair is separate: `LOT-7C-104` and `PARCEL-BR-1207`
in cell `6gxpdp`.

A lot at a berth, a route's discharge point written against that berth, and the
parcel the berth sits on are three subjects in one cell over one interval. That
is co-location. It is not a relationship, it is not an identity, and asserting
either from a shared cell is the cheapest way to manufacture a moat that is not
there. `resolved` is the literal `0` and a test holds it at `0`.

### The three unkeyable pairs

`PARCEL-NL-0511` publishes a centroid with no precision. The registry stated
none, so the record states none, and a position with no stated uncertainty is
refused a key rather than given a default one. All three of its cross-line
pairs come back `NOT_KEYABLE`: not co-located, not apart, unkeyable. A default
radius would have invented the answer, and an invented answer is worse than a
refusal because it looks like an answer.

### What never reaches the join

`TW-0103` is the counterparty's own delivery point for position `TW-1180`,
registered in their book with no `EXPORT` permission. It has a geometry and a
stated precision and would key perfectly well. It is absent from the join
because the join reads `deliverableRecords` for the seat, not the release. A
position you may not deliver is not a position you may join on, and a join
that quietly reads the ungated set is a rights bypass wearing an analytics hat.

## The precision rule

Two keys block at the **coarser** of their two resolutions, never the finer. A
key is only as sharp as the vaguer of the two sources, and comparing a ±10 m
position against a ±500 m position at 10 m would report a disagreement that
only the arithmetic believes. All four co-located pairs above were compared at
geohash precision 6.

## The two clocks, kept apart

Blocking is computed over **valid time**: where the sources say the subjects
were. Knowledge time bounds which records exist and what standing they have; it
is never itself the overlap. Overlapping in valid time is coincidence in the
world. Overlapping in knowledge time is only coincidence in what was known, and
treating the second as the first invents causation out of a reporting schedule.

## What is still missing

The join the firm claims as its moat needs the resolution decision object that
`CROSS_LINE_JOIN.requires` names first: two identifiers, the evidence, the
method and its version, the decision, and both clocks. Blocking decides which
pairs are worth comparing. It is not the comparison, it is not the decision,
and no number of co-located pairs becomes one.

## Where it lives

- `src/domain/crossLineJoin.ts`, `src/domain/crossLineJoin.test.ts`
- `src/domain/spatialKey.ts` — the key and its refusals
- `src/domain/identity.ts` — the three keys and their states
- `src/fixtures/tradewind/release.ts`, `src/fixtures/landshark/release.ts`
- `docs/CORRECTION_AND_IDENTITY.md`, `docs/SPATIAL_DERIVATION.md`
