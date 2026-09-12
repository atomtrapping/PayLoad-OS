import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import example from '../../examples/reasoning-synthetic.json';
import { ReasoningRunStore, type ReasoningRunPolicy } from './run-store';
import { digest } from './contracts';

const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'reasoning-run-test-')); roots.push(root);
  const request = structuredClone(example);
  request.sources[0].knownAt = new Date(Date.now() - 1000).toISOString();
  const policy: ReasoningRunPolicy = { schema: 'notation.reasoning-run-policy.v1', id: 'test-policy', model: 'fugu',
    reviewRef: 'synthetic:test-processing-review', timeoutMs: 120000, maxOutputTokens: 2048,
    expiresAt: new Date(Date.now() + 60000).toISOString(), allowedTasks: ['COMMERCIAL_REVIEW'],
    allowedClassifications: ['SYNTHETIC'], maxSourceAgeHours: 1 };
  const env = { PAYLOAD_REASONING_PROVIDER: 'sakana', SAKANA_API_KEY: 'synthetic-test-key-123456789',
    PAYLOAD_SAKANA_PROCESSING_REVIEW_REF: policy.reviewRef };
  return { root, store: new ReasoningRunStore(root), request, policy, env };
}
function response() {
  return new Response(JSON.stringify({ id: 'test-response', model: 'fugu', status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
      claims: [{ kind: 'SUMMARY', text: 'The synthetic opportunity is blocked.', sourceIds: ['commercial-evaluation'] }], unresolved: [] }) }] }],
    usage: { input_tokens: 40, output_tokens: 20, total_tokens: 80, input_tokens_details: { orchestration_input_tokens: 20 } } }));
}
const transportFor = () => vi.fn<typeof fetch>().mockImplementation(async () => response());

