# The vessel, the port set, and what a closure residual is worth

Caravan's core is not a feed of positions. `src/domain/vessel.ts` and
`src/domain/portSet.ts` declare the types that core will be written in, before
the first position arrives — because typing them afterwards means unpicking
every record that was ingested under the wrong assumption.

**Nothing is acquired.** No AIS, no radar, no optical, no port-call record, no
charter. No vessel is held, no port is declared, no membership is adjudicated.

## The vessel is the state the other families were defined around

Meteorology drives it, satellite and ranging see it, dispatch commands it. Its
state is position, course and speed, heading, draft — and set and drift, the
current it moves in, **estimated as state rather than treated as nuisance**,
because as nuisance it becomes noise attributed to the vessel and it corrupts
the speed signal, which is the freight signal.

Only position is carriable today. Draft is the component with the highest ratio
of signal to acquisition cost: a draft change at a berth is loading or discharge,
which is the cargo event without a cargo document.

### Dispatch is a prior, not an observation

Four channels observe: AIS (self-reported, gappy, spoofable — the claimant's
evidence class, not a disinterested one), radar (fixes a hull without naming it,
so association is a resolution decision), optical (gated by cloud and night, so
an absence there is explained rather than missing), and port-call records
(latent, and not independent of the berth geometry the same terminal declares).

The fifth is not an observation at all. A declared destination is an intention,
and in shipping a famously strategic one. Typed as a prior, its divergence from
the track is signal held as a disagreement between two beliefs. Typed as a fix,
the same divergence becomes a correction and the signal is destroyed.

### The metric is the closure residual

Position is what the aggregators already sell. What no single-channel holder can
produce is the spread between five accounts of one event — which channel led,
which lagged, which lied. That residual is three things at once: the calibration
estate, the parametric event clock, and the signal layer, because dispersion
across channels indicates congestion before any single channel confirms.

The mechanism is `src/domain/eventClosure.ts` — position separation moved from
metres to seconds, keeping the three-valued vocabulary, the refusal where a
channel states no uncertainty, and dependency groups **declared rather than
inferred**. Radar and optical share weather gating; a port-call record and a
dispatch ETA can both descend from the terminal's own declarations. Agreement is
counted over independent groups, because counting channels is counting
republications.

## A port is a time-indexed set

Not a polygon. A membership function that evolves: which vessels are alongside,
at berth, at anchorage, in the approach, in the queue, or out — at a stated
instant, on both clocks.

**Membership is a ruling.** Containment at an instant is ambiguous —
approaching, manoeuvring, waiting — so a transition carries an evidence class, a
confidence and the observations that decided it, and a later observation
supersedes it rather than overwriting it. A vessel adjudicated at berth and
later shown to have been anchored inside the berth zone is a correction on the
set, and every aggregate computed under the old call is downstream of it.

**Both clocks, and they differ by hours per channel.** The port state as of a
knowledge instant is a distinct, reconstructable object from the final state, and
that difference is the whole reason a set series can be backtested: what was
knowable about queue depth before a rate moved is answerable only if the
adjudication stamped its own knowledge time when it was made.

| Set object | What it prices |
|---|---|
| Berth occupancy sequence | Real capacity: observed utilization, not nameplate |
| Queue depth series | Congestion before it reaches waiting times |
| Turnaround distribution | Operational state; slow degradation is the early sign |
| Composition by identity | Share shifts before they are announced |
| Draft-transition ledger | Throughput without a customs document |
| Arrivals against departures | Flow conservation on the set, stiff-soft |

Every one is a series, so the estimator reads them directly: occupancy is a state
with dynamics, queue depth a driven process whose innovation spectrum separates
scheduled congestion from capacity erosion from an event, turnaround a
distribution whose regime is the object of interest.

And they are **projections**, not stored state — rebuildable from the membership
ledger, versioned with the release, digest-pinned. If occupancy were stored, a
superseded ruling would leave a series that no longer follows from anything.

### The joins are set intersections in time

Weather (attributed against unexplained downtime), imagery (two residuals: hulls
present and not in the set, which is the off-transponder economy; and set members
not imaged, which is coverage accounting and **must render void as void**),
dispatch at fleet scale (a carrier reliability metric rather than a voyage one),
documents (the cross-line join in one operation — filings and labour events
against the set's own dynamics — where *coincidence in time is not attribution*),
and port pairs (the corridor, which needs an identity carried across both sets).

### The construction lifts

Port, corridor, lane, network: one grammar and one correction path for four
scales, rather than a bespoke model per scale. The port is the base case.

## What is actually being claimed

The inputs are commodities — position feeds, public imagery, filings. The
adjudicated operational state is not, because the governance layer is what makes
utilization, turnaround and dispersion defensible rather than plausible. This is
not cargo and flow estimation, which the established vendors sell and sell well.

And a set history cannot be reconstructed later. Occupancy, queue and turnaround
series for a period nobody recorded are unrecoverable at any budget, which is the
one asset here that only time can buy — and the reason the grammar is worth
declaring before the first feed rather than after.

Under adversary, the defence is not ingestion: nobody out-ingests the position
aggregators, and nobody needs to. It is resolved, cross-channel, longitudinal
identity, which a single-source holder structurally cannot produce — and which
requires the resolution decision object that is still absent.
