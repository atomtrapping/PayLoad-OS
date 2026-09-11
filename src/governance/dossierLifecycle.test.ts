/**
 * The dossier lifecycle, run against the stacked ledgers.
 *
 * What is asserted is what the database did: which rows went in, in which
 * order, and which constraint refused each row that must not. The receipt is
 * built from values the lifecycle wrote and counts it read back, and running
 * it twice gives the same receipt, which is what lets a committed copy of it
 * be checked for drift.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DOSSIER_STAGES, estimateUnits } from '@/domain/dossierService';
import { GovernanceLedger } from './ledger';
import { seedDemonstration, type Seeded } from './seed';
import { runDossierLifecycle, DOSSIER_INSTANTS, PRICING_POLICY, type DossierLifecycleReceipt } from './dossierLifecycle';

let ledger: GovernanceLedger;
let seeded: Seeded;
let receipt: DossierLifecycleReceipt;

beforeAll(async () => {
  ledger = await GovernanceLedger.open();
  seeded = await seedDemonstration(ledger);
  receipt = await runDossierLifecycle(ledger, seeded);
}, 60_000);
afterAll(async () => { await ledger?.close(); });

describe('one dossier, end to end', () => {
  it('passes through every stage the domain declares, in order, and skips none', () => {
    expect(receipt.stages.map((s) => s.stage)).toEqual([...DOSSIER_STAGES]);
    const instants = receipt.stages.map((s) => s.at);
    expect([...instants].sort()).toEqual(instants);
  });

  it('is marked as what it is on the receipt', () => {
    expect(receipt.fixture_only).toBe(true);
    expect(receipt.simulated).toBe(true);
    expect(receipt.boundToRelease).toBe(seeded.caravan.releaseId);
  });

  it('states a hole as a coverage level and an assessment rather than omitting the facet', () => {
    const supplier = receipt.coverage.find((c) => c.facet === 'SUPPLIER_IDENTITY')!;
    expect(supplier).toMatchObject({ level: 'NONE', assessment: 'MISSING', artifactsAvailable: 0, artifactIds: [], evidence: [] });
    const risk = receipt.coverage.find((c) => c.facet === 'RISK')!;
    expect(risk).toMatchObject({ level: 'NONE', assessment: 'DISALLOWED', artifactsAvailable: 1, artifactsPresent: 0, artifactsDisallowed: 1, runsRepresented: 1, runsUsable: 0, artifactIds: [seeded.spatial.artifact.artifactId] });
    expect(risk.evidence[0].because).toMatch(/rights are none; customer_delivery is not among them/);
    expect(receipt.releases[0].holes.map((h) => [h.facet, h.assessment, h.artifactsAvailable, h.artifactsUsable])).toEqual([['SUPPLIER_IDENTITY', 'MISSING', 0, 0], ['RISK', 'DISALLOWED', 1, 0]]);
  });

  /* Two lot artifacts from one run; one carries customer_delivery and one does not. The headline names the withheld one. */
  it('assesses each artifact against the right the delivery exercises, and the headline is worst-first', () => {
    const dependency = receipt.coverage.find((c) => c.facet === 'DEPENDENCY')!;
    expect(dependency.artifactIds).toEqual(['DEMO-CARAVAN-A001', 'DEMO-CARAVAN-A002']);
    expect(dependency).toMatchObject({ level: 'THIN', assessment: 'DISALLOWED', artifactsAvailable: 2, artifactsPresent: 1, artifactsStale: 0, artifactsConflicting: 0, artifactsDisallowed: 1, runsRepresented: 1, runsUsable: 1 });
    expect(dependency.evidence.map((e) => [e.artifactId, e.assessment])).toEqual([['DEMO-CARAVAN-A001', 'PRESENT'], ['DEMO-CARAVAN-A002', 'DISALLOWED']]);
    expect(dependency.evidence[1].because).toMatch(/acquisition, normalization; customer_delivery is not among them/);
    expect(dependency.basis).toMatch(/1 present, 1 disallowed for customer delivery/);
    expect(JSON.stringify(receipt)).not.toMatch(/this customer/);
  });

  it('wrote the same assessment into the database that the receipt carries, and read the corpus’s retractions from it', async () => {
    const rows = await ledger.rows<{ facet: string; level: string; assessment: string; present: number; available: number }>(
      `SELECT f.facet, c.level, c.assessment, c.artifacts_present AS present, c.artifacts_available AS available
       FROM dossier_coverage c JOIN dossier_facet f ON f.dossier_facet_id = c.dossier_facet_id ORDER BY f.facet`);
    expect(rows).toEqual([...receipt.coverage].sort((a, b) => (a.facet < b.facet ? -1 : 1)).map((c) => ({ facet: c.facet, level: c.level, assessment: c.assessment, present: c.artifactsPresent, available: c.artifactsAvailable })));
    expect(await ledger.count('dossier_coverage_evidence')).toBe(3);
    expect(await ledger.count('retracted_record')).toBe(3); // the backdated one was refused
    expect(await ledger.rows(`SELECT retraction_id, record_id, kind FROM retracted_record ORDER BY record_id`)).toEqual([
      { retraction_id: 'RET-0002', record_id: 'REC-0111', kind: 'WITHDRAWAL' }, { retraction_id: 'RET-0002', record_id: 'REC-0112', kind: 'WITHDRAWAL' }, { retraction_id: 'RET-0001', record_id: 'REC-0203', kind: 'CORRECTION' },
    ]);
  });

  it('estimates deterministically over the coverage rows, counting only the present, and quotes at the approved rate', () => {
    expect(receipt.estimate.units).toBe(estimateUnits(receipt.coverage));
    expect(receipt.estimate.units).toBe(4);
    expect(receipt.quotation.amountMinor).toBe(4 * PRICING_POLICY.unitPriceMinor);
    expect(receipt.quotation.policyId).toBe(PRICING_POLICY.policyId);
  });

  it('has the customer accept the quotation by digest, and a steward approve each release by digest, in their own words', () => {
    expect(receipt.scope.reviewer).toBe('customer:demonstration-buyer');
    expect(receipt.scope.reasoning).toMatch(/Accepted at the quoted amount/);
    expect(receipt.releases[0].review.reasoning).toMatch(/withheld lot artifact included/);
    expect(receipt.releases[1].review.reasoning).toMatch(/version 1 stays/);
    expect(receipt.scope.actionDigest).toBe(receipt.quotation.digest);
    expect(receipt.scope.authorizationId).toBe('AU-DOSSIER-SCOPE');
    for (const release of receipt.releases) {
      expect(release.review.reviewer).toBe('operator:corpus-steward');
      expect(release.review.actionDigest).toBe(release.releaseDigest);
      expect(release.review.authorizationId).toBeTruthy();
    }
    expect(receipt.releases[0].review.authorizationId).not.toBe(receipt.releases[1].review.authorizationId);
  });

  it('presents its one conclusion at the class it was computed at, resting on the one present artifact, and names the withheld one without quoting it', () => {
    for (const release of receipt.releases) {
      expect(release.conclusions.map((c) => c.facet)).toEqual(['DEPENDENCY']);
      for (const conclusion of release.conclusions) {
        expect(conclusion.presentedAs).toBe(conclusion.artifactClass);
        expect(conclusion.artifactId).toBe('DEMO-CARAVAN-A001');
        expect(conclusion.notCovered).toMatch(/DEMO-CARAVAN-A002 bears on this facet and is DISALLOWED for customer delivery, so this statement rests on DEMO-CARAVAN-A001 alone/);
        expect(conclusion.notCovered).not.toMatch(/LOT-7C-104|rights are/);
      }
      const bytes = JSON.stringify(release);
      expect(bytes).not.toMatch(/about no building/);
      expect(bytes).not.toMatch(/LOT-7C-104/);
    }
  });

  it('delivers through a dispatch whose receipt says it was simulated, and reconciles it', () => {
    for (const release of receipt.releases) {
      expect(release.delivery.outcome).toBe('CONFIRMED');
      expect(release.delivery.venueReceipt).toMatch(/^SIMULATED_LOCAL:sha256:/);
      expect(release.delivery.reconciliation.found).toBe('DID_HAPPEN');
      expect(release.delivery.reconciliation.basis).toMatch(/simulated/i);
      expect(release.delivery.receiptBasis).toMatch(/^SIMULATED_LOCAL/);
      expect(release.delivery.recipient).toBe(receipt.recipient);
    }
  });

  it('corrects by a new release that names what it corrects, and leaves version 1 standing', async () => {
    expect(receipt.correction.correctsOperationId).toBe(receipt.releases[0].delivery.operationId);
    expect(receipt.releases[1].review.correctsOperationId).toBe(receipt.releases[0].delivery.operationId);
    expect(receipt.correction.because).toMatch(/RET-0001, RET-0002|RET-0002, RET-0001/);
    const v1 = receipt.releases[0].conclusions.find((c) => c.facet === 'DEPENDENCY')!;
    const v2 = receipt.releases[1].conclusions.find((c) => c.facet === 'DEPENDENCY')!;
    expect(v1.statement).toBe(v2.statement);
    expect(v2.notCovered).toContain(v1.notCovered);
    expect(v2.notCovered).toMatch(/REC-0111 under RET-0002/);
    expect(await ledger.rows(`SELECT dossier_release_id FROM dossier_release ORDER BY version`)).toEqual([{ dossier_release_id: 'DREL-1' }, { dossier_release_id: 'DREL-2' }]);
    expect(await ledger.rows(`SELECT successor_release_id, predecessor_release_id FROM release_succession`)).toEqual([{ successor_release_id: 'DREL-2', predecessor_release_id: 'DREL-1' }]);
    expect(await ledger.count('dossier_delivery')).toBe(2);
  });

  it('observed every refusal it claims, by the constraint that refused it', () => {
    const spatial = seeded.spatial.artifact.artifactId;
    expect(receipt.refusals.map((r) => [r.label, r.refusedBy])).toEqual([
      ['call a facet with nothing behind it PRESENT', 'coverage_assessment_is_the_rollup'],
      ['label the spatial computation PRESENT', `evidence_assessment_is_not_the_artifacts:${spatial}:PRESENT recorded, DISALLOWED from the artifact`],
      ['call one present artifact SUPPORTED', 'coverage_level_counts_the_present'],
      ['count the withheld lot artifact as present', 'coverage_does_not_match_its_evidence:COV-BAD-4:counts 2/0/0/0 but its evidence rows are 1/0/0/1'],
      ['rewrite the RISK coverage row as PRESENT after it was written', 'coverage_is_written_once:UPDATE of dossier_coverage'],
      ['backdate a withdrawal of a record the present lot artifact read', 'retraction_contradicts_a_standing_assessment:RET-BACKDATED:DEMO-CARAVAN-A001 in COV-DEPENDENCY is PRESENT and would be STALE had REC-0204 been known'],
      ['quote the work before any pricing policy is approved', 'quotation_policy'],
      ['quote an amount that is not units times the rate', 'quotation_is_units_at_the_rate'],
      ['release before the customer accepted, and before anyone reviewed', 'release_scope_accepted'],
      ['have the agent grant the release authorization', 'execution_authorization_granted_by_kind_check'],
      ['have a second reviewer close the same release again, differently', 'review_closes_once'],
      ['release the draft the reviewer did not see', 'release_reviewed'],
      ['present the spatial computation as something a source observed', 'conclusion_presented_at_its_class'],
      ['rest a conclusion on evidence a customer audience may not receive', `conclusion_rests_on_no_present_evidence:${spatial}:RISK in DREL-1`],
      ['record a delivery no dispatch carried', 'dossier_delivery_attempt_id_fkey'],
      ['deliver the dossier to the other customer', 'delivery_goes_to_the_dossiers_recipient'],
      ['release version 2 under version 1’s approval', 'release_authorization_once'],
    ]);
    expect(receipt.counts.refusals).toBe(17);
  });

  it('counts what it wrote', () => {
    expect(receipt.counts).toEqual({
      specs: 1, coverage: 3, evidence: 3, estimates: 1, quotations: 1, releases: 2, conclusions: 2, deliveries: 2,
      proposals: 3, authorizations: 3, attempts: 2, refusals: 17,
    });
  });

  it('declares its clock rather than reading one', () => {
    for (const value of Object.values(DOSSIER_INSTANTS)) expect(Number.isFinite(Date.parse(value))).toBe(true);
    expect(receipt.stages[0].at).toBe(DOSSIER_INSTANTS.asked);
    expect(Date.parse(DOSSIER_INSTANTS.asked)).toBeGreaterThan(Date.parse(seeded.spatial.run.completedAt));
  });

  it('gives the same receipt again', async () => {
    const again = await GovernanceLedger.open();
    try {
      const seededAgain = await seedDemonstration(again);
      expect(await runDossierLifecycle(again, seededAgain)).toEqual(receipt);
    } finally { await again.close(); }
  }, 60_000);
});