describe('retained reasoning runs', () => {
  it('prepares offline, reopens exact history and separates changes to packet or policy', () => {
    const { root, store, request, policy } = setup();
    const original = structuredClone(request);
    const prepared = store.prepare(request, policy);
    expect(prepared.state).toBe('PREPARED'); expect(prepared.disposition).toBe('CREATED');
    expect(prepared.runId).toMatch(/^[a-f0-9]{64}$/);
    expect(store.prepare(request, policy).disposition).toBe('EXISTING');
    expect(new ReasoningRunStore(root).inspect(prepared.runId)?.prepared.request).toEqual(original);
    request.question += ' Modified';
    expect(store.prepare(request, policy).runId).not.toBe(prepared.runId);
    expect(store.prepare(original, { ...policy, maxOutputTokens: 1000 }).runId).not.toBe(prepared.runId);
    expect(store.inspect(prepared.runId)?.prepared.request).toEqual(original);
  });
  it('dispatches once and returns completed history with no second call even after policy expiry', async () => {
    const { store, root, request, policy, env } = setup(); const transport = transportFor();
    const prepared = store.prepare(request, policy);
    const completed = await store.dispatch(prepared.runId, { allowExternal: true, env, transport });
    expect(completed.state).toBe('COMPLETED'); expect(completed.historical).toBe(false);
    expect(completed.result?.candidate.status).toBe('UNADMITTED');
    expect(completed.result?.candidate.usage?.total_tokens).toBe(80);
    vi.useFakeTimers(); vi.setSystemTime(Date.parse(policy.expiresAt) + 60000);
    const fresh = new ReasoningRunStore(root);
    const retry = await fresh.dispatch(prepared.runId, { allowExternal: false, env: {}, transport });
    expect(retry.historical).toBe(true); expect(retry.result).toEqual(completed.result);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(root, prepared.runId, 'prepared.json'), 'utf8')).not.toContain(env.SAKANA_API_KEY);
    expect(readFileSync(join(root, prepared.runId, 'result.json'), 'utf8')).not.toContain(env.SAKANA_API_KEY);
  });
  it('refuses a second caller while a claimed run is in flight', async () => {
    const { root, store, request, policy, env } = setup();
    const runId = store.prepare(request, policy).runId;
    let finish: ((result: Response) => void) | undefined;
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const first = store.dispatch(runId, { allowExternal: true, env, transport });
    expect(new ReasoningRunStore(root).inspect(runId)?.state).toBe('DISPATCH_UNCONFIRMED');
    await expect(new ReasoningRunStore(root).dispatch(runId, { allowExternal: true, env, transport })).rejects.toThrow('DISPATCH_UNCONFIRMED');
    finish!(response()); expect((await first).state).toBe('COMPLETED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('retains a safe failure receipt and never retries a failed request', async () => {
    const { root, store, request, policy, env } = setup(); const runId = store.prepare(request, policy).runId;
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error(`secret body ${env.SAKANA_API_KEY}`));
    await expect(store.dispatch(runId, { allowExternal: true, env, transport })).rejects.toThrow('UNCONFIRMED');
    const saved = new ReasoningRunStore(root).inspect(runId);
    expect(saved?.state).toBe('DISPATCH_UNCONFIRMED');
    expect(saved?.failure?.automaticRetry).toBe(false);
    expect(JSON.stringify(saved)).not.toContain(env.SAKANA_API_KEY);
    await expect(store.dispatch(runId, { allowExternal: true, env, transport })).rejects.toThrow('DISPATCH_UNCONFIRMED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('treats an interrupted attempt with no final receipt as unconfirmed', async () => {
    const { root, store, request, policy, env } = setup(); const runId = store.prepare(request, policy).runId;
    await store.dispatch(runId, { allowExternal: true, env, transport: transportFor() });
    // Simulate a crash after attempt publication but before result publication.
    rmSync(join(root, runId, 'result.json'));
    const restarted = new ReasoningRunStore(root); const transport = transportFor();
    expect(restarted.inspect(runId)?.state).toBe('DISPATCH_UNCONFIRMED');
    await expect(restarted.dispatch(runId, { allowExternal: true, env, transport })).rejects.toThrow('DISPATCH_UNCONFIRMED');
    expect(transport).not.toHaveBeenCalled();
  });
  it('performs configuration, authorization and source-time checks before consuming the attempt', async () => {
    const { store, request, policy, env } = setup(); const transport = transportFor();
    const runId = store.prepare(request, policy).runId;
    await expect(store.dispatch(runId, { allowExternal: false, env, transport })).rejects.toThrow('NOT_AUTHORIZED');
    await expect(store.dispatch(runId, { allowExternal: true, env: {}, transport })).rejects.toThrow('DISABLED');
    await expect(store.dispatch(runId, { allowExternal: true, env: { ...env, PAYLOAD_SAKANA_MODEL: 'fugu-ultra-v1.1' }, transport })).rejects.toThrow('POLICY_CHANGED');
    expect(store.inspect(runId)?.attempt).toBeNull();
    const expired = store.prepare(request, { ...policy, expiresAt: new Date(Date.now() - 1000).toISOString() }).runId;
    await expect(store.dispatch(expired, { allowExternal: true, env, transport })).rejects.toThrow('POLICY_EXPIRED');
    for (const knownAt of [new Date(Date.now() + 60000).toISOString(), new Date(Date.now() - 7200000).toISOString()]) {
      const stale = store.prepare({ ...request, sources: [{ ...request.sources[0], knownAt }] }, policy).runId;
      await expect(store.dispatch(stale, { allowExternal: true, env, transport })).rejects.toThrow('SOURCE_TIME_INVALID');
      expect(store.inspect(stale)?.attempt).toBeNull();
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects invalid policies, scope changes and unsafe run identifiers', () => {
    const { store, request, policy } = setup();
    expect(() => store.prepare(request, { ...policy, allowedTasks: ['EXTRACTION_PLAN'] })).toThrow('POLICY_SCOPE');
    expect(() => store.prepare(request, { ...policy, allowedClassifications: ['PUBLIC'] })).toThrow('POLICY_SCOPE');
    expect(() => store.prepare(request, { ...policy, timeoutMs: 120001 })).toThrow();
    expect(() => store.prepare(request, { ...policy, allowedTasks: ['COMMERCIAL_REVIEW', 'COMMERCIAL_REVIEW'] })).toThrow();
    expect(() => store.inspect('../other')).toThrow(); expect(store.inspect('a'.repeat(64))).toBeNull();
  });
  it('retains and flags actual wall-clock rollback without corrupting a valid result', async () => {
    vi.useFakeTimers();
    const { root, store, request, policy, env } = setup(); const runId = store.prepare(request, policy).runId;
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
      vi.setSystemTime(Date.now() - 10000); return response();
    });
    const result = await store.dispatch(runId, { allowExternal: true, env, transport });
    expect(result.state).toBe('COMPLETED'); expect(result.clockOrder).toBe('NON_MONOTONIC');
    expect(new ReasoningRunStore(root).inspect(runId)?.result).toEqual(result.result);
  });
  it('rechecks expiry after the dispatch claim is persisted', async () => {
    vi.useFakeTimers();
    const { store, request, policy, env } = setup(); const runId = store.prepare(request, policy).runId;
    const inspect = store.inspect.bind(store);
    vi.spyOn(store, 'inspect').mockImplementation((id) => {
      const value = inspect(id);
      if (value?.attempt) vi.setSystemTime(Date.parse(policy.expiresAt) + 1);
      return value;
    });
    const transport = transportFor();
    await expect(store.dispatch(runId, { allowExternal: true, env, transport })).rejects.toThrow('POLICY_EXPIRED');
    expect(transport).not.toHaveBeenCalled(); expect(inspect(runId)?.state).toBe('DISPATCH_UNCONFIRMED');
    expect(inspect(runId)?.failure).not.toBeNull();
  });
  it('detects changed retained packets and conflicting outcome files', async () => {
    const { root, store, request, policy, env } = setup(); const runId = store.prepare(request, policy).runId;
    await store.dispatch(runId, { allowExternal: true, env, transport: transportFor() });
    const preparedPath = join(root, runId, 'prepared.json'); const original = readFileSync(preparedPath, 'utf8');
    const altered = JSON.parse(original); altered.request.question = 'tampered';
    writeFileSync(preparedPath, JSON.stringify(altered)); expect(() => store.inspect(runId)).toThrow('INTEGRITY');
    altered.request = JSON.parse(original).request; altered.request.question += ' ';
    writeFileSync(preparedPath, JSON.stringify(altered)); expect(() => store.inspect(runId)).toThrow('INTEGRITY');
    writeFileSync(preparedPath, original);
    const saved = store.inspect(runId)!;
    writeFileSync(join(root, runId, 'failure.json'), JSON.stringify({ schema: 'notation.reasoning-failure.v1', runId,
      attemptId: saved.attempt!.attemptId, recordedAt: new Date().toISOString(), error: 'REASONING_DISPATCH_UNCONFIRMED', automaticRetry: false }));
    expect(() => store.inspect(runId)).toThrow('INTEGRITY');
  });
  it('refuses a rehashed candidate that changes provenance, authority or cited source identity', async () => {
    const { root, store, request, policy, env } = setup(); const runId = store.prepare(request, policy).runId;
    await store.dispatch(runId, { allowExternal: true, env, transport: transportFor() });
    const path = join(root, runId, 'result.json'); const original = readFileSync(path, 'utf8');
    for (const change of [
      (v: ReturnType<typeof JSON.parse>) => { v.candidate.context[0].standing = 'ADMITTED'; },
      (v: ReturnType<typeof JSON.parse>) => { v.candidate.authority.canAdmit = true; },
      (v: ReturnType<typeof JSON.parse>) => { v.candidate.answer.claims[0].sourceIds = ['invented']; },
      (v: ReturnType<typeof JSON.parse>) => { v.candidate.requestBodyDigest = `sha256:${'0'.repeat(64)}`; },
    ]) {
      const altered = JSON.parse(original); change(altered); altered.candidateDigest = digest(JSON.stringify(altered.candidate));
      writeFileSync(path, JSON.stringify(altered)); expect(() => store.inspect(runId)).toThrow('INTEGRITY');
    }
  });
});
