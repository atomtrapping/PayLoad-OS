import { expect, test } from '@playwright/test';

/**
 * What you are looking at can be sent to someone.
 *
 * An inspector that opens on a row and cannot be linked is half an inspector:
 * the reader can see the thing and cannot say which thing they saw. The case
 * workspace is the surface where that matters most — the whole point of it is
 * to have an argument about one claim — and it is checked here end to end,
 * because the property is a round trip through a URL and nothing short of a
 * browser proves a URL.
 */
const CASE = '/cases/CASE-CAR-7C104';

test('a selected claim is in the URL, and that URL opens on it again', async ({ page }) => {
  await page.goto(CASE);
  await page.waitForLoadState('load');
  expect(new URL(page.url()).hash, 'nothing selected, nothing in the link').toBe('');

  const row = page.locator('[data-claim-id]').first();
  const claimId = await row.getAttribute('data-claim-id');
  expect(claimId).toBeTruthy();
  await row.click();
  await expect(page.getByTestId('claim-detail')).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe(`#claim=${claimId}`);

  // The link, opened cold in the same tab: same case, same claim, same panel.
  const link = page.url();
  await page.goto('/cases');
  await page.goto(link);
  await page.waitForLoadState('load');
  await expect(page.getByTestId('claim-detail')).toBeVisible();
  await expect(page.getByTestId('claim-detail')).toContainText(claimId!);
});

test('a link naming a claim this case does not hold opens on the overview, not on nothing', async ({ page }) => {
  // An inspector opened on an id the bundle has never seen would be a worse
  // answer than no inspector, so the surface refuses it rather than rendering
  // an empty panel around a name it cannot resolve.
  await page.goto(`${CASE}#claim=CLM-DOES-NOT-EXIST`);
  await page.waitForLoadState('load');
  await expect(page.getByTestId('claim-detail')).toHaveCount(0);
  await expect(page.locator('[data-claim-id]').first()).toBeVisible();
});

test('selecting down a register does not fill the back button', async ({ page }) => {
  await page.goto('/cases');
  await page.goto(CASE);
  const rows = page.locator('[data-claim-id]');
  const count = Math.min(await rows.count(), 3);
  expect(count).toBeGreaterThan(1);
  for (let index = 0; index < count; index += 1) await rows.nth(index).click();

  // Back is the one control that has to mean "the page before this one".
  await page.goBack();
  await page.waitForLoadState('load');
  expect(new URL(page.url()).pathname).toBe('/cases');
});

/**
 * The release register, which is where the inspector pattern was worth the
 * change: nine columns became six, the paragraph fields moved beside the
 * table, and the supersession chain became something you walk rather than an
 * identifier you read and go looking for.
 */
test('the release register shows every column it has, and the inspector carries the rest', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/releases');
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);

  await page.locator('[data-release-select="REL-CAR-2026.09.01"]').click();
  await expect(page.getByTestId('release-inspector')).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe('#release=REL-CAR-2026.09.01');

  // The register fits beside the inspector at the design's desktop width. The
  // measured failure this replaced: the last column sat past the right edge of
  // a scroll region a reader has no reason to suspect, so the field naming the
  // release that replaced this one was the field nobody saw.
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.register')].map((el) => el.scrollWidth - el.clientWidth));
  expect(hidden, `columns hidden inside the register's own scroll: ${hidden.join(', ')}`).toEqual(hidden.map(() => 0));

  // The chain is walked from inside the inspector, without leaving the page.
  await page.getByTestId('inspector-supersedes').click();
  await expect(page.getByTestId('release-inspector')).toContainText('REL-CAR-2026.08.25');
  await expect.poll(() => new URL(page.url()).hash).toBe('#release=REL-CAR-2026.08.25');

  // And the link opens on it again, cold.
  const link = page.url();
  await page.goto('/retractions');
  await page.goto(link);
  await page.waitForLoadState('load');
  await expect(page.getByTestId('release-inspector')).toContainText('REL-CAR-2026.08.25');
  await expect(page.locator('tr[data-release-id="REL-CAR-2026.08.25"]')).toHaveAttribute('aria-selected', 'true');
});

