# The governance kernel, and one lifecycle through it

*As of 2026-09-11. Local implementation and recorded execution; not a production attestation, not customer activity, not a provider integration.*

## What this is

The action layer in `src/db/executionLedger.ts` was already the kernel: a proposal, an authorization bound to a corpus release and a state revision, an idempotent operation, an attempt rechecked against the authorization's window, and a reconciliation, with a trigger that stops a retry after an unknown outcome. This work extends that kernel with the pieces that decide whether a person actually authorized the thing that shipped, routes the dossier ledger and the newsroom ledger through it, ties the treasury ledger to its principal registry, and runs one complete lifecycle of each through embedded PostgreSQL — recording every row that went in and every row the database refused, by the name of the constraint that refused it.

The committed receipt is `src/fixtures/governance/demonstration.json`, stamped by `npm run stamp:governance` and held to the ledgers by `src/fixtures/governance/demonstration.contract.test.ts`, which re-runs the three lifecycles and asserts equality. The operator pages `/dossier`, `/newsroom`, `/treasury` and `/control` render that receipt.

## The kernel, as rows

| Concern | Row | What refuses the wrong row |
| --- | --- | --- |
| Authenticated review | `principal(principal_id, kind)`; every `authored_by`, `prepared_by`, `reviewer`, `granted_by`, `revoked_by` is a composite key into it | A name a request supplies that nobody registered is a string, not a principal: `proposal_author`, `review_reviewer`, `authorization_grantor`, `revocation_revoker` |
| Decision packet | `decision_packet`: the exact action as JSON, its sha256, the comparison with doing nothing, the case against | A packet that argues only for itself: `doing_nothing`, `against` non-blank |
| Review of a digest | `proposal_review(proposal_id, reviewed_action_digest, response)` → packet | A review of bytes the packet does not carry: `review_is_of_the_packet` |
| Denial is persistent | one closing response per proposal (`review_closes_once`); a revision names what it revises; the denial line is walked | A second reviewer for a different answer; a split of a denied proposal: `authorization_descends_from_a_denial` |
| Exact-action authorization | `execution_authorization(action_digest, review_response)` → the APPROVE review, by composite key | Approval of an earlier draft stretched over the edited one: `authorization_is_of_the_reviewed_action`; a deferral standing in for approval: `authorization_rests_on_an_approval` |
| Agent cannot grant | `granted_by_kind IN ('HUMAN','POLICY')` | The column will not hold `AGENT` |
| Expiry | `expires_at`, rechecked at the attempt | `attempt_within_authorization` |
| Revocation | `authorization_revocation`, inside the granted window, by HUMAN or POLICY | Any attempt at or after it: `attempt_after_revocation` |
| Dispatch and reconciliation | `execution_operation` (idempotent), `execution_attempt` (outcome, receipt only when confirmed), `attempt_reconciliation` | A retry after an unknown outcome: `attempt_after_unresolved_unknown_outcome` |
| Correction lineage | `operation_proposal.corrects_operation_id` + reason, both or neither | A correction of nothing: `proposal_corrects_a_real_operation` |

Forty-nine tests in `executionLedger.test.ts`. Each new trigger, index and key was removed or shifted by one and failed between one and three of them.

## The three lifecycles

**Dossier** (`src/governance/dossierLifecycle.ts`, over the products stack). A simulated buyer asks three things of the Caravan demonstration corpus. Coverage per facet is a row carrying a quantity level (`NONE`, `THIN`, `SUPPORTED`) and an assessment (`PRESENT`, `STALE`, `CONFLICTING`, `MISSING`, `DISALLOWED`), with one evidence row per artifact beneath it — see the section below. The estimate is a count of units by a named method over the present artifacts; the quotation is units at an approved policy's rate with a CHECK that the amount is their product. The customer accepts the quotation by digest; a steward approves the compiled release by digest; the release row names both authorizations. The one conclusion rests on the one artifact assessed present; the two holes are on the page with their assessment and counts, and the withheld artifacts are named without their claims. Delivery is an execution attempt whose receipt is marked `SIMULATED_LOCAL` and reconciled as such. Version 2 corrects version 1's not-covered sentence — it omitted the three records the corpus had taken back before the run, an omission in the run's own record and in the ledger's `retracted_record` table — as a new proposal naming version 1's delivery operation, reviewed and authorized again, released as a successor with the reason on the row. Version 1 stands. Fourteen refusals observed.

**Editorial** (`src/governance/editorialLifecycle.ts`, same stack). A story candidate rests on a concentration artifact. Four named reviewers answer the four questions, and the release is refused while privacy has not (`3_of_4`). The article is a message — headline, claims, chart, qualifiers, channel text — reviewed in the kernel by digest and archived with that digest and channel. The post is a second message, reviewed as itself, authorized as itself, released for its channel, and **withheld**: real external execution is disabled, so no publication row for it exists. A simulated repeater's observation descending from the article is refused as corroboration of the finding the article came from. Both messages are scanned for the dossier's customer and dossier identifiers. Eight refusals observed.

