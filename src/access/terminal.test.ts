import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureCorpusSource } from '../adapter/corpusSource';
import { tokenDigest } from '../terminal/auth';
import { TERMINAL_PROTOCOL } from '../terminal/contracts';
import { terminalHttp } from '../terminal/http';
import { TerminalService } from '../terminal/service';
import { proxy } from '../proxy';

const origin = 'http://127.0.0.1:3000';
const token = 'synthetic_terminal_token_0123456789abcdef';
const digest = `sha256:${'a'.repeat(64)}`;
const basic = `Basic ${Buffer.from('operator.test:synthetic_operator_password_0123456789abcdef').toString('base64')}`;
const registry = JSON.stringify([{
  principalId: 'PRINCIPAL-AGENT', terminalId: 'TERMINAL-AGENT', displayName: 'Synthetic agent',
  kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research',
  corpusScope: ['landshark'], canReview: false, tokenSha256: tokenDigest(token),
  expiresAt: '2099-01-01T00:00:00.000Z',
}]);
const transaction = vi.fn(async () => { throw new Error('UNEXPECTED_DATABASE_ACCESS'); });
const service = new TerminalService({ transaction }, new FixtureCorpusSource(), () => digest,
  async () => { throw new Error('UNEXPECTED_EXECUTION'); });
function request(body: unknown = { command: 'discover' }, headers: Record<string, string | undefined> = {},
  metadata = origin, path = '/api/v1/terminal') {
  const context = new Headers({ host: '127.0.0.1:3000', authorization: `Bearer ${token}`, 'content-type': 'application/json' });
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) context.delete(name); else context.set(name, value);
  }
  return new NextRequest(`${metadata}${path}`, { method: 'POST',
    headers: context,
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv('PAYLOAD_DEPLOYMENT_MODE', 'internal');
  vi.stubEnv('PAYLOAD_INTERNAL_ORIGIN', origin);
  vi.stubEnv('PAYLOAD_OPERATOR_USERNAME', 'operator.test');
  vi.stubEnv('PAYLOAD_OPERATOR_PASSWORD', 'synthetic_operator_password_0123456789abcdef');
  vi.stubEnv('PAYLOAD_OPERATOR_PASSWORD_FILE', undefined);
  vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', registry);
  transaction.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('existing terminal Bearer authority across internal ingress', () => {
  it.each(['', basic, 'Bearer invalid'])('does not convert shell credentials into terminal authority #%#', async authorization => {
    const response = proxy(request(undefined, { authorization, origin }));
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer /);
    expect(await response.json()).toEqual({ protocol: TERMINAL_PROTOCOL, error: 'AUTHENTICATION_REQUIRED' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('admits CLI Bearer requests without ambient Origin and leaves shell routes Basic-protected', () => {
    expect(proxy(request()).headers.get('x-middleware-next')).toBe('1');
    const shell = proxy(request(undefined, { origin }, origin, '/api/runtime'));
    expect(shell.status).toBe(401);
    expect(shell.headers.get('www-authenticate')).toMatch(/^Basic /);
    expect(proxy(request(undefined, { origin }, origin, '/api/v1/terminal/other')).status).toBe(401);
  });
  it.each([origin, 'http://0.0.0.0:3000'])('discovers through the real handler with framework metadata %s', async metadata => {
    for (const headers of [{}, { origin, 'sec-fetch-site': 'same-origin' }]) {
      expect(proxy(request(undefined, headers, metadata)).status).toBe(200);
      const response = await terminalHttp(request(undefined, headers, metadata), async () => service);
      expect(response.status).toBe(200);
      expect((await response.json()).result.identity).toEqual({
        principalId: 'PRINCIPAL-AGENT', terminalId: 'TERMINAL-AGENT',
        purpose: 'internal_research', corpusScope: ['landshark'], canReview: false,
      });
    }
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([
    { origin: 'http://other.invalid' }, { origin: 'http://0.0.0.0:3000' },
    { host: '0.0.0.0:3000' }, { 'x-forwarded-host': 'other.invalid' },
    { 'x-forwarded-proto': 'https' }, { 'x-forwarded-port': '4000' },
    { forwarded: 'host=127.0.0.1:3000' }, { 'sec-fetch-site': 'cross-site' },
  ])('refuses conflicting context at both boundaries: %j', async headers => {
    expect(proxy(request(undefined, headers)).status).toBe(403);
    const response = await terminalHttp(request(undefined, headers), async () => service);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ protocol: TERMINAL_PROTOCOL, error: 'REQUEST_ORIGIN_REFUSED' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('does not accept caller-proclaimed reviewer authority even with valid Bearer credentials', async () => {
    const response = await terminalHttp(request({
      command: 'review', review: { jobId: 'JOB-synthetic', actionDigest: digest, response: 'APPROVE', reason: 'Synthetic test' },
    }, { origin, 'x-payload-operator': 'admin', 'x-payload-can-review': 'true', 'x-payload-principal': 'reviewer' }), async () => service);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('REVIEW_AUTHORITY_REQUIRED');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('preserves the unchanged local terminal Origin comparison', async () => {
    vi.stubEnv('PAYLOAD_DEPLOYMENT_MODE', 'local');
    expect((await terminalHttp(request(), async () => service)).status).toBe(200);
    const response = await terminalHttp(request(undefined, { origin: 'http://other.invalid' }), async () => service);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('ORIGIN_REFUSED');
  });
  it('revalidates registry changes on every request without trusting a previous shell identity', async () => {
    expect(proxy(request()).status).toBe(200);
    vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', undefined);
    expect(proxy(request()).status).toBe(503);
    expect((await terminalHttp(request(), async () => service)).status).toBe(503);
    expect(proxy(new NextRequest(origin, { headers: { host: '127.0.0.1:3000', authorization: basic } })).status).toBe(200);
  });
});
