/**
 * One row shape for every governed act, whichever ledger it went through.
 *
 * A dossier release, an article, a transfer: each was proposed, shown to a
 * reviewer as a digest or a set of bound columns, granted or not, dispatched
 * or not, reconciled or not, and possibly refused by a named guard. The
 * register shows that shape once, and these adapters read each receipt into
 * it without the receipt learning about the register.
 */
import type { GovernanceDemonstration } from '@/governance/demonstration';
import type { DossierLifecycleReceipt } from '@/governance/dossierLifecycle';
import type { EditorialLifecycleReceipt } from '@/governance/editorialLifecycle';
import type { TreasurySimulationReceipt } from '@/governance/treasurySimulation';
import type { GovernedAct } from '@/governance/ledger';

export type Lifecycle = 'DOSSIER' | 'EDITORIAL' | 'TREASURY';

export interface GovernedActRow {
  id: string;
  lifecycle: Lifecycle;
  kind: string;
  subject: string;
  /** The digest the review was of, where the kernel bound one. The treasury binds columns instead. */
  digest: string | null;
  boundTo: string;
  review: { response: string; reviewer: string; reasoning: string } | null;
  authorization: { id: string; grantedBy: string; grantedAt: string; expiresAt: string } | null;
  revocation: { by: string; at: string; reason: string } | null;
  dispatch: { id: string; outcome: string; at: string; receipt: string | null } | null;
  reconciliation: { found: string; basis: string } | null;
  corrects: string | null;
  revises: string | null;
  standing: string;
  refusedBy: string | null;
}

const fromKernel = (act: GovernedAct, lifecycle: Lifecycle, subject: string, standing: string, boundTo: string): GovernedActRow => ({
  id: act.proposalId, lifecycle, kind: act.operationKind, subject, digest: act.actionDigest, boundTo,
  review: { response: act.response, reviewer: act.reviewer, reasoning: '' },
  authorization: act.authorizationId ? { id: act.authorizationId, grantedBy: act.grantedBy!, grantedAt: act.grantedAt, expiresAt: act.expiresAt } : null,
  revocation: null, dispatch: null, reconciliation: null,
  corrects: act.correctsOperationId, revises: act.revisesProposalId,
  standing, refusedBy: null,
});

export function dossierActs(receipt: DossierLifecycleReceipt): GovernedActRow[] {
  const scope = fromKernel(receipt.scope, 'DOSSIER', `Quotation ${receipt.quotation.quotationId}: ${receipt.quotation.units} units × ${receipt.quotation.unitPriceMinor} = ${receipt.quotation.amountMinor} ${receipt.quotation.currency} minor`, 'ACCEPTED BY THE CUSTOMER', `the quotation's digest, ${receipt.boundToRelease}`);
  scope.review = { ...scope.review!, reasoning: 'The customer accepted the quotation as put, by digest.' };
  const releases = receipt.releases.map((release, index) => {
    const correctedBy = receipt.releases[index + 1];
    const row = fromKernel(release.review, 'DOSSIER', `${release.releaseId} v${release.version}: ${release.conclusions.length} conclusion, ${release.holes.length} stated holes (${release.holes.map((h) => h.assessment).join(', ')})`, correctedBy ? `RELEASED · DELIVERED (simulated) · CORRECTED BY v${correctedBy.version}` : 'RELEASED · DELIVERED (simulated)', `the compiled release's digest, ${receipt.boundToRelease}`);
    row.review = { ...row.review!, reasoning: 'Each conclusion presented at its computed class; every gap stated.' };
    row.dispatch = { id: release.delivery.attemptId, outcome: release.delivery.outcome, at: receipt.stages.find((s) => s.stage === (index === 0 ? 'DELIVERED' : 'MONITORING'))?.at ?? '', receipt: release.delivery.venueReceipt };
    row.reconciliation = { found: release.delivery.reconciliation.found, basis: release.delivery.reconciliation.basis };
    return row;
  });
  return [scope, ...releases];
}

export function editorialActs(receipt: EditorialLifecycleReceipt): GovernedActRow[] {
  const article = fromKernel(receipt.article.review, 'EDITORIAL', `${receipt.article.channel}: ${receipt.article.message.headline}`, 'RELEASED · ARCHIVED', `the article's digest, ${receipt.boundToRelease}`);
  article.review = { ...article.review!, reasoning: 'The headline says what the chart shows; the qualifiers say what it is not.' };
  article.dispatch = receipt.article.publication ? { id: receipt.article.publication.publicationId, outcome: 'ARCHIVED', at: receipt.article.publication.at, receipt: null } : null;
  const post = fromKernel(receipt.post.review, 'EDITORIAL', `${receipt.post.channel}: ${receipt.post.message.headline} (${receipt.post.characters} characters)`, 'RELEASED · WITHHELD', `the post's digest, ${receipt.boundToRelease}`);
  post.review = { ...post.review!, reasoning: receipt.post.withheldBecause ?? '' };
  return [article, post];
}

export function treasuryActs(receipt: TreasurySimulationReceipt): GovernedActRow[] {
  return receipt.proposals.map((p) => ({
    id: p.proposalId, lifecycle: 'TREASURY', kind: 'TREASURY_TRANSFER',
    subject: `${p.amountMinor} minor → ${p.destination} in ${p.asset} (eligibility ${p.eligibility})`,
    digest: null, boundTo: 'the proposal’s amount, asset, network and destination, tied by key',
    review: p.review ? { response: p.review.response, reviewer: p.review.reviewer, reasoning: p.review.reasoning } : null,
    authorization: p.authorizationId ? { id: p.authorizationId, grantedBy: p.grantedBy!, grantedAt: '', expiresAt: '' } : null,
    revocation: p.revocation ? { by: p.revocation.revokedBy, at: p.revocation.at, reason: p.revocation.reason } : null,
    dispatch: p.dispatch ? { id: p.dispatch.dispatchId, outcome: p.dispatch.outcome, at: p.dispatch.at, receipt: null } : null,
    reconciliation: p.reconciliation ? { found: p.reconciliation.found, basis: p.reconciliation.basis } : null,
    corrects: null, revises: p.revises,
    standing: p.standing.replace(/_/g, ' '), refusedBy: p.refusedBy,
  }));
}

export function allActs(demo: GovernanceDemonstration): GovernedActRow[] {
  return [...dossierActs(demo.dossier), ...editorialActs(demo.editorial), ...treasuryActs(demo.treasury)];
}
