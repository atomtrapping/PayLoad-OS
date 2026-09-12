import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCommercialCli } from './cli';
import { commercialRegistration } from './definition';
import { applyCommand } from '../coordination/ledger';
import { createSeed, DEMO_SCOPE, RELEASE_CONTEXTS } from '../coordination/seed';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'commercial-test-')); directories.push(root);
  const stdout: string[] = []; const stderr: string[] = [];
  const run = (args: string[]) => runCommercialCli(args, { stdout: (v) => stdout.push(v), stderr: (v) => stderr.push(v) });
  return { root, stdout, stderr, run };
}
describe('commercial CLI', () => {
  it('writes a request and reproducible report without overwriting an existing file', () => {
    const { root, run } = setup(); const input = join(root, 'request.json'); const output = join(root, 'report.json');
    expect(run(['example', '--output', input])).toBe(0);
    expect(run(['evaluate', '--request', input, '--output', output])).toBe(0);
    const bytes = readFileSync(output, 'utf8'); const report = JSON.parse(bytes);
    expect(report.schema).toBe('notation.commercial-report.v1');
    expect(report.summary.blocked).toBe(1);
    expect(report.assessments[0].proposal).toBeNull();
    expect(run(['evaluate', '--request', input, '--output', output])).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe(bytes);
  });
  it('rejects duplicate keys, oversized files, missing files and invalid flags', () => {
    const { root, run } = setup(); const file = join(root, 'bad.json');
    writeFileSync(file, '{"schema":1,"schema":2}');
    expect(run(['evaluate', '--request', file])).toBe(1);
    writeFileSync(file, ' '.repeat(32769));
    expect(run(['evaluate', '--request', file])).toBe(1);
    expect(run(['evaluate', '--request', join(root, 'missing.json')])).toBe(1);
    expect(run(['evaluate'])).toBe(1);
    expect(run(['example', '--request', file])).toBe(1);
    expect(run(['example', '--send', 'yes'])).toBe(1);
    expect(run(['example', '--output', file, '--output', file])).toBe(1);
  });
  it('exposes help and the firm capability catalog', () => {
    const { run, stdout } = setup();
    expect(run([])).toBe(0); expect(stdout[0]).toContain('No contact');
    expect(run(['catalog'])).toBe(0);
    expect(JSON.parse(stdout[1]).offers).toHaveLength(3);
  });
  it('emits an idempotent registration without changing the pinned coordination seed', () => {
    const { run, stdout } = setup();
    expect(run(['registration'])).toBe(0);
    const seed = createSeed(); const original = structuredClone(seed);
    const next = applyCommand(seed, DEMO_SCOPE, JSON.parse(stdout[0]), RELEASE_CONTEXTS, '2026-09-08T12:00:00Z');
    expect(seed).toEqual(original);
    expect(next.participants.find((p) => p.id === 'agent.commercial.v1')?.status).toBe('LOCAL');
    expect(applyCommand(next, DEMO_SCOPE, commercialRegistration(), RELEASE_CONTEXTS, '2026-09-08T12:01:00Z')).toEqual(next);
  });
});
