import { expect, test } from '@playwright/test';

// The page body never scrolls horizontally: wide tables scroll inside their
// own region, and nothing positioned inside a scroll region escapes it. On
// mobile Chrome an escaped box widens the layout viewport and every pointer
// coordinate after it lands on the wrong element.
// Identifiers must exist: a route whose subject is missing renders a 16 KB
// not-found page, which passes the guard while measuring nothing.
const PAGES = ['/', '/cases', '/cases/new', '/cases/CASE-CAR-7C104', '/cases/CASE-CAR-5B221', '/evidence', '/profiles', '/rulings', '/rulings/RUL-5B221-r1', '/replay', '/replay/CASE-CAR-7C104', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/retractions', '/model', '/products', '/api', '/candidates', '/production', '/harvester', '/notations', '/earth', '/spatial', '/compute/registration', '/compute/observations', '/compute/clearance', '/agents', '/board', '/frontier', '/factoring', '/dispatch-liability'];

for (const path of PAGES) {
  test(`no horizontal document overflow on ${path}, disclosures open`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('load');
    const measure = () => page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    const closed = await measure();
    expect(closed.scroll, `closed disclosures: scrollWidth ${closed.scroll} > clientWidth ${closed.client}`).toBeLessThanOrEqual(closed.client);
    expect(closed.inner, 'layout viewport widened with disclosures closed').toBe(closed.client);
    await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
    const open = await measure();
    expect(open.scroll, `open disclosures: scrollWidth ${open.scroll} > clientWidth ${open.client}`).toBeLessThanOrEqual(open.client);
    expect(open.inner, 'layout viewport widened with disclosures open').toBe(open.client);
  });
}

/**
 * The four panels of /frontier, because the sweep above only ever measured the
 * one it lands on. Three of the four are a click away, and the Capex panel is
 * where an unbounded select pushed the layout viewport of a 412px phone out to
 * 623 — the exact failure this file exists to catch, one tab out of reach.
 */
const FRONTIER_TABS = ['1. Disclosure Assurance (CBAM/CSRD)', '2. Insurability Dynamics', '3. Capex Progress (N11 VOI)', 'Frontier 8-Passage Matrix'];

for (const tab of FRONTIER_TABS) {
  test(`no horizontal document overflow on /frontier, ${tab} panel`, async ({ page }) => {
    await page.goto('/frontier');
    await page.waitForLoadState('load');
    await page.getByRole('button', { name: tab }).click();
    const measured = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(measured.scroll, `${tab}: scrollWidth ${measured.scroll} > clientWidth ${measured.client}`).toBeLessThanOrEqual(measured.client);
    expect(measured.inner, `${tab}: layout viewport widened to ${measured.inner}`).toBe(measured.client);
  });
}