test('the inspector sits beside the register only where the register still fits', async ({ page }) => {
  // A list of titles survives a 370px column; a six-column register does not,
  // so this surface keeps the inline detail view until the two fit side by side.
  for (const { width, beside } of [{ width: 1440, beside: true }, { width: 1439, beside: false }, { width: 1024, beside: false }]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/releases#release=REL-CAR-2026.09.01');
    await page.waitForLoadState('load');
    // The selection is read from the hash on mount, so the panel exists once
    // the page is interactive rather than once it has loaded.
    await page.getByTestId('release-inspector').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const seen = await page.evaluate(() => {
      const register = document.querySelector('.register')!.getBoundingClientRect();
      const inspector = document.querySelector('.inspector')!.getBoundingClientRect();
      const el = document.querySelector('.register')!;
      return { beside: inspector.left >= register.right - 1, hidden: el.scrollWidth - el.clientWidth };
    });
    expect(seen.beside, `${width}px`).toBe(beside);
    expect(seen.hidden, `${width}px: columns hidden inside the register`).toBe(0);
  }
});

/**
 * The rulings register: nine columns of which four sat past the right edge of
 * a 1024px viewport, inside a silent scroll region — 531 pixels of table the
 * reader had no reason to know was there.
 */
test('the rulings register shows every column, and the revision chain is walked from the inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/rulings');
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);

  // A superseded revision, so the chain has both ends.
  await page.locator('[data-ruling-select="RUL-7C104-r1"]').click();
  await expect(page.getByTestId('ruling-inspector')).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe('#ruling=RUL-7C104-r1');

  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.register')].map((el) => el.scrollWidth - el.clientWidth));
  expect(hidden, `columns hidden inside the register's own scroll: ${hidden.join(', ')}`).toEqual(hidden.map(() => 0));

  // Forward to the revision that replaced it, and the row follows the panel.
  await page.getByTestId('inspector-superseded-by').click();
  await expect(page.getByTestId('ruling-inspector')).toContainText('RUL-7C104-r2');
  await expect(page.locator('tr[data-ruling-id="RUL-7C104-r2"]')).toHaveAttribute('aria-selected', 'true');

  const link = page.url();
  await page.goto('/cases');
  await page.goto(link);
  await page.waitForLoadState('load');
  await expect(page.getByTestId('ruling-inspector')).toContainText('RUL-7C104-r2');
});

/**
 * The case queue: nine columns of which 596 pixels sat past the right edge of
 * a 1440px viewport and 1012 past a 1024px one — more table hidden than shown.
 */
test('the case queue triages in place, and opening the case is one click from the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cases');
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);

  await page.locator('[data-case-select="CASE-CAR-7C104"]').click();
  await expect(page.getByTestId('case-inspector')).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe('#case=CASE-CAR-7C104');

  // The three columns the queue keeps fit whole at the widths it is read at:
  // beside the panel from 1600, and inline beneath it below that, where the
  // register has the content column to itself. At 1024 it scrolls by 32px and
  // says so, which is what the register mark is for.
  for (const { width, beside } of [{ width: 1600, beside: true }, { width: 1440, beside: false }, { width: 1280, beside: false }]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    const seen = await page.evaluate(() => {
      const el = document.querySelector('.register')!;
      const inspector = document.querySelector('.inspector')!.getBoundingClientRect();
      return { hidden: el.scrollWidth - el.clientWidth, beside: inspector.left >= el.getBoundingClientRect().right - 1 };
    });
    expect(seen.hidden, `${width}px: columns hidden inside the register`).toBe(0);
    expect(seen.beside, `${width}px`).toBe(beside);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // The four columns the register dropped are in the panel.
  const panel = page.getByTestId('case-inspector');
  await expect(panel).toContainText('World state valid on');
  await expect(panel).toContainText('Information known by');
  await expect(panel).toContainText('Use code');

  // And the queue's own job — opening the case — is the panel's primary action.
  await page.getByTestId('inspector-open-case').click();
  await page.waitForURL('**/cases/CASE-CAR-7C104');
  await expect(page.getByTestId('decision-rail')).toBeVisible();
});

/*
 * The waiting boundary is not asserted here, and the reason is worth recording
 * rather than leaving as a gap in the file.
 *
 * It is transient by construction, and the router prefetches a static route's
 * flight response, so by the time a link is clicked there is nothing left to
 * wait for. Holding that response — on hover and on click alike — did not open
 * the boundary either: the payload was already in the router's cache from the
 * rail's own prefetch. A test that passed sometimes would be worse than none.
 *
 * It is covered where it can be shown deterministically instead:
 * `SurfaceLoading.test.tsx` renders the boundary and reads every `loading.tsx`
 * in the application, holding each to naming the source it actually reads —
 * which is the defect that was there, a fallback telling every route it was
 * fetching case data.
 */
