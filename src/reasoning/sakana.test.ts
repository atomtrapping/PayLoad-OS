import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import example from '../../examples/reasoning-synthetic.json';
import { digest, parseReasoningRequest, reasoningPreview } from './contracts';
import { sakanaConfig } from './config';
import { reasonWithSakana, sakanaRequestBody } from './sakana';
import { runReasoningCli } from './cli';

const env = { PAYLOAD_REASONING_PROVIDER: 'sakana', SAKANA_API_KEY: 'synthetic-test-key-123456789',
  PAYLOAD_SAKANA_PROCESSING_REVIEW_REF: 'test:operator-review' };
const candidate = { claims: [{ kind: 'SUMMARY', text: 'The opportunity is blocked.', sourceIds: ['commercial-evaluation'] }], unresolved: ['Buyer budget is unknown.'] };
const envelope = (answer: unknown = candidate) => ({ id: 'response-test', model: 'fugu', status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }],
  usage: { input_tokens: 40, output_tokens: 20, total_tokens: 90,
    input_tokens_details: { orchestration_input_tokens: 30 } } });
const transportFor = (value: unknown = envelope()) => vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('Sakana configuration', () => {
  it('is disabled by default and requires a reviewed account plus one key source', () => {
    expect(sakanaConfig({})).toBeNull();
    expect(sakanaConfig(env)?.model).toBe('fugu');
    expect(() => sakanaConfig({ ...env, PAYLOAD_REASONING_PROVIDER: 'other' })).toThrow();
    expect(() => sakanaConfig({ ...env, PAYLOAD_SAKANA_PROCESSING_REVIEW_REF: '' })).toThrow();
    expect(() => sakanaConfig({ ...env, SAKANA_API_KEY_FILE: '' })).toThrow();
    expect(() => sakanaConfig({ ...env, SAKANA_API_KEY: '' })).toThrow();
    expect(() => sakanaConfig({ ...env, PAYLOAD_DEPLOYMENT_MODE: 'internal' })).toThrow();
    expect(() => sakanaConfig({ ...env, NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow();
  });
  it('accepts bounded mounted secrets and refuses oversized files', () => {
    const root = mkdtempSync(join(tmpdir(), 'sakana-test-')); roots.push(root);
    const path = join(root, 'test-key'); writeFileSync(path, `${env.SAKANA_API_KEY}\n`);
    const config = { ...env, SAKANA_API_KEY: undefined, SAKANA_API_KEY_FILE: path, PAYLOAD_DEPLOYMENT_MODE: 'internal' };
    expect(sakanaConfig(config)?.apiKey).toBe(env.SAKANA_API_KEY);
    writeFileSync(path, 'a'.repeat(4097)); expect(() => sakanaConfig(config)).toThrow();
    expect(() => sakanaConfig({ ...config, SAKANA_API_KEY_FILE: root })).toThrow();
  });
  it('limits operator model choices, deadlines and token counts', () => {
    for (const model of ['fugu', 'fugu-ultra-v1.1', 'sakana-namazu-v1.0'])
      expect(sakanaConfig({ ...env, PAYLOAD_SAKANA_MODEL: model })?.model).toBe(model);
    expect(() => sakanaConfig({ ...env, PAYLOAD_SAKANA_MODEL: 'anything' })).toThrow();
    expect(() => sakanaConfig({ ...env, PAYLOAD_SAKANA_TIMEOUT_MS: '120001' })).toThrow();
    expect(() => sakanaConfig({ ...env, PAYLOAD_SAKANA_MAX_OUTPUT_TOKENS: '2049' })).toThrow();
    expect(() => sakanaConfig({ ...env, PAYLOAD_SAKANA_TIMEOUT_MS: '0' })).toThrow();
  });
  it('rejects an actual process TLS bypass even with a separately supplied environment', () => {
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    expect(() => sakanaConfig(env)).toThrow('REASONING_CONFIG_INVALID');
  });
});

describe('reasoning request and preview', () => {
  it('previews offline and binds question, provenance and source standing', () => {
    const preview = reasoningPreview(example);
    expect(preview.externalRequestMade).toBe(false);
    expect(preview.inputDigest).toBe(digest(JSON.stringify(parseReasoningRequest(example))));
    expect(JSON.parse(preview.input).sources[0].standing).toBe('SYNTHETIC');
    expect(JSON.stringify(preview)).not.toContain(env.SAKANA_API_KEY);
  });
  it('rejects private packets, unknown permissions, duplicate IDs and oversized inputs', () => {
    expect(() => parseReasoningRequest({ ...example, classification: 'PRIVATE' })).toThrow();
    expect(() => parseReasoningRequest({ ...example, canAdmit: true })).toThrow();
    expect(() => parseReasoningRequest({ ...example, sources: [...example.sources, ...example.sources] })).toThrow();
    expect(() => parseReasoningRequest({ ...example, sources: [{ ...example.sources[0], standing: 'ADMITTED' }] })).toThrow();
    expect(() => parseReasoningRequest({ ...example, sources: Array.from({ length: 8 }, (_, i) => ({ ...example.sources[0], id: `source-${i}`, text: 'a'.repeat(8000) })) })).toThrow();
  });
  it('reports validation errors without including invalid request values or keys', () => {
    let error: unknown;
    try { parseReasoningRequest({ ...example, [env.SAKANA_API_KEY]: 'private input' }); }
    catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: 'REASONING_INPUT_INVALID', message: 'REASONING_INPUT_INVALID' });
    expect(String(error)).not.toContain(env.SAKANA_API_KEY);
  });
});

describe('Sakana reasoning adapter', () => {
  it('makes no request when disabled, unauthorized or input is invalid', async () => {
    const transport = transportFor();
    await expect(reasonWithSakana(example, { allowExternal: false, env, transport })).rejects.toThrow('NOT_AUTHORIZED');
    await expect(reasonWithSakana(example, { allowExternal: true, env: {}, transport })).rejects.toThrow('DISABLED');
    await expect(reasonWithSakana({ ...example, classification: 'PRIVATE' }, { allowExternal: true, env, transport })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses only the fixed HTTPS API, does not enable tools, and preserves usage plus provenance', async () => {
    const transport = transportFor(); const input = structuredClone(example);
    const resultPromise = reasonWithSakana(input, { allowExternal: true, env, transport });
    input.sources[0].text = 'changed while in flight';
    const result = await resultPromise;
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('https://api.sakana.ai/v1/responses');
    expect(init?.redirect).toBe('error');
    const body = JSON.parse(init?.body as string);
    expect(init?.body).toBe(sakanaRequestBody(parseReasoningRequest(example), sakanaConfig(env)!));
    expect(body.tools).toEqual([]); expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBe(2048);
    expect(result.status).toBe('UNADMITTED'); expect(result.reviewRequired).toBe(true);
    expect(result.context[0].contentDigest).toBe(digest(example.sources[0].text));
    expect(result.usage?.input_tokens_details).toEqual({ orchestration_input_tokens: 30 });
    expect(result.authority.canAdmit).toBe(false);
    expect(result.verification).toBe('SCHEMA_AND_CITATION_MEMBERSHIP_ONLY');
    expect(JSON.stringify(result)).not.toContain(env.SAKANA_API_KEY);
  });
  it('reconstructs request bodies with retained instructions for historical verification', () => {
    const body = sakanaRequestBody(parseReasoningRequest(example), { model: 'fugu', maxOutputTokens: 1024 }, 'Original retained instructions.');
    expect(JSON.parse(body)).toMatchObject({ model: 'fugu', max_output_tokens: 1024, instructions: 'Original retained instructions.' });
    expect(body).not.toContain(env.SAKANA_API_KEY);
  });
  it('does not send Fugu-only reasoning controls to Namazu', async () => {
    const transport = transportFor();
    await reasonWithSakana(example, { allowExternal: true, env: { ...env, PAYLOAD_SAKANA_MODEL: 'sakana-namazu-v1.0' }, transport });
    expect(JSON.parse(transport.mock.calls[0][1]?.body as string).reasoning).toBeUndefined();
  });
  it('requires the dispatch configuration to match the durable reservation policy', async () => {
    const expectedPolicy = { model: 'fugu', timeoutMs: 120000, maxOutputTokens: 2048, reviewRef: env.PAYLOAD_SAKANA_PROCESSING_REVIEW_REF };
    const transport = transportFor();
    for (const change of [{ model: 'fugu-ultra-v1.1' }, { timeoutMs: 1000 }, { maxOutputTokens: 1024 }, { reviewRef: 'review:new' }])
      await expect(reasonWithSakana(example, { allowExternal: true, env, transport, expectedPolicy: { ...expectedPolicy, ...change } }))
        .rejects.toThrow('REASONING_POLICY_CHANGED');
    expect(transport).not.toHaveBeenCalled();
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport, expectedPolicy })).resolves.toHaveProperty('status', 'UNADMITTED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...candidate, claims: [{ ...candidate.claims[0], sourceIds: ['invented'] }] },
    { ...candidate, claims: [{ ...candidate.claims[0], sourceIds: [] }] },
    { ...candidate, claims: [{ ...candidate.claims[0], sourceIds: ['commercial-evaluation', 'commercial-evaluation'] }] },
    { ...candidate, authority: 'ADMITTED' },
  ])('refuses unsupported citation or answer structures', async (answer) => {
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor(envelope(answer)) })).rejects.toThrow();
  });
  it('refuses incomplete responses, provider refusals and tool calls', async () => {
    const values = [
      { ...envelope(), status: 'incomplete' },
      { ...envelope(), error: { message: 'secret provider error' } },
      { ...envelope(), incomplete_details: { reason: 'max_output_tokens' } },
      { ...envelope(), output: [{ ...envelope().output[0], status: 'incomplete' }] },
      { ...envelope(), output: [{ type: 'function_call', name: 'send_email' }] },
      { ...envelope(), output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal' }] }] },
    ];
    for (const value of values)
      await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor(value) })).rejects.toThrow();
  });
  it('does not retry or expose provider error text', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider error including key', { status: 429 }));
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport })).rejects.toThrow('REASONING_PROVIDER_ERROR');
    expect(transport).toHaveBeenCalledTimes(1);
    const failed = vi.fn<typeof fetch>().mockRejectedValue(new Error(`private error ${env.SAKANA_API_KEY}`));
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: failed })).rejects.toThrow('REASONING_FAILED_UNCONFIRMED');
  });
  it('rejects duplicate response keys and response bodies exceeding the bound', async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(new Response('a'.repeat(256 * 1024 + 1)));
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: oversized })).rejects.toThrow('RESPONSE_LIMIT');
    const duplicate = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"completed","status":"incomplete"}'));
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: duplicate })).rejects.toThrow('RESPONSE_INVALID');
  });
  it('reports malformed JSON, invalid UTF-8 and invalid response shapes with safe response codes', async () => {
    const values = [
      new Response(`{invalid ${env.SAKANA_API_KEY}`),
      new Response(Uint8Array.from([0xc3, 0x28])),
      new Response(JSON.stringify({ ...envelope(), output: [] })),
      new Response(JSON.stringify(envelope({ ...candidate, [env.SAKANA_API_KEY]: 'private value' }))),
      new Response(JSON.stringify({ ...envelope(), output: [{ ...envelope().output[0], content: [{ type: 'output_text', text: '{invalid' }] }] })),
    ];
    for (const response of values) {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(reasonWithSakana(example, { allowExternal: true, env, transport })).rejects.toMatchObject({
        code: 'REASONING_RESPONSE_INVALID', message: 'REASONING_RESPONSE_INVALID',
      });
    }
  });
  it('cancels a pending body read when the deadline expires and then releases the slot', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(reasonWithSakana(example, { allowExternal: true, env: { ...env, PAYLOAD_SAKANA_TIMEOUT_MS: '5' }, transport }))
      .rejects.toThrow('REASONING_TIMEOUT_UNCONFIRMED');
    expect(cancel).toHaveBeenCalledTimes(1);
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor() })).resolves.toHaveProperty('status', 'UNADMITTED');
  });
  it('keeps the slot while aborted body cancellation is still unsettled', async () => {
    let finish: (() => void) | undefined;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel: () => new Promise<void>((resolve) => { finish = resolve; }),
    }));
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    const pending = reasonWithSakana(example, { allowExternal: true, env: { ...env, PAYLOAD_SAKANA_TIMEOUT_MS: '5' }, transport });
    const rejection = expect(pending).rejects.toThrow('TIMEOUT_UNCONFIRMED');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(finish).toBeTypeOf('function');
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor() })).rejects.toThrow('REASONING_BUSY');
    finish!(); await rejection;
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor() })).resolves.toHaveProperty('status', 'UNADMITTED');
  });
  it('holds a single process slot until an aborted transport settles', async () => {
    let finish: ((response: Response) => void) | undefined;
    const transport = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const pending = reasonWithSakana(example, { allowExternal: true, env: { ...env, PAYLOAD_SAKANA_TIMEOUT_MS: '5' }, transport });
    const rejection = expect(pending).rejects.toThrow('TIMEOUT_UNCONFIRMED');
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor() })).rejects.toThrow('REASONING_BUSY');
    finish!(new Response(JSON.stringify(envelope()))); await rejection;
    await expect(reasonWithSakana(example, { allowExternal: true, env, transport: transportFor() })).resolves.toHaveProperty('status', 'UNADMITTED');
  });
});

describe('reasoning CLI', () => {
  it('offers an offline preview and refuses a run without explicit authorization or configuration', async () => {
    const stdout: string[] = []; const stderr: string[] = [];
    const io = { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) };
    vi.stubEnv('PAYLOAD_REASONING_PROVIDER', 'disabled');
    expect(await runReasoningCli(['preview', '--request', 'examples/reasoning-synthetic.json'], io)).toBe(0);
    expect(JSON.parse(stdout[0]).externalRequestMade).toBe(false);
    expect(await runReasoningCli(['run', '--request', 'examples/reasoning-synthetic.json'], io)).toBe(1);
    expect(await runReasoningCli(['run', '--request', 'examples/reasoning-synthetic.json', '--allow-external'], io)).toBe(1);
    expect(stderr.at(-1)).toContain('REASONING_DISABLED');
  });
});
