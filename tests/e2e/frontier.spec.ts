import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The three frontier workbenches, which had no browser coverage at all.
 *
 * 2,310 lines of component across five files, three routes, and not one test
 * reference. They were also the only three routes of the application's
 * twenty-seven missing from the overflow sweep, and /frontier was the only
 * workbench page in the repository with no fixture banner.
 *
 * What is asserted here is the thing those pages were getting wrong: a control
 * that changes React state and nothing else must not be labelled as though it
 * committed something.
 */
const WORKBENCHES = ['/frontier', '/factoring', '/dispatch-liability'];

for (const path of WORKBENCHES) {
  test(`${path} states that it is fixture-backed, and passes axe`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('load');

    // Every fixture-backed screen says so. This one used to be the exception.
    const banner = page.getByRole('note', { name: 'Demonstration fixture' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('fixture_only: true');

    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

/**
 * Axe on the landing tab alone would have checked one quarter of /frontier.
 * Three of these four panels are only reachable by clicking, and the whole
 * reason the contrast defect survived is that nobody looked at them.
 */
const FRONTIER_TABS = ['1. Disclosure Assurance (CBAM/CSRD)', '2. Insurability Dynamics', '3. Capex Progress (N11 VOI)', 'Frontier 8-Passage Matrix'];

for (const tab of FRONTIER_TABS) {
  test(`/frontier passes axe on the ${tab} panel`, async ({ page }) => {
    await page.goto('/frontier');
    await page.waitForLoadState('load');
    await page.getByRole('button', { name: tab }).click();
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  });
}

test('the tasking optimizer says its history is session-only, and recomputes rather than committing', async ({ page }) => {
  await page.goto('/frontier');
  await page.waitForLoadState('load');

  // The optimizer is the third tab.
  await page.getByRole('button', { name: '3. Capex Progress (N11 VOI)' }).click();
  const optimizer = page.getByRole('button', { name: '+ Add outcome to this session' });
  await optimizer.scrollIntoViewIfNeeded();

  // The badge above the workbench used to read CLOSED-LOOP CALIBRATED, in
  // green, unconditionally, on a page that writes nothing.
  await expect(page.getByText('SESSION ONLY — NOT PERSISTED')).toBeVisible();
  await expect(page.getByText('CLOSED-LOOP CALIBRATED')).toHaveCount(0);

  await optimizer.click();
  const dialog = page.getByText('Add a ground-truth inspection outcome');
  await expect(dialog).toBeVisible();
  await expect(page.getByText('gone on reload')).toBeVisible();

  // "Commit & Recalibrate" for a setState call.
  await expect(page.getByRole('button', { name: 'Recompute for this session' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Commit/ })).toHaveCount(0);
});

test('an added outcome survives no reload, which is what the page now says', async ({ page }) => {
  await page.goto('/frontier');
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: '3. Capex Progress (N11 VOI)' }).click();
  await page.getByRole('button', { name: '+ Add outcome to this session' }).click();
  await page.getByRole('button', { name: 'Recompute for this session' }).click();

  const added = page.getByText(/N11-TASK-SESSION-/).first();
  await expect(added).toBeVisible();
  // And the order id names what it is: it used to be N11-TASK-LIVE-####.
  await expect(page.getByText(/N11-TASK-LIVE-/)).toHaveCount(0);

  await page.reload();
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: '3. Capex Progress (N11 VOI)' }).click();
  await expect(page.getByText(/N11-TASK-SESSION-/)).toHaveCount(0);
});

test('the factoring desk recomputes a digest and says that is what it did', async ({ page }) => {
  await page.goto('/factoring');
  await page.waitForLoadState('load');

  // "Verify Attestation Integrity" / "✓ Notary Seal Verified" for a SHA-256
  // recomputed over the same fixture that produced the digest being compared.
  const verify = page.getByRole('button', { name: 'Recompute receipt digest' });
  await expect(verify).toBeVisible();
  await verify.click();
  await expect(page.getByRole('button', { name: '✓ Digest matches' })).toBeVisible();
  await expect(page.getByText('Notary Seal Verified')).toHaveCount(0);
});
