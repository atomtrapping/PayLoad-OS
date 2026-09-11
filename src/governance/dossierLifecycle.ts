/**
 * One dossier, end to end, through the ledgers as they stand.
 *
 * request → specification → coverage → deterministic estimate → quotation →
 * accepted scope → build → reviewed release → local delivery receipt →
 * corrected release. Each arrow is a row in a table that already existed, or
 * a row in the kernel, and each is followed by the row that must not go in.
 *
 * WHAT THE CUSTOMER ASKS, AND WHAT IT RESTS ON
 *
 * A simulated buyer asks three things of the Caravan demonstration corpus:
 * who the suppliers are, what the lots depend on, and what would interrupt
 * access to the sampling floor. The first has nothing behind it and the
 * dossier says so — NONE is a coverage level, and the hole is a row. The
 * second rests on the mining engine's concentration artifacts, which are real
 * computations over the committed corpus. The third rests on the spatial
 * comparison, a deterministic workload whose baseline was observed unchanged.
 * Every conclusion points at its artifact by foreign key and is presented at
 * the class it was computed at.
 *
 * TWO APPROVALS, BOTH OF BYTES
 *
 * The customer accepts a quotation: a proposal in the kernel whose packet is
 * the quotation, reviewed and granted by the customer, of its digest. A
 * reviewer approves the release: a second proposal whose packet is the
 * compiled release, of its digest. The release row names both authorizations
 * and both digests, and the ledger refuses a release the customer did not
 * accept, a release edited after review, and a second version under the
 * first version's approval.
 *
 * DELIVERED IS WHAT THE ACTION LAYER RECORDED
 *
 * Delivery is an operation and an attempt in the kernel. The attempt's
 * outcome is CONFIRMED and its receipt is marked SIMULATED_LOCAL, because no
 * customer exists and nothing was sent anywhere; the reconciliation says the
 * same. A row that said "delivered" without an attempt behind it is one the
 * delivery table does not accept.
 *
 * THE CORRECTION IS A NEW RELEASE THAT NAMES WHAT IT CORRECTS
 *
 * Version 1's dependency conclusion stated what it did not cover and left out
 * the three records the corpus had taken back before the run — a true
 * omission, found in the run's own record. Version 2 restates that sentence.
 * It is a new proposal through the same gate, naming version 1's delivery
 * operation as what it corrects, reviewed again, authorized again, released as
 * a successor with the reason on the row, and delivered again. Version 1
 * stands: its rows are not edited, and a reader who acted on it can still see
 * what it said.
 */
import { DELIVERABLE_FOOTER, PROVENANCE_CHAIN } from '@/domain/firmIdentity';
import {
  COVERAGE_LEVEL_UNITS, ESTIMATE_METHOD, coverageLevel, estimateUnits,
  type CoverageLevel, type DossierFacet, type DossierStage,
} from '@/domain/dossierService';
import { sqlArray, sqlText } from '@/db/ddl';
import { digestOf, type GovernanceLedger, type GovernedAct, type Refusal } from './ledger';
import { PRINCIPALS } from './principals';
import type { Seeded } from './seed';

/* The clock is declared, not read. Everything below the spatial run's completion. */
export const DOSSIER_INSTANTS = {
  asked: '2026-09-06T09:00:00.000Z',
  covered: '2026-09-06T09:10:00.000Z',
  estimated: '2026-09-06T09:20:00.000Z',
  quoted: '2026-09-06T10:00:00.000Z',
  accepted: '2026-09-06T11:00:00.000Z',
  built: '2026-09-07T10:00:00.000Z',
  reviewed: '2026-09-07T10:30:00.000Z',
  released: '2026-09-07T11:00:00.000Z',
  delivered: '2026-09-07T12:00:00.000Z',
  reconciled: '2026-09-07T12:05:00.000Z',
  corrected: '2026-09-08T09:00:00.000Z',
  reviewedAgain: '2026-09-08T09:30:00.000Z',
  releasedAgain: '2026-09-08T10:00:00.000Z',
  deliveredAgain: '2026-09-08T11:00:00.000Z',
  reconciledAgain: '2026-09-08T11:05:00.000Z',
  expires: '2026-09-30T00:00:00.000Z',
} as const;

