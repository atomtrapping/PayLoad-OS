import { afterEach, describe, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ pool: vi.fn(), drizzle: vi.fn(() => ({})) }));
vi.mock('pg', () => ({ Pool: class { constructor(config: unknown) { mocked.pool(config); } } }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: mocked.drizzle }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); global._postgresPool = undefined; mocked.pool.mockClear(); });

describe('the actual pool constructor consumes the shared configuration', () => {
  it('receives connectionString for a URL-only environment and reuses one pool', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://db.invalid/corpus');
    const connection = await import('./index');
    expect(mocked.pool).toHaveBeenCalledWith({ connectionString: 'postgres://db.invalid/corpus', max: 10 });
    expect(connection.createPool()).toBe(connection.createPool());
    expect(mocked.pool).toHaveBeenCalledTimes(1);
  });

  it('refuses an unconfigured driver rather than connecting with implicit defaults', async () => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('SQL_HOST', '');
    await expect(import('./index')).rejects.toThrow('DATABASE_NOT_CONFIGURED');
    expect(mocked.pool).not.toHaveBeenCalled();
  });
});
