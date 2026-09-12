import type { Pool } from 'pg';

export interface TerminalSql {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
}
export interface TerminalDatabase {
  transaction<T>(work: (sql: TerminalSql) => Promise<T>): Promise<T>;
}

/** Same checked-out PostgreSQL connection for the whole transaction. No second datastore. */
export function postgresTerminalDatabase(pool: Pool): TerminalDatabase {
  return { async transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL search_path TO public; SET LOCAL statement_timeout TO '10s'; SET LOCAL lock_timeout TO '3s'");
      const result = await work({ query: async <T>(sql: string, values?: unknown[]) => ({ rows: (await client.query(sql, values)).rows as T[] }) });
      await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  } };
}
