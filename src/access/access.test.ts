import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAccessConfiguration } from './config';
import { authenticateConfiguredRequest } from './request';
import { config as proxyConfiguration, proxy } from '../proxy';
import { requireLocalRequest } from '../coordination/http';
import { requireProductionRequest } from '../production/http';

const origin = 'http://127.0.0.1:3000';
const username = 'operator.test';
const password = 'OFFLINE-test-credential-0123456789abcdef';
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
const internal = {
  PAYLOAD_DEPLOYMENT_MODE: 'internal',
  PAYLOAD_INTERNAL_ORIGIN: origin,
  PAYLOAD_OPERATOR_USERNAME: username,
  PAYLOAD_OPERATOR_PASSWORD: password,
};
const temporary: string[] = [];
function configured(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...internal, PAYLOAD_OPERATOR_PASSWORD_FILE: undefined, ...overrides })) vi.stubEnv(key, value);
}
function request(path = '/', overrides: Readonly<Record<string, string | undefined>> = {}, method = 'GET', urlOrigin = origin) {
  const headers = new Headers({ host: '127.0.0.1:3000', authorization });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) headers.delete(name);
    else headers.set(name, value);
  }
  return new NextRequest(`${urlOrigin}${path}`, { method, headers });
}
function secretFile(contents: string) {
  const root = mkdtempSync(join(tmpdir(), 'payload-auth-test-'));
  temporary.push(root);
  const path = join(root, 'operator-password');
  writeFileSync(path, contents, { mode: 0o600 });
  return path;
}
beforeEach(() => configured());
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('explicit internal access configuration', () => {
  it('keeps the default and explicit local modes without credentials', () => {
    expect(readAccessConfiguration({})).toEqual({ mode: 'local' });
    expect(readAccessConfiguration({ PAYLOAD_DEPLOYMENT_MODE: 'local' })).toEqual({ mode: 'local' });
    expect(readAccessConfiguration({ PAYLOAD_DEPLOYMENT_MODE: '  ' })).toEqual({ mode: 'local' });
    expect(readAccessConfiguration({ ...internal, PAYLOAD_DEPLOYMENT_MODE: ' internal ' })).toMatchObject({ mode: 'internal' });
  });
  it.each(['INTERNAL', 'production'])('refuses unknown deployment mode %j', (mode) => {
    expect(() => readAccessConfiguration({ PAYLOAD_DEPLOYMENT_MODE: mode })).toThrowError(expect.objectContaining({ code: 'ACCESS_CONFIGURATION_INVALID', status: 503 }));
  });
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'http://localhost'])('accepts canonical SSH loopback origin %s', (value) => {
    expect(readAccessConfiguration({ ...internal, PAYLOAD_INTERNAL_ORIGIN: value })).toMatchObject({ mode: 'internal', origin: value });
  });
  it.each([
    'https://internal.example', 'https://localhost:3000', 'http://internal.example', 'http://0.0.0.0:3000',
    'http://127.0.0.2:3000', 'http://127.1:3000', 'http://2130706433:3000', 'http://LOCALHOST:3000',
    `${origin}/`, `${origin}/path`, `${origin}?x=y`, `${origin}#fragment`, 'http://user:password@localhost:3000',
    'http://localhost:80', 'not a URL', '',
  ])('refuses unqualified or noncanonical origin %j', (value) => {
    expect(() => readAccessConfiguration({ ...internal, PAYLOAD_INTERNAL_ORIGIN: value })).toThrowError(expect.objectContaining({ status: 503 }));
  });
  it.each([
    { PAYLOAD_INTERNAL_ORIGIN: undefined }, { PAYLOAD_OPERATOR_USERNAME: undefined },
    { PAYLOAD_OPERATOR_USERNAME: 'user:name' }, { PAYLOAD_OPERATOR_USERNAME: 'operator name' },
    { PAYLOAD_OPERATOR_USERNAME: 'u'.repeat(65) }, { PAYLOAD_OPERATOR_PASSWORD: undefined },
    { PAYLOAD_OPERATOR_PASSWORD: 'short' }, { PAYLOAD_OPERATOR_PASSWORD: 's'.repeat(257) },
    { PAYLOAD_OPERATOR_PASSWORD: `${password}\n` }, { PAYLOAD_OPERATOR_PASSWORD: `${password} ` },
    { PAYLOAD_OPERATOR_PASSWORD: `${password}é` },
    { PAYLOAD_OPERATOR_PASSWORD_FILE: '/private/secret' },
  ])('refuses incomplete/ambiguous configuration without exposing it: %j', (overrides) => {
    configured(overrides);
    const response = proxy(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('www-authenticate')).toBeNull();
  });
  it('returns only a digest, never a raw configured password', () => {
    const config = readAccessConfiguration(internal);
    expect(JSON.stringify(config)).not.toContain(password);
    expect(config).not.toHaveProperty('password');
  });
  it('reads a mounted bounded regular file, permits a terminal newline and rechecks rotation', () => {
    const path = secretFile(`${password}\r\n`);
    configured({ PAYLOAD_OPERATOR_PASSWORD: undefined, PAYLOAD_OPERATOR_PASSWORD_FILE: path });
    expect(authenticateConfiguredRequest(request())).toEqual({ kind: 'single-operator', name: username });
    writeFileSync(path, 'rotated-test-secret-abcdefghijklmnopqrstuvwxyz');
    expect(proxy(request()).status).toBe(401);
    writeFileSync(path, 'broken');
    expect(proxy(request()).status).toBe(503);
  });
  it('refuses missing, relative, directory, overlong, blank and multiline secret files', () => {
    const directory = secretFile(password);
    const nested = `${directory}-directory`;
    mkdirSync(nested);
    for (const path of [
      'relative.secret', `${directory}.missing`, nested,
      secretFile(''), secretFile('s'.repeat(259)), secretFile(`${password}\n${password}`), secretFile(`${password}\n\n`),
    ]) {
      configured({ PAYLOAD_OPERATOR_PASSWORD: undefined, PAYLOAD_OPERATOR_PASSWORD_FILE: path });
      expect(proxy(request()).status).toBe(503);
    }
  });
});

