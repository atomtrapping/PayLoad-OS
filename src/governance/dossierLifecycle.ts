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
 * access to the sampling floor. Every artifact bearing on a facet is assessed
 * against the right a delivery exercises, its validation, its horizon and the
 * records it read, and the facet's coverage row carries the counts and the
 * headline: the first facet has nothing behind it and is MISSING; the second
 * rests on the mining engine's concentration artifacts, one of which carries
 * customer_delivery and one of which does not, so its headline is
 * DISALLOWED with one present and one withheld; the third has the spatial
 * comparison behind it, a deterministic computation whose source registration
 * permits nothing the corpus vocabulary calls a use, so it too is a hole —
 * DISALLOWED, with one artifact in it the buyer may not receive. The one
 * conclusion rests on the one present artifact, by foreign key, and is
 * presented at the class it was computed at; the database refuses a
 * conclusion resting on the withheld one.
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
 * omission, found in the run's own record and in the ledger's retraction
 * table. Version 2 restates that sentence.
 * It is a new proposal through the same gate, naming version 1's delivery
 * operation as what it corrects, reviewed again, authorized again, released as
 * a successor with the reason on the row, and delivered again. Version 1
 * stands: its rows are not edited, and a reader who acted on it can still see
 * what it said.
 */
import { DELIVERABLE_FOOTER, PROVENANCE_CHAIN } from '@/domain/firmIdentity';
import {
  COVERAGE_LEVEL_UNITS, DELIVERY_RIGHT, ESTIMATE_METHOD, assessEvidence, coverageLevel, estimateUnits, rollupAssessment,
  type CoverageAssessment, type CoverageLevel, type DossierFacet, type DossierStage, type EvidenceUnderAssessment,
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

/** One artifact bearing on a facet, with what it was assessed as and why. Its claim is not here: a withheld artifact is named, not quoted. */
export interface EvidenceRow { artifactId: string; runId: string; assessment: CoverageAssessment; because: string }
export interface CoverageRow {
  coverageId: string; assessedAt: string;
  facet: DossierFacet; level: CoverageLevel; assessment: CoverageAssessment;
  artifactsAvailable: number; artifactsPresent: number; artifactsStale: number; artifactsConflicting: number; artifactsDisallowed: number;
  runsRepresented: number; runsUsable: number;
  artifactIds: readonly string[]; evidence: readonly EvidenceRow[]; basis: string; units: number;
}
export interface ConclusionRow { facet: DossierFacet; statement: string; notCovered: string; artifactId: string; artifactClass: string; presentedAs: string }
/** A facet nothing usable bears on. What does bear on it is counted, and its assessment says why it is not usable. */
export interface HoleRow { facet: DossierFacet; level: CoverageLevel; assessment: CoverageAssessment; artifactsAvailable: number; artifactsUsable: number; basis: string }

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
  /** The corpus read again before version 2: a second coverage row per facet at a later instant, which version 2 names. */
  readonly reassessment: { at: string; coverage: readonly CoverageRow[]; changed: boolean; because: string };
  readonly estimate: { estimateId: string; method: string; units: number; digest: string };
  readonly quotation: { quotationId: string; policyId: string; unitPriceMinor: number; currency: string; units: number; amountMinor: number; snapshot: string; digest: string };
  readonly scope: GovernedAct;
  readonly releases: readonly ReleaseRecord[];
  readonly correction: { successorVersion: number; predecessorVersion: number; because: string; correctsOperationId: string; proposalId: string };
  readonly refusals: readonly Refusal[];
  readonly counts: { specs: number; coverage: number; evidence: number; estimates: number; quotations: number; releases: number; conclusions: number; deliveries: number; proposals: number; authorizations: number; attempts: number; refusals: number };
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
    `INSERT INTO dossier_spec VALUES (${sqlText(DOSSIER_ID)}, ${sqlText(customer.principalId)}, ${sqlText(QUESTION)}, 'SPEC', '${T.asked}', '${DELIVERY_RIGHT}')`,
    ...facets.map((facet) => `INSERT INTO dossier_facet VALUES (${sqlText(`${DOSSIER_ID}-${facet}`)}, ${sqlText(DOSSIER_ID)}, '${facet}')`),
  ].join(';\n'));
  stages.push({ stage: 'SPEC', at: T.asked, wrote: `dossier_spec ${DOSSIER_ID}, ${facets.length} facets` });

  /* ── coverage: every artifact bearing on a facet, assessed; the row is the sum ── */
  type Bearing = EvidenceUnderAssessment & { runId: string };
  const bearing = (a: { artifactId: string; subject: string; claim: string; validation: string; horizonEndsAt: string | null; rights: readonly string[]; inputs: ReadonlyArray<{ recordId: string }> }, runId: string): Bearing =>
    ({ artifactId: a.artifactId, subject: a.subject, claim: a.claim, validation: a.validation, horizonEndsAt: a.horizonEndsAt, rights: a.rights, inputRecordIds: a.inputs.map((i) => i.recordId), runId });
  const lotArtifacts = seeded.caravan.run.result.artifacts.filter((a) => a.subject.startsWith('LOT-')).map((a) => bearing(a, seeded.caravan.run.result.runId));
  const spatialArtifact = bearing(seeded.spatial.artifact, seeded.spatial.run.runId);
  const terms = seeded.spatial.registrationTerms;

  /** The three facets assessed at one instant, over what the ledger holds by then. `series` numbers the coverage rows. */
  const assessAll = async (at: string, series: number): Promise<CoverageRow[]> => {
    const takenBack = (await ledger.rows<{ record_id: string; kind: 'CORRECTION' | 'WITHDRAWAL' }>(
      `SELECT record_id, kind FROM retracted_record WHERE issued_at <= '${at}' ORDER BY record_id, kind`)).map((r) => ({ recordId: r.record_id, kind: r.kind }));
    const assess = (facet: DossierFacet, list: readonly Bearing[], basis: (rollup: ReturnType<typeof rollupAssessment>) => string): CoverageRow => {
      const alongside = list.map(({ artifactId, subject, claim }) => ({ artifactId, subject, claim }));
      const evidence: EvidenceRow[] = list.map((e) => ({ artifactId: e.artifactId, runId: e.runId, ...assessEvidence(e, { assessedAt: at, requiredRight: DELIVERY_RIGHT, takenBack, alongside }) }));
      const rollup = rollupAssessment(evidence.map((e) => e.assessment));
      const runsRepresented = new Set(evidence.map((e) => e.runId)).size;
      const runsUsable = new Set(evidence.filter((e) => e.assessment === 'PRESENT').map((e) => e.runId)).size;
      const level = coverageLevel(rollup.present, runsUsable);
      return {
        coverageId: `COV-${series}-${facet}`, assessedAt: at,
        facet, level, assessment: rollup.assessment,
        artifactsAvailable: evidence.length, artifactsPresent: rollup.present, artifactsStale: rollup.stale, artifactsConflicting: rollup.conflicting, artifactsDisallowed: rollup.disallowed,
        runsRepresented, runsUsable, artifactIds: evidence.map((e) => e.artifactId), evidence, basis: basis(rollup), units: COVERAGE_LEVEL_UNITS[level],
      };
    };
    return [
      assess('SUPPLIER_IDENTITY', [], () => 'No derived artifact in either demonstration run bears on supplier identity. The corpus surfaces lots and samples, not the parties behind them.'),
      assess('DEPENDENCY', lotArtifacts, (r) => `${lotArtifacts.length} evidence-concentration artifacts over the lots in ${seeded.caravan.releaseId}, from one run (${seeded.caravan.run.result.runId}): ${r.present} present, ${r.disallowed} disallowed for customer delivery (its rights carry no ${DELIVERY_RIGHT}), ${r.stale} stale, ${r.conflicting} conflicting.`),
      assess('RISK', [spatialArtifact], () => `One computation bears on it — the spatial baseline-versus-scenario comparison from ${seeded.spatial.run.runId} — and may not be delivered to a customer audience: its source registration permits ${terms.permittedPurposes.join(', ')} to ${terms.allowedAudiences.join(', ')} audiences only, so its rights carry no corpus use at all, ${DELIVERY_RIGHT} included. Nothing here rests on it.`),
    ];
  };
  const coverage = await assessAll(T.covered, 1);
  const coverageRow = (c: Pick<CoverageRow, 'coverageId' | 'assessedAt' | 'facet' | 'level' | 'assessment' | 'artifactsAvailable' | 'artifactsPresent' | 'artifactsStale' | 'artifactsConflicting' | 'artifactsDisallowed' | 'runsRepresented' | 'runsUsable' | 'artifactIds' | 'basis'>) =>
    `INSERT INTO dossier_coverage (coverage_id, dossier_facet_id, level, assessment, artifacts_available, artifacts_present, artifacts_stale, artifacts_conflicting, artifacts_disallowed, runs_represented, runs_usable, artifact_ids, basis, assessed_at)
     VALUES (${sqlText(c.coverageId)}, ${sqlText(`${DOSSIER_ID}-${c.facet}`)}, '${c.level}', '${c.assessment}', ${c.artifactsAvailable}, ${c.artifactsPresent}, ${c.artifactsStale}, ${c.artifactsConflicting}, ${c.artifactsDisallowed},
      ${c.runsRepresented}, ${c.runsUsable}, ${sqlArray(c.artifactIds)}, ${sqlText(c.basis)}, '${c.assessedAt}')`;
  const evidenceRow = (coverageId: string, e: EvidenceRow, i: number) =>
    `INSERT INTO dossier_coverage_evidence VALUES (${sqlText(`${coverageId}-E${i}`)}, ${sqlText(coverageId)}, ${sqlText(e.artifactId)}, ${sqlText(e.runId)}, '${e.assessment}', ${sqlText(e.because)})`;
  const coverageRows = (rows: readonly CoverageRow[]) => rows.flatMap((c) => [coverageRow(c), ...c.evidence.map((e, i) => evidenceRow(c.coverageId, e, i))]).join(';\n');
  const [supplierIdentity, dependency, risk] = coverage;

  // A facet with nothing behind it, written as PRESENT: the rollup CHECK refuses the headline before any trigger runs.
  await ledger.refuse('call a facet with nothing behind it PRESENT', coverageRow({ ...supplierIdentity, coverageId: 'COV-BAD-1', assessment: 'PRESENT' }));
  // The spatial artifact written as PRESENT, counts and level consistent with that: the evidence trigger recomputes it from the artifact's rights and refuses.
  await ledger.refuse('label the spatial computation PRESENT', [
    coverageRow({ ...risk, coverageId: 'COV-BAD-2', level: 'THIN', assessment: 'PRESENT', artifactsPresent: 1, artifactsDisallowed: 0, runsUsable: 1 }),
    evidenceRow('COV-BAD-2', { ...risk.evidence[0], assessment: 'PRESENT', because: 'It would be convenient.' }, 0),
  ].join(';\n'));
  // One present artifact called SUPPORTED: the CHECK relating the level to the present count refuses.
  await ledger.refuse('call one present artifact SUPPORTED', coverageRow({ ...dependency, coverageId: 'COV-BAD-3', level: 'SUPPORTED' }));
  // The withheld lot artifact counted as present, the level and headline consistent with that, its evidence row honest: the coverage row is refused for not matching its evidence.
  await ledger.refuse('count the withheld lot artifact as present', [
    coverageRow({ ...dependency, coverageId: 'COV-BAD-4', assessment: 'PRESENT', artifactsPresent: 2, artifactsDisallowed: 0, runsUsable: 1 }),
    ...dependency.evidence.map((e, i) => evidenceRow('COV-BAD-4', e, i)),
  ].join(';\n'));

  await ledger.write(coverageRows(coverage));
  await stage('COVERAGE', T.covered, `dossier_coverage × ${coverage.length}: ${coverage.map((c) => `${c.facet}=${c.level}/${c.assessment}${c.artifactsAvailable ? ` (${c.artifactsPresent} present, ${c.artifactsAvailable - c.artifactsPresent} withheld)` : ''}`).join(', ')}; dossier_coverage_evidence × ${coverage.reduce((n, c) => n + c.evidence.length, 0)}`);

  // Written once: the RISK row rewritten as PRESENT after the fact, and a withdrawal backdated behind the assessment that did not know it.
  await ledger.refuse('rewrite the RISK coverage row as PRESENT after it was written',
    `UPDATE dossier_coverage SET assessment = 'PRESENT', level = 'THIN', artifacts_present = 1, artifacts_disallowed = 0, runs_usable = 1 WHERE coverage_id = ${sqlText(risk.coverageId)}`);
  const presentLot = dependency.evidence.find((e) => e.assessment === 'PRESENT')!;
  const presentLotRecord = lotArtifacts.find((a) => a.artifactId === presentLot.artifactId)!.inputRecordIds[0];
  await ledger.refuse('backdate a withdrawal of a record the present lot artifact read',
    `INSERT INTO retracted_record VALUES ('RET-BACKDATED', ${sqlText(presentLotRecord)}, 'WITHDRAWAL', '2026-09-01T00:00:00.000Z')`);

  /* ── deterministic estimate: a count over the coverage rows as they stand ── */
  const units = estimateUnits(coverage);
  const perFacet = coverage.map((c) => ({ facet: c.facet, level: c.level, units: c.units }));
  const estimate = { estimateId: 'EST-1', method: ESTIMATE_METHOD, units, digest: digestOf({ method: ESTIMATE_METHOD, perFacet }) };
  const estimateRow = (id: string, facets: typeof perFacet, total: number) =>
    `INSERT INTO dossier_estimate VALUES (${sqlText(id)}, ${sqlText(DOSSIER_ID)}, ${sqlText(ESTIMATE_METHOD)}, ${total}, ${sqlText(JSON.stringify(facets))}::jsonb, '${estimate.digest}', '${T.estimated}')`;
  // DEPENDENCY counted as SUPPORTED when the coverage says THIN: the estimate is held to the coverage as it stood.
  await ledger.refuse('estimate the work at a level the coverage does not hold',
    estimateRow('EST-BAD', perFacet.map((f) => (f.facet === 'DEPENDENCY' ? { ...f, level: 'SUPPORTED' as const, units: COVERAGE_LEVEL_UNITS.SUPPORTED } : f)), units + 1));
  await ledger.write(estimateRow(estimate.estimateId, perFacet, units));
  await stage('ESTIMATE', T.estimated, `dossier_estimate ${estimate.estimateId}: ${units} units by ${ESTIMATE_METHOD}`);

  /* ── quotation: units at an approved rate, and not before the rate exists ── */
  const snapshot = digestOf({ releases: [seeded.caravan.releaseId, seeded.spatial.releaseId], artifacts: [...seeded.caravan.artifactIds, seeded.spatial.artifact.artifactId] });
  const amountMinor = units * PRICING_POLICY.unitPriceMinor;
  const quotationAction = { dossierId: DOSSIER_ID, recipient: customer.principalId, estimateId: estimate.estimateId, units, unitPriceMinor: PRICING_POLICY.unitPriceMinor, currency: PRICING_POLICY.currency, amountMinor, snapshot, facets: perFacet };
  const quotation = { quotationId: 'QUO-1', policyId: PRICING_POLICY.policyId, unitPriceMinor: PRICING_POLICY.unitPriceMinor, currency: PRICING_POLICY.currency, units, amountMinor, snapshot, digest: digestOf(quotationAction) };
  const quotationRow = (over: { amount?: number } = {}) =>
    `INSERT INTO dossier_quotation VALUES (${sqlText(quotation.quotationId)}, ${sqlText(DOSSIER_ID)}, ${sqlText(PRICING_POLICY.policyId)}, ${PRICING_POLICY.unitPriceMinor}, '${PRICING_POLICY.currency}', ${sqlText(estimate.estimateId)}, ${units}, '${T.estimated}', ${over.amount ?? amountMinor}, '${snapshot}', '${T.quoted}', '${quotation.digest}')`;

  await ledger.refuse('quote the work before any pricing policy is approved', quotationRow());
  await ledger.write(`INSERT INTO pricing_policy VALUES (${sqlText(PRICING_POLICY.policyId)}, ${sqlText(steward.principalId)}, '${T.asked}', ${PRICING_POLICY.unitPriceMinor}, '${PRICING_POLICY.currency}', '${PRICING_POLICY.unit}')`);
  await ledger.refuse('quote an amount that is not units times the rate', quotationRow({ amount: amountMinor + 1 }));
  await ledger.write(quotationRow());
  await stage('QUOTATION', T.quoted, `pricing_policy ${PRICING_POLICY.policyId} (demonstration rate), dossier_quotation ${quotation.quotationId}: ${units} × ${PRICING_POLICY.unitPriceMinor} = ${amountMinor} ${PRICING_POLICY.currency} minor`);

  /* ── accepted scope: the customer approves the quotation, of its digest ── */
  const scope = await ledger.govern({
    tag: 'DOSSIER-SCOPE', operationKind: 'DOSSIER_SCOPE', counterparty: customer.principalId, action: quotationAction,
    doingNothing: 'The question stays unanswered and the buyer proceeds on the supplier’s own account of itself.',
    against: `One of three facets has nothing behind it; one has a single computation behind it that the firm may not deliver to a customer audience; the third rests on one artifact from one run, beside a second the firm may not deliver. The dossier will say so on every page, and the buyer is paying ${amountMinor / 100} ${PRICING_POLICY.currency} to be told where the holes are and what is being withheld.`,
    sections: ['Proposed action', 'Economics and uncertainty', 'Evidence and alternatives'],
    authoredBy: agent, preparedBy: agent, reviewer: customer, response: 'APPROVE',
    reasoning: 'Accepted at the quoted amount. The holes are what I want to know about.',
    releaseId: seeded.caravan.releaseId, policyVersion: PRICING_POLICY.policyId,
    proposedAt: T.quoted, reviewedAt: T.accepted, grantedAt: T.accepted, expiresAt: T.expires,
  });
  await stage('SCOPE', T.accepted, `${scope.proposalId} → ${scope.packetId} (${scope.actionDigest.slice(0, 19)}…) → ${scope.reviewId} APPROVE by ${scope.reviewer} → ${scope.authorizationId}`);

  /* ── build: one conclusion, at its class, resting on the one present artifact; two holes, each with its assessment ── */
  const present = dependency.evidence.find((e) => e.assessment === 'PRESENT')!;
  const withheld = dependency.evidence.filter((e) => e.assessment !== 'PRESENT');
  const lot = seeded.caravan.run.result.artifacts.find((a) => a.artifactId === present.artifactId)!;
  const takenBackByRun = seeded.caravan.run.takenBack;
  // Named by identifier and assessment, never by claim or by the internal reason: the reason is on the evidence row.
  const dependencyNotCoveredV1 = `${withheld.map((e) => `${e.artifactId} bears on this facet and is ${e.assessment} for customer delivery`).join('; ')}, so this statement rests on ${present.artifactId} alone. Samples are not lots and are not counted here.`;
  const dependencyNotCoveredV2 = `${dependencyNotCoveredV1} Before the run, the corpus had taken back ${takenBackByRun.length} records (${takenBackByRun.map((t) => `${t.recordId} under ${t.retractionId}`).join('; ')}); the artifact read none of them, and version 1 did not say so.`;
  const conclusionsFor = (dependencyNotCovered: string): ConclusionRow[] => [
    { facet: 'DEPENDENCY', statement: lot.claim, notCovered: dependencyNotCovered, artifactId: lot.artifactId, artifactClass: lot.claimClass, presentedAs: lot.claimClass },
  ];
  const holesOf = (rows: readonly CoverageRow[]): HoleRow[] => rows.filter((c) => c.level === 'NONE').map((c) => ({ facet: c.facet, level: c.level, assessment: c.assessment, artifactsAvailable: c.artifactsAvailable, artifactsUsable: c.artifactsPresent, basis: c.basis }));
  const holes = holesOf(coverage);
  const compiled = (version: number, conclusions: readonly ConclusionRow[], over: readonly CoverageRow[]) => ({
    dossierId: DOSSIER_ID, version, recipient: customer.principalId, question: QUESTION, quotationDigest: quotation.digest, builtSnapshot: snapshot,
    coverage: over.map((c) => ({ coverageId: c.coverageId, assessedAt: c.assessedAt, facet: c.facet, level: c.level, assessment: c.assessment, artifactsAvailable: c.artifactsAvailable, artifactsPresent: c.artifactsPresent })),
    conclusions, holes: holesOf(over), footer: DELIVERABLE_FOOTER, chain: PROVENANCE_CHAIN,
    notClaimed: ['No conclusion is validated; every artifact is NOT_VALIDATED.', 'Nothing here is a statement about a real supplier, lot or building.', 'What was withheld is named by identifier and assessment; its claim is not in this release.'],
  });
  const conclusionsV1 = conclusionsFor(dependencyNotCoveredV1);
  const releaseV1 = compiled(1, conclusionsV1, coverage);
  const releaseDigestV1 = digestOf(releaseV1);
  const draftDigest = digestOf(compiled(1, conclusionsV1.map((c) => ({ ...c, notCovered: 'TBD' })), coverage));
  await stage('BUILD', T.built, `compiled release v1 over ${conclusionsV1.length} conclusion and ${holes.length} stated holes (${holes.map((h) => `${h.facet}=${h.assessment}`).join(', ')}), digest ${releaseDigestV1.slice(0, 19)}…; built snapshot equals the quoted snapshot because the corpus did not move between them`);

  const releaseRow = (over: { id?: string; version?: number; digest?: string; auth?: string; scopeAuth?: string; builtAt?: string; releasedAt?: string; names?: readonly CoverageRow[] } = {}) => [
    `INSERT INTO dossier_release (dossier_release_id, dossier_id, recipient_id, version, quotation_id, quoted_snapshot, quoted_at, quotation_digest, scope_authorization_id,
      built_snapshot, built_at, release_digest, authorization_id, released_at, monitored)
     VALUES (${sqlText(over.id ?? 'DREL-1')}, ${sqlText(DOSSIER_ID)}, ${sqlText(customer.principalId)}, ${over.version ?? 1}, ${sqlText(quotation.quotationId)}, '${snapshot}', '${T.quoted}',
      '${quotation.digest}', ${sqlText(over.scopeAuth ?? scope.authorizationId!)}, '${snapshot}', '${over.builtAt ?? T.built}', '${over.digest ?? releaseDigestV1}', ${sqlText(over.auth ?? 'AU-DOSSIER-RELEASE-1')}, '${over.releasedAt ?? T.released}', false)`,
    // What it was built over: one assessment per facet.
    ...(over.names ?? coverage).map((c) => `INSERT INTO dossier_release_coverage VALUES (${sqlText(over.id ?? 'DREL-1')}, ${sqlText(c.coverageId)})`),
  ].join(';\n');

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
    against: 'The one conclusion rests on one artifact from one run and is not validated. Two of three facets are holes, one of them with a computation behind it that a customer audience may not receive.',
    sections: ['Proposed action', 'Evidence and alternatives'],
    authoredBy: agent, preparedBy: agent, reviewer: steward, response: 'APPROVE',
    reasoning: 'The conclusion is presented at its computed class and states what it did not cover, the withheld lot artifact included. Both holes are on the page with their assessment. Release.',
    releaseId: seeded.caravan.releaseId, policyVersion: 'dossier-release@1',
    proposedAt: T.built, reviewedAt: T.reviewed, grantedAt: T.reviewed, expiresAt: T.expires,
  });
  await ledger.refuse('have a second reviewer close the same release again, differently', `INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
    VALUES ('RV-SECOND-OPINION', ${sqlText(reviewV1.proposalId)}, '${releaseDigestV1}', 'DENY', 'HUMAN', ${sqlText(secondReviewer.principalId)}, 'I would not have released it.', '${T.reviewed}')`);
  await ledger.refuse('release the draft the reviewer did not see', releaseRow({ digest: draftDigest }));
  // Built over two of three facets: a release names an assessment for every facet of its dossier, or it was built over nothing for one.
  await ledger.refuse('build version 1 naming no assessment for RISK', releaseRow({ names: coverage.filter((c) => c.facet !== 'RISK') }));
  await ledger.write(releaseRow());
  await ledger.refuse('present the spatial computation as something a source observed',
    `INSERT INTO dossier_conclusion VALUES ('CON-BAD-1', 'DREL-1', 'RISK', 'x', 'y', ${sqlText(seeded.spatial.artifact.artifactId)}, 'COMPUTED_RESULT', 'SOURCE_OBSERVATION')`);
  // At its own class this time, so the class check passes and the evidence guard is what refuses: the artifact is DISALLOWED for customer delivery.
  await ledger.refuse('rest a conclusion on evidence a customer audience may not receive',
    `INSERT INTO dossier_conclusion VALUES ('CON-BAD-2', 'DREL-1', 'RISK', 'x', 'y', ${sqlText(seeded.spatial.artifact.artifactId)}, 'COMPUTED_RESULT', 'COMPUTED_RESULT')`);
  await ledger.write(conclusionsV1.map((c, i) =>
    `INSERT INTO dossier_conclusion VALUES (${sqlText(`CON-1-${i}`)}, 'DREL-1', '${c.facet}', ${sqlText(c.statement)}, ${sqlText(c.notCovered)}, ${sqlText(c.artifactId)}, '${c.artifactClass}', '${c.presentedAs}')`).join(';\n'));
  await stage('RELEASE', T.released, `dossier_release DREL-1 v1 under ${scope.authorizationId} (scope) and ${reviewV1.authorizationId} (review); ${conclusionsV1.length} conclusion, ${holes.length} holes`);

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

  /* ── re-assessment: the corpus read again at the correction instant, as a second row per facet ── */
  const coverage2 = await assessAll(T.corrected, 2);
  await ledger.refuse('backdate a re-assessment of DEPENDENCY behind the first', coverageRow({ ...dependency, coverageId: 'COV-BACKDATED', assessedAt: T.asked }));
  await ledger.write(coverageRows(coverage2));
  const changed = coverage2.some((c, i) => c.level !== coverage[i].level || c.assessment !== coverage[i].assessment || c.artifactIds.join(',') !== coverage[i].artifactIds.join(',') || c.evidence.some((e, j) => e.assessment !== coverage[i].evidence[j].assessment));
  // What was checked, said as what was checked: the retractions the ledger holds between the two instants, and the two assessments side by side.
  const takenBackBetween = await ledger.count('retracted_record', `issued_at > '${T.covered}' AND issued_at <= '${T.corrected}'`);
  const reassessment = {
    at: T.corrected, coverage: coverage2, changed,
    because: changed
      ? `Between ${T.covered} and ${T.corrected} the second assessment differs from the first (${takenBackBetween} records taken back in between); version 2 was built over the second.`
      : `Between ${T.covered} and ${T.corrected} the ledger records no retraction, and the second assessment is the first's, artifact for artifact: same levels, same headlines, same evidence assessments. Version 2 names the second all the same: a release is built over the latest assessment at its build, and the earlier row stands.`,
  };

  /* ── corrected release ── */
  const conclusionsV2 = conclusionsFor(dependencyNotCoveredV2);
  const releaseV2 = compiled(2, conclusionsV2, coverage2);
  const releaseDigestV2 = digestOf(releaseV2);
  const because = `Version 1’s DEPENDENCY conclusion stated what it did not cover and omitted that ${takenBackByRun.length} records had been taken back before the run (${takenBackByRun.map((t) => t.retractionId).filter((v, i, a) => a.indexOf(v) === i).join(', ')}). Version 2 restates that sentence; nothing else changed.`;
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
  // Built after the re-assessment but naming the first: a re-assessment binds every later release.
  await ledger.refuse('build version 2 over the first assessment after re-assessing', releaseRow({ id: 'DREL-2', version: 2, digest: releaseDigestV2, auth: reviewV2.authorizationId!, builtAt: T.corrected, releasedAt: T.releasedAgain, names: coverage }));
  await ledger.refuse('release version 2 under version 1’s approval', releaseRow({ id: 'DREL-2', version: 2, digest: releaseDigestV1, auth: reviewV1.authorizationId!, builtAt: T.corrected, releasedAt: T.releasedAgain, names: coverage2 }));
  await ledger.write(releaseRow({ id: 'DREL-2', version: 2, digest: releaseDigestV2, auth: reviewV2.authorizationId!, builtAt: T.corrected, releasedAt: T.releasedAgain, names: coverage2 }));
  await ledger.write(`INSERT INTO release_succession VALUES ('SUC-1', 'DREL-2', 2, 'DREL-1', 1, ${sqlText(because)})`);
  await ledger.write(conclusionsV2.map((c, i) =>
    `INSERT INTO dossier_conclusion VALUES (${sqlText(`CON-2-${i}`)}, 'DREL-2', '${c.facet}', ${sqlText(c.statement)}, ${sqlText(c.notCovered)}, ${sqlText(c.artifactId)}, '${c.artifactClass}', '${c.presentedAs}')`).join(';\n'));
  const deliveryV2 = await deliver('DELIVER-2', 'DREL-2', reviewV2.authorizationId!, T.reviewedAgain, T.deliveredAgain, T.reconciledAgain);
  await stage('MONITORING', T.deliveredAgain, `re-assessed at ${T.corrected} (${changed ? 'changed' : 'unchanged'}; dossier_coverage × ${coverage2.length} more); DREL-2 v2 built over it succeeds DREL-1 (${reviewV2.proposalId} corrects ${deliveryV1.operationId}); ${deliveryV2.attemptId} CONFIRMED; DREL-1, its assessment and its delivery stand`);

  const counts = {
    specs: await ledger.count('dossier_spec'), coverage: await ledger.count('dossier_coverage'), evidence: await ledger.count('dossier_coverage_evidence'), estimates: await ledger.count('dossier_estimate'),
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
    stages, coverage, reassessment, estimate, quotation, scope,
    releases: [
      { releaseId: 'DREL-1', version: 1, releaseDigest: releaseDigestV1, builtSnapshot: snapshot, review: reviewV1, conclusions: conclusionsV1, holes, delivery: deliveryV1 },
      { releaseId: 'DREL-2', version: 2, releaseDigest: releaseDigestV2, builtSnapshot: snapshot, review: reviewV2, conclusions: conclusionsV2, holes: holesOf(coverage2), delivery: deliveryV2 },
    ],
    correction: { successorVersion: 2, predecessorVersion: 1, because, correctsOperationId: deliveryV1.operationId, proposalId: reviewV2.proposalId },
    refusals: ledger.refusals.slice(refusalsBefore),
    counts,
  };
}
