import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateTerminal, assertAuthenticated, tokenDigest, type AuthenticatedTerminal } from './auth';
import { terminalHttp } from './http';
import type { TerminalService } from './service';

const token = 'test-token-that-is-long-enough-and-never-used-outside-tests';
const registration = { principalId: 'research', terminalId: 'cli', displayName: 'Research', kind: 'AGENT', terminalClass: 'FIRM_INTERNAL', purpose: 'internal_research',
  corpusScope: ['caravan.specialty-cargo'], canReview: false, tokenSha256: tokenDigest(token), expiresAt: '2099-01-01T00:00:00Z' };
const config = JSON.stringify([registration]);
const request = (authorization = `Bearer ${token}`) => new Request('http://localhost/api/v1/terminal', { headers: { authorization } });
afterEach(() => vi.unstubAllEnvs());
describe('authenticated terminal identity', () => {
  it('binds identity and limits to server config and freezes every scope copy', () => {
    const who = authenticateTerminal(request(), config);
    expect(who).toMatchObject({ principalId: 'research', kind: 'AGENT', canReview: false });
    expect(who).not.toHaveProperty('tokenSha256');
    expect(Object.isFrozen(who)).toBe(true);
    expect(Object.isFrozen(who.corpusScope)).toBe(true);
    expect(Object.isFrozen(who.session.corpusScope)).toBe(true);
    expect(() => assertAuthenticated(who)).not.toThrow();
  });
  it.each(['', 'Basic abc', 'Bearer short', `Bearer ${token}extra`])('refuses missing or incorrect bearer %s', header => {
    expect(() => authenticateTerminal(request(header), config)).toThrow('AUTHENTICATION_REQUIRED');
  });
  it('refuses caller-constructed or copied identities', () => {
    expect(() => assertAuthenticated({ principalId: 'admin' } as AuthenticatedTerminal)).toThrow('AUTHENTICATION_REQUIRED');
    expect(() => assertAuthenticated({ ...authenticateTerminal(request(), config) })).toThrow('AUTHENTICATION_REQUIRED');
  });
  it('refuses reviewer-agent, duplicate tokens and conflicting copies of a principal', () => {
    for (const entries of [[{ ...registration, canReview: true }], [registration, registration], [registration, { ...registration, terminalId: 'navigator', tokenSha256: 'a'.repeat(64), canReview: true, kind: 'HUMAN' }]]) {
      expect(() => authenticateTerminal(request(), JSON.stringify(entries))).toThrow('TERMINAL_AUTH_CONFIGURATION_INVALID');
    }
  });
  it('supports two independent terminals for one principal', () => {
    const other = 'second-terminal-token-that-is-long-enough';
    const entries = JSON.stringify([registration, { ...registration, terminalId: 'navigator', tokenSha256: tokenDigest(other) }]);
    expect(authenticateTerminal(request(), entries).principalId).toBe(authenticateTerminal(request(`Bearer ${other}`), entries).principalId);
  });
  it('refuses expired credentials and rechecks expiry after asynchronous work', () => {
    const who = authenticateTerminal(request(), config);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2100-01-01T00:00:00Z'));
    try { expect(() => assertAuthenticated(who)).toThrow('AUTHENTICATION_REQUIRED'); expect(() => authenticateTerminal(request(), config)).toThrow('AUTHENTICATION_REQUIRED'); }
    finally { vi.restoreAllMocks(); }
  });
});
describe('HTTP command boundary', () => {
  const post = (body: string, extra: Record<string,string> = {}) => new Request('http://localhost/api/v1/terminal', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }, body });
  it('does not open the database or read a body for unauthenticated requests', async () => {
    vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', config);
    const service = vi.fn();
    const response = await terminalHttp(post('{', { authorization: 'Bearer short' }), service);
    expect(response.status).toBe(401); expect(service).not.toHaveBeenCalled();
  });
  it('fails closed when no identity configuration exists', async () => {
    vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', '');
    const response = await terminalHttp(post('{}'), vi.fn());
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('TERMINAL_AUTH_NOT_CONFIGURED');
  });
  it('rejects cross-origin, oversized, malformed and non-JSON requests before service use', async () => {
    vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', config);
    for (const [req,status] of [[post('{}', { origin: 'https://attacker.invalid' }),403], [post('x'.repeat(65537)),413], [post('{'),400], [post('{}', { 'content-type': 'text/plain' }),415]] as const) {
      const service = vi.fn(); expect((await terminalHttp(req, service)).status).toBe(status); expect(service).not.toHaveBeenCalled();
    }
  });
  it('returns no-store versioned replies and does not expose backend errors', async () => {
    vi.stubEnv('PAYLOAD_TERMINAL_PRINCIPALS', config);
    const service = { command: vi.fn().mockResolvedValue({ jobs: [] }) };
    const response = await terminalHttp(post('{"command":"jobs"}'), async () => service as unknown as TerminalService);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-payload-protocol')).toBe('payload.terminal.v1');
    expect(response.headers.get('x-payload-fixture-only')).toBeNull();
    expect(response.headers.get('x-payload-corpus-release')).toBeNull();
    expect(await response.json()).toEqual({ protocol: 'payload.terminal.v1', result: { jobs: [] } });
    service.command.mockRejectedValue(new Error('postgres://secret-password@host/db'));
    const failed = await terminalHttp(post('{}'), async () => service as unknown as TerminalService);
    expect(await failed.text()).not.toContain('secret-password');
  });
});