describe('whole-app internal boundary', () => {
  it('matches every route rather than exempting assets or public-looking APIs', () => {
    expect(proxyConfiguration.matcher).toBe('/:path*');
  });
  it.each(['/', '/cases', '/api/v1/insurability/harvester', '/api/runtime', '/api/production', '/_next/static/chunks/app.js', '/_next/image?url=%2Fasset.png&w=100&q=70', '/_next/data/build/index.json', '/Cesium/Workers/worker.js', '/favicon.ico'])('authenticates %s and marks successful response private/no-store', (path) => {
    const response = proxy(request(path));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('vary')).toBe('Authorization');
    expect(proxy(request(path, { authorization: '' })).status).toBe(401);
  });
  it('returns a per-request server-derived identity, never a caller identity header', () => {
    expect(authenticateConfiguredRequest(request('/', { 'x-payload-operator': 'admin', 'x-forwarded-for': '127.0.0.1' }))).toEqual({ kind: 'single-operator', name: username });
    expect(proxy(request('/', { authorization: '', 'x-payload-operator': username })).status).toBe(401);
  });
  it.each([
    '', 'Bearer private-token', 'Basic !!!', 'Basic YTpi', 'Basic Og==', 'Basic YQ==', 'Basic YTpi===',
    `Basic ${Buffer.from(`${username}:wrong`).toString('base64')}`,
    `Basic ${Buffer.from(`wrong:${password}`).toString('base64')}`,
    `Basic ${Buffer.from(`${username}:${password}\n`).toString('base64')}`,
    `${authorization}, ${authorization}`, `Basic ${'a'.repeat(513)}`,
  ])('refuses malformed or incorrect credential #%# with a generic challenge', async (value) => {
    const response = proxy(request('/', { authorization: value }));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic realm="Payload internal"');
    expect(response.headers.get('cache-control')).toContain('no-store');
    const text = await response.text();
    expect(text).not.toContain(password);
    expect(text).not.toContain(username);
    expect(text).not.toContain(value || 'private-token');
  });
  it('allows case-insensitive Basic scheme and colon within the password', () => {
    const custom = `${password}:extra`;
    configured({ PAYLOAD_OPERATOR_PASSWORD: custom });
    expect(proxy(request('/', { authorization: `basic ${Buffer.from(`${username}:${custom}`).toString('base64')}` })).status).toBe(200);
  });
  it.each([
    { host: '' }, { host: 'localhost:3000' }, { host: '0.0.0.0:3000' }, { host: 'evil.example:3000' }, { host: '127.0.0.1:4000' },
    { host: '127.0.0.1:3000/path' }, { host: 'user@127.0.0.1:3000' }, { host: '127.0.0.1:3000, evil.example' },
    { origin: 'https://evil.example' }, { origin: 'http://localhost:3000' }, { origin: 'http://0.0.0.0:3000' }, { origin: 'null' },
    { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'unknown' },
    { 'x-forwarded-host': 'evil.example' }, { 'x-forwarded-proto': 'https' }, { 'x-forwarded-port': '443' },
    { 'x-forwarded-proto': 'http, https' }, { forwarded: 'for=127.0.0.1;host=127.0.0.1:3000' },
  ])('refuses contradictory origin or forwarding context: %j', (headers) => {
    const response = proxy(request('/', headers));
    expect(response.status).toBe(403);
    expect(response.headers.get('www-authenticate')).toBeNull();
  });
  it('allows Next loopback URL normalization and its exact forwarding defaults', () => {
    expect(proxy(request('/', {
      origin, 'sec-fetch-site': 'same-origin', 'x-forwarded-host': '127.0.0.1:3000',
      'x-forwarded-port': '3000', 'x-forwarded-proto': 'http',
    }, 'GET', 'http://localhost:3000')).status).toBe(200);
  });
  it('allows Next bind-host URL metadata only while actual Host and browser origin remain exact loopback', () => {
    const metadata = 'http://0.0.0.0:3000';
    expect(proxy(request('/api/production', {
      origin, 'sec-fetch-site': 'same-origin', 'x-forwarded-host': '127.0.0.1:3000',
      'x-forwarded-port': '3000', 'x-forwarded-proto': 'http',
    }, 'POST', metadata)).status).toBe(200);
    for (const headers of [
      { host: '0.0.0.0:3000', origin },
      { origin: metadata },
      { origin, 'x-forwarded-host': '0.0.0.0:3000' },
      { origin, 'x-forwarded-port': '4000' },
    ]) expect(proxy(request('/api/production', headers, 'POST', metadata)).status).toBe(403);
  });
  it.each(['https://127.0.0.1:3000', 'http://127.0.0.1:4000', 'http://evil.example:3000',
    'http://0.0.0.0:4000', 'https://0.0.0.0:3000', 'http://192.0.2.1:3000'])('does not rewrite request origin %s to bypass protection', (url) => {
    expect(proxy(request('/', {}, 'GET', url)).status).toBe(403);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires exact Origin for %s even with valid credentials', (method) => {
    expect(proxy(request('/api/production', {}, method)).status).toBe(403);
    expect(proxy(request('/api/production', { origin }, method)).status).toBe(200);
    expect(proxy(request('/api/production', { origin, 'sec-fetch-site': 'cross-site' }, method)).status).toBe(403);
  });
  it('retains opt-in operation flags and reauthenticates direct operational handler access', () => {
    expect(() => requireLocalRequest(request())).not.toThrow();
    expect(() => requireLocalRequest(request('/', { authorization: '' }))).toThrowError(expect.objectContaining({ status: 401 }));
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '0');
    expect(() => requireProductionRequest(request())).toThrowError(expect.objectContaining({ code: 'LOCAL_MODE_DISABLED' }));
    vi.stubEnv('PAYLOAD_PRODUCTION_LOCAL', '1');
    expect(() => requireProductionRequest(request())).not.toThrow();
  });
  it('preserves default local app access and existing loopback/CSRF operational checks', () => {
    vi.stubEnv('PAYLOAD_DEPLOYMENT_MODE', undefined);
    expect(proxy(request('/', { authorization: '' }, 'GET', 'http://example.com')).status).toBe(200);
    expect(() => requireLocalRequest(request('/', { authorization: '' }))).not.toThrow();
    expect(() => requireLocalRequest(request('/', { host: 'evil.example', authorization: '' }))).toThrowError(expect.objectContaining({ code: 'LOCAL_ONLY' }));
    expect(() => requireLocalRequest(request('/', { origin: 'https://evil.example' }))).toThrowError(expect.objectContaining({ code: 'ORIGIN_MISMATCH' }));
  });
});
