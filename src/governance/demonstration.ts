/**
 * The governance demonstration: three lifecycles, two databases, one receipt.
 *
 * The products stack — kernel, discovery, dossier, newsroom — is seeded with
 * the Caravan demonstration corpus, the mining run over it and the spatial
 * comparison, and then a dossier and a briefing are run through it. The
 * treasury stack is a second database with simulated accounts, and the
 * treasury simulation is run through that. What comes back is everything the
 * three lifecycles wrote and every refusal they observed, with the declared
 * instants they ran at, so that the same function run again returns the same
 * bytes and a committed copy can be checked for drift.
 *
 * WHAT THE RECEIPT IS AND IS NOT
 *
 * It is a record of what four ledgers accepted and refused when a governed
 * lifecycle was put through them, over a corpus that is a fixture, for a
 * customer that is simulated, with money that does not exist. It is not
 * coverage, customer activity, provider integration or performance, and it
 * says so in its own fields rather than in a footnote.
 */
import { GovernanceLedger, type Refusal } from './ledger';
import { seedDemonstration } from './seed';
import { runDossierLifecycle, type DossierLifecycleReceipt } from './dossierLifecycle';
import { runEditorialLifecycle, type EditorialLifecycleReceipt } from './editorialLifecycle';
import { runTreasurySimulation, type TreasurySimulationReceipt } from './treasurySimulation';
import { ALL_PRINCIPALS } from './principals';
import type { Principal } from './ledger';

export const GOVERNANCE_DEMONSTRATION_SCHEMA = 'notationsos.governance-demonstration.v1';

export interface GovernanceDemonstration {
  readonly schema: typeof GOVERNANCE_DEMONSTRATION_SCHEMA;
  readonly fixture_only: true;
  readonly simulated: true;
  readonly stampedWith: string;
  readonly principals: readonly Principal[];
  readonly seeded: {
    caravan: { corpusId: string; releaseId: string; recordsSeeded: number; runId: string; artifactIds: readonly string[]; takenBack: ReadonlyArray<{ recordId: string; retractionId: string; kind: string }> };
    spatial: { releaseId: string; artifactId: string; specFingerprint: string; baselineUnchanged: boolean; baselineDigest: string; changes: number };
  };
  readonly dossier: DossierLifecycleReceipt;
  readonly editorial: EditorialLifecycleReceipt;
  readonly treasury: TreasurySimulationReceipt;
  /** Every refusal, from every lifecycle, with the ledger it happened in. */
  readonly refusals: ReadonlyArray<Refusal & { lifecycle: 'DOSSIER' | 'EDITORIAL' | 'TREASURY' }>;
  /** The constraints, keys, indexes and triggers that did the refusing, by name, once each. */
  readonly refusedBy: readonly string[];
  readonly counts: { refusals: number; proposals: number; authorizations: number; revocations: number; dispatches: number; reconciliations: number; unresolved: number; releases: number; publications: number; deliveries: number };
  readonly notClaimed: readonly string[];
}

export async function runGovernanceDemonstration(): Promise<GovernanceDemonstration> {
  const products = await GovernanceLedger.open('governance_products', 'PRODUCTS');
  const treasury = await GovernanceLedger.open('governance_treasury', 'TREASURY');
  try {
    const seeded = await seedDemonstration(products);
    const dossier = await runDossierLifecycle(products, seeded);
    const editorial = await runEditorialLifecycle(products, seeded);
    const money = await runTreasurySimulation(treasury);
    const refusals = [
      ...dossier.refusals.map((r) => ({ ...r, lifecycle: 'DOSSIER' as const })),
      ...editorial.refusals.map((r) => ({ ...r, lifecycle: 'EDITORIAL' as const })),
      ...money.refusals.map((r) => ({ ...r, lifecycle: 'TREASURY' as const })),
    ];
    return {
      schema: GOVERNANCE_DEMONSTRATION_SCHEMA,
      fixture_only: true, simulated: true,
      stampedWith: 'npm run stamp:governance',
      principals: ALL_PRINCIPALS,
      seeded: {
        caravan: { corpusId: seeded.caravan.corpusId, releaseId: seeded.caravan.releaseId, recordsSeeded: seeded.caravan.recordsSeeded, runId: seeded.caravan.run.result.runId, artifactIds: seeded.caravan.artifactIds, takenBack: seeded.caravan.run.takenBack },
        spatial: { releaseId: seeded.spatial.releaseId, artifactId: seeded.spatial.artifact.artifactId, specFingerprint: seeded.spatial.spec.specFingerprint, baselineUnchanged: seeded.spatial.baseline.unchanged, baselineDigest: seeded.spatial.baseline.resultDigest, changes: seeded.spatial.comparison.changes.length },
      },
      dossier, editorial, treasury: money,
      refusals,
      refusedBy: [...new Set(refusals.map((r) => r.refusedBy.split(':')[0]))].sort(),
      counts: {
        refusals: refusals.length,
        proposals: dossier.counts.proposals + editorial.counts.proposals + money.counts.proposals,
        authorizations: dossier.counts.authorizations + editorial.counts.authorizations + money.counts.authorizations,
        revocations: money.counts.revocations,
        dispatches: dossier.counts.attempts + money.counts.dispatches,
        reconciliations: dossier.counts.attempts + money.counts.reconciliations,
        unresolved: money.counts.unresolved,
        releases: dossier.counts.releases + editorial.counts.releases,
        publications: editorial.counts.publications,
        deliveries: dossier.counts.deliveries,
      },
      notClaimed: [
        'No customer exists; the buyer is a registered simulated principal and the delivery receipt is the attempt row.',
        'No money exists; the accounts, provider and balance are simulated and the one confirmed dispatch reconciles against a simulated receipt.',
        'Nothing was posted; the post is reviewed and authorized for its channel and withheld, and no publication row for it exists.',
        'No artifact is validated; every conclusion and claim rests on a NOT_VALIDATED computation over a demonstration corpus.',
        'No approval was supplied by a request; every authorization row rests on a review row by a registered HUMAN principal of the digest it binds to.',
        'Silence approved nothing; every authorization has a review, every denial is a row, and an unknown outcome is carried as unresolved.',
      ],
    };
  } finally {
    await products.close();
    await treasury.close();
  }
}
