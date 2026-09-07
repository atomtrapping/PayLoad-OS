# The punch card, the congruence, and the external grammar

`src/domain/computationCarrier.ts` records a distinction that decides what gets
built: a verifiable-computation stack reached for as a *credibility substitute*
is a different system from one reached for as a *carrier*.

## Not credibility

| The proof reading | The carrier reading |
|---|---|
| Trust the computation because a proof attests it | Preserve the computation because it is reified |
| The proof is the product | The carrier is the product |
| Substitutes for trust in the operator | Records what the operator did |
| Brings a verifier, a circuit and a toolchain to be trusted | Brings no trust assumption at all |

**Credibility in this system lives in the estate, in the human rulings and in the
two clocks.** No cryptography moves it, and a system implying otherwise has
misdescribed its own foundation. The card's job is to carry the record across
decades, not to make it believable — believability was never the carrier's to
supply.

So general zero-knowledge proving of corpus computation is **refused**, with
reasons: it costs real compute against a benefit this system does not need; it
imports a new trust surface (circuit correctness, toolchain versions, setup) in a
system whose entire residual risk is already frame validity; and it answers a
question this audience is not asking, because for a professional performing due
diligence **re-derivation is stronger than verification**. What is kept is the
bounded case: one exact transition, reified, per computation class, optional.

## What makes a card a card

| Property | Here |
|---|---|
| Determinism under serialisation | **Present** — digests, captures and manifests regenerate and compare byte for byte |
| Auditable without re-execution | **Present** — inputs by exact reference, outputs by digest |
| Archivability past the runtime | **Absent** — no decoding specification independent of this repository |
| One shape for every computation | **Absent** — five retained run shapes, not one format |

The two missing are the two that make a card a card.

**The archival test**: is this artifact readable in thirty years with only its
specification? Fixed-point over a frozen minimal instruction set *passes*.
Floating-point *degrades* — order of accumulation, library version and platform,
which is the same disease as an unpinned elimination ordering. Learned-model
inference *fails*: weights are not the execution.

So the waterline, for computations: **punch-card-grade artifacts for the
reasoning paths that feed a ruling; rebuild-from-source for everything else.**

## The card as a geometry

A frozen computation traces a higher-order geometry over the lower-order geometry
of the thing it tracks, and whether they line up is checkable. Three mechanisms
already here are instances of one idea:

- the **innovation gate**, for dynamics — does the world evolve where the belief
  said it would;
- the **reference channel**, for frames — does the model correspond to anything
  outside itself;
- the **disagreement layer**, for sources — can two accounts both be right.

The payoff is an asymmetry. The world arrives noisy, gappy and sometimes
adversarial, and cannot be replayed; a deterministic trace is bit-exact forever.
One side of the comparison never jitters, so a divergence **isolates three ways**:
the world changed (an event), the input changed (a source problem), or nothing
legitimate changed (a tamper signal). That is the argument for freezing at the
ruling boundary specifically.

Three guards: congruence is *declared then measured* (a computation that claims
nothing cannot fail silently); a mismatch *routes, it does not adjudicate*; and
the check is *bidirectional in time* — forward against arriving evidence,
backward by replay.

And the limit, which is the sharpest sentence here: **a manifest is a perfect
mirror of the model, and therefore a perfect mirror of the model's errors.** Exact
execution of a wrong model looks more credible than sloppy execution of a right
one. Two congruences, two guardians — the frozen trace guards fidelity to the
declaration, and only an independent reference guards fidelity to the world.

## Interoperation, and the direction of authority

The deployed object world — scene graphs, building models, geodatabases,
enterprise graph platforms, solver backends — is authoritative object models with
local truth and no provenance discipline. They know what things are; they cannot
say how they know. A manifest-carrying computation is the missing half, and it
attaches without asking them to change: the host's own format carries the
artifact, the provenance rides in a namespaced extension the host may ignore, and
anything holding the specification reconstructs the computation.

The inversion that makes it safe: **import their geometry, not their truth.** A
county layer or a building model is a shape this system measures against its own
belief, and the divergence is a congruence residual — a candidate event, a signal
about that source, an entry in the disagreement layer. Never a silent overwrite.
That is what allows interoperation with arbitrarily strong object systems without
absorbing their epistemics.

Two guards: an export is a projection and never a carrier of authority; and
vendor-format churn is a source-capture problem, ingested as versions of the
source with their own two clocks, so the corpus's answer does not jitter when a
vendor revises a format.

## Composition is adjudication

Which promotes the scene grammar's role, and nothing else. A USD opinion is a
claim by a layer about a prim's attribute; a source makes a claim about an
entity. Composition is an ordered, declared resolution of conflicting opinions —
an adjudication policy. Both systems solve the same problem, *many claims, one
addressable state*, and differ only in the default: USD resolves forward and
silently to the strongest opinion, this corpus preserves the disagreement and
requires a ruling.

That is why the refusals written for the scene target read as native rather than
imposed: they are this system's policy in the medium's grammar.

