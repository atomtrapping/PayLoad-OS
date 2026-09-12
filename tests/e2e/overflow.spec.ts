import { expect, test } from '@playwright/test';

// The page body never scrolls horizontally: wide tables scroll inside their
// own region, and nothing positioned inside a scroll region escapes it. On
// mobile Chrome an escaped box widens the layout viewport and every pointer
// coordinate after it lands on the wrong element.
// Identifiers must exist: a route whose subject is missing renders a 16 KB
// not-found page, which passes the guard while measuring nothing.
const PAGES = ['/', '/model/substrate', '/model/estimation', '/model/obligations', '/model/standing', '/cases', '/cases/new', '/cases/CASE-CAR-7C104', '/cases/CASE-CAR-5B221', '/evidence', '/profiles', '/rulings', '/rulings/RUL-5B221-r1', '/replay', '/replay/CASE-CAR-7C104', '/releases', '/releases/REL-CAR-2026.09.01', '/stream', '/retractions', '/model', '/products', '/api', '/candidates', '/production', '/harvester', '/notations', '/earth', '/spatial', '/compute/registration', '/compute/observations', '/compute/clearance', '/agents', '/board', '/corpora', '/coverage', '/frontier', '/factoring', '/dispatch-liability', '/discovery', '/commercial', '/control', '/dossier', '/treasury', '/scopes', '/newsroom', '/state'];

for (const path of PAGES) {
  test(`no horizontal document overflow on ${path}, disclosures open`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('load');
    // Text metrics decide these widths, so the fonts have to have settled
    // before anything is measured. Without this the same page measured 412 on
    // one run and 421 on the next, and the guard was a coin toss rather than a
    // check.
    await page.evaluate(() => document.fonts.ready);
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

/**
 * The other half of the guard above: a table is allowed to scroll inside its
 * own region, so the reader has to be able to tell that it does.
 *
 * `.register` — and every `.surface` scroll region holding a ledger table,
 * which is the same thing under its older spelling — carries a shadow at
 * whichever edge has more table past it. Without it a column beyond the right
 * edge is a column nobody knows is there, which is how the release register
 * lost the field naming the release that replaced each one.
 */
test('every register says which edge has more table past it', async ({ page }) => {
  const withRegisters = ['/releases', '/model/substrate', '/rulings', '/evidence', '/retractions', '/candidates'];
  const unmarked: string[] = [];
  for (const path of withRegisters) {
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.evaluate(() => document.fonts.ready);
    const seen = await page.evaluate(() => {
      const regions = [...document.querySelectorAll('.register, .surface.overflow-x-auto')];
      // Only a region that can scroll sideways needs to say so. Below the strip
      // breakpoint a register stops being a table and becomes a list, and a
      // shadow on something that cannot move would be a mark that means
      // nothing — so the rule is about scrollable regions, not about every
      // region.
      const scrollable = regions.filter((el) => getComputedStyle(el).overflowX !== 'visible');
      return {
        // Every register on the page, scrollable or not: a page where this
        // finds nothing is a page the check has stopped looking at.
        found: regions.length,
        scrollable: scrollable.length,
        // The mark is four background layers; a scrollable region without them
        // is a silent scroll region, which is the thing being ruled out.
        bare: scrollable.filter((el) => getComputedStyle(el).backgroundImage === 'none').length,
      };
    });
    if (seen.found === 0 || seen.bare > 0) unmarked.push(`${path}: ${seen.found} registers, ${seen.scrollable} scrollable, ${seen.bare} unmarked`);
  }
  expect(unmarked, unmarked.join('; ')).toEqual([]);
});
