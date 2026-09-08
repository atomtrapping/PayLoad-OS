import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
}

/**
 * DATABASE_URL IS READ HERE BECAUSE IT IS READ EVERYWHERE ELSE
 *
 * `corpusDatabaseConfigured()` flips every corpus and case surface to the live
 * readers on `DATABASE_URL || SQL_HOST`, and `databaseConfigured()` in the
 * statutory persistence path tells the harvester a database is reachable on
 * `DATABASE_URL` alone. It is also the one connection variable `.env.example`
 * documents. This pool used to ignore it and build a connection from the four
 * SQL_* variables instead, so an operator who set only the documented variable
 * put the whole terminal into live mode while the pool quietly connected with
 * pg's own defaults — a different database, or none.
 *
 * The two are not merged. A connection string wins when it is set, because an
 * operator who supplies one has said where the database is; the SQL_* fields
 * remain for the split form, and drizzle-kit still uses them for migrations.
 */
export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = process.env.DATABASE_URL;
    global._postgresPool = new Pool(connectionString
      ? { connectionString, max: 10 }
      : {
          host: process.env.SQL_HOST,
          user: process.env.SQL_USER,
          password: process.env.SQL_PASSWORD,
          database: process.env.SQL_DB_NAME,
          max: 10,
        });
  }
  return global._postgresPool;
};

export const db = drizzle(createPool(), { schema });
