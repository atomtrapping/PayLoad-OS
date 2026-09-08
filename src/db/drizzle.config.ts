import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import { databaseConfig } from './config';

dotenv.config();

// A migration operator may supply admin fields explicitly. URL configuration
// otherwise follows the same precedence and validation as runtime access.
const config = databaseConfig({ ...process.env, SQL_USER: process.env.SQL_ADMIN_USER || process.env.SQL_USER, SQL_PASSWORD: process.env.SQL_ADMIN_PASSWORD ?? process.env.SQL_PASSWORD });
if (!config) throw new Error('DATABASE_NOT_CONFIGURED');

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: 'connectionString' in config ? { url: config.connectionString } : { host: config.host, user: config.user, password: config.password, database: config.database, port: config.port },
});
