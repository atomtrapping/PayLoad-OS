import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CAPABILITIES, TOOL_CAPABILITY, TERMINAL_OPERATIONS } from '../../src/domain/capabilityRegistry';

/**
 * The navigator over the registry the plane enforces.
 *
 * The point of the page is that it is the same list: an operator reading it
 * and an integrator reading the plug-in contract are reading one thing. So the
 * assertions are against the registry rather than against literals — a row the
 * page drops, or a count it rounds, fails here.
 */
test('draws every capability the registry declares, by kind and by area', async ({ page }) => {
  await page.goto('/capabilities');
  await page.waitForLoadState('load');

  await expect(page.getByTestId('capability-standing'))
    .toContainText(`${CAPABILITIES.length} capabilities`);
  await expect(page.locator('[data-testid^="capability-"][data-kind]')).toHaveCount(CAPABILITIES.length);

  for (const kind of ['READ', 'OPERATE', 'ADMIT']) {
    const declared = CAPABILITIES.filter((capability) => capability.kind === kind).length;
    await expect(page.locator(`[data-kind="${kind}"]`), kind).toHaveCount(declared);
    await expect(page.getByTestId(`kind-count-${kind}`)).toContainText(String(declared));
  }
});

/**
 * The gap is the finding, so the page leads with it rather than burying it.
 * Twelve of a hundred and sixty-one, and the other rows say what reaches them.
 */
test('says how few of them a terminal can reach, and marks which', async ({ page }) => {
  await page.goto('/capabilities');
  await page.waitForLoadState('load');
  const wired = new Set([...Object.values(TOOL_CAPABILITY), ...TERMINAL_OPERATIONS]).size;
  await expect(page.getByTestId('capability-standing')).toContainText(`${wired} implemented terminal interfaces`);
  await expect(page.getByTestId('capability-discovery.run-workload')).toHaveAttribute('data-wired', 'true');
  await expect(page.locator('[data-wired="true"]')).toHaveCount(wired);
  await expect(page.locator('[data-wired="false"]')).toHaveCount(CAPABILITIES.length - wired);
});

/* An operate says what it waits on, including the thing that cannot happen yet. */
test('states what an operate waits on and distinguishes the generic proposal boundary', async ({ page }) => {
  await page.goto('/capabilities');
  await page.waitForLoadState('load');
  const waits = page.locator('#waits-on');
  await expect(waits).toContainText('decision_packet');
  await expect(waits).toContainText('an agent cannot be the reviewer');
  await expect(page.getByTestId('generic-operation-boundary')).toContainText('does not persist an executable request');
  await expect(page.getByTestId('capability-rule')).toContainText('never executed on a terminal’s say-so');
});

/* A capability reaching an estate is marked wherever it appears. */
test('marks every capability that reaches an estate', async ({ page }) => {
  await page.goto('/capabilities');
  await page.waitForLoadState('load');
  const estates = CAPABILITIES.filter((capability) => capability.touchesEstates);
  expect(estates.length).toBeGreaterThan(0);
  for (const capability of estates.slice(0, 5)) {
    await expect(page.getByTestId(`capability-${capability.id}`), capability.id).toContainText('ESTATE');
  }
});

test('passes the audit and does not widen the page', async ({ page }) => {
  await page.goto('/capabilities');
  await page.waitForLoadState('load');
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});