export const DOSSIER_ID = 'DOSSIER-DEMO-1';
export const QUESTION = 'Which specialty-cargo lots in the current Caravan release rest on a single source, what do the samples drawn from them depend on, and what would interrupt access to the sampling floor?';
export const PRICING_POLICY = { policyId: 'PRICING-2026-DEMONSTRATION', unitPriceMinor: 120000, currency: 'CAD', unit: 'facet-coverage-unit' } as const;

export interface CoverageRow { facet: DossierFacet; level: CoverageLevel; artifactsAvailable: number; runsRepresented: number; artifactIds: readonly string[]; basis: string; units: number }
export interface ConclusionRow { facet: DossierFacet; statement: string; notCovered: string; artifactId: string; artifactClass: string; presentedAs: string }
export interface HoleRow { facet: DossierFacet; level: CoverageLevel; basis: string }

export interface DeliveryRecord {
  operationId: string; attemptId: string; outcome: string; venueReceipt: string | null;
  reconciliation: { reconciliationId: string; found: string; basis: string };
  deliveryId: string; recipient: string; receiptBasis: string;
}

export interface ReleaseRecord {
  releaseId: string; version: number; releaseDigest: string; builtSnapshot: string;
  review: GovernedAct; conclusions: readonly ConclusionRow[]; holes: readonly HoleRow[];
  delivery: DeliveryRecord;
}

export interface DossierLifecycleReceipt {
  readonly fixture_only: true;
  readonly simulated: true;
  readonly dossierId: string;
  readonly recipient: string;
  readonly question: string;
  readonly boundToRelease: string;
  readonly stages: ReadonlyArray<{ stage: DossierStage; at: string; wrote: string }>;
  readonly coverage: readonly CoverageRow[];
  readonly estimate: { estimateId: string; method: string; units: number; digest: string };
  readonly quotation: { quotationId: string; policyId: string; unitPriceMinor: number; currency: string; units: number; amountMinor: number; snapshot: string; digest: string };
  readonly scope: GovernedAct;
  readonly releases: readonly ReleaseRecord[];
  readonly correction: { successorVersion: number; predecessorVersion: number; because: string; correctsOperationId: string; proposalId: string };
  readonly refusals: readonly Refusal[];
  readonly counts: { specs: number; coverage: number; estimates: number; quotations: number; releases: number; conclusions: number; deliveries: number; proposals: number; authorizations: number; attempts: number; refusals: number };
}

const { customer, otherCustomer, steward, secondReviewer, agent } = PRINCIPALS;

