import { lstatSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kernel = 'native/state-kernel/target/debug/notations-state-kernel';
const generated = new Set(['.stamp/production-worker.mjs', '.stamp/terminal-mining-worker.cjs', '.stamp/terminal-service.mjs', '.stamp/deployment-preflight.cjs', kernel]);
const runtimeFiles = new Set(['server.js', 'package.json', 'entrypoint.sh',
  'scripts/gat-audit-runner.py', 'scripts/gat-source.mjs']);
const runtimeTrees = ['.next/', 'node_modules/', 'public/', 'examples/'];

/** Inventory only; this never opens a suspected secret or retained evidence. */
export function allowedRuntimePath(value) {
  const path = value.replaceAll('\\', '/');
  if (!path || path.startsWith('/') || path.split('/').some((part) => part === '..' || part === '.' || !part)
      || /^[a-z]:/i.test(path) || /[\x00-\x1f]/.test(path)) return false;
  const lower = path.toLowerCase();
  if (/(?:^|\/)(?:\.payload|\.git|__pycache__)(?:\/|$)/.test(lower)
      || /(?:^|\/)\.env[^/]*(?:\/|$)/.test(lower)
      || /\.(?:pem|key|p12|pfx|pyc)$/.test(lower)) return false;
  if (generated.has(path)) return true;
  if (/(?:^|\/)(?:\.stamp|target)(?:\/|$)/.test(lower)) return false;
  // Some third-party distributions legitimately contain test-named runtime
  // helpers. Repository tests/tooling are not runtime files.
  if (!path.startsWith('node_modules/') && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(lower)) return false;
  return runtimeFiles.has(path) || runtimeTrees.some((prefix) => path.startsWith(prefix));
}

export function auditDeployment(root) {
  const absolute = resolve(root);
  if (!lstatSync(absolute).isDirectory() || lstatSync(absolute).isSymbolicLink()) throw new Error('DEPLOYMENT_ROOT_INVALID');
  const files = new Set();
  let entries = 0;
  function walk(directory, depth = 0) {
    if (depth > 32) throw new Error('DEPLOYMENT_INVENTORY_LIMIT');
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 200000) throw new Error('DEPLOYMENT_INVENTORY_LIMIT');
      const path = join(directory, entry.name);
      const local = relative(absolute, path).replaceAll('\\', '/');
      // The mount point may exist empty in the image, never with host contents.
      if (local === '.payload' && entry.isDirectory() && !readdirSync(path).length) continue;
      if (/(?:^|\/)(?:\.payload|\.git|__pycache__)(?:\/|$)/i.test(local)) throw new Error('DEPLOYMENT_UNEXPECTED_FILE');
      if (entry.isSymbolicLink()) throw new Error('DEPLOYMENT_LINK_REFUSED');
      if (entry.isDirectory()) walk(path, depth + 1);
      else {
        if (!entry.isFile() || !allowedRuntimePath(local)) throw new Error('DEPLOYMENT_UNEXPECTED_FILE');
        if (files.size >= 100000) throw new Error('DEPLOYMENT_INVENTORY_LIMIT');
        files.add(local);
      }
    }
  }
  walk(absolute);
  for (const required of [...runtimeFiles, ...generated, '.next/BUILD_ID', 'node_modules/next/package.json',
    'public/cesium/VERSION.json', 'examples/carrier/source.json', 'examples/evidence/notice.txt']) {
    if (!files.has(required)) throw new Error('DEPLOYMENT_RUNTIME_INPUT_MISSING');
  }
  if (![...files].some((path) => path.startsWith('.next/static/'))) throw new Error('DEPLOYMENT_STATIC_INPUT_MISSING');
  return { files: files.size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('DEPLOYMENT_ROOT_REQUIRED');
    const result = auditDeployment(process.argv[2]);
    console.log(`Deployment inventory passed (${result.files} files); required runtime inputs are present and operator state is excluded.`);
  } catch {
    console.error('Deployment inventory refused. Preserve the artifact and inspect the packaging rules; no file contents were reported.');
    process.exitCode = 1;
  }
}
