import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The governance demonstration on the four operator pages.
 *
 * Each page shows what its ledger recorded — the rows, the refusals, the
 * versions, the approvals and denials, and the outcomes nobody resolved —
 * and the inspector opens on a governed act to show what the reviewer was
 * shown, what they said, what was granted, taken back, dispatched and
 * reconciled.
 */
test('the dossier page carries one lifecycle end to end, and the inspector shows the correction’s lineage', async ({ page }) => {
  await page.goto('/dossier');
  await expect(page.getByTestId('dossier-count')).toContainText('1 dossier asked for by a simulated buyer, 2 releases, version 2 corrects version 1, 17 rows refused');
  const coverage = page.getByTestId('dossier-coverage');
  await expect(coverage.locator('tbody tr')).toHaveCount(3);
  await expect(coverage.locator('[data-facet="SUPPLIER_IDENTITY"]')).toHaveAttribute('data-level', 'NONE');
  await expect(coverage.locator('[data-facet="SUPPLIER_IDENTITY"]')).toHaveAttribute('data-assessment', 'MISSING');
  await expect(coverage.locator('[data-facet="DEPENDENCY"]')).toHaveAttribute('data-assessment', 'DISALLOWED');
  await expect(coverage.locator('[data-facet="DEPENDENCY"] [data-evidence="DEMO-CARAVAN-A001"]')).toHaveAttribute('data-evidence-assessment', 'PRESENT');
  await expect(coverage.locator('[data-facet="DEPENDENCY"] [data-evidence="DEMO-CARAVAN-A002"]')).toHaveAttribute('data-evidence-assessment', 'DISALLOWED');
  await expect(coverage.locator('[data-facet="RISK"]')).toHaveAttribute('data-level', 'NONE');
  await expect(coverage.locator('[data-facet="RISK"]')).toHaveAttribute('data-assessment', 'DISALLOWED');
  await expect(page.getByTestId('dossier-quotation')).toContainText('4 × 120000 = 480000 CAD minor');
  await expect(page.getByTestId('dossier-release-1').locator('[data-conclusion]')).toHaveCount(1);
  await expect(page.getByTestId('dossier-release-1').locator('[data-hole="RISK"]')).toHaveAttribute('data-hole-assessment', 'DISALLOWED');
  await expect(page.getByTestId('dossier-release-1')).not.toContainText('about no building');
  await expect(page.getByTestId('dossier-release-2')).toBeVisible();
  await expect(page.getByTestId('dossier-delivery-1')).toContainText('SIMULATED_LOCAL');
  await expect(page.getByTestId('dossier-correction')).toContainText('corrects O-DELIVER-1');
  await expect(page.getByTestId('dossier-refusals').locator('tbody tr')).toHaveCount(17);
  await expect(page.getByTestId('dossier-refusals')).toContainText('evidence_assessment_is_not_the_artifacts');
  await expect(page.getByTestId('dossier-refusals')).toContainText('coverage_is_written_once');
  await expect(page.getByTestId('dossier-refusals')).toContainText('retraction_contradicts_a_standing_assessment');

  await page.locator('[data-act-select="P-DOSSIER-RELEASE-2"]').click();
  const inspector = page.getByTestId('governed-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId('act-digest')).toContainText('sha256:');
  await expect(inspector.getByTestId('act-lineage')).toContainText('Corrects operation O-DELIVER-1');
  await expect(inspector.getByTestId('act-reconciliation')).toContainText('DID_HAPPEN');
});

test('the newsroom page archives the article and withholds the post, with four reviews and a refused repetition', async ({ page }) => {
  await page.goto('/newsroom');
  await expect(page.getByTestId('editorial-standing')).toContainText('2 releases: 1 archived, 1 reviewed and withheld, 8 rows refused');
  await expect(page.getByTestId('editorial-reviews').locator('tbody tr[data-passed="true"]')).toHaveCount(4);
  await expect(page.getByTestId('editorial-article')).toHaveAttribute('data-published', 'true');
  await expect(page.getByTestId('editorial-article-publication')).toContainText('PUB-ARCHIVE-1');
  await expect(page.getByTestId('editorial-post')).toHaveAttribute('data-published', 'false');
  await expect(page.getByTestId('editorial-post-withheld')).toContainText('external execution is disabled');
  await expect(page.getByTestId('editorial-post-qualifiers')).toContainText('not a real lot');
  await expect(page.getByTestId('editorial-repetition')).toContainText('repetition_is_not_corroboration');
  await expect(page.getByTestId('editorial-refusals').locator('tbody tr')).toHaveCount(8);
});

test('the treasury page shows ten simulated proposals, the reserve as a chain, and where each stopped', async ({ page }) => {
  await page.goto('/treasury');
  await expect(page.getByTestId('treasury-standing')).toContainText('11 simulated proposals: 9 approved, 1 denied, 2 blocked by eligibility, 2 dispatched, 1 unresolved, 11 rows refused');
  await expect(page.getByTestId('treasury-nothing-moved')).toContainText('No money exists');
  await expect(page.getByTestId('treasury-chain').locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('treasury-remaining')).toContainText('70000 remains');
  await expect(page.getByTestId('treasury-eligibility').locator('[data-eligibility="UNRESOLVED"]')).toHaveCount(1);
  await expect(page.getByTestId('treasury-refusals').locator('tbody tr')).toHaveCount(11);

  await page.locator('[data-act-select="TP-4"]').click();
  const inspector = page.getByTestId('governed-inspector');
  await expect(inspector.getByTestId('act-revocation')).toContainText('re-keyed');
  await page.locator('[data-act-select="TP-11"]').click();
  await expect(inspector.getByTestId('act-refused')).toContainText('dispatch_within_the_authorization');
  await page.locator('[data-act-select="TP-10"]').click();
  await expect(inspector.getByTestId('act-reconciliation')).toContainText('STILL_UNKNOWN');
});

test('the control plane counts every governed act, names every guard, and is accessible with the inspector open', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByTestId('governed-counts')).toContainText('15 proposals through one kernel in two databases, and one refused before it was a row: 10 authorized, 1 revoked, 4 dispatched, 4 reconciled, 1 unresolved; 36 rows refused by 34 named guards');
  await expect(page.getByTestId('guards')).toContainText('review_closes_once');
  await expect(page.getByTestId('not-claimed').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('all-refusals').locator('tbody tr')).toHaveCount(36);
  await expect(page.getByTestId('governed-act').locator('[data-act-id]')).toHaveCount(16);

  await page.locator('[data-act-select="P-DOSSIER-SCOPE"]').click();
  await expect(page.getByTestId('governed-inspector').getByTestId('act-review')).toContainText('customer:demonstration-buyer');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations, JSON.stringify(results.violations.map((v) => v.id))).toEqual([]);
});
