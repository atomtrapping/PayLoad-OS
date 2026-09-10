import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The discovery layer with something in it.
 *
 * The page used to describe a computation. It now carries one that ran, so
 * what is checked here is the pair of numbers a reader could confuse: the
 * derivations over admitted evidence, which are zero, and the artifacts over
 * the demonstration corpus, which are not. A page that let the second move the
 * first would be reporting a capability the corpus does not have.
 */
test('the discovery layer reports a demonstration run without moving the admitted zero', async ({ page }) => {
  await page.goto('/discovery');
  await expect(page.getByRole('heading', { level: 1, name: 'Computational discovery' })).toBeVisible();

  // Two counts, kept apart. The first is about admitted evidence and is zero.
  await expect(page.getByTestId('derivation-count')).toContainText('0 derivations over admitted evidence');
  await expect(page.getByTestId('demonstration-count')).toContainText('run 3 times over the demonstration corpus');
  await expect(page.getByTestId('demonstration-count')).toContainText('11 artifacts');
  await expect(page.getByTestId('demonstration-count')).toContainText('stays where it is');

  // And the basis is stated above the result rather than under it.
  await expect(page.getByTestId('mining-basis')).toContainText('no statement at all about the world');
});

test('one computation identity, three runs, and five records the run would not read', async ({ page }) => {
  await page.goto('/discovery');
  const fingerprint = await page.getByTestId('spec-fingerprint').innerText();
  expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

  const runs = page.locator('[data-run]');
  await expect(runs).toHaveCount(3);
  for (const domain of ['CARAVAN', 'TRADEWIND', 'LANDSHARK']) {
    await expect(page.locator(`[data-run="DEMO-${domain}"]`)).toHaveAttribute('data-status', 'SUCCEEDED');
  }

  // Every withdrawn and corrected record is named as one the run did not read.
  const takenBack = await page.locator('[data-taken-back]').evaluateAll((cells) =>
    cells.reduce((total, cell) => total + Number(cell.getAttribute('data-taken-back')), 0));
  expect(takenBack).toBe(5);
  await expect(page.locator('[data-run="DEMO-CARAVAN"] [data-taken-back]')).toContainText('REC-0203 (correction)');
  await expect(page.locator('[data-run="DEMO-LANDSHARK"] [data-taken-back]')).toContainText('LS-0112 (withdrawal)');
  await expect(page.getByTestId('taken-back-rule')).toContainText('does not read what the corpus took back');
});

test('an artifact names what it read, what may be done with it, and that nobody has checked it', async ({ page }) => {
  await page.goto('/discovery');
  const register = page.getByTestId('mining-workspace');
  await expect(register.locator('[data-artifact-id]')).toHaveCount(11);
  await expect(page.getByTestId('mining-standing')).toContainText('0 validated, 0 served');

  // A single-sourced subject: the strongest finding the measure can make, and
  // the one an independent source would help most.
  await register.locator('[data-artifact-select="DEMO-CARAVAN-A003"]').click();
  const inspector = page.getByTestId('artifact-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId('artifact-claim')).toContainText('rest on one source, northgate-lims');

  // The lineage is the claim. Two records, both named, neither retracted.
  const lineage = inspector.getByTestId('artifact-lineage');
  await expect(lineage.locator('[data-input-record]')).toHaveCount(2);
  for (const retracted of ['REC-0111', 'REC-0112', 'REC-0203']) {
    await expect(lineage.locator(`[data-input-record="${retracted}"]`)).toHaveCount(0);
  }

  await expect(inspector.getByTestId('artifact-rights')).toContainText('acquisition');
  await expect(inspector.getByTestId('artifact-validation')).toHaveText('NOT_VALIDATED');
  await expect(inspector.getByTestId('artifact-gap')).toContainText('No independent source covers it');
  await expect(inspector.getByTestId('artifact-proposal')).toContainText('independent registered source');
  await expect(inspector.getByTestId('artifact-proposal')).not.toContainText('://');

  // The selection is in the URL, so a reader can say which artifact they saw.
  await expect(page).toHaveURL(/#.*artifact=DEMO-CARAVAN-A003/);
});

test('a selected artifact opens from its own link', async ({ page }) => {
  await page.goto('/discovery#artifact=DEMO-LANDSHARK-A001');
  const inspector = page.getByTestId('artifact-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId('artifact-claim')).toContainText('cadastral-registry');
});

/*
 * A separate load, deliberately. Changing only the fragment is a same-document
 * navigation: nothing remounts, so a page that already had a row open would go
 * on showing it and the case would pass without testing anything. The link
 * this is about is one somebody pastes into a fresh tab.
 */
test('a link naming an artifact the page does not hold opens on nothing', async ({ page }) => {
  await page.goto('/discovery#artifact=DEMO-NOWHERE-A999');
  await expect(page.getByRole('heading', { level: 1, name: 'Computational discovery' })).toBeVisible();
  await expect(page.getByTestId('mining-workspace').locator('[data-artifact-id]')).toHaveCount(11);
  await expect(page.getByTestId('artifact-inspector')).toHaveCount(0);
});

test('the discovery layer has no serious accessibility violations with an artifact open, and does not widen the page', async ({ page }) => {
  /* Motion removed: below 1024px the inspector scrolls itself into view, and
     axe run mid-flight measures the flight rather than the page. */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/discovery');
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId('mining-workspace').locator('[data-artifact-select="DEMO-TRADEWIND-A001"]').click();
  await expect(page.getByTestId('artifact-inspector')).toBeVisible();

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), null, 1)).toEqual([]);
});
