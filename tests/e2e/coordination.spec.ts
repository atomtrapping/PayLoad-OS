import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { applyCommand, connectionsFor, CoordinationError } from '../../src/coordination/ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from '../../src/coordination/seed';
import type { CoordinationCommand, CoordinationInbox, CoordinationSnapshot, CoordinationState } from '../../src/coordination/types';

const SURFACES = [
  { path: '/agents', heading: 'Agent & apparatus stable', screenshot: 'coordination-stable.png' },
  { path: '/board', heading: 'Message board', screenshot: 'coordination-board.png' },
];

function localSnapshot(state: CoordinationState): CoordinationSnapshot {
  return {
    ...state, fixture_only: true, scope: DEMO_SCOPE, mode: 'LOCAL_SANDBOX',
    persistence: 'LOCAL_FILE', canWrite: true, connections: connectionsFor(state, DEMO_SCOPE),
    releaseContexts: structuredClone(RELEASE_CONTEXTS),
  };
}

/** Exercise browser commands against the real ledger without writing the developer's local log. */
async function isolatedBoard(page: Page) {
  let state = createSeed();
  const commands: CoordinationCommand[] = [];
  await page.route('**/api/coordination', async (route) => {
    try {
      if (route.request().method() === 'POST') {
        const command = route.request().postDataJSON() as CoordinationCommand;
        state = applyCommand(state, DEMO_SCOPE, command, RELEASE_CONTEXTS, '2026-09-05T13:00:00.000Z');
        commands.push(command);
      } else if (route.request().method() !== 'GET') {
        await route.fulfill({ status: 405, json: { error: 'METHOD_NOT_ALLOWED' } });
        return;
      }
      await route.fulfill({ status: 200, json: localSnapshot(state) });
    } catch (error) {
      await route.fulfill({
        status: error instanceof CoordinationError ? error.status : 500,
        json: { error: error instanceof CoordinationError ? error.code : 'TEST_LEDGER_ERROR', detail: String(error) },
      });
    }
  });
  return { commands, state: () => state };
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const surface of SURFACES) {
  test(`coordination: ${surface.path} renders read only without page errors`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(surface.path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: surface.heading })).toBeVisible();
    await expect(page.getByText('READ ONLY', { exact: true })).toBeVisible();
    await expect(page.getByText('No agents are launched by this board.')).toBeVisible();
    await expect(page.getByRole('form', { name: 'Compose message' })).toHaveCount(0);
    await expect(page.getByRole('form', { name: 'Register participant' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(surface.screenshot), fullPage: true });
  });
}