export async function runDossierLifecycle(ledger: GovernanceLedger, seeded: Seeded): Promise<DossierLifecycleReceipt> {
  const T = DOSSIER_INSTANTS;
  const stages: Array<{ stage: DossierStage; at: string; wrote: string }> = [];
  const stage = async (s: DossierStage, at: string, wrote: string) => {
    await ledger.write(`UPDATE dossier_spec SET stage = '${s}' WHERE dossier_id = ${sqlText(DOSSIER_ID)}`);
    stages.push({ stage: s, at, wrote });
  };
  const refusalsBefore = ledger.refusals.length;

  /* ── request → specification ── */
  const facets: DossierFacet[] = ['SUPPLIER_IDENTITY', 'DEPENDENCY', 'RISK'];
  await ledger.write([
    `INSERT INTO dossier_spec VALUES (${sqlText(DOSSIER_ID)}, ${sqlText(customer.principalId)}, ${sqlText(QUESTION)}, 'SPEC', '${T.asked}')`,
    ...facets.map((facet) => `INSERT INTO dossier_facet VALUES (${sqlText(`${DOSSIER_ID}-${facet}`)}, ${sqlText(DOSSIER_ID)}, '${facet}')`),
  ].join(';\n'));
  stages.push({ stage: 'SPEC', at: T.asked, wrote: `dossier_spec ${DOSSIER_ID}, ${facets.length} facets` });

  /* ── coverage: what the inventory holds, per facet, named ── */
  const lotArtifacts = seeded.caravan.run.result.artifacts.filter((a) => a.subject.startsWith('LOT-')).map((a) => a.artifactId);
  const assessed: Array<{ facet: DossierFacet; artifactIds: readonly string[]; runsRepresented: number; basis: string }> = [
    { facet: 'SUPPLIER_IDENTITY', artifactIds: [], runsRepresented: 0, basis: 'No derived artifact in either demonstration run bears on supplier identity. The corpus surfaces lots and samples, not the parties behind them.' },
    { facet: 'DEPENDENCY', artifactIds: lotArtifacts, runsRepresented: 1, basis: `Evidence-concentration artifacts over the two lots in ${seeded.caravan.releaseId}, from one run (${seeded.caravan.run.result.runId}).` },
    { facet: 'RISK', artifactIds: [seeded.spatial.artifact.artifactId], runsRepresented: 1, basis: `The spatial baseline-versus-scenario comparison over the synthetic sampling floor, from one run (${seeded.spatial.run.runId}).` },
  ];
  const coverage: CoverageRow[] = assessed.map((entry) => {
    const level = coverageLevel(entry.artifactIds.length, entry.runsRepresented);
    return { ...entry, level, artifactsAvailable: entry.artifactIds.length, units: COVERAGE_LEVEL_UNITS[level] };
  });
  await ledger.write(coverage.map((c) =>
    `INSERT INTO dossier_coverage VALUES (${sqlText(`COV-${c.facet}`)}, ${sqlText(`${DOSSIER_ID}-${c.facet}`)}, '${c.level}', ${c.artifactsAvailable}, ${c.runsRepresented}, ${sqlArray(c.artifactIds)}, ${sqlText(c.basis)}, '${T.covered}')`).join(';\n'));
  await stage('COVERAGE', T.covered, `dossier_coverage × ${coverage.length}: ${coverage.map((c) => `${c.facet}=${c.level}`).join(', ')}`);

  await ledger.refuse('count coverage for a facet as NONE while naming an artifact',
    `INSERT INTO dossier_coverage VALUES ('COV-BAD', ${sqlText(`${DOSSIER_ID}-RISK`)}, 'NONE', 1, 1, '{"x"}', 'A hole that names something.', '${T.covered}')`);

  /* ── deterministic estimate: a count over the coverage rows ── */
  const units = estimateUnits(coverage);
  const perFacet = coverage.map((c) => ({ facet: c.facet, level: c.level, units: c.units }));
  const estimate = { estimateId: 'EST-1', method: ESTIMATE_METHOD, units, digest: digestOf({ method: ESTIMATE_METHOD, perFacet }) };
  await ledger.write(`INSERT INTO dossier_estimate VALUES (${sqlText(estimate.estimateId)}, ${sqlText(DOSSIER_ID)}, ${sqlText(ESTIMATE_METHOD)}, ${units}, ${sqlText(JSON.stringify(perFacet))}::jsonb, '${estimate.digest}', '${T.estimated}')`);
  await stage('ESTIMATE', T.estimated, `dossier_estimate ${estimate.estimateId}: ${units} units by ${ESTIMATE_METHOD}`);

  /* ── quotation: units at an approved rate, and not before the rate exists ── */
  const snapshot = digestOf({ releases: [seeded.caravan.releaseId, seeded.spatial.releaseId], artifacts: [...seeded.caravan.artifactIds, seeded.spatial.artifact.artifactId] });
  const amountMinor = units * PRICING_POLICY.unitPriceMinor;
  const quotationAction = { dossierId: DOSSIER_ID, recipient: customer.principalId, estimateId: estimate.estimateId, units, unitPriceMinor: PRICING_POLICY.unitPriceMinor, currency: PRICING_POLICY.currency, amountMinor, snapshot, facets: perFacet };
  const quotation = { quotationId: 'QUO-1', policyId: PRICING_POLICY.policyId, unitPriceMinor: PRICING_POLICY.unitPriceMinor, currency: PRICING_POLICY.currency, units, amountMinor, snapshot, digest: digestOf(quotationAction) };
  const quotationRow = (over: { amount?: number } = {}) =>
    `INSERT INTO dossier_quotation VALUES (${sqlText(quotation.quotationId)}, ${sqlText(DOSSIER_ID)}, ${sqlText(PRICING_POLICY.policyId)}, ${PRICING_POLICY.unitPriceMinor}, '${PRICING_POLICY.currency}', ${sqlText(estimate.estimateId)}, ${units}, ${over.amount ?? amountMinor}, '${snapshot}', '${T.quoted}', '${quotation.digest}')`;

  await ledger.refuse('quote the work before any pricing policy is approved', quotationRow());
  await ledger.write(`INSERT INTO pricing_policy VALUES (${sqlText(PRICING_POLICY.policyId)}, ${sqlText(steward.principalId)}, '${T.asked}', ${PRICING_POLICY.unitPriceMinor}, '${PRICING_POLICY.currency}', '${PRICING_POLICY.unit}')`);
  await ledger.refuse('quote an amount that is not units times the rate', quotationRow({ amount: amountMinor + 1 }));
  await ledger.write(quotationRow());
  await stage('QUOTATION', T.quoted, `pricing_policy ${PRICING_POLICY.policyId} (demonstration rate), dossier_quotation ${quotation.quotationId}: ${units} × ${PRICING_POLICY.unitPriceMinor} = ${amountMinor} ${PRICING_POLICY.currency} minor`);

  /* ── accepted scope: the customer approves the quotation, of its digest ── */
  const scope = await ledger.govern({
    tag: 'DOSSIER-SCOPE', operationKind: 'DOSSIER_SCOPE', counterparty: customer.principalId, action: quotationAction,
    doingNothing: 'The question stays unanswered and the buyer proceeds on the supplier’s own account of itself.',
    against: `One of three facets has no evidence behind it at all, and the other two rest on one run each. The dossier will say so on every page, and the buyer is paying ${amountMinor / 100} ${PRICING_POLICY.currency} to be told where the holes are.`,
    sections: ['Proposed action', 'Economics and uncertainty', 'Evidence and alternatives'],
    authoredBy: agent, preparedBy: agent, reviewer: customer, response: 'APPROVE',
    reasoning: 'Accepted at the quoted amount. The holes are what I want to know about.',
    releaseId: seeded.caravan.releaseId, policyVersion: PRICING_POLICY.policyId,
    proposedAt: T.quoted, reviewedAt: T.accepted, grantedAt: T.accepted, expiresAt: T.expires,
  });
  await stage('SCOPE', T.accepted, `${scope.proposalId} → ${scope.packetId} (${scope.actionDigest.slice(0, 19)}…) → ${scope.reviewId} APPROVE by ${scope.reviewer} → ${scope.authorizationId}`);

  /* ── build: conclusions per facet, at their class, resting on their artifacts ── */
  const lot = seeded.caravan.run.result.artifacts.find((a) => a.artifactId === lotArtifacts[0])!;
  const takenBack = seeded.caravan.run.takenBack;
  const dependencyNotCoveredV1 = `The second lot, ${lotArtifacts.slice(1).join(', ')}, is in the coverage and not in this statement. Samples are not lots and are not counted here.`;
  const dependencyNotCoveredV2 = `${dependencyNotCoveredV1} Before the run, the corpus had taken back ${takenBack.length} records (${takenBack.map((t) => `${t.recordId} under ${t.retractionId}`).join('; ')}); the artifact read none of them, and version 1 did not say so.`;
  const conclusionsFor = (dependencyNotCovered: string): ConclusionRow[] => [
    { facet: 'DEPENDENCY', statement: lot.claim, notCovered: dependencyNotCovered, artifactId: lot.artifactId, artifactClass: lot.claimClass, presentedAs: lot.claimClass },
    { facet: 'RISK', statement: seeded.spatial.artifact.claim, notCovered: 'A synthetic single-floor fixture, manually annotated; no measured building, no polygon inference, and the Store passage was declared unknown in the baseline.', artifactId: seeded.spatial.artifact.artifactId, artifactClass: seeded.spatial.artifact.claimClass, presentedAs: seeded.spatial.artifact.claimClass },
  ];
  const holes: HoleRow[] = coverage.filter((c) => c.level === 'NONE').map((c) => ({ facet: c.facet, level: c.level, basis: c.basis }));
  const compiled = (version: number, conclusions: readonly ConclusionRow[]) => ({
    dossierId: DOSSIER_ID, version, recipient: customer.principalId, question: QUESTION, quotationDigest: quotation.digest, builtSnapshot: snapshot,
    conclusions, holes, footer: DELIVERABLE_FOOTER, chain: PROVENANCE_CHAIN,
    notClaimed: ['No conclusion is validated; every artifact is NOT_VALIDATED.', 'Nothing here is a statement about a real supplier, lot or building.'],
  });
  const conclusionsV1 = conclusionsFor(dependencyNotCoveredV1);
  const releaseV1 = compiled(1, conclusionsV1);
  const releaseDigestV1 = digestOf(releaseV1);
  const draftDigest = digestOf(compiled(1, conclusionsV1.map((c) => ({ ...c, notCovered: 'TBD' }))));
  await stage('BUILD', T.built, `compiled release v1 over ${conclusionsV1.length} conclusions and ${holes.length} stated hole, digest ${releaseDigestV1.slice(0, 19)}…; built snapshot equals the quoted snapshot because the corpus did not move between them`);

  const releaseRow = (over: { id?: string; version?: number; digest?: string; auth?: string; scopeAuth?: string; builtAt?: string; releasedAt?: string } = {}) =>
    `INSERT INTO dossier_release (dossier_release_id, dossier_id, recipient_id, version, quotation_id, quoted_snapshot, quoted_at, quotation_digest, scope_authorization_id,
      built_snapshot, built_at, release_digest, authorization_id, released_at, monitored)
     VALUES (${sqlText(over.id ?? 'DREL-1')}, ${sqlText(DOSSIER_ID)}, ${sqlText(customer.principalId)}, ${over.version ?? 1}, ${sqlText(quotation.quotationId)}, '${snapshot}', '${T.quoted}',
      '${quotation.digest}', ${sqlText(over.scopeAuth ?? scope.authorizationId!)}, '${snapshot}', '${over.builtAt ?? T.built}', '${over.digest ?? releaseDigestV1}', ${sqlText(over.auth ?? 'AU-DOSSIER-RELEASE-1')}, '${over.releasedAt ?? T.released}', false)`;

  /* ── reviewed release ── */
  await ledger.refuse('release before the customer accepted, and before anyone reviewed', releaseRow({ scopeAuth: 'AU-NOBODY-ACCEPTED', auth: 'AU-NOBODY-REVIEWED' }));
  await ledger.refuse('have the agent grant the release authorization', [
    `INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at) VALUES ('P-AGENT-GRANT', 'DOSSIER_RELEASE', ${sqlText(customer.principalId)}, 'AGENT', ${sqlText(agent.principalId)}, '${T.built}')`,
    `INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against, prepared_by_kind, prepared_by, prepared_at) VALUES ('K-AGENT-GRANT', 'P-AGENT-GRANT', 'DOSSIER_RELEASE', '{}'::jsonb, '${releaseDigestV1}', 'x', 'y', 'AGENT', ${sqlText(agent.principalId)}, '${T.built}')`,
    `INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at) VALUES ('RV-AGENT-GRANT', 'P-AGENT-GRANT', '${releaseDigestV1}', 'APPROVE', 'HUMAN', ${sqlText(steward.principalId)}, 'ok', '${T.reviewed}')`,
    `INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by, corpus_release_id, state_revision, policy_version, granted_at, expires_at, action_digest, review_response)
     VALUES ('AU-AGENT-GRANT', 'P-AGENT-GRANT', 'NARROW_ACTION', 'AGENT', ${sqlText(agent.principalId)}, ${sqlText(seeded.caravan.releaseId)}, 1, 'dossier@1', '${T.reviewed}', '${T.expires}', '${releaseDigestV1}', 'APPROVE')`,
  ].join(';\n'));

  const reviewV1 = await ledger.govern({
    tag: 'DOSSIER-RELEASE-1', operationKind: 'DOSSIER_RELEASE', counterparty: customer.principalId, action: releaseV1,
    doingNothing: 'The accepted scope goes undelivered and the quotation lapses at its expiry.',
    against: 'Both conclusions rest on one run each and neither artifact is validated. The dependency statement covers one of the two lots in the coverage.',
    sections: ['Proposed action', 'Evidence and alternatives'],
    authoredBy: agent, preparedBy: agent, reviewer: steward, response: 'APPROVE',
    reasoning: 'Each conclusion is presented at its computed class and states what it did not cover. The hole in supplier identity is on the page. Release.',
    releaseId: seeded.caravan.releaseId, policyVersion: 'dossier-release@1',
    proposedAt: T.built, reviewedAt: T.reviewed, grantedAt: T.reviewed, expiresAt: T.expires,
  });
  await ledger.refuse('have a second reviewer close the same release again, differently', `INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
    VALUES ('RV-SECOND-OPINION', ${sqlText(reviewV1.proposalId)}, '${releaseDigestV1}', 'DENY', 'HUMAN', ${sqlText(secondReviewer.principalId)}, 'I would not have released it.', '${T.reviewed}')`);
  await ledger.refuse('release the draft the reviewer did not see', releaseRow({ digest: draftDigest }));
  await ledger.write(releaseRow());
  await ledger.refuse('present the spatial computation as something a source observed',
    `INSERT INTO dossier_conclusion VALUES ('CON-BAD', 'DREL-1', 'RISK', 'x', 'y', ${sqlText(seeded.spatial.artifact.artifactId)}, 'COMPUTED_RESULT', 'SOURCE_OBSERVATION')`);
  await ledger.write(conclusionsV1.map((c, i) =>
    `INSERT INTO dossier_conclusion VALUES (${sqlText(`CON-1-${i}`)}, 'DREL-1', '${c.facet}', ${sqlText(c.statement)}, ${sqlText(c.notCovered)}, ${sqlText(c.artifactId)}, '${c.artifactClass}', '${c.presentedAs}')`).join(';\n'));
  await stage('RELEASE', T.released, `dossier_release DREL-1 v1 under ${scope.authorizationId} (scope) and ${reviewV1.authorizationId} (review); ${conclusionsV1.length} conclusions`);

  /* ── local delivery receipt: a dispatch in the kernel, simulated and marked ── */
  const deliver = async (tag: string, releaseId: string, authorizationId: string, grantedAt: string, at: string, reconciledAt: string, beforeDelivery?: (attemptId: string) => Promise<void>): Promise<DeliveryRecord> => {
    const receipt = `SIMULATED_LOCAL:${digestOf({ releaseId, recipient: customer.principalId, at })}`;
    const dispatched = await ledger.dispatch({ tag, authorizationId, idempotencyKey: `deliver:${releaseId}:${customer.principalId}`, grantedAt, expiresAt: T.expires, openedAt: at, attemptedAt: at, outcome: 'CONFIRMED', venueReceipt: receipt });
    const reconciliation = await ledger.reconcile({ attemptId: dispatched.attemptId, found: 'DID_HAPPEN', basis: 'Local simulated receipt: the attempt row is the receipt. No customer exists and nothing left this process.', at: reconciledAt });
    await beforeDelivery?.(dispatched.attemptId);
    const receiptBasis = 'SIMULATED_LOCAL: no customer exists; the receipt is the attempt row and says so.';
    await ledger.write(`INSERT INTO dossier_delivery VALUES (${sqlText(`DLV-${tag}`)}, ${sqlText(releaseId)}, ${sqlText(customer.principalId)}, ${sqlText(dispatched.attemptId)}, ${sqlText(receiptBasis)}, '${at}')`);
    return { ...dispatched, reconciliation, deliveryId: `DLV-${tag}`, recipient: customer.principalId, receiptBasis };
  };
  await ledger.refuse('record a delivery no dispatch carried', `INSERT INTO dossier_delivery VALUES ('DLV-PHANTOM', 'DREL-1', ${sqlText(customer.principalId)}, 'T-NOBODY', 'It felt delivered.', '${T.delivered}')`);
  const deliveryV1 = await deliver('DELIVER-1', 'DREL-1', reviewV1.authorizationId!, T.reviewed, T.delivered, T.reconciled, async (attemptId) => {
    // The dispatch is real and confirmed. Handing its receipt to the other customer is a row the key refuses.
    await ledger.refuse('deliver the dossier to the other customer', `INSERT INTO dossier_delivery VALUES ('DLV-WRONG', 'DREL-1', ${sqlText(otherCustomer.principalId)}, ${sqlText(attemptId)}, 'Wrong customer.', '${T.delivered}')`);
  });
  await stage('DELIVERED', T.delivered, `${deliveryV1.operationId} → ${deliveryV1.attemptId} CONFIRMED (${deliveryV1.venueReceipt!.slice(0, 24)}…) → ${deliveryV1.reconciliation.reconciliationId} DID_HAPPEN → ${deliveryV1.deliveryId}`);

  /* ── corrected release ── */
  const conclusionsV2 = conclusionsFor(dependencyNotCoveredV2);
  const releaseV2 = compiled(2, conclusionsV2);
  const releaseDigestV2 = digestOf(releaseV2);
  const because = `Version 1’s DEPENDENCY conclusion stated what it did not cover and omitted that ${takenBack.length} records had been taken back before the run (${takenBack.map((t) => t.retractionId).filter((v, i, a) => a.indexOf(v) === i).join(', ')}). Version 2 restates that sentence; nothing else changed.`;
  const reviewV2 = await ledger.govern({
    tag: 'DOSSIER-RELEASE-2', operationKind: 'DOSSIER_RELEASE', counterparty: customer.principalId, action: releaseV2,
    doingNothing: 'Version 1 stands with an incomplete not-covered statement, and the buyer does not learn that three records were excluded.',
    against: 'A second delivery for a one-sentence change costs the buyer’s attention. The change is to the gap statement only.',
    sections: ['Proposed action', 'Evidence and alternatives'],
    authoredBy: agent, preparedBy: agent, reviewer: steward, response: 'APPROVE',
    reasoning: 'The omission is real and is in the run’s own record. Release the correction as a successor; version 1 stays.',
    corrects: { operationId: deliveryV1.operationId, reason: because },
    releaseId: seeded.caravan.releaseId, policyVersion: 'dossier-release@1',
    proposedAt: T.corrected, reviewedAt: T.reviewedAgain, grantedAt: T.reviewedAgain, expiresAt: T.expires,
  });
  await ledger.refuse('release version 2 under version 1’s approval', releaseRow({ id: 'DREL-2', version: 2, digest: releaseDigestV1, auth: reviewV1.authorizationId!, builtAt: T.corrected, releasedAt: T.releasedAgain }));
  await ledger.write(releaseRow({ id: 'DREL-2', version: 2, digest: releaseDigestV2, auth: reviewV2.authorizationId!, builtAt: T.corrected, releasedAt: T.releasedAgain }));
  await ledger.write(`INSERT INTO release_succession VALUES ('SUC-1', 'DREL-2', 2, 'DREL-1', 1, ${sqlText(because)})`);
  await ledger.write(conclusionsV2.map((c, i) =>
    `INSERT INTO dossier_conclusion VALUES (${sqlText(`CON-2-${i}`)}, 'DREL-2', '${c.facet}', ${sqlText(c.statement)}, ${sqlText(c.notCovered)}, ${sqlText(c.artifactId)}, '${c.artifactClass}', '${c.presentedAs}')`).join(';\n'));
  const deliveryV2 = await deliver('DELIVER-2', 'DREL-2', reviewV2.authorizationId!, T.reviewedAgain, T.deliveredAgain, T.reconciledAgain);
  await stage('MONITORING', T.deliveredAgain, `DREL-2 v2 succeeds DREL-1 (${reviewV2.proposalId} corrects ${deliveryV1.operationId}); ${deliveryV2.attemptId} CONFIRMED; DREL-1 and its delivery stand`);

  const counts = {
    specs: await ledger.count('dossier_spec'), coverage: await ledger.count('dossier_coverage'), estimates: await ledger.count('dossier_estimate'),
    quotations: await ledger.count('dossier_quotation'), releases: await ledger.count('dossier_release'), conclusions: await ledger.count('dossier_conclusion'),
    deliveries: await ledger.count('dossier_delivery'),
    proposals: await ledger.count('operation_proposal', "operation_kind LIKE 'DOSSIER_%'"),
    authorizations: await ledger.count('execution_authorization', "proposal_id LIKE 'P-DOSSIER-%'"),
    attempts: await ledger.count('execution_attempt', "operation_id LIKE 'O-DELIVER-%'"),
    refusals: ledger.refusals.length - refusalsBefore,
  };

  return {
    fixture_only: true, simulated: true,
    dossierId: DOSSIER_ID, recipient: customer.principalId, question: QUESTION, boundToRelease: seeded.caravan.releaseId,
    stages, coverage, estimate, quotation, scope,
    releases: [
      { releaseId: 'DREL-1', version: 1, releaseDigest: releaseDigestV1, builtSnapshot: snapshot, review: reviewV1, conclusions: conclusionsV1, holes, delivery: deliveryV1 },
      { releaseId: 'DREL-2', version: 2, releaseDigest: releaseDigestV2, builtSnapshot: snapshot, review: reviewV2, conclusions: conclusionsV2, holes, delivery: deliveryV2 },
    ],
    correction: { successorVersion: 2, predecessorVersion: 1, because, correctsOperationId: deliveryV1.operationId, proposalId: reviewV2.proposalId },
    refusals: ledger.refusals.slice(refusalsBefore),
    counts,
  };
}
