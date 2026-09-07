import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('statutory harvester: the funnel, the two clocks as separate questions, and the inspector distinguishing an omitted field from an unreadable one', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const writes: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== origin) external.push(request.url());
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/harvester');
  await expect(page.getByRole('heading', { level: 1, name: 'Statutory filing harvester' })).toBeVisible();

  // The funnel is the argument: four supplied, three inside the horizon, fourteen candidates, five admitted.
  const stages = page.getByTestId('harvester-stages');
  await expect(stages).toContainText('Supplied4');
  await expect(stages).toContainText('In horizon3');
  await expect(stages).toContainText('Candidates14');
  await expect(stages).toContainText('Admitted5');
  await expect(stages).toContainText('Refused9');

  // Never collects, and the page says so where a reader will meet it.
  await expect(page.getByText(/no path to a network/)).toBeVisible();
  await expect(page.getByTestId('harvester-excluded')).toContainText('fl-oir-302214-26-co-a1');

  // Each filing's two adjudications, and the fact that the refusals do not smear.
  await expect(page.getByTestId('harvester-filing-fl-oir-302214-26-co')).toContainText('RESOLVED');
  await expect(page.getByTestId('harvester-filing-ca-cdi-2026-04')).toContainText('NO_USABLE_IDENTIFIER');
  await expect(page.getByTestId('harvester-filing-tx-tdi-2026-8871')).toContainText('REFUSED');
  await expect(page.getByTestId('harvester-tally')).toContainText('BOTH_CLOCKS');
  await expect(page.getByTestId('harvester-tally')).toContainText('SUBJECT_IDENTIFIED');

  // Knowledge time: before the corpus could have known it, it holds nothing.
  const asOf = page.getByTestId('harvester-as-of');
  const earliest = await asOf.locator('option').first().getAttribute('value');
  await asOf.selectOption(earliest!);
  await expect(page.getByTestId('harvester-rows-empty')).toContainText('not the same as saying nothing was happening');
  const latest = await asOf.locator('option').last().getAttribute('value');
  await asOf.selectOption(latest!);
  await expect(page.getByTestId('harvester-rows-empty')).toHaveCount(0);

  // World time is the other question: knowable in February, in force in April.
  const inForce = page.getByTestId('harvester-in-force');
  const beforeEffect = await inForce.locator('option').nth(1).getAttribute('value');
  await inForce.selectOption(beforeEffect!);
  await expect(page.getByTestId('harvester-rows-empty')).toBeVisible();
  await expect(page.getByTestId('harvester-clock-note')).toContainText('knowable two months before it binds anyone');
  await inForce.selectOption('');

  // The inspector keeps ABSENT and MALFORMED apart, and shows the check each ruling failed.
  await page.getByTestId('harvester-filing-tx-tdi-2026-8871').getByRole('button').click();
  const inspector = page.getByTestId('inspector');
  await expect(inspector).toContainText('MALFORMED');
  await expect(inspector).toContainText('Upon exhaustion of administrative appeals');
  await expect(inspector).toContainText('which is not the same, and the printed text is kept');
  await expect(inspector).toContainText('BOTH_CLOCKS');

  // Conditions travel with an admitted ruling rather than stopping at the gate.
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await page.getByTestId('harvester-filing-fl-oir-302214-26-co').getByRole('button').click();
  await expect(inspector).toContainText('ADMITTED_WITH_CONDITIONS');
  await expect(inspector).toContainText('Condition: Republication must attribute the issuing department');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
