import { executionPolicy } from '../runtime/policy';
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { checkServerIdentity, type ConnectionOptions } from 'node:tls';

/** Shared configuration for readers, writers and the Postgres driver. No connection is opened here. */
export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseConfig = (
  | { connectionString: string; max: number }
  | { host: string; user: string; password?: string; database: string; port?: number; max: number }
) & { ssl?: ConnectionOptions; connectionTimeoutMillis?: number };

const text = (value: string | undefined) => value?.trim() || undefined;
export const DATABASE_CA_MAX_BYTES = 256 * 1024;

function certificateAuthority(path: string | undefined): string {
  if (!path || !isAbsolute(path)) throw new Error('DATABASE_TLS_CA_FILE_REQUIRED');
  let fd: number | undefined;
  try {
    // Nonblocking open refuses special files after fstat without hanging on a
    // FIFO. Mounted secret symlinks may resolve to a regular file.
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > DATABASE_CA_MAX_BYTES) throw new Error();
    const bytes = Buffer.alloc(DATABASE_CA_MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > DATABASE_CA_MAX_BYTES) throw new Error();
    const pem = bytes.subarray(0, length).toString('utf8');
    const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
    if (!certificates?.length || pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) throw new Error();
    for (const certificate of certificates) if (!new X509Certificate(certificate).ca) throw new Error();
    return pem;
  } catch {
    // Do not echo file paths, PEM contents, credentials or underlying fs errors.
    throw new Error('DATABASE_TLS_CA_INVALID');
  } finally { if (fd !== undefined) closeSync(fd); }
}

function tlsConfig(env: DatabaseEnvironment, host: string, strict: boolean): Pick<DatabaseConfig, 'ssl' | 'connectionTimeoutMillis'> {
  if (!strict) return {};
  // No local sockets or encoded hosts: bind identity checking to this exact DNS/IP host.
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/.test(host)) throw new Error('DATABASE_TLS_HOST_INVALID');
  const ca = certificateAuthority(text(env.PAYLOAD_DB_CA_FILE));
  return { connectionTimeoutMillis: 10_000, ssl: {
    ca, minVersion: 'TLSv1.2', rejectUnauthorized: true,
    checkServerIdentity: (_hostname, certificate) => checkServerIdentity(host, certificate),
  } };
}

export function databaseConfig(env: DatabaseEnvironment = process.env): DatabaseConfig | null {
  const deployment = text(env.PAYLOAD_DEPLOYMENT_MODE) ?? 'local';
  if (!['local', 'internal'].includes(deployment)) throw new Error('DATABASE_DEPLOYMENT_MODE_INVALID');
  const tls = text(env.PAYLOAD_DB_TLS_MODE);
  if (tls !== undefined && tls !== 'verify-full') throw new Error('DATABASE_TLS_MODE_INVALID');
  if (deployment === 'internal' && tls !== 'verify-full') throw new Error('DATABASE_TLS_REQUIRED');
  const strict = tls === 'verify-full';
  const connectionString = text(env.DATABASE_URL);
  if (connectionString) {
    // Never put the URL or credentials into a diagnostic.
    let parsed: URL;
    try { parsed = new URL(connectionString); } catch { throw new Error('DATABASE_CONFIG_INVALID_URL'); }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
      throw new Error('DATABASE_CONFIG_INVALID_URL');
    }
    // pg reparses URL query parameters AFTER merging explicit config. Reject
    // every query in strict mode so none can replace TLS or endpoint options.
    if (strict && [...parsed.searchParams].length) throw new Error('DATABASE_TLS_URL_PARAMETERS_FORBIDDEN');
    if (strict && !parsed.username) throw new Error('DATABASE_CONFIG_EXPLICIT_USER_REQUIRED');
    return { connectionString, max: executionPolicy(env).databaseConnections, ...tlsConfig(env, parsed.hostname, strict) };
  }
  const host = text(env.SQL_HOST);
  if (!host) {
    if (deployment === 'internal' || strict) throw new Error('DATABASE_CONFIG_REQUIRED');
    return null;
  }
  const user = text(env.SQL_USER);
  const database = text(env.SQL_DB_NAME);
  if (!user || !database) throw new Error('DATABASE_CONFIG_INCOMPLETE_SQL_FIELDS');
  const rawPort = text(env.SQL_PORT);
  const port = rawPort ? Number(rawPort) : undefined;
  if (rawPort && (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port! < 1 || port! > 65535)) {
    throw new Error('DATABASE_CONFIG_INVALID_PORT');
  }
  return { host, user, database, ...(env.SQL_PASSWORD !== undefined ? { password: env.SQL_PASSWORD } : {}), ...(port !== undefined ? { port } : {}), max: executionPolicy(env).databaseConnections, ...tlsConfig(env, host, strict) };
}

export function databaseConfigured(env: DatabaseEnvironment = process.env): boolean {
  return databaseConfig(env) !== null;
}
