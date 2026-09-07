# Estimation: one joint, its constraints, and what may not decide identity

Four machineries in this repository have been describing one object: the
estimator, the constraint stack, the hierarchical aggregation the cell complex
implies, and the measurement economy. The object is a **factor graph** — a joint
belief expressed as a product of factors, `p(x) ∝ ∏ fᵢ(xᵢ)` — and naming it
collapses four contracts into one.

`src/domain/constraints.ts`, `src/domain/factorGraph.ts` and
`src/domain/invariantScoring.ts` carry this as data; `/model` renders it.
**Nothing here solves anything.** No factor is declared, no constraint is
enforced, no verdict is retained, and no solver is installed.

## A constraint is a measurement with provenance

The identity that decides where constraints live: a hard equality constraint
`Cx = c` is a measurement update with `H = C`, `R = 0`, `z = c`. A soft
constraint is the same update with `R > 0`.

So a conservation identity, a cadastral rule, a zoning ordinance and a unit
conversion are not solver configuration. They are declared, versioned,
bitemporal claims with sources, and the constraint versions in force belong in
the release manifest — because a release computed under a different constraint
stack is a different release.

`R = 0` is never a literal zero: it makes the innovation covariance singular.
The projection form is the well-conditioned limit of the same operation.

| Method | Verdict |
|---|---|
| Projection onto the constraint surface, Joseph form | **Recommended** — keeps the filter linear-Gaussian and enforcement a separate, digestible stage |
| Constraint as a pseudo-measurement with declared `R_c` | Accepted — the form every soft constraint takes |
| Reparameterization (log, angle, simplex) | Case by case — elegant where it fits, and it makes the model nonlinear |
| Clamping the estimate to the bound | **Forbidden** — ignores the covariance and corrupts the posterior silently |

### Harvest certainty in proportion to declared confidence

A hard constraint reduces the covariance by `rank(C)` for free, and that
reduction is real *only if the constraint is true*. A wrong hard constraint
manufactures certainty the estimator then defends: contradicting evidence is
absorbed elsewhere in the state, innovations stop looking anomalous, and the
wrongness becomes structural rather than accidental.

- **Hard** — definitional identities only: unit conversions, sum of shares.
  Arithmetic, not a claim about the world.
- **Stiff-soft** — real-world laws with a declared residual. Mass balance is
  stiff-soft, because facilities leak, meters drift and unmodelled flows exist.
- **Soft** — everything measured, surveyed or regulatory, with `R_c` from one
  minus the declared confidence.

Declared constraint noise is the same honesty lever process noise is.

### The violation tape

The residual `r = c − Cx̂` has covariance `C P Cᵀ`, so the same gate that watches
a measurement watches a constraint. A constraint that keeps being violated is
**not noise** — it is evidence the constraint is wrong, and it enters the
ordinary adjudication path as a candidate for supersession with its violations
as the proof. Which declared constraints failed, when, and against what, is an
estate rather than a log. Where something material rides on it, run the analysis
with and without the constraint stack and report the delta.

### Inequalities

The posterior under an inequality is a truncated Gaussian: not Gaussian, no
closed form, so any Gaussian answer under an inequality is an approximation and
must say so. In order of effort: per-dimension truncated moments for box
constraints; an active-set QP for a general polytope; or — usually correct —
leave the belief unconstrained and constrain the *action*. A state constraint and
an action constraint are different objects: "clearance ≥ 0" is a decision
boundary, not a fact about the world.

## The graph is the joint

| In the thread | As a factor |
|---|---|
| Gaussian measurement | A factor whose noise model is the measurement covariance |
| Soft constraint | A weighted factor |
| Hard constraint | A zero-noise factor, implemented as the projection |
| Declared dynamics between epochs | A motion factor chaining epoch variables |
| Hierarchical rollup between cell levels | Restriction and prolongation factors |

Three properties make it worth naming:

**Disagreement is representable.** Two sources disagreeing about a capacity are
two factors pulling one variable, and the posterior widens to reflect genuine
conflict. A pipeline that averages them reports a number no source asserted with
a confidence neither earns. The corpus already carries conflicting records and
already reports two declared positions that cannot both be right; nothing
computes a joint over them.

