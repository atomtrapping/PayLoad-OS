import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ROUTES = [...['state-kernel/route', 'state-kernel/preview/route', 'state-kernel/save/route',
  'production/route', 'production/inspect/route', 'production/compare/route', 'production/source-inventory/route',
  'gat/audits/route', 'gat/audits/[requestId]/route'].map((route) => `api/${route}`), 'earth/page'];

// The reverse check: a file the runtime spawns or reads must be IN its trace.
// Under output: 'standalone' a missing file is a deployment failure, not a warning.
const REQUIRED_FILES = [
  ['api/gat/audits/route', ['scripts/gat-audit-runner.py']],
  ['api/gat/audits/[requestId]/route', ['scripts/gat-audit-runner.py']],
  ['candidates/page', ['examples/carrier/acquisition.json', 'examples/carrier/source.json',
    'examples/carrier/normalization.json', 'examples/evidence/request.json', 'examples/evidence/notice.txt']],
];

export function forbiddenTracePath(value) {
  const path = value.replaceAll('\\', '/').toLowerCase();
  return path === '..' || path.startsWith('../') || path.startsWith('/') || /^[a-z]:\//.test(path) ||
    /(?:^|\/)(?:\.payload|\.stamp|\.git)(?:\/|$)/.test(path) ||
    /^\.env(?:\.|$)/.test(path) ||
    /^(?:tools|artifacts|docs|tests|clients|test-results|playwright-report|deploy)\//.test(path) ||
    path.startsWith('scripts/deployment') || path.startsWith('scripts/access-smoke') ||
    path.startsWith('scripts/coordination-admin') || path.startsWith('src/db/fixtures/') ||
    path.startsWith('native/state-kernel/target/') || /\.(?:test|spec)\.(?:[cm]?[jt]sx?|py)$/.test(path) ||
    ['next.config.ts', 'tsconfig.tsbuildinfo', 'package-lock.json', 'readme.md', 'dockerfile', '.dockerignore'].includes(path);
}

/** Inventory every app trace, including new routes; never open traced targets. */
export function auditBuildTraces(root = process.cwd()) {
  const workspace = resolve(root);
  const app = join(workspace, '.next/server/app');
  const traceFiles = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('Build trace inventory must not contain symbolic links.');
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith('.js.nft.json')) traceFiles.push(path);
    }
  }
  walk(app);
  if (!traceFiles.length) throw new Error('No app build traces were found. Build before auditing.');
  const routes = new Map();
  for (const file of traceFiles.sort()) {
    const route = relative(app, file).replaceAll('\\', '/').replace(/\.js\.nft\.json$/, '');
    const trace = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(trace.files) || trace.files.some((entry) => typeof entry !== 'string' || /[\x00-\x1f]/.test(entry))) {
      throw new Error(`Invalid build trace: ${route}.`);
    }
    const paths = trace.files.map((entry) => relative(workspace, resolve(dirname(file), entry)).replaceAll('\\', '/'));
    if (paths.some(forbiddenTracePath)) {
      throw new Error(`${route} traced unrelated local state, artifacts, documentation, test or compiler files. Do not distribute this build.`);
    }
    routes.set(route, new Set(paths));
  }
  for (const route of REQUIRED_ROUTES) {
    if (!routes.has(route)) throw new Error(`Missing local backend build trace: ${route}.`);
  }
  for (const [route, required] of REQUIRED_FILES) {
    const present = routes.get(route);
    if (!present) throw new Error(`Missing runtime build trace: ${route}.`);
    for (const path of required) {
      if (!present.has(path)) throw new Error(`${route} does not trace ${path}, which it reads or spawns at runtime. This build would fail when deployed.`);
    }
  }
  return { routes: routes.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditBuildTraces();
  console.log(`${result.routes} app build traces exclude local history, operator artifacts, documentation, offline tooling, tests and compiler scratch files; required runtime inputs are present.`);
}
