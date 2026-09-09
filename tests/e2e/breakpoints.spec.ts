import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The shell at the widths its own design document names, and on both sides of
 * each one.
 *
 * The regular projects run at 1440 and at a Pixel 7's 412, so every transition
 * between them — the rail becoming a strip at 1024, the header becoming three
 * rows at 768 — was described in the design document and measured by nothing.
 * A breakpoint is where a layout breaks; testing only the two comfortable ends
 * is testing everywhere the layout is not.
 *
 * Each width is checked from one side and then from the other, one pixel apart,
 * so a rule written at `min-width: 1024px` and a rule written at
 * `max-width: 1023px` are both held to the boundary they claim.
 *
 * This file is the receipt the workspace design document listed as pending:
 * responsive inspection and a rendered accessibility audit, as opposed to the
 * static contrast arithmetic, which is a different check and says so.
 */

/** The tokens the shell is built from, asserted rather than re-measured from the CSS. */
const SIDEBAR_W = 232;
const TOPBAR_H = 80;
const TOPBAR_H_NARROW = 144; // 9rem at the default root size.

const WIDTHS = [
  { width: 1440, height: 900, name: 'desktop', rail: 'column' },
  { width: 1024, height: 800, name: 'rail lower bound', rail: 'column' },
  { width: 1023, height: 800, name: 'strip upper bound', rail: 'strip' },
  { width: 768, height: 900, name: 'two-row header lower bound', rail: 'strip' },
  { width: 767, height: 900, name: 'three-row header upper bound', rail: 'strip' },
  { width: 412, height: 915, name: 'phone', rail: 'strip' },
] as const;

/**
 * One page per shape the shell has to hold: the console's panel grid, a wide
 * ledger table, the sticky globe stage, a marketing-shaped product page and the
 * production rail's console. A width that breaks the shell breaks it on all of
 * them; a width that breaks one of these breaks it where nothing else looks.
 */
const PAGES = ['/', '/releases', '/earth', '/landshark', '/production'];

/** Positions of the elements whose relationship *is* the responsive contract. */
async function geometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
    };
    const rail = document.querySelector<HTMLElement>('[data-testid="nav-rail"]');
    return {
      document: { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, inner: window.innerWidth },
      topbar: box('.app-topbar'),
      sidebar: box('.app-sidebar'),
      main: box('#main'),
      // Which axis the rail overflows on is which layout it is in: a column
      // scrolls its container vertically, a strip scrolls itself sideways.
      rail: rail ? { scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth, flexDirection: getComputedStyle(rail).flexDirection } : null,
      // How many rows the header actually occupies. Not a count of distinct
      // `top` values: the wide bar centres three boxes of three different
      // heights on one row, so their tops all differ while the row is one.
      // Two boxes share a row when their vertical extents overlap, which is
      // the thing the layout is being asked about.
      headerRows: (() => {
        const spans = ['.terminal-brand', '.terminal-location', '.terminal-products']
          .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
          .filter((rect): rect is DOMRect => rect !== undefined && rect.height > 0)
          .map((rect) => ({ top: rect.top, bottom: rect.bottom }))
          .sort((a, b) => a.top - b.top);
        let rows = 0;
        let reachedTo = -Infinity;
        for (const span of spans) {
          if (span.top >= reachedTo) rows += 1;
          reachedTo = Math.max(reachedTo, span.bottom);
        }
        return rows;
      })(),
    };
  });
}

for (const { width, height, name, rail } of WIDTHS) {
  test.describe(`${width}px — ${name}`, () => {
    test.use({ viewport: { width, height } });

    for (const path of PAGES) {
      test(`${path} fits its viewport and is drawn to the shell's contract`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('load');
        // Text metrics decide these widths; measure after the fonts settle.
        await page.evaluate(() => document.fonts.ready);
        const seen = await geometry(page);

        // Nothing escapes sideways, and nothing widens the layout viewport —
        // the failure that puts every pointer coordinate on the wrong element.
        expect(seen.document.scroll, `scrollWidth ${seen.document.scroll} > clientWidth ${seen.document.client}`).toBeLessThanOrEqual(seen.document.client);
        expect(seen.document.inner, `layout viewport widened to ${seen.document.inner}`).toBe(seen.document.client);

        const { topbar, sidebar, main } = seen;
        expect(topbar, 'the top bar is on every page').not.toBeNull();
        expect(sidebar, 'the navigation is on every page').not.toBeNull();
        expect(main, 'the main surface is on every page').not.toBeNull();

        if (rail === 'column') {
          // A left rail: beside the surface, at the declared width, and the
          // list runs down rather than across.
          expect(Math.round(sidebar!.width)).toBe(SIDEBAR_W);
          expect(sidebar!.right, 'the rail is beside the surface, not above it').toBeLessThanOrEqual(main!.left + 1);
          expect(seen.rail!.flexDirection).toBe('column');
          expect(seen.rail!.scrollWidth, 'a column rail never scrolls sideways').toBeLessThanOrEqual(seen.rail!.clientWidth + 1);
        } else {
          // A strip: beneath the bar, above the surface, running across.
          expect(sidebar!.bottom, 'the strip is above the surface, not beside it').toBeLessThanOrEqual(main!.top + 1);
          expect(sidebar!.left).toBeLessThanOrEqual(main!.left + 1);
          expect(seen.rail!.flexDirection).toBe('row');
        }

        // The header's minimum is a token, and below 768 it is a different one
        // because the bar has become three rows and has to hold them.
        expect(topbar!.height).toBeGreaterThanOrEqual(width < 768 ? TOPBAR_H_NARROW : TOPBAR_H);
        if (width < 768) expect(seen.headerRows, 'the narrow header is three rows').toBe(3);
        else expect(seen.headerRows, 'the wide header is one row').toBe(1);
      });
    }

    test('the rendered page has no WCAG A or AA violation', async ({ page }) => {
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState('load');
        // The globe is a WebGL canvas the engine owns; its contents are not
        // this repository's markup and excluding it is stated rather than
        // silent. Everything drawn around it is still audited.
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.earth-canvas').analyze();
        const found = results.violations.map((violation) => `${path}: ${violation.id} (${violation.nodes.length}) — ${violation.help}`);
        expect(found, found.join('\n')).toEqual([]);
      }
    });
  });
}

