# What the read paths cost at volume

`scripts/bench-query.ts` — synthetic, in memory, never written, and not corpus
content. It exists to produce a number.

The corpus's correctness is provable over 21 committed records and none of it
says how long an answer takes. **The factory's correctness is testable without
inventory; the index's is not testable without rows.** So these are rows.

## Measured

| records | as-of p50 | as-of p95 | 5-leg condition p50 | restatement exposure p50 |
|---|---|---|---|---|
| 1,000 | 31 µs | 91 µs | 362 µs | 50 µs |
| 10,000 | 283 µs | 425 µs | 4.2 ms | 1.0 ms |
| 100,000 | 4.0 ms | 4.9 ms | 66.8 ms | 21.9 ms |
| 1,000,000 | **141.6 ms** | 167.3 ms | **2,346 ms** | 404.5 ms |

Linear, and slightly worse than linear at the top from allocation pressure —
`queryAsOf` filters the whole record array twice per call, building large
intermediate arrays each time.

**These are not acceptable numbers for the product's noun.** A single-record
as-of lookup at 141 ms is not a query primitive; it is a scan wearing one. And
the 5-leg condition is the vehicle's core operation: a release decision over a
million records currently takes **2.3 seconds**, because the condition grammar
resolves each leg through its own `queryAsOf`, so a five-term rate confirmation
is five full corpus scans.

Nothing here is a surprise given the implementation. The point of measuring was
to stop it being a guess.

## The defect the benchmark found

The dependency fan-out reached **14** dependents out of a million edges and took
**926 ms** — because it rebuilt the whole forward adjacency inside every call. A
correction's cost scaled with the size of the graph rather than with its own
reach, which is the difference between a scan and an index and the entire reason
an index exists.

`buildDependencyIndex` is now separate from `fanOut`. The adjacency is prepared
once and queried many times:

| edges | build p50 | fan-out p50 | reached |
|---|---|---|---|
| 1,000 | 165 µs | 12 µs | 14 |
| 100,000 | 34.2 ms | 9 µs | 14 |
| 1,000,000 | 710.6 ms | **9 µs** | 14 |

926 ms to 9 µs, and flat: the walk now costs its closure and not the graph. A
test asserts a one-dependent closure over fifty thousand unrelated edges stays
under 5 ms, so the property is pinned rather than remembered.

The build cost is real and amortised. It is also the honest shape of the thing:
an index is prepared, then queried.

## What this says about the next design pass

Two of the three measured paths need an actual index rather than a faster scan,
and the shape is already visible without a customer:

- **As-of is a lookup on `(subjectId, predicate)` ordered by `knownAt`.** That is
  a composite index and a descending scan bounded by the knowledge time, not a
  filter over everything.
- **The condition grammar should resolve a whole tree in one pass**, not one
  query per leg. Its resolver is already a seam — it takes a `FactResolver` — so
  a batching resolver is a change at one boundary rather than through the
  grammar.
- **Rights filtering has to be decided before the index is built, not after.**
  An index built first and filtered second holds what the filter would have
  withheld, and every failure in that shape is a disclosure rather than a bug.

## The numbers, addressable

`src/domain/queryCost.ts` holds the points above as data, and `/api` renders
them. It answers what a read costs at a size, from points that were recorded,
and refuses outside them: past the last run the answer is `UNKNOWN` rather than
an extrapolation, because a scan's curve is knowable where it was run and a
guess everywhere else — and the guess would be the most persuasive figure on the
page precisely because it would carry a decimal point. That is
`admittedRecords: number | 'UNKNOWN'` one layer over: an unmeasured cost is not
a fast one.

Two things are recorded rather than derived. The condition tree is held at
**five legs**, which is what ran — dividing it into a per-leg figure would be an
assumption about how cost scales in leg count, and the benchmark never varied
that number. `planCondition` scales from the five-leg measurement and carries
`COST_SCALES_LINEARLY_IN_LEGS` as a field rather than a footnote. And the
conditions travel on every estimate, because a number whose conditions travelled
separately from it is a number that will eventually be quoted without them.

A test reads this document's table back and fails if it disagrees with the
module, so the prose cannot drift away from the numbers it describes.

## What this does not say

It does not say the system is slow, because there is no system yet — these are
synthetic records in one process with no store, no network and no concurrency.
Real numbers will be worse in some ways and better in others: Postgres will do
the composite lookup far better than an array filter, and will add latency an
in-process benchmark has none of.

It says the read paths as currently written do not scale, which was previously
an inference from reading the code and is now a measurement.
