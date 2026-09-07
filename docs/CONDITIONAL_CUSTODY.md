# Conditional custody: hold, monitor, adjudicate, release

`src/domain/collateralVehicle.ts`, rendered at [`/model#pm-custody`](../src/app/model/page.tsx).

A deposit is placed against conditions, held while they are unmet, and released
when an adjudicated fact says they are met. This is the documentary credit — a
bill of lading released against payment — with the documents replaced by
receipts. It is the oldest trusted-intermediary role in commerce.

It is deliberately **not an insurance product**. There is no pooled capital, no
priced risk and no contingent payout, so the exposure is notarial rather than
actuarial: did the condition fire correctly, on the right evidence, at a stated
instant? That distinction decides everything downstream. An underwriter is a
party to the outcome; a stakeholder is not, and here neutrality is the whole
service rather than something spent to win the business.

## Release is irreversible and facts are not

This is the risk that goes unwritten, and it is the reason a general-purpose
oracle cannot fill this role. A chain settles at machine speed. A correction
arrives at world speed. The gap between them is the entire liability.

An oracle publishes a value and has no notion of that value being restated
later. This corpus does: a retraction is a first-class object, records carry
both clocks, and a superseded record keeps its identity rather than being edited
away. So the vehicle can state its restatement exposure *before* releasing, and
afterwards can say exactly which facts it relied on have since been restated —
without un-firing anything, because a release that has fired is history and
history is not corrected by mutation.

### The worked case, over the committed corpus

A condition set between the two accounts of one lot's weight:

> Release on confirmation that the gross quantity of lot 5B-221 does not exceed
> 40.05 t.

| | |
|---|---|
| Decided 2026-08-20 | **GRANTED** — REC-0203 states 40.0 t (draft survey, estimated) |
| What arrived later | RET-0001 (CORRECTION) after **5.6 days** — a terminal weighbridge ticket at 40.120 t supersedes it |
| The same condition now | **WITHHELD** |

The decision was right on what was held and is wrong on what is held. That is
the exposure this role carries and cannot eliminate; what it can do is measure
it, name it, and refuse to pretend the release can be taken back.

### Two kinds of restatement, and they are not the same trouble

A **CORRECTION** replaces a value: the world was as it was, the corpus said it
wrong, and the release may or may not still be right depending on where the
condition sat. A **WITHDRAWAL** removes support: the record is gone and nothing
takes its place, so the release now rests on nothing — which is not the same as
resting on something false.

The corpus's own second retraction makes the point in its own words: Northgate
withdrew a certificate for a chain-of-custody defect at the laboratory, and the
reason says plainly that this *is not a finding about the cargo*. A vehicle that
reported the two the same way would tell a depositor its cargo was misdescribed
when what actually happened is that an inspector's paperwork failed. Withdrawn
is not false, here as everywhere else in this system.

## The window is measured, and is not a rate

`restatementExposure` reads the corpus's own history: 2 restatements over 21
records, the longest arriving **18.3 days** after the record it restates became
knowable.

That measures a window. It does not estimate a frequency, and the function says
so rather than returning a number that would be used as one. A handful of events
over one synthetic corpus supports an anecdote; a vehicle that held deposits for
nineteen days on this evidence would be pricing something it does not have. The
window becomes estimable when the corpus has run long enough to have a
denominator — which is the credibility problem an actuary would name on sight,
arriving here through the collateral door.

## What it must never do

Each is a mechanism, not a promise:

| Never | Because | Enforced by |
|---|---|---|
| Hold the collateral | Custody of client assets is licensed everywhere that matters; taking it on buys a fee on float at the price of a licensing wall | No balance, account or transfer exists in the module, and a test asserts none is added |
| Warrant the outcome | A vehicle that warrants the cargo warrants the world | `LIABILITY_BOUNDARY`: the adjudication is attested, the thing itself is not |
| Un-fire a release | Correcting by mutation makes the ledger lie about what was decided | `exposureAfter` reports against a decision and never alters it |
| Release on an unadmitted record | Money must not move on a demonstration | Every decision carries a standing; over a fixture corpus it is `DEMONSTRATION` and can never be `BINDING` |
| Infer a source clock to settle a dispute | A dispute asks what the vehicle held, not what the source knew | `DISPUTE_QUESTION` is fixed to `WHAT_WE_HELD`; the other question is refused as `QUESTION_NOT_ANSWERABLE` |

That last row is the tie to the as-of work: a vehicle can only ever be
accountable for what it held, and this corpus carries no source clock, so the
question a claimant might prefer is refused rather than answered on the wrong
one.

## What is missing before any of this is real

An admitted record — every decision here is stamped `DEMONSTRATION`. A live
source for the condition class: a delivery condition needs a delivery observed
by something other than the party who wants the money. Two channels on the
event, because one channel that also benefits from the release is the
adversarial-oracle case with extra steps. A custody arrangement that is
explicitly not ours, written down before the first deposit rather than after the
first dispute. And a denominator.

Nothing here holds an asset, moves money, or exists as a deployed vehicle. No
release has fired.
