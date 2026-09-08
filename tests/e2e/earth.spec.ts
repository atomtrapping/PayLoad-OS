import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('earth twin: a keyless globe served from this origin, every layer with its source and state, the corpus asked for honestly, a view that is a link, and no request leaves the origin', async ({ page, baseURL }, testInfo) => {
  // Real CesiumJS on software WebGL, several camera flights and one request per record of the release: this test is slow by nature.
  test.slow();
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (!['blob:', 'data:'].includes(url.protocol) && url.origin !== origin) external.push(request.url()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const navigation = await page.goto('/earth');
  // Withheld metadata must never arrive in the document/RSC payload, not merely be hidden by the UI.
  expect(await navigation!.text()).not.toMatch(/REC-0305|REC-0401|REC-0402/);
  await expect(page.getByRole('heading', { level: 2, name: 'NotationsOS Earth Twin' })).toBeVisible();
  const status = page.getByTestId('twin-status');
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-renderer')).toContainText('CesiumJS on');
  await expect(page.locator('.earth-canvas canvas')).toBeVisible();
  const assetResponse = await page.request.get('/cesium/VERSION.json');
  expect(assetResponse.ok()).toBe(true);
  const assets = await assetResponse.json();
  expect(assets.schema).toBe('payload.earth-assets.v1');
  expect(assets.version).toBe('1.124.0');
  expect(assets.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(assets.files.some((file: { path: string }) => file.path === 'LICENSE.md')).toBe(true);

  // Layers say what they are; only the bundled surface, the computed sun and the declared corpus layer draw anything.
  await expect(page.locator('[data-layer="surface"][data-state="BUNDLED"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="sun"][data-state="COMPUTED"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="corpus"][data-state="FIXTURE"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="signals"][data-state="NOT_INTEGRATED"]')).toHaveCount(1);
  await expect(page.locator('[data-layer="notations"][data-state="UNAVAILABLE"]')).toHaveCount(1);
  await expect(page.locator('[data-signal][data-integration="NOT_INTEGRATED"]')).toHaveCount(21);
  await expect(page.locator('[data-signal]:not([data-integration="NOT_INTEGRATED"])')).toHaveCount(0);

  // The corpus: the twin opens on a record the release can place, so something
  // is drawn on arrival. The refusal is one selection away rather than the
  // landing state — the compiler refuses geometry for a selectable record whose
  // subject no position record names, and the twin draws nothing in its place.
  const projection = page.getByTestId('earth-projection');
  await expect(projection).toHaveAttribute('data-outcome', 'READY', { timeout: 20_000 });
  const before = await page.getByTestId('earth-valid-at').textContent();
  const select = page.getByLabel('Record', { exact: true });
  await select.selectOption('REC-0101');
  await expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE', { timeout: 20_000 });
  await expect(projection).toHaveAttribute('data-code', 'GEOMETRY_NOT_AVAILABLE');
  await expect(projection).toContainText('invents none');
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1);
  expect(options.join('\n')).not.toMatch(/REC-0305|REC-0401|REC-0402/);
  await select.selectOption({ index: options.length - 1 });
  await expect(projection).toHaveAttribute('data-outcome', /UNAVAILABLE|REFUSED/);
  const after = await page.getByTestId('earth-valid-at').textContent();
  expect([before, after].every((t) => /UTC/.test(t ?? ''))).toBe(true);

  // Time is computed, not observed.
  await expect(page.getByTestId('earth-subsolar')).toContainText('computed by CesiumJS', { timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath('earth-twin.png') });

  // A view is a link: a flight ends with the camera in the hash; the global preset is the global hash; a link restores its view.
  const global = '#v=0.0000,0.0000,12000000,0.0,-90.0';
  await expect(page.getByTestId('earth-link')).toHaveText(global);
  const subSolarLatitude = /(-?\d+\.\d\d)°/.exec((await page.getByTestId('earth-subsolar').textContent()) ?? '')![1];
  await page.getByTestId('fly-subsolar').click();
  // A slow renderer can raise a camera stop mid-flight; the link is the view only once the camera has arrived.
  await expect(page.getByTestId('earth-camera')).toContainText(`${subSolarLatitude}`, { timeout: 20_000 });
  await expect.poll(async () => { const current = new URL(page.url()).hash; return current !== global && current === (await page.getByTestId('earth-link').textContent()); }, { timeout: 20_000 }).toBe(true);
  const hash = new URL(page.url()).hash;
  await expect(page.getByTestId('earth-camera')).toContainText('12,000 km');
  await page.getByTestId('fly-global').click();
  await expect(page.getByTestId('earth-camera')).toContainText('0.0000°, 0.0000°', { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(global.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), { timeout: 20_000 });
  // The same link in this page's address bar flies there; a fresh load of it starts there.
  await page.evaluate((next) => { window.location.hash = next; }, hash);
  await expect(page.getByTestId('earth-link')).toHaveText(hash, { timeout: 20_000 });
  await page.goto('/releases');
  await page.goto(`/earth${hash}`);
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-link')).toHaveText(hash);
  await page.goto('/releases');
  await page.goto('/earth#v=999,0,1,0,0');
  await expect(status).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });
  await expect(page.getByTestId('earth-link')).toHaveText(global);

  // A record is drawn only where its own subject's position record declares.
  // The twin now opens on a record the release can place, so this arrives READY
  // rather than on an empty globe — and the refusal is one selection away
  // rather than the landing state: a sample's moisture has no position record
  // for its subject, so nothing is drawn and the twin says why.
  await expect(projection).toHaveAttribute('data-outcome', 'READY', { timeout: 20_000 });
  // The draft-survey record's lot has a berth position from the port custody
  // system: choosing it lists that declaration, with its source's interest and
  // stated uncertainty, and flies the camera there. Selected away and back,
  // because the twin already opens on it and re-selecting the current record is
  // not a change — the flight follows a change of selection.
  await page.getByLabel('Record', { exact: true }).selectOption('REC-0101');
  await expect(projection).toHaveAttribute('data-outcome', 'UNAVAILABLE', { timeout: 20_000 });
  await page.getByLabel('Record', { exact: true }).selectOption('REC-0203');
  await expect(projection).toHaveAttribute('data-outcome', 'READY', { timeout: 20_000 });
  await expect(projection).toContainText('1 declared position');
  const berth = projection.locator('[data-position-record="REC-0207"]');
  await expect(berth).toHaveAttribute('data-interest', 'disinterested');
  await expect(berth).toContainText('disinterested source');
  await expect(berth).toContainText('±250 m · WGS84');
  await expect(berth).toContainText('Port custody operator system');
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '1');
  // The height is framed by the position's own stated uncertainty (±250 m),
  // not by a fixed regional preset a parcel would be invisible in.
  await expect(page.getByTestId('earth-camera')).toContainText('51.9497°, 4.0250° · 3,500 m', { timeout: 20_000 });
  await expect.poll(async () => new URL(page.url()).hash, { timeout: 20_000 }).toMatch(/^#v=4\.0250,51\.9497,3500,/);

  // Every record offered, each at its own validity start: two lots declare a position, so their records are placed; samples, identity links and retracted inventory are not, and nothing is inferred across the sample-of-lot link. The records this viewer may not select were never offered, so the compiler refuses none.
  await page.getByTestId('place-all').click();
  const summary = page.getByTestId('place-summary');
  await expect(summary).toHaveAttribute('data-placed', '9', { timeout: 60_000 });
  await expect(summary).toHaveAttribute('data-unplaced', '9');
  await expect(summary).toHaveAttribute('data-refused', '0');
  await expect(summary).toContainText('9 placed at 9 positions');
  await expect(summary).toContainText('REC-0101, REC-0102, REC-0111, REC-0112, REC-0201, REC-0202, REC-0301, REC-0411, REC-0412');
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '9');
  await expect(page.locator('[data-placed-record]')).toHaveCount(9);
  await expect(page.locator('[data-placed-record="REC-0306"]')).toContainText('LOT-7C-104');
  await page.locator('[data-placed-record="REC-0302"]').getByRole('button').click();
  await expect(projection).toHaveAttribute('data-outcome', 'READY', { timeout: 15_000 });
  await expect(projection.locator('[data-position-record="REC-0306"]')).toHaveAttribute('data-interest', 'self_reported');
  await expect(projection).toContainText('self-reported');
  await expect(page.getByTestId('earth-camera')).toContainText('-23.9535°, -46.3130° · 7,000 m', { timeout: 20_000 });
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '9');

  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.earth-canvas').analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('the derivation beneath the globe keys each position no finer than its evidence and refuses to confirm', async ({ page }) => {
  await page.goto('/earth');
  const panel = page.getByTestId('spatial-keys');
  await expect(panel).toBeVisible();

  // Two subjects declare a position; both state an uncertainty, so both are keyed.
  await expect(panel.locator('[data-key-record]')).toHaveCount(2);
  await expect(panel.locator('[data-key-record][data-keyed="true"]')).toHaveCount(2);
  const berth = panel.locator('[data-key-record="REC-0207"]');
  await expect(berth).toContainText('u14ze9');
  // The cell is never shown without the claim that bounded its resolution.
  await expect(berth).toContainText('±250 m');
  await expect(berth).toContainText('No finer');
  await expect(panel.locator('[data-key-record="REC-0306"]')).toContainText('6gxpdp');

  // The one cross-subject pair: the cells differ, and the geodesic refutes.
  const pair = panel.locator('[data-pair="REC-0207-REC-0306"]');
  await expect(pair).toHaveAttribute('data-answer', 'DISJOINT');
  await expect(pair).toContainText('750 m of stated uncertainty');
  await expect(pair).toContainText('different places');
  await expect(panel.locator('[data-answer="OVERLAPPING"]')).toHaveCount(0);
  await expect(panel).toContainText('Containment is the join that would matter, and it is still absent');
  // The shape is carried now; the predicate that would read it is not.
  await expect(panel).toContainText('POINT, POLYGON and EXTENT');
  await expect(panel.locator('[data-shape="POINT"]')).toHaveCount(2);
});

