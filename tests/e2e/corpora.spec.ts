import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/*
 * The two specification surfaces.
 *
 * What these tests are for is not the layout. It is that a page naming forty
 * sources and six regions cannot come to read as an inventory of things this
 * system has. Every count on both pages is derived — from an empty corridor
 * table, and from candidates whose gates are all untested — so the assertions
 * below are about the derivation surviving into what a reader sees.
 */

test('the corpora register compares eight corpora and says nothing is acquired', async ({ page }) => {
  await page.goto('/corpora');
  await expect(page.getByRole('table', { name: 'Evidence corpora' }).locator('tbody tr')).toHaveCount(8);
  await expect(page.getByTestId('central-question')).toContainText('what evidence supports that account at a particular time');

  const standing = page.getByTestId('corpus-standing');
  await expect(standing).toContainText('0 integrated');
  await expect(standing).toContainText('declared acquisition shortlist only');
  await expect(page.getByText('No source named here is integrated, connected, licensed or collected.')).toBeVisible();
});

test('a corpus inspector draws its chains, states what it forbids, and shows every gate untested', async ({ page }) => {
  await page.goto('/corpora');
  await expect(page.getByTestId('corpus-inspector')).toHaveCount(0);
  await page.locator('[data-corpus-select="facilities"]').click();

  const inspector = page.getByTestId('corpus-inspector');
  await expect(page).toHaveURL(/#corpus=facilities$/);

  // The chain is drawn, in order, as distinct objects.
  const chain = inspector.getByTestId('chain').first();
  await expect(chain.locator('.chain-name')).toHaveText([
    'legal entity', 'operating organization', 'physical facility', 'parcel', 'entrance or access point', 'network connection',
  ]);
  await expect(inspector.getByTestId('corpus-chains')).toContainText('A registered office is not necessarily a factory.');
  await expect(inspector.getByTestId('corpus-loss')).toContainText('never inferred from a company category');

  /*
   * The honesty assertion. Not "the page mentions gates" — every gate pill on
   * every candidate in the open panel has to read as untested, because none has
   * been tested. A single pill reading otherwise is a claim this repository has
   * no evidence for.
   */
  const gates = inspector.getByTestId('corpus-candidates').locator('.pill').filter({ hasText: /access|coverage|cost|redistribution/ });
  const count = await gates.count();
  expect(count, 'the facilities corpus has candidates with gates').toBeGreaterThan(0);
  for (let index = 0; index < count; index++) {
    await expect(gates.nth(index)).toContainText('not tested');
  }

  // A corpus this surface does not hold opens on nothing, loaded fresh.
  await page.goto('/coverage');
  await page.goto('/corpora#corpus=mining');
  await expect(page.getByTestId('corpus-inspector')).toHaveCount(0);
});

test('the coverage register declares six regions and reports nothing covered', async ({ page }) => {
  await page.goto('/coverage');
  await expect(page.getByRole('table', { name: 'Coverage regions' }).locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('geographic-mandate')).toContainText('Asia, Africa, Latin America, the Pacific and Eastern Europe');

  const standing = page.getByTestId('coverage-standing');
  await expect(standing).toContainText('6 regions declared, 0 entered');
  await expect(standing).toContainText('0 corridors maintained');
  await expect(standing).toContainText('proposed portfolio not a verified ranking');
});

test('a region inspector shows the evidence that exists and what it does not establish, together', async ({ page }) => {
  await page.goto('/coverage#region=pacific');
  const inspector = page.getByTestId('region-inspector');
  await expect(inspector).toContainText('Pacific');
  // The pair. Either half alone misdescribes the opportunity.
  await expect(inspector.getByTestId('region-foundation')).toContainText('exposure to external and climatic shocks');
  await expect(inspector.getByTestId('region-limit')).toContainText('does not say which shipment is late');
  await expect(inspector.getByTestId('region-distinction')).toContainText('distinguished from the broader Pacific Rim');

  await page.locator('[data-region-select="south-america"]').click();
  await expect(page).toHaveURL(/#region=south-america$/);
  await expect(page.getByTestId('region-limit')).toContainText('establishes no individual factory transaction');
});

test('the coverage page keeps the corridor, the levels and the separation rule on the surface', async ({ page }) => {
  await page.goto('/coverage');
  await expect(page.getByRole('table', { name: 'Coverage levels' }).locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText('A point on the map is not a verified facility.')).toBeVisible();
  await expect(page.getByTestId('corridor-rules')).toContainText('“Cover Vietnam” does not tell an acquisition system');
  await expect(page.getByTestId('separation-rule'))
    .toHaveText('Jurisdiction, observed condition and evidentiary uncertainty must remain separate.');
  await expect(page.getByTestId('separation-prohibitions').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('confirmation-route')).toContainText('evidence partners');
});

test('both specification surfaces have no serious accessibility violations, with a row open', async ({ page }) => {
  // Motion removed for the same reason the register sweep removes it: a row
  // transitions its background and axe would otherwise sample it mid-change.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [path, selector, inspector] of [
    ['/corpora', '[data-corpus-select="observations"]', 'corpus-inspector'],
    ['/coverage', '[data-region-select="africa"]', 'region-inspector'],
  ] as const) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    await page.locator(selector).click();
    await expect(page.getByTestId(inspector)).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, `${path}: ${JSON.stringify(serious.map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.target) })), null, 1)}`).toEqual([]);
  }
});