**Marginals are free**, so the value of a prospective measurement is a query:
insert the candidate factor virtually and measure the shift in the marginal of
the decision variable. A watchlist becomes a standing query over marginal
changes, and alerting an event of the solved graph rather than a polling job.
This decides which *measurement* to buy, not which sensor to own.

**As-of is elimination** over retained factors: a belief rebuilt from canonical
state per query, cached, invalidated on a release bump, never authoritative.
Both clocks survive the translation.

### Two disciplines, written before the first solve

1. **Correct is not reproducible.** Elimination orderings are heuristic, ordering
   changes floating-point accumulation, and two orderings produce
   different-but-both-correct posteriors. That is fine mathematically and fatal
   for a digest-based receipt. So the elimination ordering is a declared
   parameter, the solver version is pinned beside it, both go in the computation
   receipt, and posterior digests are verified across replays. At fixture scale
   the sequential form is exactly reproducible by construction and more
   receipt-transparent than a batch solver.
2. **A solver never decides an identity.** Estimation is over continuous
   variables. Whether two identifiers name one carrier is discrete,
   combinatorial and adjudicated by a person with stored reasons. A tight
   marginal between two candidate identities is exactly the scored evidence the
   resolution layer should consume — but the decision stays in the identity
   estate. The solver informs the corpus; the corpus never delegates authority to
   the solver. Same invariant as an audit computation never becoming a corpus
   fact.

GTSAM is a **candidate** solver for the factor layer, not a new architecture. The
representation comes first: factors as typed, provenance-bearing objects with
both clocks and a noise model are valuable before any solver exists, because they
are the schema the estimator, the complex and the measurement economy all want to
write into.

## Scoring by what a record survives

Data earns credence by surviving declared checks — consistency-based
epistemology, the way replication and metrology work. Four tiers:

| Tier | What a pass is worth |
|---|---|
| Structural: type, unit, both clocks, provenance | The record is well-formed. Nothing whatever about whether it is true |
| Cross-source: disagreement bounds, corroboration | Worth exactly as much as the agreeing sources are independent |
| Model: conservation residuals, innovation gates | A statement about the model as much as about the observation |
| Reliability priors fitted from the verdicts | **This is the tier that compounds** |

Recording the verdicts is what makes this an estate rather than a gate: a gate
rejects bad rows; an estate learns which sources produce bad rows, with a
history, and that history is evidence a promotion decision consumes — never an
authorization.

### Where it stops being sufficient

Invariants validate coherence with a declared model, not correspondence with
reality. A perfectly self-consistent corpus can be uniformly wrong.

- **Correlated failure masquerading as confirmation.** Five sources agreeing
  while syndicating one original measurement pass every cross-source invariant.
  *Weight corroboration by independent provenance paths, never by the count of
  agreeing sources.* That weighting needs an upstream lineage per source, and
  this corpus has none: a record's provenance names the artifact **this** capture
  came from, and a source registration names licence, purposes and retention.
  Neither says whether one source republished another's measurement — so until
  lineage exists, agreement between sources is not down-weighted, it is not
  counted as evidence at all.
- **The invariants are themselves beliefs.** A constraint stack, a corroboration
  threshold and a disagreement bound are declared models with versions. *They
  carry provenance, versions and their own violation tape, and every score
  reports which invariant set version produced it.*
- **Consistency is not correspondence.** *Only an independent reference channel
  touches the world rather than the model of the world.*

### The firewall

References are structurally separated from the invariant scoring. **A reference
must never become an invariant input**, or the benchmark trains the test and the
system becomes one that cannot be surprised. Filters refine belief inside the
declared frame; references calibrate whether the frame corresponds to anything.

The posture is not "filters, therefore safe to promote". It is "filters,
therefore safe to promote, calibrated by an independent channel the filters
cannot contaminate."

Here: verification is internal recompute, stated as such on every release. V3,
independent recomputation, is not reached. No independent reference measurement
exists, no held-out ground truth is retained, and no backtest against outcomes
runs.
