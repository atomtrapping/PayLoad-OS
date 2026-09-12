import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import { auditBuildTraces, forbiddenTracePath } from './check-state-kernel-traces.mjs';

const picomatch = createRequire(import.meta.url)('next/dist/compiled/picomatch');
const repository = fileURLToPath(new URL('../', import.meta.url));
// Read the real configuration using the installed compiler, not Node's
// version-dependent native TypeScript loader. Its only import is type-only.
const configJavaScript = ts.transpileModule(readFileSync(join(repository, 'next.config.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const nextConfig = (await import(`data:text/javascript;base64,${Buffer.from(configJavaScript).toString('base64')}`)).default;

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

test('Next excludes every audited test-source extension without excluding runtime scripts or evidence', () => {
  const route = '/api/compute/clearance/artifacts/[id]';
  // Same matcher and options as Next's collect-build-traces implementation,
  // using portable forward-slash paths as recorded in the trace inventory.
  const patterns = Object.entries(nextConfig.outputFileTracingExcludes)
    .filter(([routePattern]) => picomatch(routePattern, { dot: true, contains: true })(route))
    .flatMap(([, exclusions]) => exclusions.map(pattern => join(repository, pattern).replaceAll('\\', '/')));
  const excludes = picomatch(patterns, { dot: true, contains: true });
  for (const suffix of ['test', 'spec']) {
    for (const extension of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'mjsx', 'cjs', 'cjsx', 'mts', 'mtsx', 'cts', 'ctsx', 'py']) {
      const path = `scripts/build-traces.${suffix}.${extension}`;
      assert.equal(forbiddenTracePath(path), true, path);
      assert.equal(excludes(resolve(repository, path).replaceAll('\\', '/')), true, path);
    }
  }
  for (const path of ['scripts/gat-audit-runner.py', 'scripts/gat-source.mjs', 'examples/evidence/notice.txt',
    'src/domain/corpus.ts', 'node_modules/pg/lib/index.js']) {
    assert.equal(excludes(resolve(repository, path).replaceAll('\\', '/')), false, path);
  }
  const scenario = fixture();
  try {
    scenario.trace('api/compute/clearance/artifacts/[id]/route', ['scripts/build-traces.test.mjs']);
    assert.throws(() => auditBuildTraces(scenario.root), /traced unrelated/);
  } finally { scenario.cleanup(); }
});

test('missing critical route fails instead of shrinking the inventory silently', () => {
  const scenario = fixture();
  try {
    rmSync(join(scenario.root, '.next/server/app/earth/page.js.nft.json'));
    assert.throws(() => auditBuildTraces(scenario.root), /Missing local backend build trace: earth\/page/);
  } finally { scenario.cleanup(); }
});
