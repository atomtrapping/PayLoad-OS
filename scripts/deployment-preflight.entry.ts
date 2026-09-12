import { accessSync, constants, lstatSync } from 'node:fs';
import { readAccessConfiguration } from '../src/access/config';
import { databaseConfig } from '../src/db/config';
import { executionPolicy } from '../src/runtime/policy';
import { sosConfig } from '../src/data-os/sos-config';
import { authenticateTerminal } from '../src/terminal/auth';
import { TerminalError } from '../src/terminal/contracts';
import { retentionPlan } from '../src/terminal/retention';

/** No connections, collection, writes, migrations, seeding or publication. */
export function deploymentPreflight(environment: NodeJS.ProcessEnv = process.env, role = 'web'): void {
  if (!['web', 'worker', 'publisher'].includes(role)) throw new Error('DEPLOYMENT_ROLE_REFUSED');
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid?.() !== 10001
    || process.cwd() !== '/app' || environment.NODE_ENV !== 'production'
    || environment.PAYLOAD_DEPLOYMENT_MODE !== 'internal') throw new Error('DEPLOYMENT_PLATFORM_REFUSED');
  const access = readAccessConfiguration(environment);
  if (access.mode !== 'internal' || access.origin !== 'http://127.0.0.1:3000'
    || environment.PORT !== '3000' || environment.HOSTNAME !== '0.0.0.0'
    || environment.PAYLOAD_OPERATOR_PASSWORD_FILE !== '/run/secrets/operator-password'
    || environment.PAYLOAD_OPERATOR_PASSWORD !== undefined) throw new Error('DEPLOYMENT_ACCESS_REFUSED');
  if (environment.PAYLOAD_DB_TLS_MODE !== 'verify-full'
    || environment.PAYLOAD_DB_CA_FILE !== '/run/secrets/postgresql-ca.pem'
    || !databaseConfig(environment)) throw new Error('DEPLOYMENT_DATABASE_REFUSED');
  executionPolicy(environment);
  // Validate the existing registry without a token; this cannot mint a principal.
  try { authenticateTerminal(new Request('http://127.0.0.1:3000/api/v1/terminal'), environment.PAYLOAD_TERMINAL_PRINCIPALS); }
  catch (error) {
    if (!(error instanceof TerminalError) || error.code !== 'AUTHENTICATION_REQUIRED') throw new Error('DEPLOYMENT_TERMINAL_AUTH_REFUSED');
  }
  const retention = retentionPlan(environment);
  if (role === 'publisher' && !retention) throw new Error('DEPLOYMENT_RETENTION_REFUSED');
  const objects = sosConfig(environment);
  if (objects && (environment.PAYLOAD_SOS_SECRET_ACCESS_KEY_FILE !== '/run/secrets/sos-secret-access-key'
    || environment.PAYLOAD_SOS_SECRET_ACCESS_KEY !== undefined)) throw new Error('DEPLOYMENT_OBJECT_STORE_REFUSED');
  for (const flag of ['PAYLOAD_SOURCE_COLLECTION', 'PAYLOAD_SAMSARA_COLLECTION', 'GAT_INTEGRATION', 'PAYLOAD_COORDINATION_LOCAL']) {
    if (environment[flag] !== '0') throw new Error('DEPLOYMENT_DISABLED_CAPABILITY');
  }
  for (const [key, expected] of Object.entries({ PAYLOAD_PRODUCTION_DIR: '/app/.payload/evidence',
    PAYLOAD_NOTATION_STATE_DIR: '/app/.payload/notation-state', PAYLOAD_SOURCE_QUALIFICATION_DIR: '/app/.payload/source-qualification' })) {
    if (environment[key] !== expected) throw new Error('DEPLOYMENT_STATE_ROOT_REFUSED');
  }
  const state = lstatSync('/app/.payload');
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error('DEPLOYMENT_STATE_ROOT_REFUSED');
  accessSync('/app/.payload', constants.R_OK | constants.W_OK | constants.X_OK);
  for (const path of ['/app/server.js', '/app/.stamp/production-worker.mjs',
    '/app/.stamp/terminal-mining-worker.cjs', '/app/.stamp/terminal-service.mjs',
    '/app/native/state-kernel/target/debug/notations-state-kernel']) {
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink()) throw new Error('DEPLOYMENT_RUNTIME_MISSING');
  }
  accessSync('/app/native/state-kernel/target/debug/notations-state-kernel', constants.X_OK);
}

try {
  if (process.argv.length > 3) throw new Error('DEPLOYMENT_ROLE_REFUSED');
  deploymentPreflight(process.env, process.argv[2] ?? 'web');
  console.log('Internal deployment configuration passed offline preflight. Database connectivity and storage qualification are separate checks.');
} catch {
  // Validators may read secrets; never print the thrown error, env, URLs or paths.
  console.error('Internal deployment preflight refused. Check the protected deployment configuration and runtime mounts.');
  process.exitCode = 1;
}