test('coordination: the stable is a register, its filters cut it, and synastry is walked from the inspector', async ({ page }, testInfo) => {
  await page.goto('/agents');
  const register = page.getByRole('table', { name: 'Agents and apparatuses' });
  await expect(register.locator('tbody tr')).toHaveCount(12);
  await expect(page.getByTestId('participant-inspector')).toHaveCount(0);

  await page.locator('[data-participant-select="agent.normalize"]').click();
  const inspector = page.getByTestId('participant-inspector');
  await expect(inspector.getByText('Normalization agent')).toBeVisible();
  await expect(page).toHaveURL(/#participant=agent\.normalize$/);
  await expect(inspector.getByText(/Contract compatibility indicates how definitions can work together/)).toBeVisible();
  await expect(inspector.getByText('MATCH', { exact: true }).first()).toBeVisible();
  await expect(inspector.getByText('PARTIAL', { exact: true })).toBeVisible();
  await expect(inspector.getByText(/Missing inputs:/)).toContainText('IdentityMapping/v1');
  await page.screenshot({ path: testInfo.outputPath('coordination-synastry.png'), fullPage: true });

  // A connection names another row, so it selects it rather than printing an id.
  await inspector.getByRole('button', { name: 'Identity agent', exact: true }).click();
  await expect(page.getByTestId('participant-inspector')).toContainText('Propose evidence-bearing mappings');
  await expect(page).toHaveURL(/#participant=agent\.identity$/);

  await page.getByRole('combobox', { name: 'Participant kind', exact: true }).selectOption('AGENT');
  await page.getByLabel('Search the stable', { exact: true }).fill('identity.propose');
  await expect(register.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('[data-participant-select="agent.identity"]')).toBeVisible();
  await page.getByRole('combobox', { name: 'Participant kind', exact: true }).selectOption('APPARATUS');
  await expect(page.getByText('No definitions match these filters.')).toBeVisible();
  // The selection survives a filter that hides its row, and says so.
  await expect(page.getByTestId('participant-not-listed')).toBeVisible();
});

test('coordination: a selection is in the URL, that URL opens on it, and a name the surface does not hold opens on nothing', async ({ page }) => {
  await page.goto('/agents#participant=apparatus.delivery');
  await expect(page.getByTestId('participant-inspector')).toContainText('API and feed projection');

  // Loaded fresh, because a fragment change on a live page is a same-document
  // navigation: there the register keeps the selection it has rather than
  // clearing it for a name that means nothing here. This is the other
  // direction — arriving on such a name, with nothing to keep.
  await page.goto('/board');
  await page.goto('/agents#participant=agent.nowhere');
  await expect(page.getByTestId('participant-inspector')).toHaveCount(0);

  await page.goto('/board#message=MSG-00002');
  const inspector = page.getByTestId('message-inspector');
  await expect(inspector.getByTestId('message-body')).toContainText('The demonstration release has no sample-to-lot link.');
  await expect(inspector.getByRole('link', { name: 'REL-CAR-2026.09.01', exact: true })).toHaveAttribute('href', '/releases/REL-CAR-2026.09.01');
  // A message that is not a reply says so, in an element that is there to read.
  await expect(inspector.getByTestId('inspector-reply-to')).toContainText('Nothing');
  await expect(inspector.getByTestId('inspector-thread')).toContainText('This message starts the thread.');

  await page.goto('/agents');
  await page.goto('/board#message=MSG-00404');
  await expect(page.getByTestId('message-inspector')).toHaveCount(0);
});

test('coordination: the fixture API exposes the shared register with writes explicitly disabled', async ({ request }) => {
  const response = await request.get('/api/coordination');
  expect(response.status()).toBe(200);
  expect(response.headers()['x-payload-fixture-only']).toBe('true');
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json() as CoordinationSnapshot;
  expect(body).toMatchObject({ fixture_only: true, canWrite: false, mode: 'FIXTURE', persistence: 'NONE', scope: DEMO_SCOPE });
  expect(body.participants).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'apparatus.coordination', kind: 'APPARATUS', authority: 'coordination' }),
    expect.objectContaining({ id: 'agent.identity', kind: 'AGENT', status: 'PLANNED' }),
  ]));
  expect(body.participants.every((participant) => participant.scope === DEMO_SCOPE)).toBe(true);
  expect(body.messages.every((message) => message.scope === DEMO_SCOPE)).toBe(true);
  expect(body.releaseContexts).toEqual(RELEASE_CONTEXTS);
});

