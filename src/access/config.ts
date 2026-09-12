import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export class AccessError extends Error {
  constructor(public readonly code: 'ACCESS_CONFIGURATION_INVALID' | 'AUTHENTICATION_REQUIRED' | 'REQUEST_ORIGIN_REFUSED', public readonly status: number) {
    super('Internal access is unavailable for this request.');
  }
}

export type AccessConfiguration = { mode: 'local' } | {
  mode: 'internal';
  origin: string;
  host: string;
  port: string;
  username: string;
  credentialDigest: Buffer;
};

const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
export const isLoopbackHostname = (hostname: string) => loopback.has(hostname);
const invalidConfiguration = (): never => { throw new AccessError('ACCESS_CONFIGURATION_INVALID', 503); };

/** Both operands of the credential comparison are fixed-size hashes, never raw variable-length secrets. */
export function digestCredential(username: string, password: string): Buffer {
  return createHash('sha256').update(`${username}:${password}`, 'utf8').digest();
}

function readPasswordFile(path: string): string {
  if (!isAbsolute(path)) return invalidConfiguration();
  let descriptor: number | undefined;
  const bytes = Buffer.alloc(259);
  try {
    // Regular mounted files only: never block on a FIFO or follow an accidental symlink.
    if (!lstatSync(path).isFile()) return invalidConfiguration();
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 32 || stat.size > 258) return invalidConfiguration();
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > 258) return invalidConfiguration();
    return bytes.subarray(0, length).toString('utf8').replace(/\r?\n$/, '');
  } catch {
    return invalidConfiguration();
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Initial internal deployment is single-host, HTTP loopback reached over SSH.
 * Host/Origin checks cannot prove transport encryption or the client's socket address.
 * The server MUST be bound/published only on loopback; a Host header is not that boundary.
 * A public or private-DNS HTTPS gateway needs a separately qualified ingress contract.
 * Read at startup and on every request; rotated or broken secret/config fails closed.
 */
export function readAccessConfiguration(environment: Readonly<Record<string, string | undefined>> = process.env): AccessConfiguration {
  const mode = environment.PAYLOAD_DEPLOYMENT_MODE?.trim() || 'local';
  if (mode === 'local') return { mode: 'local' };
  if (mode !== 'internal') return invalidConfiguration();
  const origin = environment.PAYLOAD_INTERNAL_ORIGIN;
  const username = environment.PAYLOAD_OPERATOR_USERNAME;
  if (!origin || !username || !/^[A-Za-z0-9._-]{1,64}$/.test(username)) return invalidConfiguration();
  let url: URL;
  try { url = new URL(origin); } catch { return invalidConfiguration(); }
  if (url.origin !== origin || url.protocol !== 'http:' || !isLoopbackHostname(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return invalidConfiguration();
  const file = environment.PAYLOAD_OPERATOR_PASSWORD_FILE;
  const inline = environment.PAYLOAD_OPERATOR_PASSWORD;
  if ((file === undefined) === (inline === undefined)) return invalidConfiguration();
  const password = file === undefined ? inline! : readPasswordFile(file);
  // Length is a floor, not proof of entropy: deployment must generate a random secret.
  if (!/^[\x21-\x7e]{32,256}$/.test(password)) return invalidConfiguration();
  return { mode, origin, host: url.host, port: url.port || '80', username, credentialDigest: digestCredential(username, password) };
}
