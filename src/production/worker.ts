import { join } from 'node:path';
import { runBoundedProcess, type ProcessFailure } from '../runtime/boundedProcess';
import { ProductionError } from './errors';

export { MAX_PRODUCTION_WORKERS } from '../runtime/policy';
export const PRODUCTION_WORKER_TIMEOUT_MS = 15_000;
export const MAX_PRODUCTION_WORKER_BYTES = 2 * 1024 * 1024;

export type ProductionWork = { action: 'EXECUTE'; command: unknown }
  | { action: 'INSPECT'; kind: string; reference: unknown }
  | { action: 'COMPARE_CANDIDATE_BUILDS'; request: unknown }
  | { action: 'CATALOG' };

function failure(reason: ProcessFailure): ProductionError {
  if (reason === 'BUSY') return new ProductionError('PRODUCTION_BUSY', 'The local production worker limit is occupied. Retry the same request.', 503);
  if (reason === 'CONFIG_INVALID') return new ProductionError('WORKER_UNAVAILABLE', 'The operator execution limits are invalid. Check the runtime configuration.', 503);
  if (reason === 'TIMEOUT') return new ProductionError('EXECUTION_TIMEOUT',
    'The local operation exceeded 15 seconds. Completion is unconfirmed; retry the identical request to discover retained outputs without repeating incomplete work.', 504);
  if (reason === 'STDOUT_LIMIT') return new ProductionError('WORKER_OUTPUT_LIMIT', 'The local result exceeded its output limit. Inspect the request before retrying.', 503);
  return new ProductionError('WORKER_UNAVAILABLE', 'The local worker could not complete. Build it with npm run production:build; inspect retained outputs before retrying.', 503);
}

/** Fixed Node entry point. A caller supplies an operation, never executable options or paths. */
export function runProductionWork(work: ProductionWork): Promise<unknown> {
  const input = JSON.stringify({ schema: 'payload.production-worker.v1', ...work });
  if (Buffer.byteLength(input) > MAX_PRODUCTION_WORKER_BYTES) throw new ProductionError('BODY_TOO_LARGE', 'The worker request exceeds 2 MiB.', 413);
  return runBoundedProcess({ pool: 'production', executable: process.execPath,
    args: [join(process.cwd(), '.stamp', 'production-worker.mjs')], input,
    maxOutputBytes: MAX_PRODUCTION_WORKER_BYTES, timeoutMs: PRODUCTION_WORKER_TIMEOUT_MS,
    env: { ...process.env, PAYLOAD_PRODUCTION_LOCAL: process.env.PAYLOAD_PRODUCTION_LOCAL ?? '0' }, failure,
  }).then(({ code, stdout }) => {
    let result;
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout)); }
    catch { throw failure('UNAVAILABLE'); }
    if (code === 0 && result?.schema === 'payload.production-worker-result.v1' && result.ok === true && result.value && typeof result.value === 'object') return result.value;
    if (code === 1 && result?.schema === 'payload.production-worker-result.v1' && result.ok === false &&
      /^[A-Z_]{1,80}$/.test(result.error?.code) && typeof result.error?.message === 'string' && result.error.message.length <= 512 &&
      Number.isSafeInteger(result.error?.status) && result.error.status >= 400 && result.error.status <= 599) {
      throw new ProductionError(result.error.code, result.error.message, result.error.status, result.error.details);
    }
    throw failure('UNAVAILABLE');
  });
}
