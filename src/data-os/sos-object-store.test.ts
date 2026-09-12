import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { objectDigest } from './immutable-object-store';
import { SosImmutableObjectStore, sosDestination } from './sos-object-store';
import { BoundedSosHttpHandler } from './sos-http';
import { sosConfig, type SosEnvironment } from './sos-config';

const env: SosEnvironment = {
  PAYLOAD_OBJECT_STORE: 'sos', PAYLOAD_SOS_ENDPOINT: 'https://sos-ch-gva-2.exo.io', PAYLOAD_SOS_REGION: 'ch-gva-2',
  PAYLOAD_SOS_BUCKET: 'synthetic-evidence', PAYLOAD_SOS_ACCESS_KEY_ID: 'SYNTHETIC_ACCESS_KEY',
  PAYLOAD_SOS_SECRET_ACCESS_KEY: 'synthetic-test-secret-not-a-provider-credential',
};
const payload = Buffer.from('synthetic evidence');
const digest = objectDigest(payload);
const key = 'sha256/' + digest.slice(7) + '.json';
const stores: SosImmutableObjectStore[] = [];
const temp: string[] = [];
const signal = () => new AbortController().signal;
type WireRequest = Parameters<NodeHttpHandler['handle']>[0];
type WireOptions = Parameters<NodeHttpHandler['handle']>[1];
type WireResult = Awaited<ReturnType<NodeHttpHandler['handle']>>;
function store(overrides: SosEnvironment = {}) {
  const instance = new SosImmutableObjectStore({ ...env, ...overrides }); stores.push(instance); return instance;
}
function response(statusCode: number, bytes: Uint8Array = Buffer.alloc(0), headers: Record<string, string> = {}): WireResult {
  return { response: { statusCode, headers: { 'content-length': String(bytes.byteLength), ...headers }, body: Readable.from([bytes]) } };
}
function xmlError(code: string, statusCode: number) {
  return response(statusCode, Buffer.from('<Error><Code>' + code + '</Code><Message>synthetic provider secret</Message></Error>'),
    { 'content-type': 'application/xml' });
}
function transport(run: (request: WireRequest, options?: WireOptions) => WireResult | Promise<WireResult>) {
  return vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async (request, options) => run(request, options));
}
function successful(request: WireRequest): WireResult {
  return request.method === 'PUT'
    ? response(200, undefined, { 'x-amz-version-id': 'synthetic-v1' })
    : response(200, payload, { 'x-amz-version-id': 'synthetic-v1' });
}
afterEach(() => {
  for (const instance of stores.splice(0)) { if (!instance.limits().active) instance.close(); }
  for (const path of temp.splice(0)) {
    const target = resolve(path);
    expect(dirname(target)).toBe(resolve(tmpdir())); expect(basename(target).startsWith('payload-sos-test-')).toBe(true);
    rmSync(target, { recursive: true, force: true });
  }
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});

