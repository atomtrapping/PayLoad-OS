/** Shared configuration for readers, writers and the Postgres driver. No connection is opened here. */
export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseConfig =
  | { connectionString: string; max: number }
  | { host: string; user: string; password?: string; database: string; port?: number; max: number };

const text = (value: string | undefined) => value?.trim() || undefined;

export function databaseConfig(env: DatabaseEnvironment = process.env): DatabaseConfig | null {
  const connectionString = text(env.DATABASE_URL);
  if (connectionString) {
    // Never put the URL or credentials into a diagnostic.
    let parsed: URL;
    try { parsed = new URL(connectionString); } catch { throw new Error('DATABASE_CONFIG_INVALID_URL'); }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || parsed.pathname.length < 2) {
      throw new Error('DATABASE_CONFIG_INVALID_URL');
    }
    return { connectionString, max: 10 };
  }
  const host = text(env.SQL_HOST);
  if (!host) return null;
  const user = text(env.SQL_USER);
  const database = text(env.SQL_DB_NAME);
  if (!user || !database) throw new Error('DATABASE_CONFIG_INCOMPLETE_SQL_FIELDS');
  const rawPort = text(env.SQL_PORT);
  const port = rawPort ? Number(rawPort) : undefined;
  if (rawPort && (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port! < 1 || port! > 65535)) {
    throw new Error('DATABASE_CONFIG_INVALID_PORT');
  }
  return { host, user, database, ...(env.SQL_PASSWORD !== undefined ? { password: env.SQL_PASSWORD } : {}), ...(port !== undefined ? { port } : {}), max: 10 };
}

export function databaseConfigured(env: DatabaseEnvironment = process.env): boolean {
  return databaseConfig(env) !== null;
}
