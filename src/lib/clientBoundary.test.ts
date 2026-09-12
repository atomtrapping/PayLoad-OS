import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No module a browser bundle can reach imports a Node built-in.
 *
 * The bundler does not refuse such an import; it answers it with a polyfill.
 * That is how crypto-browserify and Buffer, 428 KB together, came to ride
 * into the frontier, spatial and Earth Twin routes for a digest apiece. This
 * walks the runtime import closure of every 'use client' module (type-only
 * imports are erased and do not count) and names the first module on each
 * path that imports `node:` or a bare built-in, with the chain that reached
 * it, so the fix is at the module named and not at the symptom.
 */
const ROOT = resolve(__dirname, '..');
const BUILTINS = new Set(['crypto', 'fs', 'fs/promises', 'path', 'os', 'child_process', 'buffer', 'stream', 'util', 'events', 'net', 'http', 'https', 'zlib', 'url', 'worker_threads', 'readline', 'tty', 'assert']);
const IMPORT = /(?:^|\n)\s*(import|export)(\s+type)?\b[^'"\n]*?\bfrom\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

function list(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) list(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? resolve(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function nodeImportsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    if (match[2]) continue;
    const spec = match[3] ?? match[4];
    if (spec.startsWith('node:') || BUILTINS.has(spec)) found.push(spec);
  }
  return found;
}

function offenders(rootFile: string): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    const node = nodeImportsOf(source);
    if (node.length) problems.push(`${relative(ROOT, file)} imports ${node.join(', ')} via ${[...chain, file].map((f) => relative(ROOT, f)).join(' -> ')}`);
    for (const match of source.matchAll(IMPORT)) {
      if (match[2]) continue;
      const target = resolveImport(file, match[3] ?? match[4]);
      if (target) walk(target, [...chain, file]);
    }
  };
  walk(rootFile, []);
  return problems;
}

describe('the browser boundary', () => {
  const clientModules = list(ROOT).filter((file) => /^'use client';/.test(readFileSync(file, 'utf8')));

  it('has client modules to check', () => {
    expect(clientModules.length).toBeGreaterThan(20);
  });

  it('reaches no Node built-in from any client module', () => {
    const problems = clientModules.flatMap(offenders);
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
