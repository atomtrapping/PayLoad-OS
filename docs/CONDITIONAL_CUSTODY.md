# Conditional custody: hold, monitor, adjudicate, release

`src/domain/collateralVehicle.ts`, rendered at [`/model/obligations#pm-custody`](../src/components/model/ObligationsChapter.tsx).

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

## Reversal exposure is a property of a corpus, and only a corpus can compute it

This is the exportable part, so it is worth stating plainly rather than as a
lifecycle note.

Every oracle in production publishes a value and has **no representation of that
value being wrong later**. It has a history of what it published, not a history
of what it retracted, because a feed has no correction tape. That is not an
implementation gap; it is a category boundary. A feed can tell you what it said
at T. It cannot tell you what it has since had to unsay, how long that usually
takes, or what a decision made at T would read as now.

The consequence is an invisible tail risk under every on-chain conditional
mechanism built on general-purpose oracles: settlement correct at T, incorrect
at T+Δ, and **no party in the system can state the exposure, let alone price
it**. Not because nobody has done the arithmetic — because the data structure
that the arithmetic would run over does not exist on their side of the line.

`restatementExposure` and `exposureAfter` do not merely measure this for one
vehicle. They demonstrate that **reversal exposure is a measurable property of a
corpus**: computable from a correction tape, both clocks, and records that keep
their identity when superseded. A feed-based oracle architecture cannot compute
it at any price, because its history has nothing to compute over.

So the thing being sold to the venue, the consortium chain and the insurance
protocol is not the receipts. It is this computable tail-risk property, which
their stack cannot represent. The receipts are how it is produced; the property
is what it is worth.

## What a condition can say

`src/domain/conditionGrammar.ts`.

The first version was one subject, one predicate, one scalar comparison. That
expresses *"gross quantity at most 40.05 t"* and nothing else — not detention,
which accrues past a free window; not an accessorial, which triggers on an event
class; not a truck-ordered-not-used, which is a condition on something *not*
happening; and nothing with an "or" in it. Every real freight or trade term has
at least one of those. A counterparty who has to restate their rate confirmation
as a scalar comparison does not use the system, so **their terms compile into
this grammar rather than being replaced by it.**

Five node kinds — `SCALAR`, `EVENT`, `DURATION`, `ALL_OF`, `ANY_OF` — with the
counterparty's own wording carried verbatim on **every** node. The compiled form
is what the corpus evaluates; the agreed text is what a dispute reads, and
neither is derived from the other.

### Composition is three-valued

A node answers `GRANTED`, `WITHHELD` or `NOT_ADJUDICABLE`, and composition is
Kleene-ordered rather than boolean. In `ALL_OF` a definite failure outranks an
unknown — one leg definitely unmet settles it whatever the others could not
decide. In `ANY_OF` a definite success outranks one, for the same reason.

What is never allowed is an unknown quietly becoming a false, which is what
ordinary boolean composition does silently. A composite with one answerable leg
and one the corpus cannot resolve is **undecided, not refused** — the vehicle
stays held rather than returning the deposit on a question nobody answered.

### The term that looks easy and is not

A condition on something *not* happening — TONU, no damage recorded, no customs
hold — cannot be settled by failing to find a record. Absence of a record is a
fact about the corpus, not about the world.

So `DID_NOT_OCCUR` requires a declared **coverage** record: something that states
this window was watched. Without one the node is `NOT_ADJUDICABLE` and says why.
With one, the non-occurrence is *attributed rather than assumed* — and if the
coverage record is itself missing, that is an unwatched silence and says nothing
either.

### Detention, worked

Arrived 08:00, released 13:30, two hours free: 5.5 elapsed − 2 free = **3.5 h
chargeable**. Against a term allowing two further hours, the leg is `WITHHELD`
and the reason states the arithmetic and both record ids. Against a term allowing
four, it holds. One end missing refuses rather than assuming the other.

## Release is irreversible and facts are not

A chain settles at machine speed. A correction arrives at world speed. The gap
between them is the entire liability.

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

## The window is measured, and priceability is a gate rather than a refusal

`restatementExposure` reads the corpus's own history: 2 restatements over 21
records, the longest arriving **18.3 days** after the record it restates became
knowable.

That measures a window. It does not estimate a frequency, and `ratePriceable` is
**derived from a declared gate** rather than hardcoded — `PRICEABILITY_GATE`
names thresholds (30 restatements, 500 records, a corpus that is not a committed
demonstration) and the function reports which are unmet. So the refusal is not a
permanent `false` that someone eventually deletes: it is a milestone indicator
that flips on its own when the corpus earns it, with the discipline that governed
beforehand governing the number afterwards.

Two questions, two denominators — the same structure as the as-of law, applied to
statistics. `2/21` answers *what has this corpus restated*. A depositor asks
*what will your restatement behaviour be*. Those are different questions over
different populations, and emitting the first as an answer to the second is what
every "99.9% accuracy" claim in the data business actually does. The gate makes
the conflation unrepresentable rather than discouraged, and `andEvenThen` says
that passing the thresholds still does not make a rate about this corpus a rate
about a new source.

### The decision carries its own risk neighbourhood

`ReleaseDecision.exposureAtDecision` attaches the corpus's restatement behaviour
*as it was known at the decision instant* — bounded by the decision's own
knowledge time, so an audit does not have to rebuild the risk context and cannot
rebuild it with hindsight. A release decided 2026-08-20 records that the corpus
had restated nothing yet, and says that this is an absence of observed
corrections rather than evidence that none was coming. The same condition
decided twelve days later records two restatements and the longest lag. The
vehicle's honesty then covers not only what it held but how vulnerable its
holding was known to be.

## Where a release could execute

The vehicle targets a **property set, not a venue**: non-custodial hold,
verifiable release execution, a binding point for an attestation, and a
settlement leg that belongs to somebody else. Any venue with those four can host
one. Naming a chain in the design would bet the architecture on a vendor, and
the routing table already treats engines this way.

Two kinds of attestor, and only one is scarce. An **execution attestor** proves a
program ran on given inputs — reproducible by anyone holding both, which is
exactly the property that lets an attestor set be open, and commodity for the
same reason. It says nothing about whether the inputs described the world: a
verified computation over an asserted fact is a verified assertion. A **fact
attestor** claims something about the world that nobody can re-derive from the
inputs, so its qualification is the estate behind it — and specifically whether
it can still say something useful once the claim is restated. That second half is
the part usually missing, and it is the part this module measures.

`TRUST_ORDER` fixes what governs when the venue brings a trust model of its own.
The adjudication and its receipt come first. A proof, where one is wanted, comes
second — and it says the declared policy ran, not that the policy was right. A
venue feature comes third and is convenience, never ground. An enclave and a
proof both let a counterparty verify without inspecting, which makes them easy to
treat as interchangeable; they are not, because an enclave's assurance terminates
in a manufacturer's attestation chain and a proof's in mathematics. Either is
fine as a venue feature; neither may become the reason a fact is believed.

And the confusion worth naming: **transport verification is not content
testimony.** A verifier that checks a message crossed chains correctly has
verified the message. Nobody in that stack has verified that the condition inside
it was adjudicated rather than asserted. Two verification layers are needed, and
the industry has built the pipe one.

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
