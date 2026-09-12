import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runReasoningCli } from './cli';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'reasoning-cli-test-')); roots.push(root);
  const stdout: string[] = []; const stderr: string[] = [];
  const run = (args: string[]) => runReasoningCli(args, { stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  return { root, stdout, stderr, run };
}
describe('retained reasoning CLI workflow', () => {
  it('prepares, inspects and preserves a request while disabled dispatch leaves it available', async () => {
    vi.stubEnv('PAYLOAD_REASONING_PROVIDER', 'disabled');
    const { root, stdout, stderr, run } = setup();
    const args = ['prepare', '--request', 'examples/reasoning-synthetic.json', '--policy', 'examples/reasoning-run-policy.json', '--root', root];
    expect(await run(args)).toBe(0); const receipt = JSON.parse(stdout.at(-1)!);
    expect(receipt.externalRequestMade).toBe(false); expect(receipt.state).toBe('PREPARED');
    expect(await run(args)).toBe(0); expect(JSON.parse(stdout.at(-1)!).disposition).toBe('EXISTING');
    expect(await run(['inspect', '--run-id', receipt.runId, '--root', root])).toBe(0);
    expect(JSON.parse(stdout.at(-1)!).prepared.request.requestId).toBe('sakana-synthetic-review-v1');
    expect(await run(['dispatch', '--run-id', receipt.runId, '--root', root, '--allow-external'])).toBe(1);
    expect(stderr.at(-1)).toContain('REASONING_DISABLED');
    expect(await run(['inspect', '--run-id', receipt.runId, '--root', root])).toBe(0);
    expect(JSON.parse(stdout.at(-1)!).attempt).toBeNull();
  });
  it('connects the deterministic synthetic commercial evaluation without an external call', async () => {
    const { root, stdout, run } = setup();
    expect(await run(['prepare-commercial', '--request', 'examples/commercial-reasoning-synthetic.json',
      '--policy', 'examples/reasoning-run-policy.json', '--basis', 'Synthetic fixture only', '--at', '2026-09-12T12:00:00Z', '--root', root])).toBe(0);
    const receipt = JSON.parse(stdout.at(-1)!);
    expect(await run(['inspect', '--run-id', receipt.runId, '--root', root])).toBe(0);
    const packet = JSON.parse(stdout.at(-1)!).prepared.request;
    expect(packet.task).toBe('COMMERCIAL_REVIEW');
    const report = JSON.parse(packet.sources.map((s: { text: string }) => s.text).join(''));
    expect(report.summary.blocked).toBeGreaterThan(0); expect(report.authority.canContact).toBe(false);
    expect(await run(['prepare-commercial', '--request', 'examples/commercial-agent-request.json',
      '--policy', 'examples/reasoning-run-policy.json', '--basis', 'Cannot authorize real catalog', '--root', root])).toBe(1);
  });
  it('rejects missing authorization, duplicate flags and unknown options', async () => {
    const { root, run } = setup();
    expect(await run(['dispatch', '--run-id', 'a'.repeat(64), '--root', root])).toBe(1);
    expect(await run(['inspect', '--run-id', 'a'.repeat(64), '--root', root, '--root', root])).toBe(1);
    expect(await run(['prepare', '--request', 'examples/reasoning-synthetic.json', '--root', root])).toBe(1);
    expect(await run(['inspect', '--run-id', 'a'.repeat(64), '--endpoint', 'https://example.invalid'])).toBe(1);
  });
});