/**
 * A register is a table where its columns fit and a list where they do not,
 * and the condition is asked of the register rather than of the viewport.
 *
 * A viewport breakpoint could not express it. The case queue's content column
 * is 1015px at 1023, where the navigation is a strip — and 758 at 1024, where
 * it is a column and the viewport is at its smallest. Wider viewport, narrower
 * register. Every threshold picked against the viewport left a band where the
 * table did not fit and a band where a list was drawn for no reason.
 *
 * Measured before this on a 386px register: the case queue put `Required
 * action` entirely off-screen, the rulings register showed 38 pixels of a
 * 121-pixel case title and lost the ruling's date and assurance, and the
 * release register lost its records, retractions and certification — each of
 * them reachable only by a sideways scroll the reader had no reason to try.
 */
const REGISTERS = ['/cases', '/rulings', '/releases'];
/** From a small phone to a wide desktop, including both sides of the rail's own threshold. */
const REGISTER_WIDTHS = [1600, 1440, 1280, 1100, 1024, 1023, 900, 800, 768, 767, 600, 412, 360];

for (const path of REGISTERS) {
  test(`${path} never hides a column, at any width`, async ({ page }) => {
    const problems: string[] = [];
    for (const width of REGISTER_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.waitForLoadState('load');
      // Next streams the page into a display:none staging div and places it
      // when it arrives, so at `load` the register is in the document with a
      // width of zero. Measuring there measures the staging area.
      await page.locator('.register').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const seen = await page.evaluate(() => {
        const register = document.querySelector('.register')!;
        const frame = register.getBoundingClientRect();
        const cells = [...register.querySelectorAll('tbody td')];
        return {
          hidden: register.scrollWidth - register.clientWidth,
          column: register.clientWidth,
          stacked: getComputedStyle(register.querySelector('.ledger-table')!).display === 'block',
          cells: cells.length,
          // Every cell, not every column: stacked, a row is a block, so a field
          // the reader came for is either on the screen or it is nowhere.
          past: cells.filter((cell) => cell.getBoundingClientRect().right > frame.right + 1).length,
          document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      if (seen.cells === 0) problems.push(`${width}px: no rows to measure`);
      if (seen.hidden !== 0) problems.push(`${width}px: ${seen.hidden}px of table past a ${seen.column}px register, ${seen.stacked ? 'stacked' : 'as a table'}`);
      if (seen.past !== 0) problems.push(`${width}px: ${seen.past} cells past the register's edge`);
      if (seen.document !== 0) problems.push(`${width}px: the document scrolls sideways by ${seen.document}px`);
    }
    expect(problems, problems.join('; ')).toEqual([]);
  });
}

test('a stacked register labels its own cells and keeps the roles the display change takes away', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  for (const path of REGISTERS) {
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.locator('.register').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const seen = await page.evaluate(() => {
      const register = document.querySelector('.register')!;
      return {
        stacked: getComputedStyle(register.querySelector('.ledger-table')!).display === 'block',
        // The header row is gone, so each cell says what it is.
        labelled: register.querySelectorAll('.cell-label').length,
        cells: register.querySelectorAll('tbody td').length,
        roles: {
          table: register.querySelectorAll('[role="table"]').length,
          rowgroup: register.querySelectorAll('[role="rowgroup"]').length,
          row: register.querySelectorAll('[role="row"]').length,
          cell: register.querySelectorAll('[role="cell"]').length,
        },
      };
    });
    expect(seen.stacked, `${path} is a list at 412px`).toBe(true);
    expect(seen.labelled, `${path} labels its cells`).toBeGreaterThan(0);
    expect(seen.roles.table, `${path} restates the table role`).toBe(1);
    expect(seen.roles.rowgroup, `${path} restates the rowgroup role`).toBe(1);
    expect(seen.roles.row, `${path} restates the row role`).toBeGreaterThan(0);
    expect(seen.roles.cell, `${path} restates the cell role on every cell`).toBe(seen.cells);
  }
});
