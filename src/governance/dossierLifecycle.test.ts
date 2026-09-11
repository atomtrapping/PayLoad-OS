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

  it('states a hole as a coverage level rather than omitting the facet', () => {
    const hole = receipt.coverage.find((c) => c.facet === 'SUPPLIER_IDENTITY')!;
    expect(hole.level).toBe('NONE');
    expect(hole.artifactIds).toEqual([]);
    expect(receipt.releases[0].holes.map((h) => h.facet)).toEqual(['SUPPLIER_IDENTITY']);
    expect(receipt.coverage.find((c) => c.facet === 'DEPENDENCY')!.artifactIds).toEqual(['DEMO-CARAVAN-A001', 'DEMO-CARAVAN-A002']);
    expect(receipt.coverage.find((c) => c.facet === 'RISK')!.artifactIds).toEqual([seeded.spatial.artifact.artifactId]);
  });

  it('estimates deterministically over the coverage rows and quotes at the approved rate', () => {
    expect(receipt.estimate.units).toBe(estimateUnits(receipt.coverage));
    expect(receipt.estimate.units).toBe(5);
    expect(receipt.quotation.amountMinor).toBe(5 * PRICING_POLICY.unitPriceMinor);
    expect(receipt.quotation.policyId).toBe(PRICING_POLICY.policyId);
  });

  it('has the customer accept the quotation by digest, and a steward approve each release by digest', () => {
    expect(receipt.scope.reviewer).toBe('customer:demonstration-buyer');
    expect(receipt.scope.actionDigest).toBe(receipt.quotation.digest);
    expect(receipt.scope.authorizationId).toBe('AU-DOSSIER-SCOPE');
    for (const release of receipt.releases) {
      expect(release.review.reviewer).toBe('operator:corpus-steward');
      expect(release.review.actionDigest).toBe(release.releaseDigest);
      expect(release.review.authorizationId).toBeTruthy();
    }
    expect(receipt.releases[0].review.authorizationId).not.toBe(receipt.releases[1].review.authorizationId);
  });

  it('presents every conclusion at the class it was computed at, resting on a real artifact', () => {
    for (const release of receipt.releases) {
      for (const conclusion of release.conclusions) {
        expect(conclusion.presentedAs).toBe(conclusion.artifactClass);
        expect([...seeded.caravan.artifactIds, seeded.spatial.artifact.artifactId]).toContain(conclusion.artifactId);
        expect(conclusion.notCovered.length).toBeGreaterThan(20);
      }
    }
    expect(receipt.releases[0].conclusions.find((c) => c.facet === 'RISK')!.statement).toMatch(/about no building/);
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
    expect(receipt.refusals.map((r) => [r.label, r.refusedBy])).toEqual([
      ['count coverage for a facet as NONE while naming an artifact', 'coverage_none_is_zero'],
      ['quote the work before any pricing policy is approved', 'quotation_policy'],
      ['quote an amount that is not units times the rate', 'quotation_is_units_at_the_rate'],
      ['release before the customer accepted, and before anyone reviewed', 'release_scope_accepted'],
      ['have the agent grant the release authorization', 'execution_authorization_granted_by_kind_check'],
      ['have a second reviewer close the same release again, differently', 'review_closes_once'],
      ['release the draft the reviewer did not see', 'release_reviewed'],
      ['present the spatial computation as something a source observed', 'conclusion_presented_at_its_class'],
      ['record a delivery no dispatch carried', 'dossier_delivery_attempt_id_fkey'],
      ['deliver the dossier to the other customer', 'delivery_goes_to_the_dossiers_recipient'],
      ['release version 2 under version 1’s approval', 'release_authorization_once'],
    ]);
    expect(receipt.counts.refusals).toBe(11);
  });

  it('counts what it wrote', () => {
    expect(receipt.counts).toEqual({
      specs: 1, coverage: 3, estimates: 1, quotations: 1, releases: 2, conclusions: 4, deliveries: 2,
      proposals: 3, authorizations: 3, attempts: 2, refusals: 11,
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
