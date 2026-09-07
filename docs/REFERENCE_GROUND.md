# Reference ground: the third clock, and the layer that is closed

The legacy layer is not a dataset this system holds. It is the ground it
stands on: immutable, content-addressed, closed to this system's own writes
and closed to sale. The live corpus is richer and unanchored — estates,
corrections, adjudications — and this is thinner and stable. Belief and
terrain.

`src/domain/referenceGround.ts` is the contract. Nothing acquires anything
here; the module decides what a record of either kind may answer.

## Two clocks were enough only while capture was live

A live capture is published by its source and obtained by this system at
nearly the same instant, which is why two clocks sufficed. Backfill splits
that instant in two, and the third clock was hiding inside "source" all
along.

| Clock | Meaning | Live capture | Backfill |
|---|---|---|---|
| valid time | when the fact was true in the world | T | T |
| source time | when the source published or knew it | ≈ acquisition | S, often long before |
| acquisition time | when this system obtained it | ≈ source | now |

A 2019 record bought in 2026 was knowable by its source in 2019 and by this
system in 2026. Both are true.

## They answer two different questions, and the module keeps them apart

- **`WHAT_THE_SOURCE_KNEW`** — bounded by source time. A question about the
  source. Answerable over backfill, and it says nothing about whether this
  system held the record.
- **`WHAT_WE_HELD`** — bounded by acquisition time. A question about this
  system, and the one the product sells. Backfill answers it only from the
  moment it was acquired.

Making source time *the* knowledge boundary does not fix the fabrication; it
relabels it. Answering the second question with the first invents a system
that knew things it did not know — the same fabrication every refusal here
already blocks, arriving through the acquisition door wearing a helpful
costume. So a caller names which question it is asking, the two use
different clocks on purpose, and what a question excluded is named rather
than dropped.

`asOf` returns the included set and the excluded list with a reason each. The
canonical refusal reads: *this system did not hold it then — acquired 2026,
which is after the asked-for instant. The source may have known it long
before; that is the other question.*

## Two checks, and one deliberate absence of a check

**Coherence is checked.** A record obtained before its source published it
did not arrive the way it claims to have arrived, whatever it is labelled,
and `clocksCohere` refuses it.

**Provenance is not inferred.** No threshold reads a gap between source time
and acquisition time as backfill. Provenance inferred from metadata is a
guess about testimony rather than testimony, one waterline below the thing
itself. It is declared at entry by the admission gate or the candidate is
refused.

## Absence has three readings and never a fourth

| Coverage | Reading |
|---|---|
| the ground does not cover the range | `WE_ACQUIRED_NOTHING` |
| covered, and the source declared the range complete | `SOURCE_RECORDED_NOTHING` |
| covered, completeness undeclared | `INDETERMINATE` |

None of the three says the thing did not happen. Absence is a fact about
records, and the world is not obliged to have been quiet because nobody
wrote it down. This is the historical form of the rule the rest of the
system now shares: silence is not zero.

The reading matters most exactly where an archive is strongest. A chartered
trade archive is superb at what its system saw and structurally silent on
what bypassed it, so the coverage bound is declared rather than hidden, and
`INDETERMINATE` is the honest answer wherever completeness was never stated.

## The boundary the ground never crosses

**It may be measured but not sold.** A calibration score, a fitted source
reliability, an attested residual — those carry no ground with them and are
the product. The ground is not, because a reference layer with customers has
negotiable neutrality, and a negotiable standard is not a standard. You can
sell the certification; you cannot sell the judge.

**It may be reasoned over but not into.** `QUERY`, `CITE` and `TEST` keep the
ground external to the reasoner, so a claim can be checked against it.
`TRAIN`, `DISTIL`, `FINE_TUNE` and `EMBED` dissolve it into the reasoner,
after which nothing it "confirms" is a check — not because the model is
unreliable but because the confirmation is no longer independent. The
reference channel's entire value is its externality. It is a type rather
than a policy, because a policy is negotiable at call time by whoever holds
the config and a type is negotiable only by changing a contract, which is
visible and versioned.

## What this layer is not

It is the shadow of a live corpus, not a substitute for one. Every record is
reconstructable; every correction, adjudication and calibration that
operating would have produced is not. A backfilled release is a different
object from a live-captured one, and its manifest says which it is.
