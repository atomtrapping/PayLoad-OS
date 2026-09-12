import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export type ReasoningEnvironment = Readonly<Record<string, string | undefined>>;
export const SAKANA_MODELS = ['fugu', 'fugu-ultra-v1.1', 'sakana-namazu-v1.0'] as const;
export class ReasoningError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ReasoningError'; }
}

function keyFile(path: string): string {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path) || !lstatSync(path).isFile()) throw new Error();
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    if (!fstatSync(fd).isFile() || fstatSync(fd).size > 4096) throw new Error();
    const bytes = Buffer.alloc(4097); let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > 4096) throw new Error();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)).replace(/\r?\n$/, '');
  } catch { throw new ReasoningError('REASONING_CONFIG_INVALID'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
function limit(value: string | undefined, maximum: number): number {
  if (value === undefined || value === '') return maximum;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum)
    throw new ReasoningError('REASONING_CONFIG_INVALID');
  return Number(value);
}

/** Server/operator configuration only. No caller-provided destinations or fallback providers. */
export function sakanaConfig(env: ReasoningEnvironment = process.env) {
  const provider = env.PAYLOAD_REASONING_PROVIDER ?? 'disabled';
  if (provider === 'disabled' || provider === '') return null;
  if (provider !== 'sakana' || env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    throw new ReasoningError('REASONING_CONFIG_INVALID');
  const model = env.PAYLOAD_SAKANA_MODEL ?? 'fugu';
  if (!(SAKANA_MODELS as readonly string[]).includes(model)) throw new ReasoningError('REASONING_CONFIG_INVALID');
  const reviewRef = env.PAYLOAD_SAKANA_PROCESSING_REVIEW_REF?.trim();
  if (!reviewRef || reviewRef.length > 500) throw new ReasoningError('REASONING_PROCESSING_REVIEW_REQUIRED');
  const inline = env.SAKANA_API_KEY; const file = env.SAKANA_API_KEY_FILE;
  if ((inline === undefined) === (file === undefined)) throw new ReasoningError('REASONING_CONFIG_INVALID');
  if (env.PAYLOAD_DEPLOYMENT_MODE === 'internal' && file === undefined) throw new ReasoningError('REASONING_CONFIG_INVALID');
  const apiKey = file === undefined ? inline! : keyFile(file);
  if (!/^[\x21-\x7e]{16,4096}$/.test(apiKey)) throw new ReasoningError('REASONING_CONFIG_INVALID');
  return Object.freeze({ model, apiKey, reviewRef,
    timeoutMs: limit(env.PAYLOAD_SAKANA_TIMEOUT_MS, 120000),
    maxOutputTokens: limit(env.PAYLOAD_SAKANA_MAX_OUTPUT_TOKENS, 2048),
  });
}
