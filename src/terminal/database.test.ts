import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { postgresTerminalDatabase } from './database';

describe('terminal transaction lifecycle', () => {
  function fixture(fail: (sql: string) => boolean = () => false) {
    const query = vi.fn(async (sql: string) => {
      if (fail(sql)) throw new Error('synthetic connection failure');
      return { rows: [{ id: 'retained' }] };
    });
    const release = vi.fn();
    const connect = vi.fn(async () => ({ query, release }));
    return { query, release, connect, db: postgresTerminalDatabase({ connect } as unknown as Pool) };
  }
  it('uses one client and commits once', async () => {
    const f = fixture();
    expect(await f.db.transaction(sql => sql.query('SELECT 1'))).toEqual({ rows: [{ id: 'retained' }] });
    expect(f.connect).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', "SET LOCAL search_path TO public; SET LOCAL statement_timeout TO '10s'; SET LOCAL lock_timeout TO '3s'", 'SELECT 1', 'COMMIT']);
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it('discards a connection whose rollback failed', async () => {
    const f = fixture(sql => sql === 'ROLLBACK');
    await expect(f.db.transaction(async () => { throw new Error('work failure'); })).rejects.toThrow('work failure');
    expect(f.release).toHaveBeenCalledWith(true);
  });
  it('does not replay work after an ambiguous commit response', async () => {
    const f = fixture(sql => sql === 'COMMIT');
    const work = vi.fn(async () => 'value');
    await expect(f.db.transaction(work)).rejects.toThrow('synthetic connection failure');
    expect(work).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
  });
});
