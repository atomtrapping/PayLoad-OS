import { lstatSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { runBoundedProcess } from '@/runtime/boundedProcess';
import { canonicalJson } from '@/fixtures/digest';
import { destinationIdentity } from '@/data-os/immutable-object-store';

export interface LocalLakeConfig { python: string; packages: string; root: string; repository: string }
/** Optional local qualification only. Never selects a remote catalog or discovers credentials. */
export function localLakeConfig(env: Readonly<Record<string, string | undefined>> = process.env): LocalLakeConfig {
  const deployment = env.PAYLOAD_DEPLOYMENT_MODE?.trim() || 'local';
  if (!['local', 'internal'].includes(deployment)) throw new Error('LOCAL_LAKE_CONFIG_INVALID');
  if (deployment === 'internal') throw new Error('LOCAL_LAKE_NOT_PRODUCTION');
  const python = env.PAYLOAD_LAKE_PYTHON, packages = env.PAYLOAD_LAKE_PYTHON_PACKAGES;
  const root = env.PAYLOAD_LAKE_ROOT;
  if (!python || !packages || !root || ![python, packages, root].every(isAbsolute)) throw new Error('LOCAL_LAKE_CONFIG_REQUIRED');
  if (!lstatSync(python).isFile() || !lstatSync(packages).isDirectory()) throw new Error('LOCAL_LAKE_CONFIG_INVALID');
  return Object.freeze({ python, packages, root: resolve(root), repository: resolve('.') });
}
export function lakeDestination(config: LocalLakeConfig): string {
  return destinationIdentity({ adapter: 'payload.local-terminal-lake.v1', root: resolve(config.root) });
}
/** Each call is a fresh, bounded process in the existing production worker budget. */
export async function runLocalLake(config: LocalLakeConfig, command: 'init' | 'publish' | 'read', value?: unknown): Promise<unknown> {
  if (!['init', 'publish', 'read'].includes(command) || !Object.values(config).every(isAbsolute)) throw new Error('LOCAL_LAKE_CONFIG_INVALID');
  const input = command === 'init' ? '' : canonicalJson(value);
  if (Buffer.byteLength(input) > 65536) throw new Error('LOCAL_LAKE_INPUT_LIMIT');
  // -I excludes Python environment/user-site discovery. Only the two explicit
  // operator-owned package/repository directories are added to sys.path.
  const bootstrap = `import sys,runpy; sys.path[:0]=${JSON.stringify([config.packages, config.repository])}; sys.argv=['terminal_lake','--root',${JSON.stringify(config.root)},${JSON.stringify(command)}]; runpy.run_module('tools.terminal_lake',run_name='__main__')`;
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[name]) env[name] = process.env[name];
  const output = await runBoundedProcess({ pool: 'production', executable: config.python, args: ['-I', '-B', '-c', bootstrap], input,
    maxOutputBytes: 262144, timeoutMs: 20000, env, failure: reason => new Error(`LOCAL_LAKE_${reason}`) });
  if (output.code !== 0) throw new Error('LOCAL_LAKE_REFUSED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(output.stdout)); }
  catch { throw new Error('LOCAL_LAKE_RESPONSE_INVALID'); }
}
