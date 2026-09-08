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
