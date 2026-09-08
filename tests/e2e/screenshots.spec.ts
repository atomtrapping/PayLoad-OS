import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

test('desktop screenshots', async ({ page }) => {
  // The console first, because it is the terminal's home and the first thing
  // an operator sees.
  await page.goto('/');
  await page.getByRole('heading', { name: 'NotationsOS console' }).waitFor();
  await page.screenshot({ path: `${OUT}/0000-console.png`, fullPage: true });
  // The atlas on its own: the figure is a design artefact and a full-page
  // console shot is too small to read the band sizes off. Clipped out of a
  // full-page render rather than taken off the element, because an element
  // shot scrolls the panel under the sticky top bar and loses its own rule.
  const atlas = (await page.getByTestId('workspace-atlas').boundingBox())!;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/0000b-workspace-atlas.png`, fullPage: true, clip: { ...atlas, x: atlas.x - 8, y: atlas.y - 8, width: atlas.width + 16, height: atlas.height + 16 } });
  await page.goto('/model');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.screenshot({ path: `${OUT}/000-product-model.png`, fullPage: true });
  await page.goto('/releases');
  await page.getByRole('table', { name: 'Releases of caravan.specialty-cargo' }).waitFor();
  await page.screenshot({ path: `${OUT}/00a-releases.png`, fullPage: true });
  await page.goto('/releases/REL-CAR-2026.09.01');
  await page.getByTestId('certification').waitFor();
  await page.screenshot({ path: `${OUT}/00a2-release-certified.png`, fullPage: true });
  await page.goto('/stream?subject=LOT-5B-221&predicate=quantity.gross&validAt=2026-08-17T16:00:00Z&knownAt=2026-08-20T00:00:00Z');
  await page.getByTestId('asof-banner').waitFor();
  await page.screenshot({ path: `${OUT}/00b-stream-asof.png`, fullPage: true });
  await page.goto('/stream');
  await page.getByTestId('asof-banner').waitFor();
  await page.screenshot({ path: `${OUT}/00c-stream-refusal.png`, fullPage: false });
  await page.goto('/retractions');
  await page.getByRole('list', { name: 'Retraction feed' }).waitFor();
  await page.screenshot({ path: `${OUT}/00d-retractions.png`, fullPage: true });
  await page.goto('/harvester');
  await page.getByTestId('harvester-stages').waitFor();
  await page.screenshot({ path: `${OUT}/00d2-harvester.png`, fullPage: true });
  await page.getByTestId('harvester-filing-tx-tdi-2026-8871').getByRole('button').click();
  await page.getByTestId('inspector').waitFor();
  await page.screenshot({ path: `${OUT}/00d3-harvester-inspector.png`, fullPage: true });
  await page.goto('/candidates');
  await page.getByTestId('candidate-boundary').waitFor();
  await page.screenshot({ path: `${OUT}/00e-candidates.png`, fullPage: true });
  await page.getByRole('article', { name: 'Normalization demo-caravan-carrier-normalization-001' }).getByRole('button', { name: /Inspect normalization/ }).click();
  await page.getByTestId('production-inspector').waitFor();
  await page.getByTestId('production-workspace').evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 64 }));
  await page.screenshot({ path: `${OUT}/00e2-candidates-inspector.png`, fullPage: false });
  await page.goto('/products');
  await page.getByTestId('correction-demonstration').waitFor();
  await page.screenshot({ path: `${OUT}/00f-information-product.png`, fullPage: true });
  await page.goto('/notations');
  await page.getByTestId('evidence-fixture-marker').waitFor();
  await page.screenshot({ path: `${OUT}/00g-notations-disabled-with-evidence-references.png`, fullPage: true });
  await page.goto('/compute/observations');
  await page.getByTestId('observation-register').locator('[data-observation="session-b-RADAR-observation"]').getByRole('button').click();
  await page.getByTestId('replay-inspector').waitFor();
  await page.screenshot({ path: `${OUT}/00n-observation-replay.png`, fullPage: false });
  await page.goto('/production');
  await page.getByTestId('path-rail').waitFor();
  await page.screenshot({ path: `${OUT}/00l-production-path-fixture.png`, fullPage: true });
  await page.goto('/earth');
  await expect(page.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await page.getByTestId('earth-subsolar').filter({ hasText: 'computed' }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00j-earth-twin.png`, fullPage: false });
  // The same twin with every placeable record drawn where its subject's own position record declares, looking at the loading-terminal berth.
  await page.getByTestId('place-all').click();
  await expect(page.getByTestId('place-summary')).toHaveAttribute('data-placed', /\d+/, { timeout: 60_000 });
  await page.getByLabel('Record', { exact: true }).selectOption('REC-0204');
  await expect(page.getByTestId('earth-camera')).toContainText('51.9497°, 4.0250°', { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/00k-earth-twin-placed.png`, fullPage: false });
  // The operator instrument opened: the corpus's own spatial state as a readout,
  // with the void layer listing what cannot be flown to and why.
  await page.getByTestId('earth-operator').locator('> summary').click();
  await page.getByTestId('operator-voids').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/00m-earth-operator-instrument.png`, fullPage: false });
  // A conflicting specimen headline selected: the region drawn loud at the yard, and the card with both clocks.
  await page.locator('[data-event-select="SPEC-H-005"]').click();
  await expect(page.getByTestId('earth-camera')).toContainText('51.9497°, 4.0250°', { timeout: 20_000 });
  await page.getByTestId('event-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/00o-earth-events.png`, fullPage: false });
  await page.goto('/cases');
  await page.getByRole('table', { name: 'Case queue' }).waitFor();
  await page.screenshot({ path: `${OUT}/01-case-queue.png`, fullPage: true });
  await page.goto('/cases/CASE-CAR-7C104');
  await page.getByTestId('decision-rail').waitFor();
  await page.screenshot({ path: `${OUT}/02-case-workspace-refused.png`, fullPage: false });
  await page.getByRole('complementary', { name: 'Decision' }).getByRole('button', { name: /CAR-101 Lot identity reconciles/ }).click();
  await page.screenshot({ path: `${OUT}/03-refusal-remediation.png`, fullPage: false });
  await page.goto('/cases/CASE-CAR-5B221');
  await page.getByTestId('decision-rail').waitFor();
  await page.getByRole('navigation', { name: 'Case structure' }).getByRole('button', { name: /rev 1/ }).click();
  await page.screenshot({ path: `${OUT}/04-revision-comparison.png`, fullPage: false });
  await page.goto('/rulings/RUL-7C104-r2');
  await page.getByTestId('ruling-viewer').waitFor();
  await page.screenshot({ path: `${OUT}/05-ruling-viewer-desktop.png`, fullPage: true });
  await page.goto('/replay/CASE-CAR-7C104');
  await page.getByTestId('replay-view').waitFor();
  await page.getByRole('button', { name: '08-27 09:10' }).click();
  await page.screenshot({ path: `${OUT}/06-replay-historical.png`, fullPage: false });
  await page.goto('/profiles/caravan.brokerage.specialty-cargo');
  await page.getByTestId('profile-recognition').waitFor();
  await page.screenshot({ path: `${OUT}/07-profile-viewer.png`, fullPage: false });
  await page.goto('/cases/new');
  await page.getByTestId('new-case-intake').waitFor();
  await page.screenshot({ path: `${OUT}/08-new-case-intake.png`, fullPage: false });

  // The three frontier workbenches, which had no screenshot and no browser
  // coverage until the fixture banner and the session-only labelling landed.
  await page.goto('/frontier');
  await page.getByRole('button', { name: '3. Capex Progress (N11 VOI)' }).click();
  await page.getByRole('button', { name: '+ Add outcome to this session' }).waitFor();
  await page.screenshot({ path: `${OUT}/12-frontier-tasking-optimizer.png`, fullPage: true });
  await page.goto('/factoring');
  await page.getByRole('button', { name: 'Recompute receipt digest' }).waitFor();
  await page.screenshot({ path: `${OUT}/13-factoring-desk.png`, fullPage: true });
  await page.goto('/dispatch-liability');
  await page.getByRole('note', { name: 'Demonstration fixture' }).waitFor();
  await page.screenshot({ path: `${OUT}/14-dispatch-liability.png`, fullPage: true });
});

test('mobile ruling viewer screenshot', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/rulings/RUL-7C104-r2');
  await page.getByTestId('ruling-viewer').waitFor();
  await page.getByRole('heading', { name: 'Supersession chain' }).waitFor();
  await page.screenshot({ path: `${OUT}/09-ruling-viewer-mobile.png`, fullPage: true });
  await page.goto('/cases');
  await page.getByRole('table', { name: 'Case queue' }).waitFor();
  await page.screenshot({ path: `${OUT}/10-case-queue-mobile.png`, fullPage: false });
  await page.goto('/candidates');
  await page.getByRole('article', { name: 'Normalization demo-caravan-carrier-normalization-001' }).getByRole('button', { name: /Inspect normalization/ }).click();
  await page.getByTestId('production-inspector').getByRole('heading', { level: 2 }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/11-candidates-inspector-mobile.png`, fullPage: false });
  await ctx.close();
});
