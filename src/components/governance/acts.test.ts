import { describe, expect, it } from 'vitest';
import { GOVERNANCE_DEMONSTRATION } from '@/fixtures/governance/committed';
import { allActs, dossierActs, editorialActs, treasuryActs } from './acts';

const demo = GOVERNANCE_DEMONSTRATION;

describe('one row shape for every governed act', () => {
  it('reads the dossier: the customer’s acceptance, then two reviewed releases each delivered and reconciled', () => {
    const rows = dossierActs(demo.dossier);
    expect(rows.map((r) => r.id)).toEqual(['P-DOSSIER-SCOPE', 'P-DOSSIER-RELEASE-1', 'P-DOSSIER-RELEASE-2']);
    expect(rows[0].review).toMatchObject({ response: 'APPROVE', reviewer: 'customer:demonstration-buyer' });
    expect(rows[0].digest).toBe(demo.dossier.quotation.digest);
    for (const release of rows.slice(1)) {
      expect(release.dispatch?.outcome).toBe('CONFIRMED');
      expect(release.dispatch?.receipt).toMatch(/^SIMULATED_LOCAL:/);
      expect(release.reconciliation?.found).toBe('DID_HAPPEN');
    }
    expect(rows[1].standing).toMatch(/CORRECTED BY v2/);
    expect(rows[2].corrects).toBe(demo.dossier.releases[0].delivery.operationId);
  });

  it('reads the newsroom: the article archived, the post withheld', () => {
    const [article, post] = editorialActs(demo.editorial);
    expect(article.dispatch).toMatchObject({ id: 'PUB-ARCHIVE-1', outcome: 'ARCHIVED' });
    expect(article.digest).toBe(demo.editorial.article.messageDigest);
    expect(post.dispatch).toBeNull();
    expect(post.standing).toBe('RELEASED · WITHHELD');
    expect(post.review?.reasoning).toMatch(/external execution is disabled/);
  });

  it('reads the treasury: where each of eleven proposals stopped, and why — one before it was a row', () => {
    const rows = treasuryActs(demo.treasury);
    expect(rows).toHaveLength(11);
    expect(demo.treasury.counts.proposals).toBe(10);
    const by = (id: string) => rows.find((r) => r.id === id)!;
    expect(by('TP-9').review).toBeNull();
    expect(by('TP-9').refusedBy).toBe('proposal_stays_within_the_entity');
    expect(by('TP-4').revocation?.by).toBe('operator:treasurer');
    expect(by('TP-10').reconciliation?.found).toBe('STILL_UNKNOWN');
    expect(by('TP-11').standing).toBe('EXPIRED BEFORE DISPATCH');
    expect(by('TP-3').revises).toBe('TP-2');
    expect(by('TP-1').dispatch?.outcome).toBe('CONFIRMED');
    for (const row of rows) expect(row.digest).toBeNull();
  });

  it('puts all sixteen in one register', () => {
    const rows = allActs(demo);
    expect(rows).toHaveLength(16);
    expect(new Set(rows.map((r) => r.id)).size).toBe(16);
    expect(rows.map((r) => r.lifecycle)).toEqual([...Array(3).fill('DOSSIER'), ...Array(2).fill('EDITORIAL'), ...Array(11).fill('TREASURY')]);
  });
});
