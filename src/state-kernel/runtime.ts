import { join } from 'node:path';
import { runBoundedProcess, type ProcessFailure } from '../runtime/boundedProcess';
import { StateKernelError } from './errors';
import type { KernelCommand, NotationState } from './types';

export const MAX_KERNEL_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

const executablePath = () => join(process.cwd(), 'native', 'state-kernel', 'target', 'debug',
  process.platform === 'win32' ? 'notations-state-kernel.exe' : 'notations-state-kernel');

function failure(reason: ProcessFailure): StateKernelError {
  // Saved-history reads must report operational pressure, not INVALID_SAVED_STATE.
  const message = reason === 'BUSY' ? 'The local kernel execution limit is occupied. Retry the same request.'
    : reason === 'CONFIG_INVALID' ? 'The operator execution limits are invalid. Check the runtime configuration.'
      : 'The local Rust kernel could not complete. Build it with npm run kernel:build.';
  return new StateKernelError('KERNEL_UNAVAILABLE', message, 503);
}

/** Fixed local executable, no shell, no caller-selected executable or command-line flags. */
export function evaluateKernel(commands: readonly KernelCommand[]): Promise<NotationState> {
  const input = JSON.stringify({ schema: 'notations.state-kernel-request.v1', commands });
  if (Buffer.byteLength(input) > MAX_KERNEL_INPUT_BYTES) throw new StateKernelError('CAPACITY', 'The command history exceeds 2 MiB.', 409);
  const executable = executablePath();
  return runBoundedProcess({ pool: 'kernel', executable, args: [], input, maxOutputBytes: MAX_OUTPUT_BYTES, timeoutMs: 10_000, failure })
    .then(({ code, stdout }) => {
      let result;
      try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout)); }
      catch { throw failure('UNAVAILABLE'); }
      if (code === 0 && result?.ok === true && result.state?.schema === 'notations.notation-state.v1' &&
          result.state.revision === commands.length && Array.isArray(result.state.notations) && Array.isArray(result.state.relations)) {
        return result.state as NotationState;
      }
      if (code === 1 && result?.ok === false && typeof result.error?.code === 'string' &&
          /^[A-Z_]{1,64}$/.test(result.error.code) && typeof result.error.message === 'string' && result.error.message.length <= 256) {
        throw new StateKernelError(result.error.code, result.error.message, 400);
      }
      throw failure('UNAVAILABLE');
    });
}
