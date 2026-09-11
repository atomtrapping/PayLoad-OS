#!/usr/bin/env node
/**
 * Mutation-test a ledger's guards.
 *
 * Reads a list of named mutations — each an exact string in the ledger
 * source and what to replace it with — applies them one at a time, runs
 * the ledger's test file against each, and reports which tests failed. A
 * mutation no test fails on has survived, and the guard it weakened is not
 * proven by the suite. The source is restored after every mutation, and
 * checked byte-for-byte at the end.
 *
 *   node scripts/mutate-ledger.mjs src/db/dossierLedger.mutations.json
 *
 * Exit status is 1 if any mutation survived, or if a mutation's text does
 * not occur exactly once in the source (a stale list is a false proof).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const listPath = process.argv[2];
if (!listPath) { console.error('usage: mutate-ledger.mjs <mutations.json>'); process.exit(2); }
const list = JSON.parse(readFileSync(listPath, 'utf8'));
const { source, test, mutations } = list;
const original = readFileSync(source, 'utf8');

const stale = mutations.filter((m) => original.split(m.find).length !== 2);
if (stale.length) {
  for (const m of stale) console.error(`stale: ${m.name} — text occurs ${original.split(m.find).length - 1} times, not once`);
  process.exit(1);
}

const results = [];
for (const m of mutations) {
  writeFileSync(source, original.replace(m.find, m.replace));
  const run = spawnSync('npx', ['vitest', 'run', test], { encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' } });
  writeFileSync(source, original);
  // Vitest colours its output whatever the environment says; strip that before reading it.
  const out = `${run.stdout}\n${run.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
  const failed = [...out.matchAll(/^\s+×\s+(.+?)\s+\d+ms$/gm)].map((x) => x[1]);
  const summary = (out.match(/Tests\s+.+$/m) || [''])[0].trim();
  const killed = run.status !== 0;
  results.push({ name: m.name, killed, failed, summary });
  console.log(`${killed ? 'killed  ' : 'SURVIVED'} ${m.name} — ${summary || `exit ${run.status}`}${failed.length ? `: ${failed.slice(0, 2).join(' | ')}${failed.length > 2 ? ' | …' : ''}` : ''}`);
}

if (readFileSync(source, 'utf8') !== original) { console.error('source not restored'); process.exit(1); }
const survived = results.filter((r) => !r.killed);
const perKilled = results.filter((r) => r.killed).map((r) => r.failed.length);
console.log(`\n${results.length} mutations, ${results.length - survived.length} killed, ${survived.length} survived${perKilled.length ? `; failing tests per killed mutation: ${Math.min(...perKilled)}–${Math.max(...perKilled)}` : ''}`);
process.exit(survived.length ? 1 : 0);
