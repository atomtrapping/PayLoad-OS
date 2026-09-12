import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { allowedRuntimePath, auditDeployment } from './deployment-audit.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(join(workspace, path), 'utf8');
const kernel = 'native/state-kernel/target/debug/notations-state-kernel';
const required = ['server.js', 'package.json', 'entrypoint.sh', '.stamp/production-worker.mjs', '.stamp/terminal-mining-worker.cjs', '.stamp/terminal-service.mjs',
  '.stamp/deployment-preflight.cjs', kernel, 'scripts/gat-audit-runner.py', 'scripts/gat-source.mjs',
  '.next/BUILD_ID', '.next/static/chunk.js', 'node_modules/next/package.json',
  'public/cesium/VERSION.json', 'examples/carrier/source.json', 'examples/evidence/notice.txt'];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'payload-deployment-test-'));
  const add = (path) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'synthetic deployment fixture');
  };
  required.forEach(add);
  return { root, add, cleanup() {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(target.startsWith(join(resolve(tmpdir()), 'payload-deployment-test-')));
    rmSync(target, { recursive: true, force: true });
  } };
}

test('runtime file policy rejects histories, credentials, host binaries and tool scaffolding', () => {
  for (const path of ['.payload/evidence/raw', '.PAYLOAD/history.json', '.env', '.env.production',
    'node_modules/example/.env', 'node_modules/example/.envrc', 'examples/key.pem', 'scripts/admin.key', 'db.p12', '.git/config',
    '.stamp/unreviewed-worker.mjs', 'scripts/source.entry.ts', 'scripts/deployment.test.mjs',
    'native/state-kernel/target/debug/notations-state-kernel.exe', 'native/state-kernel/Cargo.toml',
    '../operator/secret', 'C:/operator/secret', '/operator/secret', 'docs/audit.md',
    'examples/regression.test.ts', 'examples/__pycache__/runner.pyc', 'vitest.config.ts']) {
    assert.equal(allowedRuntimePath(path), false, path);
  }
  for (const path of required) assert.equal(allowedRuntimePath(path), true, path);
});

test('complete synthetic package passes and empty state mount point is permitted', () => {
  const sample = fixture();
  try {
    mkdirSync(join(sample.root, '.payload'));
    assert.equal(auditDeployment(sample.root).files, required.length);
  } finally { sample.cleanup(); }
});

test('inventory refuses a populated state mount without reading its contents', () => {
  const sample = fixture();
  try {
    sample.add('.payload/operator-history');
    assert.throws(() => auditDeployment(sample.root), /DEPLOYMENT_UNEXPECTED_FILE/);
  } finally { sample.cleanup(); }
});

test('inventory requires both separately-built worker and target-platform kernel', () => {
  for (const path of ['.stamp/production-worker.mjs', '.stamp/terminal-mining-worker.cjs', '.stamp/terminal-service.mjs', kernel, 'public/cesium/VERSION.json', 'examples/carrier/source.json']) {
    const sample = fixture();
    try {
      rmSync(join(sample.root, path));
      assert.throws(() => auditDeployment(sample.root), /DEPLOYMENT_RUNTIME_INPUT_MISSING/);
    } finally { sample.cleanup(); }
  }
});

test('Docker context is default-deny with secret exclusions after every allowlist', () => {
  const rules = read('.dockerignore').split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
  assert.equal(rules[0], '**');
  const lastAllow = rules.findLastIndex((rule) => rule.startsWith('!'));
  for (const exclusion of ['**/.payload/**', '**/.stamp/**', '**/.git/**', '**/.env*',
    '**/node_modules/**', '**/target/**', '**/*.pem', '**/*.key']) assert.ok(rules.indexOf(exclusion) > lastAllow);
  // Our small allowlist uses glob patterns only. These are policy regression
  // samples, not a replacement for Docker's own build-context implementation.
  function allowed(path) {
    let include = false;
    for (const rule of rules) {
      const allow = rule.startsWith('!');
      const pattern = allow ? rule.slice(1) : rule;
      if (matchesGlob(path, pattern)) include = allow;
    }
    return include;
  }
  for (const path of ['.env', '.env.example', '.payload/history', '.stamp/worker.mjs', '.git/config',
    'native/state-kernel/target/debug/kernel', 'public/cesium/local.js', 'deploy/secret.key',
    'src/db/fixtures/ca.pem', 'src/db/fixtures/tls.ts', 'src/.env.production', 'node_modules/next/package.json',
    'artifacts/package.payload', 'unreviewed-folder/server.js']) assert.equal(allowed(path), false, path);
  for (const path of ['src/app/page.tsx', 'src/access/config.ts', 'examples/carrier/source.json',
    'native/state-kernel/src/main.rs', 'native/state-kernel/Cargo.lock', 'scripts/production-worker.entry.ts',
    'scripts/terminal-mining-worker.entry.ts', 'scripts/terminal-service.entry.ts',
    'src/terminal/retention.ts', 'src/data-os/sos-object-store.ts', 'src/adapter/corpusSource.ts',
    'scripts/deployment-preflight.entry.ts', 'scripts/deployment-audit.mjs', 'deploy/entrypoint.sh']) assert.equal(allowed(path), true, path);
});

