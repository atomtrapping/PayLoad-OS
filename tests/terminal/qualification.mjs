/** Real loopback HTTP, independent clients, process restarts. Disposable fixtures only.
 * Default requires a real browser. --no-browser is explicitly process/HTTP-only;
 * missing browser dependencies never silently become a successful browser check. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { terminalCall } from '../../clients/javascript/terminal.mjs';

const options = new Set(process.argv.slice(2));
if ([...options].some(option => !['--browser', '--no-browser', '--storage', '--lake'].includes(option)) || (options.has('--browser') && options.has('--no-browser'))) {
  throw new Error('QUALIFICATION_ARGUMENT_INVALID: use no arguments, --browser, or --no-browser');
}
const browserRequested = !options.has('--no-browser');
const lakeRequested = options.has('--lake');
const storageRequested = options.has('--storage') || lakeRequested;
const lake = lakeRequested ? { python: process.env.PAYLOAD_LAKE_PYTHON, packages: process.env.PAYLOAD_LAKE_PYTHON_PACKAGES } : undefined;
if (lakeRequested && (!lake.python || !lake.packages)) throw new Error('QUALIFICATION_LAKE_RUNTIME_REQUIRED');
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = await mkdtemp(join(tmpdir(), 'payload-terminal-process-test-'));
const dataDir = join(directory, 'postgres');
const entry = join(repository, '.stamp', 'terminal-qualification-backend.cjs');
let browser;
let page;
let browserEngine = null;
let browserPhase = 'not-requested';
const browserCommands = [];
const tokens = { a: randomBytes(32).toString('hex'), b: randomBytes(32).toString('hex'), reviewer: randomBytes(32).toString('hex') };
const digestToken = token => createHash('sha256').update(token).digest('hex');
const base = { principalId: 'QUALIFICATION-MINER', displayName: 'Fixture process qualification miner', kind: 'AGENT',
  terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research', corpusScope: ['landshark.terminal-parcels'], canReview: false,
  expiresAt: new Date(Date.now() + 3600000).toISOString() };
const principals = JSON.stringify([
  { ...base, terminalId: 'QUALIFICATION-A', tokenSha256: digestToken(tokens.a) },
  { ...base, terminalId: 'QUALIFICATION-B', tokenSha256: digestToken(tokens.b) },
  { ...base, principalId: 'QUALIFICATION-HUMAN', displayName: 'Fixture human reviewer', kind: 'HUMAN', canReview: true, terminalId: 'QUALIFICATION-R', tokenSha256: digestToken(tokens.reviewer) },
]);
function environment(extra = {}) {
  const env = { NODE_ENV: 'production', PAYLOAD_TERMINAL_QUALIFICATION: '1', PAYLOAD_EXECUTION_PROFILE: 'normal' };
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH']) if (process.env[name]) env[name] = process.env[name];
  return { ...env, ...extra }; // Never inherit production DB, source or model credentials.
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let active;
let origin;
const pids = new Set();
let cleanClosures = 0;
let abruptKills = 0;
function mailbox(child) {
  const messages = [], waiters = new Set();
  child.on('message', message => { messages.push(message); for (const notify of waiters) notify(); });
  return async (kind, timeout = 30000) => {
    const find = () => messages.findIndex(message => message.kind === kind || message.kind === 'failed' || message.kind === 'worker-failed');
    if (find() < 0) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(`QUALIFICATION_IPC_TIMEOUT:${kind}`)); }, timeout);
      const notify = () => { if (find() >= 0) { cleanup(); resolve(); } };
      const closed = () => { cleanup(); reject(new Error(`QUALIFICATION_CHILD_EXIT:${kind}`)); };
      const cleanup = () => { clearTimeout(timer); waiters.delete(notify); child.off('exit', closed); };
      waiters.add(notify); child.once('exit', closed);
    });
    const value = messages.splice(find(), 1)[0];
    assert.equal(value.kind, kind, 'Qualification child reported a bounded failure'); return value;
  };
}
async function launch(holdFirstClaim = false, holdPublication = false) {
  const child = fork(entry, [], { cwd: repository, env: environment(), windowsHide: true, silent: true, serialization: 'json' });
  const wait = mailbox(child); child.stdout.resume(); child.stderr.resume();
  active = { child, wait };
  child.send({ kind: 'initialize', dataDir, principals, holdFirstClaim, browserUi: browserRequested, storage: storageRequested, holdPublication, lake });
  const ready = await wait('ready');
  assert.equal(ready.fixture_only, true); assert.match(ready.methodDigest, /^sha256:[a-f0-9]{64}$/);
  assert(!pids.has(ready.pid), 'Restart requires an actual new backend process');
  pids.add(ready.pid); origin = `http://127.0.0.1:${ready.port}`;
  return ready;
}
async function stop(abrupt = false) {
  if (!active) return;
  const selected = active, exited = once(selected.child, 'exit');
  if (abrupt) { selected.child.kill('SIGKILL'); abruptKills++; }
  else { selected.child.send({ kind: 'shutdown' }); await selected.wait('closed'); cleanClosures++; }
  let timer;
  try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('QUALIFICATION_SHUTDOWN_TIMEOUT')), 10000); })]); }
  finally { clearTimeout(timer); }
  active = undefined;
}
const call = (command, token = tokens.a) => terminalCall({ origin, token, command });
async function browserStyle(command) {
  const response = await fetch(new URL('/api/v1/terminal', origin), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${tokens.b}`, 'content-type': 'application/json', origin }, body: JSON.stringify(command),
  });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json(); assert.equal(body.protocol, 'payload.terminal.v1'); return body.result;
}
async function independentCli(command) {
  const input = join(directory, 'cli-command.json'); await writeFile(input, JSON.stringify(command), { mode: 0o600 });
  const child = spawn(process.execPath, [join(repository, 'clients/javascript/terminal-cli.mjs'), input], {
    cwd: repository, windowsHide: true, shell: false, env: environment({ PAYLOAD_TERMINAL_ORIGIN: origin, PAYLOAD_TERMINAL_TOKEN: tokens.a }), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', size = 0;
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  child.stdout.on('data', chunk => { size += chunk.length; if (size > 1200000) child.kill('SIGKILL'); else output += chunk.toString('utf8'); });
  child.stderr.resume();
  const [code] = await once(child, 'exit'); clearTimeout(timer);
  assert.equal(code, 0, 'Independent CLI must succeed'); return JSON.parse(output);
}
async function submit(key, releaseId, correction) {
  const discovery = await call({ command: 'discover' });
  const pinned = await call({ command: 'pin', releaseId });
  assert.equal(pinned.snapshot.fixture_only, true);
  assert.equal(pinned.snapshot.selection, 'PERMITTED_STANDING_RECORDS');
  assert(pinned.snapshot.coverage.withheldByPermission > 0);
  const request = { capability: discovery.mining.capability, releaseId, snapshotDigest: pinned.snapshotDigest, methodDigest: discovery.mining.methodDigest,
    ...(discovery.mining.retentionDestination ? { retentionDestination: discovery.mining.retentionDestination } : {}),
    parameters: { minRecords: 1 }, budget: { maxRows: 1000, maxInputBytes: 1048576, maxOutputBytes: 1048576, timeoutMs: 5000 },
    idempotencyKey: key, ...(correction ? { correction } : {}) };
  const job = await call({ command: 'submit', request }); assert.equal(job.state, 'PROPOSED');
  return { job, request, pinned };
}
const review = job => call({ command: 'review', review: { jobId: job.jobId, actionDigest: job.actionDigest, response: 'APPROVE', reason: 'Fixture-only exact snapshot/method/budget qualification; no admission, delivery or acquisition.' } }, tokens.reviewer);
async function finished(jobId, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const job = await call({ command: 'job', jobId });
    if (job.state === 'SUCCEEDED') return job;
    assert.notEqual(job.state, 'FAILED', 'The real bounded mining subprocess must succeed');
    await delay(400);
  }
  throw new Error('QUALIFICATION_JOB_TIMEOUT');
}

async function published(jobId) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const job = await call({ command: 'job', jobId });
    assert.equal(job.retention.length, 1);
    if (job.retention[0].state === 'PUBLISHED') return job.retention[0];
    assert.notEqual(job.retention[0].state, 'BLOCKED');
    await delay(400);
  }
  throw new Error('QUALIFICATION_PUBLICATION_TIMEOUT');
}
async function indexPublication(publicationId) {
  active.child.send({ kind: 'lake', publicationId });
  return (await active.wait('lake', 45000)).receipt;
}

async function launchBrowser() {
  browserPhase = 'dependency-check';
  const installed = process.env.PW_CHROMIUM_PATH
    ? [{ path: process.env.PW_CHROMIUM_PATH, engine: 'OPERATOR_CONFIGURED_CHROMIUM' }]
    : [{ path: chromium.executablePath(), engine: 'PLAYWRIGHT_CHROMIUM' },
      { path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', engine: 'MICROSOFT_EDGE_CHROMIUM' },
      { path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', engine: 'MICROSOFT_EDGE_CHROMIUM' }];
  const selected = installed.find(candidate => existsSync(candidate.path));
  if (!selected) throw new Error('QUALIFICATION_BROWSER_DEPENDENCY_UNAVAILABLE: no installed Chromium; no browser was downloaded');
  browserEngine = selected.engine;
  browser = await chromium.launch({ headless: true, executablePath: selected.path, env: environment() });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(15000);
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/terminal') browserCommands.push(request.postDataJSON());
  }); // Observation only: no route interception, mock, proxy or response substitution.
}
async function uiConnect(token = tokens.b) {
  browserPhase = 'authenticate-and-discover';
  await page.goto(new URL('/qualification', origin).href);
  await page.getByLabel('Terminal token', { exact: true }).fill(token);
  await page.getByRole('button', { name: 'Connect and discover', exact: true }).click();
  await page.getByTestId('terminal-identity').waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
}
async function uiSubmit(releaseId, correction) {
  browserPhase = 'pin-and-submit';
  await uiConnect();
  await page.getByLabel('Release ID', { exact: true }).fill(releaseId);
  await page.getByLabel('Minimum records', { exact: true }).fill('1');
  if (correction) {
    await page.getByLabel('Predecessor job ID (optional)', { exact: true }).fill(correction.jobId);
    await page.getByLabel('Correction reason', { exact: true }).fill(correction.reason);
  }
  await page.getByRole('button', { name: 'Pin release', exact: true }).click();
  await page.getByTestId('terminal-request').waitFor();
  const request = JSON.parse(await page.getByTestId('terminal-request').textContent());
  assert.match(await page.getByTestId('terminal-pin').textContent(), /Withheld by permission/);
  const pinned = await call({ command: 'pin', releaseId });
  assert.equal(request.snapshotDigest, pinned.snapshotDigest);
  assert.equal(pinned.snapshot.fixture_only, true);
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await page.getByTestId('terminal-job').waitFor();
  const job = JSON.parse(await page.getByTestId('terminal-job').locator('details pre').textContent());
  assert.equal(job.state, 'PROPOSED');
  assert.equal(await page.getByRole('button', { name: 'Approve exact action', exact: true }).count(), 0);
  return { job, request, pinned };
}
async function uiLoadJob(jobId) {
  await page.getByLabel('Job ID', { exact: true }).fill(jobId);
  await page.getByRole('button', { name: 'Fetch job status', exact: true }).click();
  await page.getByTestId('terminal-job').waitFor();
  return JSON.parse(await page.getByTestId('terminal-job').locator('details pre').textContent());
}
async function uiReview(job) {
  browserPhase = 'manual-human-review';
  await uiConnect(tokens.reviewer); await uiLoadJob(job.jobId);
  assert.equal(await page.getByTestId('terminal-action-digest').textContent(), job.actionDigest);
  const reason = 'Browser reviewer inspected the exact fixture snapshot, method and budget. No admission or delivery.';
  await page.getByLabel('Review reason', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Approve exact action', exact: true }).click();
  await page.getByTestId('terminal-job').getByText('QUEUED', { exact: true }).waitFor();
  assert.deepEqual(browserCommands.at(-1), { command: 'review', review: { jobId: job.jobId, actionDigest: job.actionDigest, response: 'APPROVE', reason } });
}
async function uiResult(jobId) {
  browserPhase = 'fetch-status-result-and-receipt';
  await uiConnect();
  assert.equal((await uiLoadJob(jobId)).state, 'SUCCEEDED');
  await page.getByRole('button', { name: 'Fetch result and receipt', exact: true }).click();
  await page.getByTestId('terminal-result').waitFor();
  const result = JSON.parse(await page.getByTestId('terminal-result').textContent());
  assert.equal(result.result.validation, 'NOT_VALIDATED');
  assert.equal(result.receipt.terminalId, 'QUALIFICATION-B');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  assert.deepEqual(await page.context().cookies(), []);
  await page.getByRole('button', { name: 'Forget token', exact: true }).click();
  assert.equal(await page.getByLabel('Terminal token', { exact: true }).inputValue(), '');
  assert.equal(await page.getByTestId('terminal-result').count(), 0);
  return result;
}

try {
  if (browserRequested) {
    await build({ entryPoints: [join(repository, 'tests/terminal/browser.entry.tsx')], outfile: join(repository, '.stamp/terminal-qualification-browser.js'),
      bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', alias: { '@': join(repository, 'src') },
      define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
    await launchBrowser();
  }
  await build({ entryPoints: [join(repository, 'tests/terminal/backend.entry.ts')], outfile: entry,
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': join(repository, 'src') }, logLevel: 'silent' });
  await launch();
  const original = browserRequested ? await uiSubmit('REL-LS-2026.08.20') : await submit('process-qualification-original', 'REL-LS-2026.08.20');
  await stop(); await launch(true); // Real clean process restart with an unreviewed durable proposal.
  assert.deepEqual(await call({ command: 'job', jobId: original.job.jobId }), original.job);
  assert.deepEqual(await call({ command: 'submit', request: original.request }), original.job);
  await assert.rejects(call({ command: 'review', review: { jobId: original.job.jobId, actionDigest: original.job.actionDigest, response: 'APPROVE', reason: 'Agent cannot review its proposal.' } }), /REVIEW_AUTHORITY_REQUIRED/);
  if (browserRequested) await uiReview(original.job);
  else assert.equal((await review(original.job)).state, 'QUEUED');
  active.child.send({ kind: 'start-workers' });
  const held = await active.wait('claim-held');
  assert.equal(held.jobId, original.job.jobId); assert.equal(held.state, 'RUNNING'); assert.equal(held.attempts, 1);
  await stop(true); await launch(false, storageRequested); // Kill after claim; optional next stop is after object write.
  const retained = await call({ command: 'job', jobId: original.job.jobId });
  assert.equal(retained.state, 'RUNNING'); assert.equal(retained.attempts, 1);
  active.child.send({ kind: 'start-workers' });
  assert.equal((await finished(original.job.jobId)).attempts, 2); // Real 30-second lease, no SQL edits.
  let originalPublication;
  let originalArtifact;
  let heldCustody;
  let originalLake;
  if (storageRequested) {
    heldCustody = (await active.wait('publication-held')).receipt;
    assert.equal(heldCustody.provider, 'local');
    originalArtifact = await readFile(join(directory, 'objects', heldCustody.key));
    assert.equal('sha256:' + createHash('sha256').update(originalArtifact).digest('hex'), heldCustody.contentDigest);
    await stop(true); await launch();
    active.child.send({ kind: 'start-workers' });
    originalPublication = await published(original.job.jobId);
    if (lakeRequested) originalLake = await indexPublication(originalPublication.publication_id);
  }
  const a = await call({ command: 'result', jobId: original.job.jobId });
  if (storageRequested) {
    assert.deepEqual(JSON.parse(originalArtifact.toString('utf8')), a.result);
    assert.equal(heldCustody.contentDigest, a.resultDigest);
    assert.equal(heldCustody.byteLength, originalArtifact.length);
  }
  const b = browserRequested ? await uiResult(original.job.jobId) : await browserStyle({ command: 'result', jobId: original.job.jobId });
  assert.deepEqual(await browserStyle({ command: 'result', jobId: original.job.jobId }), b);
  assert.equal(a.resultDigest, b.resultDigest); assert.deepEqual(a.result, b.result); assert.notEqual(a.receiptDigest, b.receiptDigest);
  assert.equal(a.result.fixture_only, true); assert.equal(a.result.validation, 'NOT_VALIDATED');
  assert.equal(a.result.citations.length, original.pinned.snapshot.records.length);
  assert.deepEqual(await independentCli({ command: 'result', jobId: original.job.jobId }), a);
  await stop(); await launch();
  assert.deepEqual(await call({ command: 'result', jobId: original.job.jobId }), a);
  assert.deepEqual(await browserStyle({ command: 'result', jobId: original.job.jobId }), b);
  if (browserRequested) assert.deepEqual(await uiResult(original.job.jobId), b);
  const correctionDeclaration = { jobId: original.job.jobId, reason: 'Later fixture vintage; original cited result remains unchanged.' };
  const correction = browserRequested ? await uiSubmit('REL-LS-2026.09.01', correctionDeclaration)
    : await submit('process-qualification-correction', 'REL-LS-2026.09.01', correctionDeclaration);
  assert.equal(correction.job.correctsJobId, original.job.jobId); assert.notEqual(correction.pinned.snapshotDigest, original.pinned.snapshotDigest);
  if (browserRequested) await uiReview(correction.job);
  else assert.equal((await review(correction.job)).state, 'QUEUED');
  active.child.send({ kind: 'start-workers' });
  await finished(correction.job.jobId, 15000);
  const corrected = browserRequested ? await uiResult(correction.job.jobId) : await browserStyle({ command: 'result', jobId: correction.job.jobId });
  assert.deepEqual(await browserStyle({ command: 'result', jobId: correction.job.jobId }), corrected);
  assert.notEqual(corrected.resultDigest, a.resultDigest);
  if (storageRequested) {
    const correctedPublication = await published(correction.job.jobId);
    assert.notEqual(correctedPublication.publication_id, originalPublication.publication_id);
    assert.deepEqual(await published(original.job.jobId), originalPublication);
    assert.deepEqual(await readFile(join(directory, 'objects', heldCustody.key)), originalArtifact);
    if (lakeRequested) {
      const correctedLake = await indexPublication(correctedPublication.publication_id);
      assert.equal(correctedLake.receipt.snapshot_record_count, 2);
      assert.notEqual(correctedLake.receipt.snapshot_id, originalLake.receipt.snapshot_id);
      assert.equal(typeof correctedLake.receipt.snapshot_id, 'string');
      assert.equal(originalLake.receipt.snapshot_record_count, 1);
      assert.deepEqual(await indexPublication(originalPublication.publication_id), originalLake);
    }
  }
  assert.deepEqual(await call({ command: 'result', jobId: original.job.jobId }), a);
  assert.deepEqual(await browserStyle({ command: 'result', jobId: original.job.jobId }), b);
  assert.deepEqual((await call({ command: 'job', jobId: original.job.jobId })).corrections, [{ jobId: correction.job.jobId, state: 'SUCCEEDED' }]);
  active.child.send({ kind: 'stats' }); const statistics = (await active.wait('stats')).counts;
  assert.deepEqual(statistics, { proposals: 2, reviews: 2, jobs: 2, results: 2, receipts: 3, attempts: 3, reconciliations: 3 });
  if (browserRequested) {
    for (const command of ['discover', 'pin', 'submit', 'review', 'job', 'result']) assert(browserCommands.some(value => value.command === command));
    assert.equal(browserCommands.filter(value => value.command === 'submit').length, 2);
    assert.equal(browserCommands.filter(value => value.command === 'review').length, 2);
    browserPhase = 'completed';
  }
  await stop();
  process.stdout.write(JSON.stringify({ qualification: 'payload.terminal.process-http.v1', passed: true, fixture_only: true,
    backendProcesses: pids.size, cleanClosures, abruptKillAfterCommittedClaim: abruptKills >= 1,
    storage: { tested: storageRequested, abruptKillAfterObjectBeforeAck: storageRequested && abruptKills === 2, earlierBytesPreserved: storageRequested, provider: storageRequested ? 'LOCAL_QUALIFICATION' : null },
    iceberg: { tested: lakeRequested, freshProcessReadback: lakeRequested, sqlAcknowledgement: lakeRequested, earlierSnapshotPreserved: lakeRequested, catalog: lakeRequested ? 'LOCAL_SQLITE_QUALIFICATION' : null },
    realLeaseRecovery: true, realBoundedMiningSubprocess: true, independentClients: ['javascript', 'native-fetch-same-origin', 'standalone-cli', ...(browserRequested ? ['builtin-TerminalWorkbench-Chromium'] : [])],
    browserUiTested: browserRequested, browserEngine, browserPhase, correctionPreservesOriginal: true, statistics }) + '\n');
} catch (failure) {
  let message = failure instanceof Error ? failure.message : 'QUALIFICATION_FAILED';
  for (const token of Object.values(tokens)) message = message.replaceAll(token, '[REDACTED_FIXTURE_TOKEN]');
  throw new Error(`Qualification failed (${browserPhase}): ${message}`);
} finally {
  await browser?.close();
  if (active && active.child.exitCode === null && active.child.signalCode === null) {
    const exit = once(active.child, 'exit'); active.child.kill('SIGKILL'); await exit;
  }
  const selected = relative(resolve(tmpdir()), resolve(directory));
  assert(!selected.startsWith('..') && selected.startsWith('payload-terminal-process-test-'));
  await rm(directory, { recursive: true, force: true });
}
