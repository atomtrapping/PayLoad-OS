import { afterEach, describe, expect, it, vi } from 'vitest';
import { databaseConfig, databaseConfigured } from './config';
import { corpusDatabaseConfigured } from '@/adapter/corpusSource';
import { databaseConfigured as persistenceConfigured } from '@/adapter/statutoryPersistence';

afterEach(() => vi.unstubAllEnvs());

describe('one database configuration for the pool, reader and writer', () => {
  it('passes a configured URL unchanged to the driver instead of defaulting to localhost', () => {
    const url = 'postgresql://operator:encoded%20password@database.invalid:5433/corpus?sslmode=require';
    expect(databaseConfig({ DATABASE_URL: url })).toEqual({ connectionString: url, max: 10 });
  });

  it('gives the URL precedence over SQL fields', () => {
    expect(databaseConfig({ DATABASE_URL: ' postgres://user:pw@db.invalid/corpus ', SQL_HOST: 'ignored', SQL_PORT: 'invalid' })).toEqual({ connectionString: 'postgres://user:pw@db.invalid/corpus', max: 10 });
  });

  it('supports host configuration, including sockets and a verbatim password', () => {
    expect(databaseConfig({ SQL_HOST: '/cloudsql/project:region:instance', SQL_USER: 'worker', SQL_PASSWORD: ' whitespace matters ', SQL_DB_NAME: 'corpus', SQL_PORT: '5433' }))
      .toEqual({ host: '/cloudsql/project:region:instance', user: 'worker', password: ' whitespace matters ', database: 'corpus', port: 5433, max: 10 });
  });

  it('returns unconfigured for missing or whitespace-only selectors', () => {
    expect(databaseConfig({})).toBeNull();
    expect(databaseConfigured({ DATABASE_URL: '  ', SQL_HOST: '  ' })).toBe(false);
  });

  it.each(['not-a-url', 'https://user:secret@db.invalid/corpus', 'postgres://db.invalid/'])('refuses malformed database URL without exposing it: %s', (url) => {
    expect(() => databaseConfig({ DATABASE_URL: url })).toThrow('DATABASE_CONFIG_INVALID_URL');
    try { databaseConfig({ DATABASE_URL: url }); } catch (error) { expect(String(error)).not.toContain(url); }
  });

  it('refuses a host configuration that would fall back to an implicit user or database', () => {
    expect(() => databaseConfig({ SQL_HOST: 'db.invalid' })).toThrow('DATABASE_CONFIG_INCOMPLETE_SQL_FIELDS');
  });

  it.each(['0', '65536', '5432.5', 'bad'])('rejects invalid port %s', (port) => {
    expect(() => databaseConfig({ SQL_HOST: 'db.invalid', SQL_USER: 'worker', SQL_DB_NAME: 'corpus', SQL_PORT: port })).toThrow('DATABASE_CONFIG_INVALID_PORT');
  });

  it.each(['url', 'host', 'none'])('reader and writer make the same choice for %s', (mode) => {
    for (const key of ['DATABASE_URL', 'SQL_HOST', 'SQL_USER', 'SQL_PASSWORD', 'SQL_DB_NAME', 'SQL_PORT']) vi.stubEnv(key, '');
    if (mode === 'url') vi.stubEnv('DATABASE_URL', 'postgres://db.invalid/corpus');
    if (mode === 'host') {
      vi.stubEnv('SQL_HOST', 'db.invalid'); vi.stubEnv('SQL_USER', 'operator'); vi.stubEnv('SQL_DB_NAME', 'corpus');
    }
    expect(corpusDatabaseConfigured()).toBe(mode !== 'none');
    expect(persistenceConfigured()).toBe(mode !== 'none');
  });
});