/**
 * The twin lands on a placed record rather than on an empty globe. Before this,
 * the default was simply the first deliverable record — moisture, whose subject
 * the release does not position — so a reader arrived to nothing drawn under a
 * red refusal.
 */
test('the twin arrives with something on the globe, and folds what a reader would scroll past', async ({ page }) => {
  await page.goto('/earth');
  await page.waitForLoadState('load');

  await expect(page.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY', { timeout: 20_000 });
  // The HUD counts what is drawn. Arriving at zero was the defect.
  await expect(page.getByTestId('earth-placed')).toHaveAttribute('data-count', '1', { timeout: 20_000 });
  await expect(page.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'READY');

  // The two heaviest sections start shut, and their counts survive the fold.
  const layers = page.getByTestId('earth-layers');
  const signals = page.getByTestId('earth-signals');
  expect(await layers.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  expect(await signals.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await expect(signals).toContainText('21 named, 0 integrated');

  // And they still open.
  await signals.locator('> summary').click();
  expect(await signals.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
});

/**
 * The instrument, on the built page. Two rules to see held: the panel writes
 * nothing (its only control selects a record), and it reports the conveniences
 * it took — which today is none, said rather than left out.
 */
test('the operator instrument reads the corpus back and offers no way to change it', async ({ page }) => {
  await page.goto('/earth');
  await page.waitForLoadState('load');
  await expect(page.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY', { timeout: 20_000 });

  const panel = page.getByTestId('earth-operator');
  // Shut on arrival, with the reading that matters in the summary: the second
  // number is where this seat is ignorant, not where the world is empty.
  expect(await panel.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  await expect(panel).toContainText('2 flyable, 5 void');
  await panel.locator('> summary').click();
  expect(await panel.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);

  // Five layers, and the one a page cannot read says UNKNOWN rather than 0.
  const layers = page.locator('[data-operator-layer]');
  await expect(layers).toHaveCount(5);
  await expect(page.locator('[data-operator-layer="admission-queue"]')).toHaveAttribute('data-reading', 'UNKNOWN');
  await expect(page.locator('[data-operator-layer="positioned"]')).toHaveAttribute('data-reading', '2');
  await expect(page.locator('[data-operator-layer="void"]')).toHaveAttribute('data-reading', '5');

  // Rule two: nothing was smoothed, and the panel says so rather than omitting it.
  await expect(page.getByTestId('operator-conveniences')).toHaveAttribute('data-taken', '0');
  await expect(page.getByTestId('operator-conveniences')).toContainText('nothing was interpolated, smoothed, aggregated or carried forward');

  // Rule one: every control in the panel is a selection.
  await expect(page.getByTestId('operator-rules')).toHaveAttribute('data-writes', 'NONE');
  const buttons = panel.getByRole('button');
  await expect(buttons).toHaveCount(5);
  for (const label of await buttons.allInnerTexts()) expect(label).toMatch(/^Select /);

  // And a void row navigates: selecting a subject the corpus cannot place
  // changes what is looked at, and the globe says why it draws nothing.
  const voids = page.getByTestId('operator-voids');
  await expect(voids).toHaveAttribute('data-count', '5');
  await buttons.first().click();
  await expect(page.getByTestId('earth-projection')).toHaveAttribute('data-outcome', 'UNAVAILABLE');

  // The page's own axe pass runs with this section shut, so its contents are
  // display:none and unexamined. Check them open, which is how they are read.
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.earth-canvas').analyze();
  expect(accessibility.violations).toEqual([]);
});

/**
 * Located events: the ledger's own retractions and the drafted specimen
 * headlines, each met by the corpus at its coordinates. Five of seven have a
 * radius and are drawn; two are listed and not drawn. A conflict is drawn
 * loud, and the card shows both clocks.
 */
test('located events meet the corpus at their coordinates, and nothing in the section writes', async ({ page }) => {
  await page.goto('/earth');
  await page.waitForLoadState('load');
  await expect(page.getByTestId('twin-status')).toHaveAttribute('data-state', 'READY', { timeout: 45_000 });

  await expect(page.getByTestId('earth-events')).toHaveAttribute('data-count', '5');
  const list = page.getByTestId('event-list');
  await expect(list.locator('[data-event-item]')).toHaveCount(7);
  await expect(list.locator('[data-event-item][data-placed="false"]')).toHaveCount(2);
  await expect(list.locator('[data-event-item="SPEC-H-002"]')).toHaveAttribute('data-event-state', 'CONFLICTING');

  // A conflict, flown to from the list, with the corpus's own bounds in the card.
  await list.locator('[data-event-select="SPEC-H-002"]').click();
  const card = page.getByTestId('event-card');
  await expect(card).toHaveAttribute('data-state', 'CONFLICTING');
  await expect(card).toContainText(/falls outside REC-0302.s stated bounds \[19\.94, 19\.98\] t/);
  await expect(page.getByTestId('earth-camera')).toContainText('-23.9535°, -46.3130° · 70 km', { timeout: 20_000 });

  // Two clocks that disagree: corroborated when captured, conflicting now.
  await list.locator('[data-event-select="SPEC-H-005"]').click();
  await expect(page.getByTestId('event-reading-capture')).toHaveAttribute('data-state', 'CORROBORATED');
  await expect(page.getByTestId('event-reading-now')).toHaveAttribute('data-state', 'CONFLICTING');
  await expect(page.getByTestId('event-clocks-differ')).toBeVisible();

  // Not drawn, still checked: the corpus's refusal, at coordinates it declined to draw.
  await list.locator('[data-event-select="SPEC-H-004"]').click();
  await expect(card).toHaveAttribute('data-state', 'NOT_IN_COVERAGE');
  await expect(card).toContainText('NO_IDENTITY_LINK');
  await expect(page.getByTestId('event-geocode')).toHaveAttribute('data-epistemic', 'UNKNOWN');

  // The ledger's correction at the berth, selecting the record it replaced with.
  await list.locator('[data-event-select="RET-0001"]').click();
  await expect(card).toHaveAttribute('data-state', 'CORRECTION');
  await expect(card).toHaveAttribute('data-epistemic', 'WITHDRAWN');
  await page.locator('[data-event-record="REC-0204"]').click();
  await expect(page.getByLabel('Record', { exact: true })).toHaveValue('REC-0204');

  // Every control in the section is a selection or a flight.
  const labels = await page.getByTestId('earth-events-panel').getByRole('button').allInnerTexts();
  expect(labels.length).toBeGreaterThanOrEqual(8);
  for (const label of labels) expect(label).toMatch(/^(RET-\d+|SPEC-H-\d+|Fly to it|Select REC-\d+)$/);

  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.earth-canvas').analyze();
  expect(accessibility.violations).toEqual([]);
});
