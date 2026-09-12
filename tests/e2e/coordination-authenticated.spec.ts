import { test, expect, type Page } from '@playwright/test';

// Synthetic browser-only declarations, never a real token, grant or live worker.
const MOCK_TOKEN = 'e2e_mock_'.repeat(8);
const BOARD = 'browser-smoke-board';
const actionDigest = 'sha256:' + 'a'.repeat(64);
const resultDigest = 'sha256:' + 'b'.repeat(64);
const participant = {
  id: 'browser-smoke-agent', name: 'Browser smoke definition', kind: 'AGENT', version: '0.1.0',
  purpose: 'Read-only browser qualification', authority: 'derived', runtime: 'JavaScript', status: 'LOCAL',
  scope: BOARD, domains: ['LANDSHARK'], inputs: [], outputs: [], capabilities: [], reference: 'test:browser-smoke',
};
const identity = {
  schema: 'payload.coordination.identity.v1', mode: 'AUTHENTICATED',
  board: { boardId: BOARD, corpusId: 'landshark.terminal-parcels', purpose: 'internal_research', domain: 'LANDSHARK' },
  identity: { principalId: 'browser-smoke-principal', terminalId: 'browser-smoke-terminal', participantId: participant.id },
  participant,
};
const entry = {
  message: {
    requestId: 'REQ-browser-smoke', recipientId: participant.id, kind: 'HANDOFF', topic: 'browser-qualification',
    title: 'Inspect a retained fixture result', body: 'This message coordinates inspection; it does not authorize execution.',
    replyTo: null, link: { jobId: 'JOB-browser-smoke', actionDigest, resultDigest }, authorId: 'browser-smoke-peer',
    scope: BOARD, id: 'MSG-browser-smoke', sequence: 1, createdAt: '2026-09-12T12:00:00.000Z',
    digest: 'sha256:' + 'c'.repeat(64),
  },
  linkedJob: {
    jobId: 'JOB-browser-smoke', actionDigest, resultDigest, corpusId: identity.board.corpusId,
    purpose: identity.board.purpose, releaseId: 'REL-browser-smoke', state: 'SUCCEEDED',
    correctsJobId: null, corrections: [], fixture_only: true,
  },
};

type ObservedRequest = { path: string; method: string; body: unknown; authorization: string | undefined };

/** Intercept every API request: this smoke cannot reach real terminal or local-ledger state. */
async function readOnlyTerminal(page: Page) {
  const requests: ObservedRequest[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    requests.push({ path, method: request.method(), body, authorization: request.headers().authorization });
    let result: unknown;
    if (path === '/api/v1/terminal' && request.method() === 'POST'
      && body?.command === 'coordination' && body?.request?.boardId === BOARD) {
      switch (body.request.operation) {
        case 'identity': result = identity; break;
        case 'stable': result = { schema: 'payload.coordination.stable.v1', participants: [participant], connections: [], connectionsTruncated: false }; break;
        case 'inbox': result = {
          schema: 'payload.coordination.inbox.v1', participantId: participant.id, afterSequence: 0,
          nextSequence: 1, highWaterSequence: 1, hasMore: false, messages: [entry], acknowledgements: [], withheld: 0,
        }; break;
      }
    }
    await route.fulfill({ status: result ? 200 : 403, json: { protocol: 'payload.terminal.v1',
      ...(result ? { result } : { error: 'SMOKE_READ_ONLY' }) } });
  });
  return requests;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

for (const surface of [
  { path: '/agents?mode=authenticated', heading: 'Authenticated agent stable', operation: 'stable' },
  { path: '/board?mode=authenticated', heading: 'Authenticated message board', operation: 'inbox' },
] as const) {
  // Both tests run in the existing desktop and mobile projects.
  test(`authenticated coordination: ${surface.operation} is opt-in, keyboard-accessible and bounded`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const requests = await readOnlyTerminal(page);
    const response = await page.goto(surface.path);
    expect(response?.status()).toBe(200);
    const html = await response!.text();
    // The server-rendered payload must not embed the legacy fixture snapshot.
    for (const marker of ['firm:coordination-demo', 'agent.normalize', 'MSG-00002']) expect(html).not.toContain(marker);
    await expect(page.getByRole('heading', { level: 1, name: surface.heading })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Agents and apparatuses' })).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Messages', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Legacy fixture / local view' })).toBeVisible();

    const token = page.getByLabel('Board terminal token', { exact: true });
    const board = page.getByLabel('Board ID', { exact: true });
    const connect = page.getByRole('button', { name: 'Connect to board', exact: true });
    await expect(token).toHaveAttribute('type', 'password');
    await expect(token).toHaveAttribute('autocomplete', 'off');
    await expect(connect).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    await token.focus();
    await token.fill(MOCK_TOKEN);
    await page.keyboard.press('Tab');
    await expect(board).toBeFocused();
    await board.fill(BOARD);
    await page.keyboard.press('Tab');
    await expect(connect).toBeFocused();
    await expect(connect).toBeEnabled();
    expect(requests).toEqual([]); // Neither page load nor entering credentials initiates a request.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('authenticated-board-identity')).toContainText(participant.id);
    expect(requests).toEqual([{ path: '/api/v1/terminal', method: 'POST', authorization: 'Bearer ' + MOCK_TOKEN,
      body: { command: 'coordination', request: { operation: 'identity', boardId: BOARD } } }]);

    if (surface.operation === 'stable') {
      await page.getByRole('button', { name: 'Fetch registered stable', exact: true }).click();
      await expect(page.getByRole('list', { name: 'Authenticated participants' })).toContainText(participant.name);
      await expect(page.getByText(/they do not grant permissions or prove a running worker/)).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Fetch my inbox', exact: true }).click();
      await expect(page.getByTestId('board-message-MSG-browser-smoke')).toContainText(entry.message.body);
      await expect(page.getByTestId('board-link-MSG-browser-smoke')).toContainText('SUCCEEDED');
      await expect(page.getByTestId('board-link-MSG-browser-smoke')).toContainText('Fixture-only result');
      const composer = page.getByRole('form', { name: 'Post authenticated message' });
      await expect(composer).toBeVisible();
      await composer.getByLabel('Message topic', { exact: true }).fill('keyboard-smoke');
      await composer.getByLabel('Message title', { exact: true }).fill('Draft only');
      await composer.getByLabel('Message body', { exact: true }).fill('No write will be sent by this browser smoke.');
      await expect(composer.getByRole('button', { name: 'Post as me', exact: true })).toBeEnabled();
      await expect(page.getByLabel('Author', { exact: true })).toHaveCount(0);
    }
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toMatchObject({ command: 'coordination', request: { operation: surface.operation, boardId: BOARD } });
    await expectNoHorizontalOverflow(page);
    // Reset form-focus scrolling so sticky shell chrome is captured at the top.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('authenticated-' + surface.operation + '.png'), fullPage: true });

    const forget = page.getByRole('button', { name: 'Forget board token', exact: true });
    await forget.focus();
    await page.keyboard.press('Enter');
    await expect(token).toHaveValue('');
    await expect(page.getByTestId('authenticated-board-identity')).toHaveCount(0);
    await expect(page.getByTestId('board-message-MSG-browser-smoke')).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(errors).toEqual([]);
  });
}