test('Docker recipe preserves pins, explicit runtime selection, preflight and non-root identity', () => {
  const recipe = read('Dockerfile');
  for (const line of recipe.split(/\r?\n/).filter((line) => /^FROM (?:node|rust):/.test(line))) {
    assert.match(line, /@sha256:[a-f0-9]{64} AS (?:kernel|builder|runtime)$/);
  }
  assert.doesNotMatch(recipe, /^\s*COPY\s+\.\s/m);
  assert.doesNotMatch(recipe, /COPY.*(?:\.payload|\.env|--from=kernel.*\/target\/\s)/);
  assert.match(recipe, /cargo build --release --locked/);
  assert.match(recipe, /npm ci --no-audit --no-fund/);
  assert.match(recipe, /npm run build/);
  assert.match(recipe, /npm run deployment:build-preflight/);
  assert.match(recipe, /npm run terminal:build/);
  assert.match(recipe, /npm run terminal:service:build/);
  assert.doesNotMatch(recipe, /node node_modules\/esbuild\/bin\/esbuild/);
  assert.ok(read('.gitattributes').includes('deploy/*.sh text eol=lf'));
  assert.match(recipe, /node scripts\/deployment-audit\.mjs \/runtime/);
  assert.match(recipe, /USER 10001:10001/);
  assert.match(recipe, /COPY --from=kernel \/kernel\/target\/release\/notations-state-kernel \/runtime\/native\/state-kernel\/target\/debug\/notations-state-kernel/);
  const entry = read('deploy/entrypoint.sh');
  assert.ok(entry.indexOf('node .stamp/deployment-preflight.cjs') < entry.indexOf('exec node server.js'));
  assert.ok(entry.includes('mode="${1:-web}"'));
  assert.ok(entry.includes('exec node .stamp/terminal-service.mjs worker'));
  assert.ok(entry.includes('exec node .stamp/terminal-service.mjs publisher'));
  assert.doesNotMatch(entry.split(/\r?\n/).filter((line) => !line.startsWith('#')).join('\n'), /npm run|cargo|bootstrap|seed-db|source\.entry/);
});

test('base composition is single-writer, loopback-only, resource-bounded and read-only', () => {
  const compose = read('deploy/compose.yaml');
  for (const fragment of ['"127.0.0.1:3000:3000"', 'read_only: true', 'user: "10001:10001"',
    'cap_drop: [ALL]', 'no-new-privileges:true', 'pids_limit: 128', 'mem_limit: 2g', 'cpus: "2.0"',
    'PAYLOAD_SOURCE_COLLECTION: "0"', 'PAYLOAD_SAMSARA_COLLECTION: "0"', 'GAT_INTEGRATION: "0"',
    'PAYLOAD_DEPLOYMENT_MODE: internal', 'PAYLOAD_DB_TLS_MODE: verify-full',
    'PAYLOAD_EXECUTION_PROFILE: conserve', 'create_host_path: false', 'pull_policy: never']) assert.ok(compose.includes(fragment), fragment);
  assert.doesNotMatch(compose, /network_mode:\s*host|privileged:\s*true|docker\.sock|replicas:|build:/);
  assert.ok(!compose.includes('PAYLOAD_OPERATOR_PASSWORD:'));
  assert.ok(!compose.includes('PAYLOAD_SOS_SECRET_ACCESS_KEY:'));
  assert.ok(!read('deploy/compose.sos.yaml').includes('PAYLOAD_SOS_SECRET_ACCESS_KEY:'));
});

test('preflight reuses authoritative validators and never connects or starts work', () => {
  const preflight = read('scripts/deployment-preflight.entry.ts');
  for (const symbol of ['readAccessConfiguration(environment)', 'databaseConfig(environment)',
    'executionPolicy(environment)', 'sosConfig(environment)', 'retentionPlan(environment)',
    'authenticateTerminal(new Request(']) assert.ok(preflight.includes(symbol), symbol);
  assert.doesNotMatch(preflight, /new Pool|fetch\(|writeFile|spawn\(|connect\(/);
  assert.ok(preflight.includes("environment.PAYLOAD_SOS_SECRET_ACCESS_KEY_FILE !== '/run/secrets/sos-secret-access-key'"));
});

test('access smoke uses operating routes and assets present in this repository', () => {
  const smoke = read('scripts/access-smoke.mjs');
  const targets = source => [...source.matchAll(/^const (operatingPage|operatingApi|iconPath) = '([^']+)';\r?$/gm)]
    .map(([, name, route]) => [name, route]);
  const routes = targets(smoke);
  assert.deepEqual(targets(smoke.replace(/\r?\n/g, '\r\n')), routes, 'CRLF checkout preserves the same route inventory');
  assert.equal(routes.length, 3);
  for (const [name, route] of routes) {
    assert.match(route, /^\/[A-Za-z0-9/.-]+$/);
    const source = name === 'iconPath' ? `src/app${route}` : `src/app${route}/${name === 'operatingApi' ? 'route.ts' : 'page.tsx'}`;
    assert.ok(read(source).length > 0, `${name}: ${source}`);
  }
  assert.ok(smoke.includes('payload.production-availability.v1'));
  assert.ok(!smoke.includes('/api/runtime'));
  assert.ok(!smoke.includes('/operations'));
  assert.ok(smoke.includes('net.Socket.prototype.connect = refuse'));
});
