import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { databaseConfig } from './config';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const config = databaseConfig();
    if (!config) throw new Error('DATABASE_NOT_CONFIGURED');
    global._postgresPool = new Pool(config);
  }
  return global._postgresPool;
};

export const db = drizzle(createPool(), { schema });
