import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { executionPolicy } from '../runtime/policy';
import { validateObjectKey } from './immutable-object-store';

export type SosEnvironment = Readonly<Record<string, string | undefined>>;
export const SOS_MAX_BYTES = 8 * 1024 * 1024;
export const SOS_TIMEOUT_MS = 10_000;
export interface SosConfig {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxBytes: number;
  timeoutMs: number;
  maxConcurrency: number;
}

export class SosError extends Error {
  constructor(public readonly code: 'CONFIG_INVALID' | 'NOT_CONFIGURED' | 'INPUT_INVALID' | 'BODY_TOO_LARGE'
    | 'BUSY' | 'TIMEOUT' | 'CANCELLED' | 'UNAVAILABLE' | 'WRITE_UNCONFIRMED' | 'INTEGRITY_FAILED'
    | 'VERSION_REQUIRED' | 'INVALID_RESPONSE' | 'CLOSED') {
    super(`SOS_${code}`);
  }
}

function lower(value: string | undefined, ceiling: number): number {
  if (!value?.trim()) return ceiling;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > ceiling) throw new SosError('CONFIG_INVALID');
  return Number(value);
}

/** Operator-selected file only. Read through one descriptor with a hard byte cap. */
function secretFile(path: string): string {
  if (!isAbsolute(path)) throw new SosError('CONFIG_INVALID');
  let fd: number | undefined;
  try {
    if (!lstatSync(path).isFile()) throw new SosError('CONFIG_INVALID');
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 4096) throw new SosError('CONFIG_INVALID');
    const bytes = Buffer.alloc(4097);
    let size = 0;
    while (size < bytes.length) {
      const read = readSync(fd, bytes, size, bytes.length - size, null);
      if (!read) break;
      size += read;
    }
    if (size > 4096) throw new SosError('CONFIG_INVALID');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)).replace(/\r?\n$/, '');
  } catch { throw new SosError('CONFIG_INVALID'); }
  finally { if (fd !== undefined) { try { closeSync(fd); } catch { throw new SosError('CONFIG_INVALID'); } } }
}

/** No default AWS credential chain, implicit region, localhost endpoint or bucket fallback. */
export function sosConfig(env: SosEnvironment = process.env): Readonly<SosConfig> | null {
  const provider = env.PAYLOAD_OBJECT_STORE?.trim() || 'local';
  if (provider === 'local') return null;
  if (provider !== 'sos' || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new SosError('CONFIG_INVALID');
  const endpoint = env.PAYLOAD_SOS_ENDPOINT ?? '';
  const region = env.PAYLOAD_SOS_REGION ?? '';
  const bucket = env.PAYLOAD_SOS_BUCKET ?? '';
  const accessKeyId = env.PAYLOAD_SOS_ACCESS_KEY_ID ?? '';
  const prefix = env.PAYLOAD_SOS_PREFIX ?? '';
  try { if (prefix) validateObjectKey(prefix); } catch { throw new SosError('CONFIG_INVALID'); }
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new SosError('CONFIG_INVALID'); }
  // Official regional SOS HTTPS endpoints only; callers never select a destination.
  if (!/^sos-[a-z]{2}-[a-z]{3}-[1-9]\d*\.exo\.io$/.test(url.hostname)
    || endpoint !== `https://${url.hostname}` || region !== url.hostname.slice(4, -7)
    || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
    || !/^[A-Za-z0-9_-]{8,256}$/.test(accessKeyId)) throw new SosError('CONFIG_INVALID');
  const inline = env.PAYLOAD_SOS_SECRET_ACCESS_KEY;
  const file = env.PAYLOAD_SOS_SECRET_ACCESS_KEY_FILE;
  if ((inline === undefined) === (file === undefined)) throw new SosError('CONFIG_INVALID');
  const secretAccessKey = file === undefined ? inline! : secretFile(file);
  if (!/^[\x21-\x7e]{16,4096}$/.test(secretAccessKey)) throw new SosError('CONFIG_INVALID');
  let profile: ReturnType<typeof executionPolicy>;
  try { profile = executionPolicy(env); } catch { throw new SosError('CONFIG_INVALID'); }
  return Object.freeze({ endpoint, region, bucket, prefix, accessKeyId, secretAccessKey,
    maxBytes: lower(env.PAYLOAD_SOS_MAX_BYTES, SOS_MAX_BYTES),
    timeoutMs: lower(env.PAYLOAD_SOS_TIMEOUT_MS, SOS_TIMEOUT_MS),
    maxConcurrency: lower(env.PAYLOAD_SOS_MAX_CONCURRENCY, profile.profile === 'conserve' ? 1 : 2),
  });
}
