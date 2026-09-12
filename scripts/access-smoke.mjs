/**
 * Real production-Next authentication smoke, entirely synthetic and offline.
 * Run after `npm run build`: node scripts/access-smoke.mjs
 * Starts ONLY its own loopback child. Does not load the repository's .env files,
 * connect to a database/provider, enable workers, or read operator histories.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--container-metadata'), 'Unknown smoke argument.');
const containerMetadata = process.argv[2] === '--container-metadata';
const buildIdPath = join(repository, '.next', 'BUILD_ID');
assert(existsSync(buildIdPath), 'A completed production Next build is required before access smoke.');
const buildId = readFileSync(buildIdPath, 'utf8').trim();
assert(/^[A-Za-z0-9_-]+$/.test(buildId), 'Unexpected production build identifier.');

const temporaryBase = resolve(tmpdir());
const directory = mkdtempSync(join(temporaryBase, 'payload-access-smoke-'));
const appDirectory = join(directory, 'app');
const links = [];
const username = 'access-smoke';
const password = randomBytes(32).toString('base64url');
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const terminalToken = randomBytes(32).toString('base64url');
const bearer = `Bearer ${terminalToken}`;
const terminalRegistry = JSON.stringify([{
  principalId: 'ACCESS-SMOKE-AGENT', terminalId: 'ACCESS-SMOKE-TERMINAL', displayName: 'Synthetic access smoke',
  kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research',
  corpusScope: ['landshark'], canReview: false, tokenSha256: createHash('sha256').update(terminalToken).digest('hex'),
  expiresAt: '2099-01-01T00:00:00.000Z',
}]);
let child;
let exit;
let childOutput = '';
let checks = 0;

const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function availablePort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert(address && typeof address !== 'string', 'Unable to reserve a loopback port.');
  await new Promise((done, reject) => reservation.close((error) => error ? reject(error) : done()));
  return address.port;
}

/** Raw HTTP keeps encoded paths intact instead of URL-normalizing the test away. */
function exchange(port, path, headers = {}, method = 'GET', body) {
  return new Promise((done, reject) => {
    const chunks = [];
    let length = 0;
    const request = httpRequest({ hostname: '127.0.0.1', port, path, method, headers, agent: false }, (response) => {
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) response.destroy(new Error('Smoke response exceeded its 2 MiB limit.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => done({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    const timeout = setTimeout(() => request.destroy(new Error('Smoke HTTP request exceeded five seconds.')), 5000);
    request.on('close', () => clearTimeout(timeout));
    request.on('error', reject);
    request.end(body);
  });
}

function status(response, expected, label) {
  checks++;
  assert.equal(response.status, expected, `${label}: unexpected HTTP status.`);
}
function noStore(response, label) {
  checks++;
  assert.match(String(response.headers['cache-control']), /(?:^|[,\s])no-store(?:$|[,\s])/, `${label}: response was cacheable.`);
}

function linkDirectory(source, name) {
  const target = join(appDirectory, name);
  symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  links.push(target);
}

async function stopChild() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([exit, delay(4000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exit, delay(4000)]);
  }
  assert(child.exitCode !== null || child.signalCode !== null, 'The spawned smoke child could not be stopped; temporary files were preserved.');
}

function cleanup() {
  const target = resolve(directory);
  assert(dirname(target) === temporaryBase && basename(target).startsWith('payload-access-smoke-'), 'Refusing cleanup outside the dedicated smoke directory.');
  assert(lstatSync(target).isDirectory() && !lstatSync(target).isSymbolicLink(), 'Refusing unexpected temporary root type.');
  // Unlink only our exact directory links before recursive cleanup: never traverse
  // the repository's build or installed dependencies during cleanup.
  for (const link of links) {
    assert(dirname(link) === appDirectory && lstatSync(link).isSymbolicLink(), 'Refusing unexpected smoke directory link.');
    unlinkSync(link);
  }
  rmSync(target, { recursive: true, force: true });
}

try {
  mkdirSync(appDirectory);
  linkDirectory(join(repository, '.next'), '.next');
  linkDirectory(join(repository, 'node_modules'), 'node_modules');
  copyFileSync(join(repository, 'next.config.ts'), join(appDirectory, 'next.config.ts'));
  copyFileSync(join(repository, 'package.json'), join(appDirectory, 'package.json'));
  mkdirSync(join(appDirectory, '.stamp'));
  copyFileSync(join(repository, '.stamp/terminal-mining-worker.cjs'), join(appDirectory, '.stamp/terminal-mining-worker.cjs'));
  // Next reads .env files from its application directory even when its processed
  // environment marker is set. This directory deliberately has no such files.
  const certificateSource = readFileSync(join(repository, 'src/db/fixtures/tls.ts'), 'utf8');
  const certificate = /export const TEST_DATABASE_CA = `([^`]+)`/.exec(certificateSource)?.[1];
  assert(certificate?.startsWith('-----BEGIN CERTIFICATE-----'), 'Public test CA fixture is missing.');
  const certificatePath = join(directory, 'public-test-ca.pem');
  const passwordPath = join(directory, 'synthetic-operator-password');
  writeFileSync(certificatePath, certificate, { mode: 0o600 });
  writeFileSync(passwordPath, `${password}\n`, { mode: 0o600 });

  // No outbound socket or DNS lookup is necessary for the selected read-only
  // routes. Fail even if an accidental DB/provider attempt is caught upstream.
  const guardPath = join(directory, 'deny-outbound.cjs');
  writeFileSync(guardPath, `
const net = require('node:net');
const dns = require('node:dns');
const { syncBuiltinESMExports } = require('node:module');
const refuse = () => { process.stderr.write('ACCESS_SMOKE_OUTBOUND_REFUSED\\n'); throw new Error('ACCESS_SMOKE_OUTBOUND_REFUSED'); };
net.Socket.prototype.connect = refuse;
${containerMetadata ? `// Exercise Next's container bind-host URL metadata without ever listening on
// all interfaces on this workstation. The real image remains a separate gate.
const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (args[0] && typeof args[0] === 'object') {
    if (args[0].host !== '0.0.0.0') throw new Error('ACCESS_SMOKE_UNEXPECTED_LISTENER');
    args[0] = { ...args[0], host: '127.0.0.1' };
  } else {
    if (args[1] !== '0.0.0.0') throw new Error('ACCESS_SMOKE_UNEXPECTED_LISTENER');
    args[1] = '127.0.0.1';
  }
  return originalListen.apply(this, args);
};` : ''}
// Node's listener calls lookup even for a literal IP. Permit only that no-DNS
// fast path; all outgoing connections remain forbidden by Socket.connect.
const literal = (original) => (...args) => ['127.0.0.1', '::1'].includes(args[0]) ? original(...args) : refuse();
for (const name of Object.keys(dns)) if (/^(lookup|resolve|reverse)/.test(name) && typeof dns[name] === 'function') dns[name] = name === 'lookup' ? literal(dns[name]) : refuse;
for (const name of Object.keys(dns.promises)) if (typeof dns.promises[name] === 'function') dns.promises[name] = name === 'lookup' ? literal(dns.promises[name]) : refuse;
syncBuiltinESMExports();
`, { mode: 0o600 });

  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const environment = {};
  for (const name of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  Object.assign(environment, {
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    PAYLOAD_DEPLOYMENT_MODE: 'internal', PAYLOAD_INTERNAL_ORIGIN: origin,
    PAYLOAD_OPERATOR_USERNAME: username, PAYLOAD_OPERATOR_PASSWORD_FILE: passwordPath,
    PAYLOAD_TERMINAL_PRINCIPALS: terminalRegistry, PAYLOAD_TERMINAL_RETENTION: 'disabled',
    PAYLOAD_EXECUTION_PROFILE: 'conserve', PAYLOAD_OPERATIONS_LOCAL: '1',
    PAYLOAD_PRODUCTION_LOCAL: '0', PAYLOAD_STATE_KERNEL_LOCAL: '0', PAYLOAD_COORDINATION_LOCAL: '0',
    PAYLOAD_PRODUCTION_DIR: join(directory, 'evidence'), PAYLOAD_NOTATION_STATE_DIR: join(directory, 'notation-state'),
    PAYLOAD_SOURCE_QUALIFICATION_DIR: join(directory, 'source-qualification'), PAYLOAD_OBJECT_STORE: 'local',
    DATABASE_URL: 'postgres://access_smoke:synthetic-test-only@database.invalid:5432/access_smoke',
    PAYLOAD_DB_TLS_MODE: 'verify-full', PAYLOAD_DB_CA_FILE: certificatePath,
  });
  child = spawn(process.execPath, ['--require', guardPath, join(repository, 'node_modules/next/dist/bin/next'), 'start', appDirectory, '-H', containerMetadata ? '0.0.0.0' : '127.0.0.1', '-p', String(port)], {
    cwd: appDirectory, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  exit = new Promise((done) => { child.once('exit', done); child.once('error', done); });
  const collect = (bytes) => {
    childOutput += bytes.toString('utf8');
    if (childOutput.length > 64 * 1024) child.kill('SIGTERM');
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const interrupt = () => child?.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let ready = false;
  const startupDeadline = Date.now() + 30_000;
  while (Date.now() < startupDeadline) {
    assert(child.exitCode === null && child.signalCode === null, 'Production Next child exited before becoming ready.');
    try { if ((await exchange(port, '/operations')).status === 401) { ready = true; break; } }
    catch { /* The owned child has not started listening yet. */ }
    await delay(200);
  }
  assert(ready, 'Production Next did not expose the expected authentication boundary.');

  const page = await exchange(port, '/operations', { authorization });
  status(page, 200, 'Authenticated operations page');
  noStore(page, 'Authenticated operations page');
  assert.match(page.body, /NotationsOS/, 'Expected the actual rendered application.');
  const staticPath = /(?:src|href)="(\/_next\/static\/[^"?]+\.(?:css|js))(?:\?[^"<>]*)?"/.exec(page.body)?.[1];
  assert(staticPath, 'Rendered page did not reference a compiled static asset.');
  for (const path of [
    '/operations', '/model', '/api/runtime', staticPath, '/favicon.ico',
    `/_next/data/${buildId}/operations.json`, '/_next/image?url=%2Ffavicon.ico&w=64&q=75',
    '/%6fperations', '/api/%72untime', '/_next/static/%2e%2e/%2e%2e/api/runtime',
  ]) {
    const denied = await exchange(port, path);
    status(denied, 401, `Unauthenticated ${path}`);
    noStore(denied, `Unauthenticated ${path}`);
    assert.match(String(denied.headers['www-authenticate']), /^Basic /);
  }
  status(await exchange(port, '/operations?_rsc=synthetic', { rsc: '1' }), 401, 'Unauthenticated RSC request');
  const asset = await exchange(port, staticPath, { authorization });
  status(asset, 200, 'Authenticated static asset');
  noStore(asset, 'Authenticated static asset');
  const metrics = await exchange(port, '/api/runtime', { authorization, origin, 'sec-fetch-site': 'same-origin' });
  status(metrics, 200, 'Authenticated process metrics');
  noStore(metrics, 'Authenticated process metrics');
  assert.equal(JSON.parse(metrics.body).scope, 'process');
  for (const headers of [
    { authorization: 'Basic ZmFrZTpmYWtl' },
    { authorization, host: `localhost:${port}` },
    { authorization, origin: 'http://different.invalid' },
    { authorization, 'sec-fetch-site': 'cross-site' },
    { authorization, 'x-forwarded-host': 'different.invalid' },
    { authorization, 'x-forwarded-proto': 'https' },
  ]) {
    const denied = await exchange(port, '/api/runtime', headers);
    status(denied, headers.authorization === authorization ? 403 : 401, 'Invalid credential/origin/forwarding context');
    noStore(denied, 'Invalid credential/origin/forwarding context');
  }
  for (const candidateOrigin of [undefined, 'http://different.invalid']) {
    const response = await exchange(port, '/api/production', { authorization, ...(candidateOrigin ? { origin: candidateOrigin } : {}), 'content-type': 'application/json' }, 'POST', '{}');
    status(response, 403, 'Unsafe command without exact same-origin context');
    assert.equal(JSON.parse(response.body).error.code, 'REQUEST_ORIGIN_REFUSED');
  }
  const disabled = await exchange(port, '/api/production', { authorization, origin, 'content-type': 'application/json' }, 'POST', '{}');
  status(disabled, 403, 'Authenticated same-origin command reaches disabled rail');
  noStore(disabled, 'Disabled production rail');
  assert.equal(JSON.parse(disabled.body).error.code, 'LOCAL_MODE_DISABLED');
  const terminalPath = '/api/v1/terminal';
  const discover = JSON.stringify({ command: 'discover' });
  for (const credential of [undefined, authorization]) {
    const denied = await exchange(port, terminalPath, { ...(credential ? { authorization: credential } : {}), origin, 'content-type': 'application/json' }, 'POST', discover);
    status(denied, 401, 'Shell credentials cannot authenticate terminal');
    assert.match(String(denied.headers['www-authenticate']), /^Bearer /);
    assert.equal(JSON.parse(denied.body).error, 'AUTHENTICATION_REQUIRED');
  }
  for (const context of [{}, { origin, 'sec-fetch-site': 'same-origin' }]) {
    const response = await exchange(port, terminalPath, { authorization: bearer, 'content-type': 'application/json', ...context }, 'POST', discover);
    status(response, 200, 'Existing Bearer discovery through actual terminal handler');
    noStore(response, 'Terminal discovery');
    assert.deepEqual(JSON.parse(response.body).result.identity, {
      principalId: 'ACCESS-SMOKE-AGENT', terminalId: 'ACCESS-SMOKE-TERMINAL', purpose: 'internal_research', corpusScope: ['landshark'], canReview: false,
    });
  }
  status(await exchange(port, '/api/runtime', { authorization: bearer, origin }), 401, 'Terminal token is not shell ingress authority');
  const forgedReview = await exchange(port, terminalPath, { authorization: bearer, origin, 'content-type': 'application/json', 'x-payload-can-review': 'true' }, 'POST', JSON.stringify({
    command: 'review', review: { jobId: 'JOB-synthetic', actionDigest: `sha256:${'a'.repeat(64)}`, response: 'APPROVE', reason: 'Synthetic test' },
  }));
  status(forgedReview, 403, 'Agent cannot manufacture review authority');
  assert.equal(JSON.parse(forgedReview.body).error, 'REVIEW_AUTHORITY_REQUIRED');
  status(await exchange(port, terminalPath, { authorization: bearer, origin: 'http://different.invalid', 'content-type': 'application/json' }, 'POST', discover), 403, 'Cross-origin terminal request');
  assert(!childOutput.includes('ACCESS_SMOKE_OUTBOUND_REFUSED'), 'An unexpected outbound connection or DNS lookup was attempted.');
  assert(childOutput.length <= 64 * 1024, 'Production Next exceeded its bounded smoke log.');
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  console.log(`Access smoke passed: ${checks} HTTP assertions; ${containerMetadata ? 'container URL metadata with forced loopback listener' : 'loopback URL metadata'}, isolated production Next, synthetic credentials, no outbound connections.`);
} finally {
  await stopChild();
  cleanup();
}