describe('explicit bounded SOS configuration', () => {
  it('does not select a provider or open connections implicitly', () => {
    expect(sosConfig({})).toBeNull();
    expect(() => new SosImmutableObjectStore({})).toThrow('SOS_NOT_CONFIGURED');
    expect(sosConfig(env)).toMatchObject({ prefix: '', region: 'ch-gva-2', maxBytes: 8388608, timeoutMs: 10000, maxConcurrency: 2 });
  });
  it.each([
    { PAYLOAD_OBJECT_STORE: 's3' }, { PAYLOAD_SOS_ENDPOINT: 'http://sos-ch-gva-2.exo.io' },
    { PAYLOAD_SOS_ENDPOINT: 'https://localhost' }, { PAYLOAD_SOS_ENDPOINT: 'https://sos-ch-gva-2.exo.io.attacker.invalid' },
    { PAYLOAD_SOS_ENDPOINT: 'https://sos-ch-gva-2.exo.io/' }, { PAYLOAD_SOS_ENDPOINT: 'https://secret@sos-ch-gva-2.exo.io' },
    { PAYLOAD_SOS_ENDPOINT: 'https://sos-ch-gva-2.exo.io?redirect=x' }, { PAYLOAD_SOS_REGION: 'us-east-1' },
    { PAYLOAD_SOS_BUCKET: 'bucket/other' }, { PAYLOAD_SOS_BUCKET: '../secret' }, { PAYLOAD_SOS_BUCKET: 'name.with.dot' },
    { PAYLOAD_SOS_BUCKET: '' }, { PAYLOAD_SOS_ACCESS_KEY_ID: '' }, { PAYLOAD_SOS_SECRET_ACCESS_KEY: '' },
    { PAYLOAD_SOS_SECRET_ACCESS_KEY: 'bad\nsecret' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    { PAYLOAD_SOS_MAX_BYTES: '8388609' }, { PAYLOAD_SOS_TIMEOUT_MS: '10001' },
    { PAYLOAD_SOS_MAX_CONCURRENCY: '3' }, { PAYLOAD_SOS_MAX_BYTES: '-1' }, { PAYLOAD_SOS_MAX_BYTES: '1.5' },
    { PAYLOAD_EXECUTION_PROFILE: 'unbounded' }, { PAYLOAD_SOS_SECRET_ACCESS_KEY_FILE: 'relative/path' },
    { PAYLOAD_SOS_PREFIX: '../other' }, { PAYLOAD_SOS_PREFIX: 'root/' }, { PAYLOAD_SOS_PREFIX: 'a%2fb' },
  ])('refuses bad config without revealing values: %j', (change) => {
    expect(() => sosConfig({ ...env, ...change })).toThrow('SOS_CONFIG_INVALID');
  });
  it('uses a credential-independent identity bound to region/bucket/prefix', () => {
    const original = sosDestination(sosConfig(env)!);
    expect(original).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(sosDestination(sosConfig({ ...env, PAYLOAD_SOS_SECRET_ACCESS_KEY: 'rotated-synthetic-test-secret' })!)).toBe(original);
    for (const change of [{ PAYLOAD_SOS_PREFIX: 'results' }, { PAYLOAD_SOS_BUCKET: 'other-bucket' },
      { PAYLOAD_SOS_ENDPOINT: 'https://sos-de-fra-1.exo.io', PAYLOAD_SOS_REGION: 'de-fra-1' }]) {
      expect(sosDestination(sosConfig({ ...env, ...change })!)).not.toBe(original);
    }
  });
  it('accepts validated worker configuration but rechecks its destination', () => {
    const config = sosConfig(env)!; const instance = new SosImmutableObjectStore(config); stores.push(instance);
    expect(instance.destination).toBe(sosDestination(config));
    expect(() => new SosImmutableObjectStore({ ...config, endpoint: 'https://attacker.invalid' })).toThrow('SOS_CONFIG_INVALID');
  });
  it('permits lower ceilings; conserve only lowers concurrency', () => {
    expect(sosConfig({ ...env, PAYLOAD_EXECUTION_PROFILE: 'conserve', PAYLOAD_SOS_MAX_BYTES: '1024', PAYLOAD_SOS_TIMEOUT_MS: '20' }))
      .toMatchObject({ maxConcurrency: 1, maxBytes: 1024, timeoutMs: 20 });
    expect(() => sosConfig({ ...env, PAYLOAD_EXECUTION_PROFILE: 'conserve', PAYLOAD_SOS_MAX_CONCURRENCY: '2' })).toThrow('SOS_CONFIG_INVALID');
  });
  it('loads one bounded mounted secret; rotation requires reconstructing config/store', () => {
    const root = mkdtempSync(join(tmpdir(), 'payload-sos-test-')); temp.push(root);
    const path = join(root, 'secret'); writeFileSync(path, 'synthetic-secret-for-tests-only\n');
    const config = { ...env, PAYLOAD_SOS_SECRET_ACCESS_KEY: undefined, PAYLOAD_SOS_SECRET_ACCESS_KEY_FILE: path };
    expect(sosConfig(config)?.secretAccessKey).toBe('synthetic-secret-for-tests-only');
    writeFileSync(path, 'rotated-synthetic-secret-for-tests');
    expect(sosConfig(config)?.secretAccessKey).toBe('rotated-synthetic-secret-for-tests');
    expect(() => sosConfig({ ...config, PAYLOAD_SOS_SECRET_ACCESS_KEY: '' })).toThrow('SOS_CONFIG_INVALID');
    writeFileSync(path, Buffer.alloc(4097, 65)); expect(() => sosConfig(config)).toThrow('SOS_CONFIG_INVALID');
    expect(() => sosConfig({ ...config, PAYLOAD_SOS_SECRET_ACCESS_KEY_FILE: root })).toThrow('SOS_CONFIG_INVALID');
  });
});

describe('actual S3 SDK custody through an offline wire boundary', () => {
  it('signs one conditional PUT and verifies its exact version, with operator prefix', async () => {
    const calls = transport(successful); const instance = store({ PAYLOAD_SOS_PREFIX: 'internal/results' });
    const receipt = await instance.ensure(key, payload, signal());
    expect(receipt).toEqual({ schema: 'payload.object-custody.v1', provider: 'exoscale-sos', destination: instance.destination,
      key, contentDigest: digest, byteLength: payload.length, versionId: 'synthetic-v1' });
    expect(calls).toHaveBeenCalledTimes(2);
    const put = calls.mock.calls[0][0]; const get = calls.mock.calls[1][0];
    expect(put.path).toBe('/synthetic-evidence/internal/results/' + key);
    expect(put.headers['if-none-match']).toBe('*'); expect(put.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(put.headers['x-amz-acl']).toBeUndefined(); expect(Buffer.from(put.body)).toEqual(payload);
    expect(get.query?.versionId).toBe('synthetic-v1');
    expect(await instance.readReceipt(receipt, signal())).toEqual(payload);
    expect(calls.mock.calls[2][0].query?.versionId).toBe('synthetic-v1');
  });
  it('copies caller bytes before asynchronous signing', async () => {
    const calls = transport(successful); const content = Buffer.from(payload);
    const pending = store().ensure(key, content, signal()); content.fill(0);
    expect((await pending).contentDigest).toBe(digest); expect(Buffer.from(calls.mock.calls[0][0].body)).toEqual(payload);
  });
  it.each([412, 409, 500, 'network'] as const)('reconciles ambiguous/conditional PUT %s with one read and no overwrite', async (kind) => {
    const calls = transport((request) => {
      if (request.method === 'GET') return successful(request);
      if (kind === 'network') throw new Error('provider-secret-do-not-expose');
      return xmlError(kind === 412 ? 'PreconditionFailed' : 'InternalError', kind);
    });
    expect((await store().ensure(key, payload, signal())).contentDigest).toBe(digest);
    expect(calls.mock.calls.map(([request]) => request.method)).toEqual(['PUT', 'GET']);
  });
  it('supports safe named artifact keys and refuses conflicting existing bytes', async () => {
    transport((request) => request.method === 'PUT' ? xmlError('PreconditionFailed', 412)
      : response(200, Buffer.from('different'), { 'x-amz-version-id': 'existing-v1' }));
    await expect(store().ensure('warehouse/corpus/metadata/v1.json', payload, signal())).rejects.toThrow('SOS_INTEGRITY_FAILED');
  });
  it('does not call an unknown outcome absence', async () => {
    transport((request) => request.method === 'PUT' ? xmlError('InternalError', 500) : xmlError('NoSuchKey', 404));
    await expect(store().ensure(key, payload, signal())).rejects.toThrow('SOS_WRITE_UNCONFIRMED');
  });
  it('reports successful PUT lacking version as unconfirmed, not a safe absence', async () => {
    const calls = transport(() => response(200));
    await expect(store().ensure(key, payload, signal())).rejects.toThrow('SOS_WRITE_UNCONFIRMED');
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 400, 429])('does not retry/reconcile explicit refusal %i', async (statusCode) => {
    const calls = transport(() => xmlError('AccessDenied', statusCode));
    await expect(store().ensure(key, payload, signal())).rejects.toThrow('SOS_UNAVAILABLE');
    expect(calls).toHaveBeenCalledTimes(1);
  });
  it('distinguishes absent key from missing bucket or denied reads', async () => {
    const instance = store(); const calls = transport(() => xmlError('NoSuchKey', 404));
    await expect(instance.get(key, 100, signal())).resolves.toBeNull();
    for (const [name, code] of [['NoSuchBucket', 404], ['AccessDenied', 403]] as const) {
      calls.mockImplementation(async () => xmlError(name, code));
      await expect(instance.get(key, 100, signal())).rejects.toThrow('SOS_UNAVAILABLE');
    }
  });
  it.each([undefined, 'null', 'undefined', ''])('requires non-null versioning on reads (%s)', async (versionId) => {
    transport(() => response(200, payload, versionId === undefined ? {} : { 'x-amz-version-id': versionId }));
    await expect(store().get(key, 100, signal())).rejects.toThrow('SOS_VERSION_REQUIRED');
  });
  it('checks exact custody destination, digest, length and returned version', async () => {
    const calls = transport(successful); const instance = store(); const receipt = await instance.ensure(key, payload, signal());
    await expect(instance.readReceipt({ ...receipt, destination: 'other' }, signal())).rejects.toThrow('SOS_INPUT_INVALID');
    await expect(instance.readReceipt({ ...receipt, byteLength: receipt.byteLength + 1 }, signal())).rejects.toThrow('SOS_INTEGRITY_FAILED');
    calls.mockImplementation(async () => response(200, payload, { 'x-amz-version-id': 'different-v2' }));
    await expect(instance.readReceipt(receipt, signal())).rejects.toThrow('SOS_INTEGRITY_FAILED');
  });
  it.each(['../escape', 'a//b', 'a%2fb', 'other?query', 'x\\y', '/absolute', 'con', 'a.'])('rejects unsafe key %s before IO', async (bad) => {
    const calls = transport(successful);
    await expect(store().ensure(bad, payload, signal())).rejects.toThrow('SOS_INPUT_INVALID');
    expect(calls).not.toHaveBeenCalled();
  });
  it('rejects oversized bytes and dishonest digest keys before IO', async () => {
    const calls = transport(successful); const instance = store({ PAYLOAD_SOS_MAX_BYTES: '8' });
    await expect(instance.ensure(key, payload, signal())).rejects.toThrow('SOS_BODY_TOO_LARGE');
    await expect(store().ensure(key, Buffer.from('wrong'), signal())).rejects.toThrow('SOS_INPUT_INVALID');
    expect(calls).not.toHaveBeenCalled();
  });
  it('refuses unsafe global TLS and closed adapters', async () => {
    const calls = transport(successful); const instance = store();
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    await expect(instance.get(key, 100, signal())).rejects.toThrow('SOS_CONFIG_INVALID'); expect(calls).not.toHaveBeenCalled();
    vi.unstubAllEnvs(); instance.close();
    await expect(instance.get(key, 100, signal())).rejects.toThrow('SOS_CLOSED');
  });
});

describe('wire bounds and cancellation', () => {
  it.each(['declared', 'undeclared', 'lying'])('bounds %s object bodies before SDK buffering', async (mode) => {
    transport(() => {
      const result = response(200, Buffer.alloc(9), { 'x-amz-version-id': 'v1' });
      if (mode === 'undeclared') delete result.response.headers['content-length'];
      if (mode === 'lying') result.response.headers['content-length'] = '1';
      return result;
    });
    await expect(store({ PAYLOAD_SOS_MAX_BYTES: '8' }).get(key, 8, signal())).rejects.toThrow(/SOS_(BODY_TOO_LARGE|INVALID_RESPONSE)/);
  });
  it.each([true, false])('bounds declared/chunked XML before SDK deserialization (declared=%s)', async (declared) => {
    transport(() => { const r = response(500, Buffer.alloc(16385)); if (!declared) delete r.response.headers['content-length']; return r; });
    await expect(store().get(key, 100, signal())).rejects.toThrow('SOS_BODY_TOO_LARGE');
  });
  it('enforces a caller read ceiling lower than configured maximum', async () => {
    transport(successful); await expect(store().get(key, 1, signal())).rejects.toThrow('SOS_BODY_TOO_LARGE');
  });
  it.each(['gzip', 'br'])('rejects response encoding %s', async (encoding) => {
    transport(() => response(200, payload, { 'content-encoding': encoding, 'x-amz-version-id': 'v1' }));
    await expect(store().get(key, 100, signal())).rejects.toThrow('SOS_INVALID_RESPONSE');
  });
  it('rejects redirects without following them', async () => {
    const calls = transport(() => response(307, undefined, { location: 'https://attacker.invalid/' }));
    await expect(store().get(key, 100, signal())).rejects.toThrow('SOS_INVALID_RESPONSE'); expect(calls).toHaveBeenCalledTimes(1);
  });
  it('checks truncated bodies', async () => {
    transport(() => response(200, payload, { 'content-length': String(payload.length + 1), 'x-amz-version-id': 'v1' }));
    await expect(store().get(key, 100, signal())).rejects.toThrow('SOS_INVALID_RESPONSE');
  });
  it('bounds transformed response headers before SDK parsing', async () => {
    transport(() => response(200, payload, { 'x-amz-version-id': 'v1', 'x-large': 'x'.repeat(16385) }));
    await expect(store().get(key, 100, signal())).rejects.toThrow('SOS_INVALID_RESPONSE');
  });
  it('bounds slow bodies and concurrency without a queue, closing both streams', async () => {
    const source = new PassThrough(); let started!: () => void; const ready = new Promise<void>((resolve) => { started = resolve; });
    transport(() => { started(); return { response: { statusCode: 200, headers: { 'content-length': '1', 'x-amz-version-id': 'v1' }, body: source } }; });
    const instance = store({ PAYLOAD_SOS_TIMEOUT_MS: '80', PAYLOAD_SOS_MAX_CONCURRENCY: '1' });
    const pending = instance.get(key, 100, signal()); const failure = expect(pending).rejects.toThrow('SOS_TIMEOUT'); await ready;
    await expect(instance.get(key, 100, signal())).rejects.toThrow('SOS_BUSY'); expect(() => instance.close()).toThrow('SOS_BUSY');
    await failure; await new Promise((resolve) => setImmediate(resolve));
    expect(source.destroyed).toBe(true); expect(instance.limits().active).toBe(0);
  });
  it('retains admission until an abort-ignoring transport settles', async () => {
    let finish!: (result: WireResult) => void;
    transport(() => new Promise((resolve) => { finish = resolve; }));
    const instance = store({ PAYLOAD_SOS_TIMEOUT_MS: '40', PAYLOAD_SOS_MAX_CONCURRENCY: '1' });
    await expect(instance.get(key, 100, signal())).rejects.toThrow('SOS_TIMEOUT'); expect(instance.limits().active).toBe(1);
    finish(response(200, payload, { 'x-amz-version-id': 'v1' }));
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(instance.limits().active).toBe(0);
  });
  it('reports timed-out PUT as unconfirmed and sends no request for pre-cancelled reads', async () => {
    const calls = transport((_request, options) => new Promise((_resolve, reject) => {
      if (options?.abortSignal instanceof AbortSignal) options.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    await expect(store({ PAYLOAD_SOS_TIMEOUT_MS: '40' }).ensure(key, payload, signal())).rejects.toThrow('SOS_WRITE_UNCONFIRMED');
    const before = calls.mock.calls.length;
    await expect(store().get(key, 100, AbortSignal.abort())).rejects.toThrow('SOS_CANCELLED'); expect(calls).toHaveBeenCalledTimes(before);
  });
  it('rejects unexpected signed destination/path/query/userinfo before transport', async () => {
    const calls = transport(successful);
    const handler = new BoundedSosHttpHandler(sosConfig(env)!);
    const valid = { protocol: 'https:', hostname: 'sos-ch-gva-2.exo.io', method: 'GET', path: '/synthetic-evidence/' + key, headers: {} };
    for (const change of [{ hostname: 'evil.invalid' }, { path: '/other-bucket/' + key }, { path: '/synthetic-evidence/../escape' },
      { username: 'secret' }, { fragment: 'x' }, { query: { unexpected: 'value' } }, { query: { versionId: ['a', 'b'] } },
      { method: 'DELETE' }, { port: 8443 }, { method: 'PUT', body: payload }, { body: payload }]) {
      await expect(handler.handle({ ...valid, ...change } as unknown as WireRequest)).rejects.toThrow('SOS_CONFIG_INVALID');
    }
    expect(calls).not.toHaveBeenCalled(); handler.destroy();
  });
});
