import { timingSafeEqual } from 'node:crypto';
import { authenticateTerminal } from '../terminal/auth';
import { AccessError, type AccessConfiguration, digestCredential, isLoopbackHostname, readAccessConfiguration } from './config';

export type OperatorIdentity = { kind: 'single-operator'; name: string };
type InternalConfiguration = Extract<AccessConfiguration, { mode: 'internal' }>;

function refuseOrigin(): never { throw new AccessError('REQUEST_ORIGIN_REFUSED', 403); }

function requireInternalOrigin(request: Request, config: InternalConfiguration, ambientCredentials = true) {
  const url = new URL(request.url);
  // Next may put its bind hostname (localhost or 0.0.0.0) into URL metadata.
  // 0.0.0.0 is accepted ONLY as framework metadata, never as the actual Host or
  // configured/browser origin. This does not authorize an externally reachable
  // listener: deployment must still publish/bind the service only on loopback.
  const frameworkHostname = isLoopbackHostname(url.hostname) || url.hostname === '0.0.0.0';
  if (request.headers.get('host') !== config.host || !frameworkHostname
    || url.protocol !== 'http:' || (url.port || '80') !== config.port || url.username || url.password) refuseOrigin();
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== config.origin) refuseOrigin();
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && !['same-origin', 'none'].includes(site)) refuseOrigin();
  // Basic credentials are browser-ambient. Require an explicit same-origin signal
  // on every mutation, including machine clients; authentication alone is not CSRF protection.
  if (ambientCredentials && !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase()) && origin !== config.origin) refuseOrigin();
  // Next sets these fields itself when absent. Accept only exact single values;
  // never use forwarded headers as origin, transport or identity authority.
  for (const [header, expected] of [
    ['x-forwarded-host', config.host], ['x-forwarded-proto', 'http'], ['x-forwarded-port', config.port],
  ]) {
    const value = request.headers.get(header);
    if (value !== null && value !== expected) refuseOrigin();
  }
  if (request.headers.has('forwarded')) refuseOrigin();
}

/** Called independently by proxy and protected operational handlers; no trusted identity header. */
export function authenticateInternalRequest(request: Request, config: InternalConfiguration): OperatorIdentity {
  requireInternalOrigin(request, config);
  const header = request.headers.get('authorization');
  let username = '';
  let password = '';
  let validEncoding = false;
  if (header && header.length <= 512) {
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
    if (match) {
      const bytes = Buffer.from(match[1], 'base64');
      const plain = bytes.toString('utf8');
      const separator = plain.indexOf(':');
      validEncoding = bytes.toString('base64') === match[1] && /^[\x21-\x7e]+$/.test(plain) && separator > 0;
      if (validEncoding) { username = plain.slice(0, separator); password = plain.slice(separator + 1); }
      bytes.fill(0);
    }
  }
  const supplied = digestCredential(username, password);
  const matches = timingSafeEqual(supplied, config.credentialDigest);
  supplied.fill(0);
  if (!validEncoding || !matches) throw new AccessError('AUTHENTICATION_REQUIRED', 401);
  return { kind: 'single-operator', name: config.username };
}

/** Local mode is deliberately unchanged; internal mode authenticates each request. */
export function authenticateConfiguredRequest(request: Request): OperatorIdentity | undefined {
  const config = readAccessConfiguration();
  return config.mode === 'internal' ? authenticateInternalRequest(request, config) : undefined;
}

export function isTerminalApiRequest(request: Request): boolean {
  return new URL(request.url).pathname === '/api/v1/terminal';
}

/** The terminal keeps its existing principal registry and review authority.
 * No Basic identity or forwarded identity header becomes a terminal principal. */
export function authenticateProxyRequest(request: Request) {
  const config = readAccessConfiguration();
  if (config.mode === 'local') return undefined;
  if (isTerminalApiRequest(request)) {
    requireInternalOrigin(request, config, false);
    return authenticateTerminal(request);
  }
  return authenticateInternalRequest(request, config);
}

/** Returns true when internal origin was checked. Bearer credentials are not
 * browser-ambient: CLI calls may omit Origin, but a supplied Origin must match. */
export function validateTerminalRequestOrigin(request: Request): boolean {
  const config = readAccessConfiguration();
  if (config.mode === 'local') return false;
  requireInternalOrigin(request, config, false);
  return true;
}
