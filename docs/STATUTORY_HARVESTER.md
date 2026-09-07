# The statutory filing harvester

The insurance-regulator rail: from bytes somebody kept to records the corpus
holds, with the admission gate in the middle rather than beside it.

`/harvester` is the workspace, `/api/v1/insurability/harvester` is the endpoint,
and both run the same pipeline through `src/adapter/statutoryHarvester.ts`
because a page that reported different counts from the endpoint under it would
be the more convincing of the two while being wrong.

## Why it exists

`/api/v1/insurability/filings` reports its records honestly:

```
records: { admitted: 0, candidate: 0, quarantined: 0, synthetic: N }
```

Nothing statutory had ever crossed the admission gate. The gate existed
(`src/domain/admission.ts`), identity resolution existed
(`src/domain/identityResolution.ts`), world-time establishment existed
(`src/domain/worldTime.ts`), and the projection from rail shape to assertion
shape existed (`src/domain/candidateProjection.ts`). What was missing was a
source that could reach them.

## The first rail that reaches ADMITTED

`candidateProjection` names two absent stages, and both refuse the census rail:

- **`SUBJECT_IDENTIFIED`** — a company name is not an issued identifier, and
  nothing binds it to a canonical subject.
- **`BOTH_CLOCKS`** — a snapshot of a register establishes when it was read, not
  when the fact became true.

A regulator's filing supplies both, as testimony rather than inference:

- The order names an **NAIC company code**, which the National Association of
  Insurance Commissioners issues. `IdentifierFamilyId` gained `NAIC` for it.
  Resolution is then a lookup against evidence rather than a guess at a name.
- The order **declares its own effective date**. That is
  `SOURCE_DECLARED_EFFECTIVE`, the one kind of time evidence `worldTime` resolves
  cleanly, because a regulator stating when its own rule takes legal effect is
  the one question a regulator is authoritative on.

So the statutory rail reaches the gate with both clocks and a resolved subject,
and passes on the merits. **No check was relaxed to get there**, and the
specimens deliberately include two filings that fail.

## Five stages

| Stage | Module | What it does |
| --- | --- | --- |
| Capture | `statutoryHarvest.captureSuppliedDocument` | Takes supplied bytes, computes a digest over exactly those bytes, records the declaration. Never fetches. |
| Extract | `statutoryHarvest.extractFiling` | Applies the jurisdiction's declared header grammar. Four presence states. |
| Candidate build | `statutoryAdmission.buildStatutoryCandidates` | Resolves identity, establishes world time, projects to one candidate per stated field, under a knowledge horizon. |
| Admit | `statutoryAdmission.admitStatutoryBuild` | Rules on every candidate at the gate; returns a `StatutoryAdmissionReceipt`. |
| Serve | `statutoryServing` | `serveAdmittedAsOf` and `serveInForceAsOf` — two questions, two functions. |

## Where it begins, and why not earlier

Capture begins at bytes the operator supplies. Nothing in the rail fetches,
polls, logs in or schedules, and there is **no code path from this module to a
network** — a test asserts the absence rather than a comment claiming it.

Collection against a live regulator is the operator's act, under the operator's
credentials and the operator's reading of the source's terms. A harvester that
reached out on its own behalf would be making that decision for them.

That is also why `beganAs` is required and never inferred. This module cannot
tell an operator's capture of a real order from a drafted specimen — the bytes
look the same — so it refuses to guess and carries the declaration through to
the served payload. A reader who wants to know whether a record descends from a
real filing reads the declaration. If the declaration is wrong, that is a lie
somebody told, which is a different failure from a system that quietly assumed.

## The grammar is declared, not discovered

Each jurisdiction prints its header fields with its own labels, declared per
jurisdiction in `JURISDICTION_GRAMMAR`:

| Field | FL OIR | CA CDI | TX TDI |
| --- | --- | --- | --- |
| `orderReference` | `Case No` | `Bulletin No` | `Order No` |
| `carrierNaic` | `NAIC Company Code` | `NAIC Company Code` | `NAIC Number` |
| `carrierName` | `Respondent` | `Addressee` | `Insurer` |
| `issuedDate` | `Filed` | `Issued` | `Signed` |

A parser that discovered its own field names would be inventing vocabulary,
which is the same mistake `candidateProjection` refuses when it declines to
derive a predicate from a field name.

Only labelled header lines are read. A filing that states its effective date in
a paragraph yields `ABSENT`, is refused on the clocks, and is **not** rescued by
a regular expression over English.

## Four answers, not two

A field is `PRESENT`, or it is one of three different kinds of absence, and
collapsing them would throw away the part that matters.

- **`ABSENT`** — the label does not appear. The document says nothing about
  this, which is not the document saying zero, none or unknown.
- **`MALFORMED`** — the label appears and the value does not read as the declared
  kind. A filing whose effective date this parser cannot read *has* an effective
  date; the printed text is kept.
- **`AMBIGUOUS`** — the label appears more than once with different values.
  Taking the first would settle a contradiction on document order, which is the
  tiebreak `identityResolution` already refuses for the same reason.

## What is a claim and what is a coordinate

Five of the ten extracted fields become claims about the carrier. The other five
are never admitted as ones:

| Field | Role |
| --- | --- |
| `filingType`, `lineOfBusiness`, `primaryPeril`, `policiesImpacted`, `capacityReductionPct` | Claims. One candidate each, ruled on separately. |
| `carrierNaic`, `carrierName` | Identity, consumed by resolution. |
| `effectiveDate` | Valid time. A coordinate of the claims, not a claim. |
| `issuedDate` | Source time — the third clock. |
| `orderReference` | Basis, carried onto every claim so a reader of one row can name the document. |

One consent order is therefore five records about one subject, admitted or
refused independently. A structural test holds that every grammar field is
either a declared predicate or a declared non-assertion, so a new field cannot
be added without deciding which it is.

## The specimens

Four drafted documents in `src/fixtures/insurability/statutoryFilings.ts`. Every
one declares `beganAs: 'DRAFTED_SPECIMEN'`; the carriers are invented and the
NAIC codes sit in a `99xxx` range no company holds.

| Specimen | Outcome | Why |
| --- | --- | --- |
| FL-1 consent order | **ADMITTED_WITH_CONDITIONS** ×5 | Issued NAIC code, declared effective date, every claim field legible. Passes all ten checks. |
| CA-1 bulletin | REFUSED on `SUBJECT_IDENTIFIED` ×4 | Addressed to a class of insurers. The corpus has no subject called "every admitted insurer writing in the affected ZIP codes", and manufacturing one would invent a party. |
| TX-1 commissioner's order | REFUSED on `BOTH_CLOCKS` ×5 | Effective date conditioned on the exhaustion of appeals. `MALFORMED`, not absent — and a condition is not a time. |
| FL-2 amendment | Excluded by the cutoff | Knowable after the build's horizon. A build states what it knew. |

Note that TX-1's identity **resolves** and CA-1's world time **establishes**. The
refusals do not smear: each names exactly the check that failed.

## Two clocks, two questions

`serveAdmittedAsOf` bounds on knowledge time alone — what this system knew by
then, which is the leak-free question. `serveInForceAsOf` additionally bounds on
valid time — what was in force in the world.

They are separate functions because they are separate questions. FL-1 is filed
on 2026-02-10, knowable on 2026-02-12 and effective on 2026-04-01: in the
knowledge-time answer for March, out of the valid-time answer for March.
Conflating them would report a withdrawal as effective two months before it was.

The workspace gives each its own control for the same reason. A single slider
that moved both would quietly conflate them.

## The API

```
GET /api/v1/insurability/harvester?asOf=<instant>&inForceAt=<instant>
```

Runs the drafted specimens and serves what the corpus holds at those clocks.
The payload carries both `provenance.crossedTheGate` (these rows passed all ten
checks on the merits) and `provenance.beganAs` (what the supplier declared the
bytes to be), because either fact alone would mislead.

```
POST /api/v1/insurability/harvester
{ documents: [{ declaration, text }], registry, buildId, knownThrough, context, authority }
```

Runs the same pipeline over bytes the caller supplies. There is no parameter
that would make it fetch. It refuses, rather than defaults:

| Refusal | Because |
| --- | --- |
| `NO_AUTHORITY_NAMED` | Admission is an act with an author, and this route will not name itself — the gate refuses `AUTHORITY_IS_NOT_THE_PROCESS` anyway. |
| `NO_DECLARED_CONTEXT` | It will not decide whether a caller may use a source. |
| `NO_KNOWLEDGE_HORIZON` | A build states what it knew, so the horizon is required rather than assumed to be now. |
| `NO_DOCUMENTS` | It never fetches; the bytes come from the caller. |

An empty registry admits nothing and says why: *that is the registry being
empty, not the filings being wrong.*

## What it does not do

- It does not collect. Ever, by any parameter.
- It does not read PDFs, understand prose, or infer a field from a sentence.
- It does not verify that the carrier will do what the order says, or that the
  order will survive appeal. Admitting a filing says the regulator published it
  and this system read it correctly.
- It does not produce bracketed world times. A filing is issued once; a bracket
  comes from re-reading a register that changed between reads. The branch is
  handled rather than assumed away, and a test asserts the absence so nobody
  goes looking for one.
- It does not yet handle supersession: FL-2 amends FL-1, and at a later horizon
  both stand as separate assertions at different valid times. Wiring
  `SUPERSESSION_IS_ABOUT_THIS_RECORD` through the build is the next joint.

## Verification

80 tests, all passing:

| File | Tests | Holds |
| --- | --- | --- |
| `src/domain/statutoryHarvest.test.ts` | 23 | Digest over supplied bytes; the network absence; four presence states; what a value must read as; how a line is matched. |
| `src/domain/statutoryAdmission.test.ts` | 29 | All ten checks pass on FL-1; the two refusals and that they do not smear; the horizon; three distinct clocks; claims vs coordinates; the authority check; receipt determinism; the two serving questions. |
| `src/app/api/v1/insurability/harvester/route.test.ts` | 18 | The declared surface; both clocks; every refusal path; batch and size caps; digest reproducibility. |
| `src/components/insurability/StatutoryHarvester.test.tsx` | 10 | The funnel; the excluded filing; the refusal tally; both clock controls; the inspector's `ABSENT` / `MALFORMED` distinction. |

The verification ladder at `/api/v1/status` moved accordingly, and the wording
is deliberate: rung 4 is `VERIFIED_ON_SUPPLIED_BYTES` (the cycle runs; collection
stays the operator's), rung 5 is `VERIFIED_ON_SPECIMENS` (re-running reproduces
the receipt digest; four drafted documents is determinism demonstrated, not
determinism demonstrated at scale).