test('coordination: the fixture inbox scopes pending handoffs, opts into broadcasts and validates queries', async ({ request }) => {
  const seed = createSeed();
  const response = await request.get('/api/coordination/inbox?participant=agent.release');
  expect(response.status()).toBe(200);
  expect(response.headers()).toMatchObject({
    'x-payload-fixture-only': 'true', 'x-payload-coordination': 'sandbox-v1', 'cache-control': 'no-store',
  });
  const inbox = await response.json() as CoordinationInbox;
  expect(inbox).toEqual({
    schema: 'payload.coordination-inbox.v1', fixture_only: true, mode: 'FIXTURE', canWrite: false,
    scope: DEMO_SCOPE, participantId: 'agent.release', afterSequence: 0,
    nextSequence: 3, highWaterSequence: 3, hasMore: false,
    messages: [seed.messages[2]], acknowledgements: [],
  });
  expect(inbox.messages.every((message) => message.scope === DEMO_SCOPE && message.recipientId === 'agent.release')).toBe(true);

  const broadcastResponse = await request.get('/api/coordination/inbox?participant=agent.release&broadcasts=true&limit=1');
  expect(broadcastResponse.status()).toBe(200);
  const firstPage = await broadcastResponse.json() as CoordinationInbox;
  expect(firstPage).toMatchObject({ messages: [seed.messages[0]], afterSequence: 0, nextSequence: 1, highWaterSequence: 3, hasMore: true });
  const nextResponse = await request.get(`/api/coordination/inbox?participant=agent.release&broadcasts=true&limit=1&after=${firstPage.nextSequence}`);
  expect(nextResponse.status()).toBe(200);
  expect(await nextResponse.json()).toMatchObject({ messages: [seed.messages[2]], afterSequence: 1, nextSequence: 3, hasMore: false });

  for (const [query, status, code] of [
    ['participant=agent.release&after=-1', 400, 'INVALID_INBOX_QUERY'],
    ['participant=agent.release&scope=another-scope', 400, 'INVALID_INBOX_QUERY'],
    ['participant=agent.unknown', 404, 'UNKNOWN_PARTICIPANT'],
  ] as const) {
    const invalid = await request.get(`/api/coordination/inbox?${query}`);
    expect(invalid.status(), query).toBe(status);
    expect(await invalid.json()).toMatchObject({ fixture_only: true, error: code, detail: expect.any(String) });
  }
});

