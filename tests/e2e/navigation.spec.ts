import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Where the active tab sits inside the rail's own scroll frame. */
async function activeInRail(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rail = document.querySelector('[data-testid="nav-rail"]') as HTMLElement | null;
    const active = rail?.querySelector('a.nav-link[aria-current="page"]') as HTMLElement | null;
    if (!rail || !active) return null;
    const frame = rail.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    return {
      label: active.textContent?.trim() ?? '',
      scrollWidth: Math.round(rail.scrollWidth), clientWidth: Math.round(rail.clientWidth),
      scrollLeft: Math.round(rail.scrollLeft),
      visible: box.left >= frame.left - 1 && box.right <= frame.right + 1,
    };
  });
}

/**
 * The measured defect: on a 412-pixel viewport the strip was 2336 pixels wide,
 * scrolled to 0, with the current page's tab 2113 pixels off-screen. You could
 * not see where you were.
 */
test('the current tab is visible in the rail, on a deep page and after navigating', async ({ page }) => {
  await page.goto('/compute/clearance');
  await page.waitForLoadState('load');
  await expect.poll(async () => (await activeInRail(page))?.label).toBe('Clearance');
  await expect
    .poll(async () => (await activeInRail(page))?.visible, { message: 'the current tab must be inside the rail\'s own scroll frame' })
    .toBe(true);

  // And it follows a soft navigation, which restores no scroll position of its own.
  await page.goto('/harvester');
  await page.getByRole('link', { name: 'Earth Twin', exact: true }).first().click();
  await page.waitForURL('**/earth');
  await expect.poll(async () => (await activeInRail(page))?.label).toBe('Earth Twin');
  expect((await activeInRail(page))!.visible).toBe(true);
});

test('the rail is one tab stop, and the arrow keys move inside it', async ({ page }) => {
  await page.goto('/releases');
  await page.waitForLoadState('load');

  /*
   * Twenty-six links used to be twenty-six tab stops: a keyboard reader passed
   * thirty-two focusable elements before reaching the page. A roving tabindex
   * makes the rail one stop — the page you are on — so Tab enters it and Tab
   * leaves it, and the arrow keys do the moving.
   */
  const stops = await page.evaluate(() => {
    const tabbable = [...document.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')]
      .filter((el) => el.getAttribute('tabindex') !== '-1' && el.offsetParent !== null);
    const main = document.getElementById('main');
    const beforeMain = tabbable.filter((el) => !main?.contains(el));
    const rail = document.querySelector('[data-testid="nav-rail"]');
    return {
      beforeMain: beforeMain.length,
      inRail: beforeMain.filter((el) => rail?.contains(el)).length,
      railLabel: beforeMain.find((el) => rail?.contains(el))?.textContent?.trim(),
    };
  });
  expect(stops.inRail, 'the rail should be one tab stop, not twenty-six').toBe(1);
  expect(stops.railLabel).toBe('Releases');
  expect(stops.beforeMain, `${stops.beforeMain} stops before the page content`).toBeLessThan(12);

  // Arrows move on both axes, because the same list is a column and a strip.
  await page.evaluate(() => (document.querySelector('[data-testid="nav-rail"] a.nav-link') as HTMLElement)?.focus());
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.keyboard.press('ArrowDown');
  const second = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(second).not.toBe(first);
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe(first);
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe(second);
  await page.keyboard.press('End');
  const last = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(last).not.toBe(first);
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe(first);
});

test('Alt with an arrow steps to the next page without opening the rail', async ({ page }) => {
  await page.goto('/releases');
  await page.waitForLoadState('load');

  // The shortcut is a listener the client attaches, so it is live only once the
  // page is interactive. Opening and closing the palette proves that — a React
  // click handler answered — rather than pressing into an unhydrated document
  // and reading the absence of a listener as an absence of the feature.
  await page.getByTestId('palette-open').click();
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('palette')).toHaveCount(0);

  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(async () => (await activeInRail(page))?.label, { timeout: 10000 }).not.toBe('Releases');
  const forward = new URL(page.url()).pathname;
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe('/releases');
  expect(forward).not.toBe('/releases');
});

