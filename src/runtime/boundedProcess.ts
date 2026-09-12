import { spawn } from 'node:child_process';
import { acquireProcessSlot, type ProcessLease, type ProcessPool } from './policy';

export type ProcessFailure = 'BUSY' | 'CONFIG_INVALID' | 'UNAVAILABLE' | 'TIMEOUT' | 'STDOUT_LIMIT' | 'STDERR_LIMIT';
interface ProcessRequest {
  pool: ProcessPool;
  executable: string;
  args: string[];
  input: string;
  maxOutputBytes: number;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  failure: (reason: ProcessFailure) => Error;
}

/** Internal transport only; each apparatus still validates its own input and result contract. */
export function runBoundedProcess(request: ProcessRequest): Promise<{ code: number | null; stdout: Buffer }> {
  let release: ProcessLease | null;
  try { release = acquireProcessSlot(request.pool); }
  catch { throw request.failure('CONFIG_INVALID'); }
  if (!release) throw request.failure('BUSY');
  const releaseSlot = release;
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(request.executable, request.args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
        ...(request.env ? { env: request.env } : {}) });
    } catch {
      releaseSlot.settle('UNAVAILABLE');
      releaseSlot();
      reject(request.failure('UNAVAILABLE'));
      return;
    }
    // Grow a byte buffer rather than retaining one object per tiny output chunk.
    let output = Buffer.alloc(0);
    let outputLength = 0;
    let length = 0;
    let settled = false;
    const fail = (reason: Exclude<ProcessFailure, 'BUSY' | 'CONFIG_INVALID'>) => {
      if (settled) return;
      settled = true;
      releaseSlot.settle(reason);
      clearTimeout(timer);
      output = Buffer.alloc(0);
      // A failed kill is not proof of exit. Keep the slot occupied until close.
      try { child.kill(); } catch { /* Preserve the original bounded failure. */ }
      reject(request.failure(reason));
    };
    const timer = setTimeout(() => fail('TIMEOUT'), request.timeoutMs);
    child.on('error', () => fail('UNAVAILABLE'));
    child.stdin!.on('error', () => fail('UNAVAILABLE'));
    child.stdout!.on('error', () => fail('UNAVAILABLE'));
    child.stderr!.on('error', () => fail('UNAVAILABLE'));
    child.stdout!.on('data', (chunk: Buffer) => {
      releaseSlot.bytes('stdoutObserved', chunk.length);
      if (settled) return;
      length += chunk.length;
      if (length > request.maxOutputBytes) fail('STDOUT_LIMIT');
      else {
        const nextLength = outputLength + chunk.length;
        if (nextLength > output.length) {
          const grown = Buffer.allocUnsafe(Math.min(request.maxOutputBytes, Math.max(nextLength, output.length * 2, 4096)));
          output.copy(grown, 0, 0, outputLength);
          output = grown;
        }
        output.set(chunk, outputLength);
        outputLength = nextLength;
      }
    });
    // Count stderr against the same ceiling but never retain or expose diagnostics.
    child.stderr!.on('data', (chunk: Buffer) => {
      releaseSlot.bytes('stderrObserved', chunk.length);
      if (settled) return;
      length += chunk.length;
      if (length > request.maxOutputBytes) fail('STDERR_LIMIT');
    });
    child.on('close', (code) => {
      if (!settled) releaseSlot.settle(code === 0 ? 'SUCCEEDED' : 'EXIT_FAILURE');
      releaseSlot();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: output.subarray(0, outputLength) });
    });
    // This measures bytes offered to stdin, not an acknowledgement of child consumption.
    releaseSlot.bytes('stdinSubmitted', Buffer.byteLength(request.input));
    try { child.stdin!.end(request.input); } catch { fail('UNAVAILABLE'); }
  });
}