The promotion is in **role, not authority**. The scene grammar becomes the
external interface to the deployed object world; the observation contract remains
the internal one; the compiler between them is still one row in the routing
table. USD does not become the store. `INTEROP_VOCABULARY` in
`src/domain/usdProjection.ts` is the canonical mapping and the only place the two
vocabularies meet, so a shared grammar does not grow private ones — and whether
to offer any of it to the body stewarding that grammar is the operator's
decision, not one made here.

## Actuaries

`src/domain/actuarial.ts` records why one profession's obligations already are
this doctrine — and three of the correspondences are the same object under two
names: the loss development triangle *is* bitemporality, the valuation-date
statement *is* an as-of answer, and the signing actuary *is* the adjudication
authority wearing a licence. Credibility theory is the disagreement layer a
century old; the data-quality standard concerns exactly what a receipt produces.

The commercial consequence is an inversion: elsewhere provenance must be sold,
here it is already required of the buyer, so the offer is the documentation a
signer would otherwise reconstruct. The restraint that keeps this honest: this
repository names standards and their subjects and **never restates what they
oblige a member to do**, because a supplier paraphrasing a professional duty is
inventing one.

Nothing here has been used by anyone. The mapping has 8 correspondences; the
corpus has no development history, has answered no valuation date, and has no
engagement.

## The serving boundary: what a transport can enforce

`src/domain/servingBoundary.ts` compares an open surface with a tool surface on
five axes, and refuses to claim the one it does not win.

| Question | Stronger |
|---|---|
| What does systematic probing cost the caller? | Tool surface — probing at scale becomes paying at scale |
| What does the caller learn about how the corpus is addressed? | Tool surface — intentions, not the addressing system |
| Does provenance stay attached to the answer? | Tool surface — the receipt rides inside the frame |
| Can the boundary know what the answer is for? | Tool surface — a call can declare a purpose |
| What stops a caller keeping what it received? | **Neither**, and the conversational frame is worse |

The upgrade is intent. A key says who is calling; a tool call can say who and
what for — and this system's rights model has always decided against a purpose
without ever having a transport that could ask. Declaring a purpose is not
proving one; it moves the question from "can this be enforced at all" to "what
happens when a declaration is false", which is a rights and evidence question.

**Serve the corpus under a purpose. Serve the estates never.** Calibration
internals, source-reliability models, the structure of the disagreement layer,
and identity decision records do not leave the wall on any transport. The corpus
is the inventory; the estates are the business.

Every caller is a source in this system's own sense — identified, recorded,
metered — and the three fields that would make that true (a recipient identity,
a request identifier, a served instant) are the same three the metering receipt
is missing. One set of fields, two purposes, neither present.

### Attesting the policy, which is not attesting the corpus

General proving of corpus computation stays refused. This is a different
boundary: the response pipeline — query, rights check, admissibility filter,
shaping, receipt — is a deterministic computation over declared inputs, which is
what a proof guest is. So the thing to prove is not that a fact is true; it is
that **the policy ran**.

That buys verifiable refusal (REFUSED means the policy refused, checkable rather
than described), demonstrable filtering (a caller verifies the declared policy
produced this response from this release, without seeing either), and selective
disclosure — provenance served without substance, which is a better product than
a sample for a caller deciding whether to buy.

It does not answer estate leakage. No cryptography fixes an architecture error:
the estates are safe because they are unserved, not because they are proven
unserved. Doctrine draws the line; a proof shows the line was held.

Three preconditions, each already built for another reason: a deterministic
response computation (a proof over floating-point dispatch is unavailable; over
pinned fixed-point arithmetic it is natural — the archival discipline and the
cryptographic layer share a precondition), the policy as a digest-addressed
artifact, and receipts as first-class objects the proof slots into as one more
grade. Three costs, priced rather than assumed: proving is not free, so it is a
tier and not a default; the guest is a new frame-validity surface, since a wrong
guest proves the wrong policy perfectly; and it enforces a boundary it does not
draw.

## A reasoner over the surface

`src/domain/reasoningWitness.ts`. The pairing is complementary: a reasoner
without the corpus has no epistemic structure — it cannot say which release an
answer came from, cannot separate a claim it read from one it composed, and has
no way to refuse. A corpus without a reasoner has structure and no traversal.

Three rules, **none of them enforced by anything today**:

1. An explanation is a **projection of the ledger, not a generation over it**.
   Every sentence resolves to records; one that resolves to nothing is not an
   explanation.
2. A **tier crossing in a sentence is an authored claim**. "The vessel arrived"
   is a different claim from "berth containment at 04:12, at confidence 0.6,
   superseded twice", and promoting the second into the first crosses a waterline
   in prose where no ruling was made.
3. **Reasoning outputs are candidates**, with a method identity and a version,
   the same shape a parser's output takes.

The surface is safe today because it is read-only, which is not the same as the
rules being held. The reasoner is the most powerful witness in the system and
has no authority in it — the same wall that keeps a solver from deciding an
identity and an audit computation from becoming a corpus fact, with a third
occupant.
