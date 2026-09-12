# What the additions cost, and what one acquisition would move

`src/domain/accommodation.ts`, rendered at [`/model/standing#pm-accommodation`](../src/components/model/StandingChapter.tsx).

Roughly twenty modules landed in a short stretch: the spatial derivations, the
sensor families, the constraint and factor-graph estimation layer, the invariant
filters, the vessel and the port set, the carrier and congruence, the serving
boundary, the actuarial correspondence, the legacy-trade backfill, the scene and
manifold projection tiers. Each states what exists and what does not. None of
them says what the *system* owes as a consequence, which is the question worth
asking when a lot has been added quickly.

This module answers it as data with a test over it, so a capability that
quietly becomes runnable stops being listed as blocked, and a precondition that
quietly stops being met is caught rather than remembered wrongly.

## The shape

A **precondition** is something a capability waits on, of one of five kinds:
corpus content, rights, infrastructure, a method, or an adjudication. A
**capability** names the module it lives in and the preconditions it needs. The
**fit** is derived — `RUNS_TODAY`, `ONE_THING_AWAY`, `SEVERAL_THINGS_AWAY` — and
never declared.

Preconditions about the corpus carry a **probe** that reads the records
themselves, so the declaration cannot drift away from what is committed. The
test holds every declared answer to what its probe returns. Preconditions about
the repository carry a `provenBy` instead, naming what would fail if the answer
changed.

## What the probes found

The probes were written before the answers were checked, and the first one
contradicted what had been written down.

**The corpus already contains exactly one independently corroborated quantity.**
Lot 5B-221's gross weight is claimed twice, by two different sources:

| Record | Source | Value | Stated bound |
|---|---|---|---|
| REC-0203 | `blue-anchor-docs` | 40.0 t | none — "estimate; no stated bound" |
| REC-0204 | `terminal-weighbridge` | 40.12 t | ±0.040 t (40.08–40.16) |

That is the seed of everything the estimation layer describes, and it was
already committed. It is also, under this system's own rule, **not assessable**:
a channel that states no uncertainty is not compared and none is assumed for it.
So the corpus holds one disagreement and it is the kind that cannot be
adjudicated.

That is a sharper statement of the gap than any count of modules. What is
missing is not a second account — it is *a second account that stated its own
bound*. A source that declines to bound itself contributes a number and no test,
which makes stated uncertainty a requirement on any source worth connecting
rather than a nicety.

Everything else the probes found is a variation on the same theme: no subject's
position is declared twice, no event is placed by two channels, no geometry is
areal, no record names an upstream beyond its immediate source, and the corpus's
historical depth is measured in weeks.

## Pressure

`PRESSURE` is the other half: what the additions cost the parts that already
existed, and whether the existing system absorbs it without change. Most of it
is absorbed, because a module that only declares costs nothing.

One is **owed**:

- **Constraints as observations with provenance** need a slot in the record
  schema that does not exist. A constraint declared in a module is not a
  constraint the corpus carries, and the two must not be confused when a solver
  arrives.

One **was owed and has been paid**, which is what this module is for:

- **The third clock** changed every existing caller rather than adding beside
  them. A caller must name which as-of question it is asking, because *what the
  source knew by D* and *what this system held at K* are different questions
  bounded by different clocks. `AsOfQuery` now carries a required `question`
  with no default, so the compiler enumerated every caller that owed one; the
  HTTP route and the MCP tool refuse an unnamed or unrecognised question rather
  than guessing; every answer states the `boundedBy` clock in the domain object
  and in the wire shape; and `WHAT_THE_SOURCE_KNEW` is refused outright as
  `QUESTION_NOT_ANSWERABLE`, because no record here carries a source clock and
  answering it on knowledge time would report what this system held as what the
  source knew. The refusal is decided before rights or validity are consulted,
  so no later check can quietly answer a question that was never answerable.

The strongest thing the additions produced is in the absorbed column: the
independence rule arrived in three unrelated places at once — event closure,
position separation, invariant scoring — each reaching it from its own problem.
Agreement is counted over declared independent groups, never over records or
sources, because counting sources counts republications. A rule three modules
reach independently is a rule rather than a preference.

## What this does not do

It does not acquire anything, does not claim any capability runs, and does not
raise a verification tier. Two of six are reached, and describing a capability
never verifies it.