test('the palette jumps to any destination, by shortcut and by button', async ({ page }) => {
  await page.goto('/releases');
  await page.waitForLoadState('load');

  // The button, which is the only route on a touch screen.
  await page.getByTestId('palette-open').click();
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.getByTestId('palette-field').fill('clearance');
  const t0 = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/compute/clearance');
  await expect.poll(async () => (await activeInRail(page))?.label).toBe('Clearance');
  const jump = Date.now() - t0;
  expect(jump, `jump took ${jump}ms`).toBeLessThan(4000);

  // The shortcut, and Escape leaving the page where it was.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByTestId('palette')).toBeVisible();
  await page.getByTestId('palette-field').fill('zzzznotathing');
  await expect(page.getByTestId('palette-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('palette')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe('/compute/clearance');
});

test('the open palette has no serious accessibility violations and does not widen the page', async ({ page }) => {
  await page.goto('/releases');
  await page.getByTestId('palette-open').click();
  await expect(page.getByTestId('palette')).toBeVisible();
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});

/**
 * The grammar exists in the domain and nothing serves it. The page says both,
 * and the missing-question refusal is the one worth holding to its wording.
 */
test('the API page states the questions the endpoints do not yet ask', async ({ page }) => {
  await page.goto('/api');
  await page.waitForLoadState('load');
  const grammar = page.getByTestId('query-grammar');
  await expect(grammar).toContainText('WHAT_CHANGED');
  await expect(grammar).toContainText('WHAT_IS_MISSING');
  await expect(grammar).toContainText('circular');
  await expect(page.getByText('No endpoint serves it yet')).toBeVisible();

  // A change log over the demonstration corpus. This subject arrived and was
  // corrected; the withdrawal in the corpus is on another subject, which is why
  // the coverage panel below is where it shows.
  const changed = page.getByTestId('grammar-changed');
  await expect(changed).toContainText('ARRIVED');
  await expect(changed).toContainText('CORRECTED');
  await expect(changed).toContainText('an as-of query before the correction still returns the earlier answer');

  // All three answers in one panel: held, withdrawn, and never held — and the
  // last said as a fact about the corpus rather than about the subject.
  const missing = page.getByTestId('grammar-missing');
  await expect(missing).toContainText('HELD');
  await expect(missing).toContainText('HELD_THEN_WITHDRAWN');
  await expect(missing).toContainText('NOT_HELD');
  await expect(missing).toContainText('nobody told us');
});

/**
 * The hints name the keyboard in front of the reader.
 *
 * Every hint used to read `⌘K` and `Alt` on every machine, so a reader on
 * Linux or Windows was told to press a key their keyboard does not have. This
 * runner is one of those machines, which makes it the right place to check:
 * a hint that still said ⌘ here would be the defect, reproduced.
 */
test('the shell names the modifier this machine actually has', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('load');

  // userAgentData is not in the DOM lib yet; the runtime has it or it does not,
  // and either way navigator.platform answers.
  const platform = await page.evaluate(() =>
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform);
  const apple = /^(mac|iphone|ipad|ipod)/i.test(platform);
  const chord = apple ? '⌘K' : 'Ctrl K';
  const alt = apple ? '⌥' : 'Alt';

  // The button in the bar, the rail's key line, and the atlas's step hint all
  // describe the same two shortcuts and must not print three different keys.
  await expect(page.getByTestId('palette-open')).toContainText(chord);
  await expect(page.getByTestId('nav-keys')).toContainText(chord);
  await expect(page.getByTestId('nav-keys')).toContainText(alt);
  await expect(page.getByTestId('atlas-position')).toContainText(alt);
  if (!apple) {
    await expect(page.getByTestId('nav-keys')).not.toContainText('⌘');
    await expect(page.getByTestId('atlas-position')).not.toContainText('⌥');
  }

  // The screen-reader text names both keys and needs no detection, so it says
  // the same true thing on every machine.
  await expect(page.getByTestId('palette-open')).toContainText('Command or Control K');
});