test('coordination: both surfaces have no serious or critical accessibility violations', async ({ page }) => {
  /*
   * Motion removed for the reason the specification sweep removes it, and one
   * more. Below 1024px the inspector brings itself into view with a smooth
   * scroll, so for about half a second the page is between two positions and a
   * row can sit half under the sticky top bar. Axe measures geometry, and
   * measuring during the flight measures the flight: it reported a row as
   * "partially obscured (366px by 12.5px)" at one scroll offset and clean at
   * the next. Reduced motion is a real reader setting, and under it the
   * inspector arrives at once, so what is measured is where the reader ends up.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const surface of SURFACES) {
    await page.goto(surface.path);
    // With the inspector open, which is the state that carries the most markup.
    await page.locator(surface.path === '/agents' ? '[data-participant-select="agent.normalize"]' : '[data-message-select="MSG-00002"]').click();
    await expect(page.getByTestId(surface.path === '/agents' ? 'participant-inspector' : 'message-inspector')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious, `${surface.path}: ${JSON.stringify(serious.map((violation) => ({ id: violation.id, nodes: violation.nodes.length, help: violation.help })), null, 1)}`).toEqual([]);
  }
});

test('coordination: mobile surfaces and expanded relationships stay within the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  for (const surface of SURFACES) {
    await page.goto(surface.path);
    await expect(page.getByRole('heading', { level: 1, name: surface.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.locator(surface.path === '/agents' ? '[data-participant-select="agent.normalize"]' : '[data-message-select="MSG-00002"]').click();
    await expect(page.getByTestId(surface.path === '/agents' ? 'participant-inspector' : 'message-inspector')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('coordination: isolated local board composes a handoff, records its recipient receipt and preserves reply context', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const api = await isolatedBoard(page);
  await page.goto('/board');
  await expect(page.getByRole('form', { name: 'Compose message' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('LOCAL SANDBOX', { exact: true })).toBeVisible();
  const composer = page.getByRole('form', { name: 'Compose message' });
  await expect(composer).toBeVisible();
  if (isMobile) await expectNoHorizontalOverflow(page);

  const context = RELEASE_CONTEXTS.find((release) => release.releaseId === 'REL-CAR-2026.09.01')!;
  const title = 'Review the Caravan identity mapping';
  await composer.getByRole('combobox', { name: 'Author', exact: true }).selectOption('apparatus.corpus');
  await composer.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption('agent.identity');
  await composer.getByRole('combobox', { name: 'Message kind', exact: true }).selectOption('HANDOFF');
  await composer.getByLabel('Topic', { exact: true }).fill('identity-review');
  await composer.getByLabel('Title', { exact: true }).fill(title);
  await composer.getByRole('combobox', { name: 'Release context', exact: true }).selectOption(context.releaseId);
  await composer.getByLabel('Body', { exact: true }).fill('Inspect the sample-to-lot mapping against this release and retain unresolved evidence.');
  await composer.getByRole('button', { name: 'Post message', exact: true }).click();

  // Wait for the posted message to reach the register before reading the
  // ledger's state for its id: the row appearing is what says the round trip
  // has happened, and reading first raced it.
  const register = page.getByRole('table', { name: 'Messages' });
  await expect(register).toContainText(title);
  const posted = api.state().messages.find((message) => message.title === title)!;
  const row = page.locator(`[data-message-select="${posted.id}"]`);
  await expect(row).toContainText(title);
  await expect(row.locator('xpath=ancestor::tr')).toContainText('HANDOFF');
  expect(api.commands[0]).toMatchObject({
    operation: 'post', message: { authorId: 'apparatus.corpus', recipientId: 'agent.identity', kind: 'HANDOFF', topic: 'identity-review', context },
  });

  await row.click();
  const handoff = page.getByTestId('message-inspector');
  await expect(handoff.getByRole('link', { name: context.releaseId, exact: true })).toBeVisible();
  const acknowledger = handoff.getByRole('combobox', { name: `Acknowledge ${title} as`, exact: true });
  await expect(acknowledger.locator('option')).toHaveCount(1);
  await expect(acknowledger).toHaveValue('agent.identity');
  await handoff.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(handoff.getByTestId('message-receipts')).toContainText('Identity agent');
  expect(api.commands[1]).toEqual({ operation: 'acknowledge', messageId: posted.id, participantId: 'agent.identity' });

  await composer.getByRole('combobox', { name: 'Author', exact: true }).selectOption('agent.identity');
  await handoff.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(composer.getByLabel('Topic', { exact: true })).toBeDisabled();
  await expect(composer.getByLabel('Topic', { exact: true })).toHaveValue('identity-review');
  await expect(composer.getByRole('combobox', { name: 'Release context', exact: true })).toBeDisabled();
  await expect(composer.getByRole('combobox', { name: 'Release context', exact: true })).toHaveValue(context.releaseId);
  await expect(composer.getByRole('combobox', { name: 'Recipient', exact: true })).toHaveValue('apparatus.corpus');
  await composer.getByRole('combobox', { name: 'Message kind', exact: true }).selectOption('RESULT');
  await composer.getByLabel('Body', { exact: true }).fill('The evidence does not yet establish identity. Keep the mapping unresolved.');
  await composer.getByRole('button', { name: 'Post message', exact: true }).click();
  await expect(register).toContainText(`Re: ${title}`);
  const replied = api.state().messages.find((message) => message.title === `Re: ${title}`)!;
  await page.locator(`[data-message-select="${replied.id}"]`).click();
  const reply = page.getByTestId('message-inspector');
  await expect(reply.getByTestId('inspector-reply-to')).toContainText(posted.id);
  // Following the thread selects the message it answers rather than scrolling to it.
  await reply.getByTestId('inspector-reply-to-open').click();
  await expect(page.getByTestId('message-inspector')).toContainText(title);
  await expect(page).toHaveURL(new RegExp(`#message=${posted.id}$`));
  expect(api.commands[2]).toMatchObject({
    operation: 'post', message: { authorId: 'agent.identity', recipientId: 'apparatus.corpus', kind: 'RESULT', replyTo: posted.id, topic: 'identity-review', context },
  });
  if (isMobile) await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('coordination-local-handoff.png'), fullPage: true });
});
