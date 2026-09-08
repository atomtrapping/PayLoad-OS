/**
 * The guard that could not see what it claimed to see.
 *
 * The previous form of `requireLocalRequest` read `request.url` — which Next
 * derives from the `Host` header — and then compared it to the `Host` header.
 * One attacker-controlled string checked against itself. Every test below that
 * sends a remote-looking request with `Host: 127.0.0.1:3000` would have passed
 * against that implementation, which is why they are here.
 */
import { describe, expect, it } from 'vitest';

import { CoordinationError } from './ledger';
import { LOCAL_GUARD_LOSS, requireLocalRequest } from './http';

const LOCAL = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' };

const ask = (headers: Record<string, string> = {}, url = 'http://localhost:3000/api/coordination') =>
  new Request(url, { headers: { ...LOCAL, ...headers } });

function refusal(headers: Record<string, string>, url?: string): CoordinationError {
  try { requireLocalRequest(ask(headers, url)); }
  catch (error) { return error as CoordinationError; }
  throw new Error('the guard admitted a request it should have refused');
}

describe('a forwarding header is the one thing about a request’s origin that a header can prove', () => {
  // Each of these is set by something standing between the client and this
  // process. Its presence is not the caller's claim about itself; it is a
  // relay's record that the request passed through it.
  const relays = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'x-cluster-client-ip', 'via'];

  for (const header of relays) {
    it(`refuses a request carrying ${header}, whatever it claims its host to be`, () => {
      const error = refusal({ [header]: '203.0.113.7' });
      expect(error.code).toBe('RELAYED_REQUEST');
      expect(error.status).toBe(403);
      // The refusal names the header it read, so an operator debugging a
      // 403 on their own machine can see which proxy is in the way.
      expect(error.message).toContain(header);
    });
  }

  it('names every relay header it saw, not just the first', () => {
    expect(refusal({ 'x-forwarded-for': '203.0.113.7', via: '1.1 nginx' }).message).toMatch(/x-forwarded-for.*via/);
  });

  it('refuses an empty forwarding header, because a proxy that sets one is still a proxy', () => {
    expect(refusal({ 'x-forwarded-for': '' }).code).toBe('RELAYED_REQUEST');
  });

  it('refuses before it reads the host, so a relayed request cannot be excused by a well-formed one', () => {
    // This is the deployment the app's own status route describes: nginx
    // rewrites Host to the upstream address, so the host check would pass.
    expect(refusal({ 'x-forwarded-for': '203.0.113.7', host: '127.0.0.1:3000' }).code).toBe('RELAYED_REQUEST');
  });
});

describe('the host check still rejects what it can, and is no longer the boundary', () => {
  it('admits a direct loopback request', () => {
    expect(() => requireLocalRequest(ask())).not.toThrow();
  });

  it('admits a request with no origin and no fetch metadata, which is how a CLI arrives', () => {
    expect(() => requireLocalRequest(new Request('http://localhost:3000/api/coordination', { headers: { host: '127.0.0.1:3000' } }))).not.toThrow();
  });

  it('refuses a host that names something other than loopback', () => {
    expect(refusal({ host: 'board.example.com' }).code).toBe('LOCAL_ONLY');
  });

  it('refuses a host on a different port from the one serving the request', () => {
    expect(refusal({ host: '127.0.0.1:9999' }).code).toBe('LOCAL_ONLY');
  });

  it('refuses credentials, a path, a query or a fragment smuggled through the host', () => {
    for (const host of ['user:pw@127.0.0.1:3000', '127.0.0.1:3000/evil', '127.0.0.1:3000?x=1', '127.0.0.1:3000#x']) {
      expect(refusal({ host }).code).toBe('LOCAL_ONLY');
    }
  });

  it('refuses a cross-origin browser request and a cross-site fetch', () => {
    expect(refusal({ origin: 'https://evil.example' }).code).toBe('ORIGIN_MISMATCH');
    expect(refusal({ 'sec-fetch-site': 'cross-site' }).code).toBe('ORIGIN_MISMATCH');
  });
});

describe('the guard says what it cannot establish', () => {
  it('declares the socket peer as unread, because the handler is never given one', () => {
    expect(LOCAL_GUARD_LOSS.length).toBeGreaterThanOrEqual(4);
    expect(LOCAL_GUARD_LOSS.map((entry) => entry.what).join(' ')).toMatch(/peer address/);
    for (const entry of LOCAL_GUARD_LOSS) expect(entry.because.length).toBeGreaterThan(0);
  });

  it('does not claim that an unrelayed request arrived directly', () => {
    // A proxy that strips its own forwarding headers is invisible here. Saying
    // so is the difference between a guard and a guarantee.
    expect(LOCAL_GUARD_LOSS.some((entry) => /arrived directly/.test(entry.what))).toBe(true);
  });
});