**Treasury** (`src/governance/treasurySimulation.ts`, its own database on the treasury stack). Accounts, provider and balance are simulated and say so. One proposal goes through all four terms and reconciles against a simulated receipt. One is denied on the reserve; its split, approved by a second reviewer, is refused at authorization. One is revoked; one is left to expire; two are approved into a blocked and an unresolved asset and refused all the same. The agent granting its own proposal is refused by the column; a hold larger than the surplus by the chain; the concurrent-hold race by `reservation_one_successor`; money leaving the entity before it is a proposal. One dispatch ends `OUTCOME_UNKNOWN` with a reconciliation that says `STILL_UNKNOWN`, carried as unresolved. Eleven refusals observed.

**Spatial** (`src/discovery/spatialComparison.ts`). The baseline-versus-scenario comparison over the synthetic floor is written as a discovery workload run and artifact. Its rights are derived from the fixture's source registration in the corpus's rights vocabulary — the registration permits `SPATIAL_INQUIRY` to an `INTERNAL` audience by `INGEST` and `DERIVE`, which is none of the nine corpus uses, so the rights list is empty and the receipt carries the nine denials with their reasons. The RISK facet's coverage names it and assesses it `DISALLOWED`; no conclusion rests on it, and the ledger refuses one that tries. The baseline receipt's digest is read before and after the scenario runs and both are reported; the test asserts they are one value.

## Coverage assessment

Mandate §8 asks coverage to distinguish present, stale, conflicting, missing and disallowed evidence. It is two columns on `dossier_coverage` and a table beneath it, and the database derives all three.

| Where | What | Held by |
| --- | --- | --- |
| `dossier_spec.required_right` | The corpus use a delivery of this dossier exercises (`customer_delivery`) | `CHECK (required_right IN <PERMITTED_USES>)` |
| `dossier_coverage_evidence` | One row per artifact bearing on a facet: artifact, run, assessment, why | `evidence_assessment_is_the_artifacts` recomputes the assessment at commit from the artifact's rights against `required_right`, then a corrected input (`retracted_record`, `CORRECTION`, issued by `assessed_at`), a disagreeing artifact on the same facet about the same subject, or a `FALSIFIED` validation, then a horizon ended by `assessed_at` or a withdrawn input; and refuses an artifact computed after `assessed_at` |
| `dossier_coverage.assessment` + four counts | The facet's headline and how many artifacts carry each assessment | `coverage_assessment_is_the_rollup`: `MISSING` when nothing bears on it, else worst-first — `CONFLICTING`, `STALE`, `DISALLOWED` — and `PRESENT` only when every artifact is |
| `dossier_coverage.level` | How much usable evidence: `NONE` / `THIN` / `SUPPORTED` | `coverage_level_counts_the_present`: `NONE` when no artifact is present, `SUPPORTED` at two or more present from two or more runs, `THIN` between |
| `dossier_coverage` ↔ its evidence | Same artifacts, same counts, same runs | `coverage_matches_evidence` and `evidence_matches_coverage`, from both sides, so a coverage row cannot outrun its evidence and an evidence row cannot arrive after the count |
| `dossier_conclusion` | Rests on evidence | `conclusion_rests_on_present_evidence`: the artifact is assessed `PRESENT`, for that facet, in that dossier, at an assessment no later than the release's build |

Discovery ledger rights are held to the same vocabulary: `artifact_rights_are_permitted_uses` and `input_rights_are_permitted_uses` refuse a source-policy operation name in a rights column, which is how a `DISALLOWED` can only ever be about the delivery right and never about two vocabularies failing to match.

The domain (`src/domain/dossierService.ts`: `assessEvidence`, `rollupAssessment`, `coverageLevel`) computes the same three things in the same order, and the lifecycle test checks that what it wrote is what the database holds. Seventy-seven tests in `dossierLedger.test.ts`; every guard branch and CHECK was removed or reordered one at a time and failed between one and forty-three of them.

Not modelled: re-assessment. One coverage row per facet, assessed once at `assessed_at`; a build after the corpus moved does not re-read the evidence, and nothing says what a release after an artifact's horizon ends means. The state ledger's `recorded_contradiction` is keyed on operational subjects and has no bridge to artifact subjects, so `CONFLICTING` here comes from the corpus's corrections, from disagreement among artifacts on the facet and from refuted validation, not from that table.

## What the receipt says it is not

Every `notClaimed` line is a field on the receipt and a line on `/control`: no customer, no money, nothing posted, nothing validated, no approval supplied by a request, nothing approved by silence.

## Where the mandate is ahead of the code

- **Re-assessment and the state ledger's contradictions** (§8): coverage is assessed once per facet; a corrected corpus after the quote is a new dossier, not a refreshed row; and `recorded_contradiction` does not yet reach an artifact's subject (see the coverage-assessment section).
- **Price, cost, quote acceptance, production, delivery and customer outcome as separate records** (§8): price, acceptance, production, delivery are rows; cost and customer outcome are not modelled.
- **Oversight modes** (§7: envelope-governed, human-required, supervised, blocked) are not a vocabulary in `executionEnvelope.ts`; the demonstration exercises the human-required and blocked cases without naming them.
- **Authentication** here is registration: a principal is a row with a kind. Nothing verifies that the person named is the person acting; that is the operator interface's and its session's to prove, and neither exists for these pages.
- **Scope acceptance expiry**: the customer's acceptance carries an expiry like every authorization, and nothing yet says what a release after it means.

## Regenerating

```
npm run stamp:governance      # two embedded PostgreSQL databases, ~20 s; rewrites the committed receipt
npx vitest run src/governance src/db src/fixtures/governance src/components/governance
```
