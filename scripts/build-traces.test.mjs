import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { auditBuildTraces, forbiddenTracePath } from './check-state-kernel-traces.mjs';

const critical = [
  ...['state-kernel/route', 'state-kernel/preview/route', 'state-kernel/save/route',
    'production/route', 'production/inspect/route', 'production/compare/route', 'production/source-inventory/route',
    'gat/audits/route', 'gat/audits/[requestId]/route'].map((route) => `api/${route}`), 'earth/page', 'candidates/page',
];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'notations-trace-test-'));
  function trace(route, paths = []) {
    const file = join(root, '.next/server/app', `${route}.js.nft.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ version: 1, files: paths.map((path) => relative(dirname(file), join(root, path))) }));
  }
  for (const route of critical) trace(route);
  for (const route of ['api/gat/audits/route', 'api/gat/audits/[requestId]/route']) trace(route, ['scripts/gat-audit-runner.py']);
  trace('candidates/page', ['examples/carrier/acquisition.json', 'examples/carrier/source.json',
    'examples/carrier/normalization.json', 'examples/evidence/request.json', 'examples/evidence/notice.txt']);
  return { root, trace, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('every newly discovered route is audited, not only the historical shortlist', () => {
  const scenario = fixture();
  try {
    scenario.trace('new-product/page', ['src/domain/corpus.ts']);
    assert.equal(auditBuildTraces(scenario.root).routes, critical.length + 1);
    scenario.trace('new-product/page', ['artifacts/operator-notes.zip']);
    assert.throws(() => auditBuildTraces(scenario.root), /new-product\/page traced unrelated/);
  } finally { scenario.cleanup(); }
});

test('offline tools, operator artifacts, documentation and local state are forbidden', () => {
  for (const path of ['tools/storage_proof.py', 'tools/lakehouse/pilot.py', '.stamp/worker.mjs', '.payload/evidence/x',
    '.PAYLOAD/evidence/x', '.git/config', '.env.local', 'artifacts/design.zip', 'docs/audit.md',
    'scripts/build-traces.test.mjs', 'tests/e2e/test.spec.ts', 'native/state-kernel/target/debug/notations-state-kernel.exe',
    'Dockerfile', '.dockerignore', 'deploy/compose.yaml', 'scripts/deployment-preflight.entry.ts',
    'scripts/access-smoke.mjs', 'src/db/fixtures/tls.ts',
    '../private/input.json', 'D:/private/input.json', 'D:\\private\\input.json',
    '/private/input.json', '\\\\server\\share\\input.json', '//server/share/input.json']) {
    assert.equal(forbiddenTracePath(path), true, path);
  }
  for (const path of ['scripts/gat-audit-runner.py', 'scripts/gat-source.mjs', 'examples/evidence/notice.txt',
    'public/cesium/Cesium.js', 'src/domain/corpus.ts', 'node_modules/pg/lib/index.js']) {
    assert.equal(forbiddenTracePath(path), false, path);
  }
});

test('required runtime scripts and evidence examples must remain traced', () => {
  const scenario = fixture();
  try {
    scenario.trace('api/gat/audits/route');
    assert.throws(() => auditBuildTraces(scenario.root), /does not trace scripts\/gat-audit-runner.py/);
  } finally { scenario.cleanup(); }
});

test('missing critical route fails instead of shrinking the inventory silently', () => {
  const scenario = fixture();
  try {
    rmSync(join(scenario.root, '.next/server/app/earth/page.js.nft.json'));
    assert.throws(() => auditBuildTraces(scenario.root), /Missing local backend build trace: earth\/page/);
  } finally { scenario.cleanup(); }
});
