import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import example from '../../examples/reasoning-synthetic.json';
import { ReasoningRunStore, type ReasoningRunPolicy } from './run-store';

let artifact: string;
const roots: string[] = [];
beforeAll(() => {
  artifact = mkdtempSync(join(tmpdir(), 'reasoning-process-artifact-'));
  // Fixed test helper with a local fake transport; never activates the hosted CLI.
  buildSync({
    stdin: { resolveDir: resolve('.'), sourcefile: 'reasoning-process-test.ts', contents: [
      "import { appendFileSync } from 'node:fs';",
      "import { join } from 'node:path';",
      "import { ReasoningRunStore } from './src/reasoning/run-store';",
      "const [mode, root, runId] = process.argv.slice(2);",
      "const store = new ReasoningRunStore(root);",
      "const env = { PAYLOAD_REASONING_PROVIDER: 'sakana', SAKANA_API_KEY: 'synthetic-test-key-123456789', PAYLOAD_SAKANA_PROCESSING_REVIEW_REF: 'synthetic:process-review' };",
      "const transport = async () => {",
      "  appendFileSync(join(root, 'fake-provider-calls.log'), 'called\\n');",
      "  if (mode === 'crash') process.exit(79);",
      "  return new Response(JSON.stringify({ id: 'synthetic-response', model: 'fugu', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ claims: [{ kind: 'SUMMARY', text: 'Synthetic review only.', sourceIds: ['commercial-evaluation'] }], unresolved: [] }) }] }] }));",
      "};",
      "async function main() {",
      "  if (mode === 'inspect') return store.inspect(runId);",
      "  if (!['dispatch', 'crash'].includes(mode)) throw new Error('TEST_MODE_INVALID');",
      "  return store.dispatch(runId, { allowExternal: true, env, transport });",
      "}",
      "main().then(value => { process.stdout.write(JSON.stringify(value)); }, error => { process.stdout.write(JSON.stringify({ error: error.code ?? 'TEST_FAILED' })); process.exitCode = 2; });",
    ].join('\n') },
    bundle: true, platform: 'node', format: 'cjs', outfile: join(artifact, 'worker.cjs'), logLevel: 'silent',
  });
});
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
afterAll(() => { if (artifact) rmSync(artifact, { recursive: true, force: true }); });

function prepared() {
  const root = mkdtempSync(join(tmpdir(), 'reasoning-process-store-')); roots.push(root);
  const request = structuredClone(example);
  request.sources[0].knownAt = new Date(Date.now() - 1000).toISOString();
  const policy: ReasoningRunPolicy = {
    schema: 'notation.reasoning-run-policy.v1', id: 'process-test-policy', model: 'fugu',
    reviewRef: 'synthetic:process-review', timeoutMs: 120000, maxOutputTokens: 2048,
    expiresAt: new Date(Date.now() + 60000).toISOString(), allowedTasks: ['COMMERCIAL_REVIEW'],
    allowedClassifications: ['SYNTHETIC'], maxSourceAgeHours: 1,
  };
  const store = new ReasoningRunStore(root);
  return { root, runId: store.prepare(request, policy).runId };
}

function child(mode: string, root: string, runId: string): Promise<{ code: number | null; output: string }> {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
  return new Promise((resolveResult, reject) => {
    const processChild = spawn(process.execPath, [join(artifact, 'worker.cjs'), mode, root, runId], {
      windowsHide: true, shell: false, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = ''; let observed = 0; let failure: Error | undefined;
    const stop = (message: string) => { failure ??= new Error(message); processChild.kill(); };
    const timer = setTimeout(() => stop('TEST_CHILD_TIMEOUT'), 10000);
    processChild.stdout.on('data', (chunk: Buffer) => {
      observed += chunk.length;
      if (observed > 262144) stop('TEST_CHILD_OUTPUT_LIMIT');
      else output += chunk.toString('utf8');
    });
    processChild.stderr.on('data', (chunk: Buffer) => {
      observed += chunk.length; if (observed > 262144) stop('TEST_CHILD_OUTPUT_LIMIT');
    });
    processChild.on('error', error => { failure = error; });
    processChild.on('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure); else resolveResult({ code, output });
    });
  });
}

describe('retained reasoning across real process boundaries', () => {
  it('preserves a crash after durable claim and refuses dispatch after process restart', async () => {
    const { root, runId } = prepared();
    expect((await child('crash', root, runId)).code).toBe(79);
    const inspected = await child('inspect', root, runId);
    expect(inspected.code).toBe(0);
    const retained = JSON.parse(inspected.output);
    expect(retained.state).toBe('DISPATCH_UNCONFIRMED');
    expect(retained.result).toBeNull(); expect(retained.failure).toBeNull();
    const retried = await child('dispatch', root, runId);
    expect(retried.code).toBe(2);
    expect(JSON.parse(retried.output).error).toBe('REASONING_DISPATCH_UNCONFIRMED');
    expect(readFileSync(join(root, 'fake-provider-calls.log'), 'utf8')).toBe('called\n');
  });

  it('allows one dispatch among cooperating processes and reads the same completed result after restart', async () => {
    const { root, runId } = prepared();
    const concurrent = await Promise.all([child('dispatch', root, runId), child('dispatch', root, runId)]);
    expect(concurrent.some(result => result.code === 0)).toBe(true);
    for (const result of concurrent) {
      expect([0, 2]).toContain(result.code);
      if (result.code === 2) expect(JSON.parse(result.output).error).toBe('REASONING_DISPATCH_UNCONFIRMED');
    }
    expect(readFileSync(join(root, 'fake-provider-calls.log'), 'utf8')).toBe('called\n');
    const fresh = await child('inspect', root, runId);
    const retry = await child('dispatch', root, runId);
    expect(fresh.code).toBe(0); expect(retry.code).toBe(0);
    expect(JSON.parse(fresh.output).state).toBe('COMPLETED');
    expect(JSON.parse(retry.output).historical).toBe(true);
    expect(JSON.parse(retry.output).result).toEqual(JSON.parse(fresh.output).result);
    expect(readFileSync(join(root, 'fake-provider-calls.log'), 'utf8')).toBe('called\n');
  });
});
