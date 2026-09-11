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

**Dossier** (`src/governance/dossierLifecycle.ts`, over the products stack). A simulated buyer asks three things of the Caravan demonstration corpus. Coverage per facet is a row with `NONE` as a level and the artifacts it counts named in the row; the estimate is a count of units by a named method; the quotation is units at an approved policy's rate with a CHECK that the amount is their product. The customer accepts the quotation by digest; a steward approves the compiled release by digest; the release row names both authorizations. Delivery is an execution attempt whose receipt is marked `SIMULATED_LOCAL` and reconciled as such. Version 2 corrects version 1's not-covered sentence — it omitted the three records the corpus had taken back before the run, an omission in the run's own record — as a new proposal naming version 1's delivery operation, reviewed and authorized again, released as a successor with the reason on the row. Version 1 stands. Eleven refusals observed.

**Editorial** (`src/governance/editorialLifecycle.ts`, same stack). A story candidate rests on a concentration artifact. Four named reviewers answer the four questions, and the release is refused while privacy has not (`3_of_4`). The article is a message — headline, claims, chart, qualifiers, channel text — reviewed in the kernel by digest and archived with that digest and channel. The post is a second message, reviewed as itself, authorized as itself, released for its channel, and **withheld**: real external execution is disabled, so no publication row for it exists. A simulated repeater's observation descending from the article is refused as corroboration of the finding the article came from. Both messages are scanned for the dossier's customer and dossier identifiers. Eight refusals observed.

**Treasury** (`src/governance/treasurySimulation.ts`, its own database on the treasury stack). Accounts, provider and balance are simulated and say so. One proposal goes through all four terms and reconciles against a simulated receipt. One is denied on the reserve; its split, approved by a second reviewer, is refused at authorization. One is revoked; one is left to expire; two are approved into a blocked and an unresolved asset and refused all the same. The agent granting its own proposal is refused by the column; a hold larger than the surplus by the chain; the concurrent-hold race by `reservation_one_successor`; money leaving the entity before it is a proposal. One dispatch ends `OUTCOME_UNKNOWN` with a reconciliation that says `STILL_UNKNOWN`, carried as unresolved. Eleven refusals observed.

**Spatial** (`src/discovery/spatialComparison.ts`). The baseline-versus-scenario comparison over the synthetic floor is written as a discovery workload run and artifact, and the RISK facet's conclusion rests on it. The baseline receipt's digest is read before and after the scenario runs and both are reported; the test asserts they are one value.

## What the receipt says it is not

Every `notClaimed` line is a field on the receipt and a line on `/control`: no customer, no money, nothing posted, nothing validated, no approval supplied by a request, nothing approved by silence.

## Where the mandate is ahead of the code

- **Coverage assessment** (Mandate §8) distinguishes present, stale, conflicting, missing and disallowed evidence. `dossier_coverage` carries a quantity level (`NONE`, `THIN`, `SUPPORTED`) and a basis sentence; the five-way distinction is not yet a column.
- **Price, cost, quote acceptance, production, delivery and customer outcome as separate records** (§8): price, acceptance, production, delivery are rows; cost and customer outcome are not modelled.
- **Oversight modes** (§7: envelope-governed, human-required, supervised, blocked) are not a vocabulary in `executionEnvelope.ts`; the demonstration exercises the human-required and blocked cases without naming them.
- **Authentication** here is registration: a principal is a row with a kind. Nothing verifies that the person named is the person acting; that is the operator interface's and its session's to prove, and neither exists for these pages.
- **Scope acceptance expiry**: the customer's acceptance carries an expiry like every authorization, and nothing yet says what a release after it means.

## Regenerating

```
npm run stamp:governance      # two embedded PostgreSQL databases, ~20 s; rewrites the committed receipt
npx vitest run src/governance src/db src/fixtures/governance src/components/governance
```
