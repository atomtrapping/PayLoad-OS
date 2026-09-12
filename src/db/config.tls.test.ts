import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, createServer as createTlsServer, rootCertificates, type ConnectionOptions } from 'node:tls';
import { createServer } from 'node:net';
import { Client } from 'pg';
import { databaseConfig, DATABASE_CA_MAX_BYTES } from './config';
import { TEST_DATABASE_CA, TEST_DATABASE_KEY } from './fixtures/tls';

let temporary: string;
let caFile: string;
const strict = (extra = {}) => ({ DATABASE_URL: 'postgres://operator@db.invalid/corpus', PAYLOAD_DEPLOYMENT_MODE: 'internal', PAYLOAD_DB_TLS_MODE: 'verify-full', PAYLOAD_DB_CA_FILE: caFile, ...extra });
beforeAll(() => { temporary = mkdtempSync(join(tmpdir(), 'payload-db-tls-')); caFile = join(temporary, 'ca.pem'); writeFileSync(caFile, TEST_DATABASE_CA); });
afterAll(() => { rmSync(temporary, { recursive: true, force: true }); });

describe('explicit verified database TLS', () => {
  it('survives the actual pg connection-string parser, even with insecure ambient PGSSLMODE', () => {
    vi.stubEnv('PGSSLMODE', 'no-verify');
    try {
      const config = databaseConfig(strict())!;
      const client = new Client(config);
      expect(client.ssl).toMatchObject({ ca: TEST_DATABASE_CA, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      expect(client.ssl).toBe(config.ssl);
      expect(config.connectionTimeoutMillis).toBe(10_000);
    } finally { vi.unstubAllEnvs(); }
  });
  it.each(['sslmode=disable', 'ssl=no-verify', 'sslrootcert=secret.pem', 'host=%2Ftmp', 'port=42', 'uselibpqcompat=true', 'SSLMode=require', 'options=-c%20foo=bar'])('refuses URL overrides before pg parses them: %s', (query) => {
    expect(() => databaseConfig(strict({ DATABASE_URL: `postgres://operator@db.invalid/corpus?${query}` }))).toThrow('DATABASE_TLS_URL_PARAMETERS_FORBIDDEN');
  });
  it('requires strict mode, explicit database identity and mounted CA in internal deployments', () => {
    expect(() => databaseConfig(strict({ PAYLOAD_DB_TLS_MODE: '' }))).toThrow('DATABASE_TLS_REQUIRED');
    expect(() => databaseConfig(strict({ PAYLOAD_DB_TLS_MODE: 'require' }))).toThrow('DATABASE_TLS_MODE_INVALID');
    expect(() => databaseConfig(strict({ DATABASE_URL: '' }))).toThrow('DATABASE_CONFIG_REQUIRED');
    expect(() => databaseConfig(strict({ DATABASE_URL: 'postgres://db.invalid/corpus' }))).toThrow('DATABASE_CONFIG_EXPLICIT_USER_REQUIRED');
    expect(() => databaseConfig(strict({ PAYLOAD_DB_CA_FILE: '' }))).toThrow('DATABASE_TLS_CA_FILE_REQUIRED');
    expect(() => databaseConfig(strict({ PAYLOAD_DB_CA_FILE: 'relative.pem' }))).toThrow('DATABASE_TLS_CA_FILE_REQUIRED');
    expect(() => databaseConfig({ PAYLOAD_DEPLOYMENT_MODE: 'typo' })).toThrow('DATABASE_DEPLOYMENT_MODE_INVALID');
    expect(() => databaseConfig(strict({ DATABASE_URL: '', SQL_HOST: '/tmp/socket', SQL_USER: 'worker', SQL_DB_NAME: 'db' }))).toThrow('DATABASE_TLS_HOST_INVALID');
  });
  it('bounds CA reads, rejects malformed material, and redacts errors', () => {
    for (const value of ['private-secret-material', 'x'.repeat(DATABASE_CA_MAX_BYTES + 1), TEST_DATABASE_CA + '\nsecret']) {
      const path = join(temporary, 'invalid.pem'); writeFileSync(path, value);
      expect(() => databaseConfig(strict({ PAYLOAD_DB_CA_FILE: path }))).toThrow('DATABASE_TLS_CA_INVALID');
    }
    expect(() => databaseConfig(strict({ PAYLOAD_DB_CA_FILE: temporary }))).toThrow('DATABASE_TLS_CA_INVALID');
    try { databaseConfig(strict({ PAYLOAD_DB_CA_FILE: join(temporary, 'missing-secret.pem') })); } catch (error) {
      expect(String(error)).toBe('Error: DATABASE_TLS_CA_INVALID');
    }
  });
  it('negotiates real local TLS with the trusted identity, refuses wrong hostname and untrusted CA', async () => {
    const server = createTlsServer({ key: TEST_DATABASE_KEY, cert: TEST_DATABASE_CA }, (socket) => socket.end());
    server.on('tlsClientError', () => {});
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS');
    const handshake = (ssl: ConnectionOptions) => new Promise<void>((resolve, reject) => {
      const socket = connect({ ...ssl, host: '127.0.0.1', port: address.port, servername: 'db.invalid' });
      socket.once('secureConnect', () => { socket.destroy(); resolve(); });
      socket.once('error', (error) => { socket.destroy(); reject(error); });
      socket.setTimeout(2000, () => socket.destroy(new Error('TEST_TLS_TIMEOUT')));
    });
    try {
      await expect(handshake(databaseConfig(strict())!.ssl!)).resolves.toBeUndefined();
      await expect(handshake(databaseConfig(strict({ DATABASE_URL: 'postgres://operator@other.invalid/corpus' }))!.ssl!)).rejects.toThrow(/Hostname\/IP does not match/);
      const unrelated = join(temporary, 'other-ca.pem'); writeFileSync(unrelated, rootCertificates[0]);
      await expect(handshake(databaseConfig(strict({ PAYLOAD_DB_CA_FILE: unrelated }))!.ssl!)).rejects.toThrow(/self-signed certificate/);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it('makes the real pg driver refuse a server that declines TLS, without sending a password', async () => {
    let received = 0;
    const server = createServer((socket) => socket.on('data', (bytes) => { received += bytes.length; socket.end('N'); }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TEST_SERVER_ADDRESS');
    const config = databaseConfig(strict({ DATABASE_URL: `postgres://operator:secret@127.0.0.1:${address.port}/corpus` }))!;
    const client = new Client(config);
    try { await expect(client.connect()).rejects.toThrow('The server does not support SSL connections'); expect(received).toBe(8); }
    finally { await client.end(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
});
