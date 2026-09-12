import { createHash } from 'node:crypto';

export const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
export interface ObjectCustodyReceipt {
  schema: 'payload.object-custody.v1';
  provider: 'local' | 'exoscale-sos';
  destination: string;
  key: string;
  contentDigest: string;
  byteLength: number;
  versionId: string | null;
}
export interface ImmutableObjectStore {
  readonly destination: string;
  ensure(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<ObjectCustodyReceipt>;
  /** Bounded current-key read; callers must compare their retained expected digest. */
  get(key: string, maxBytes: number, signal: AbortSignal): Promise<Uint8Array | null>;
  /** Exact retained custody/version read, including expected SHA-256 and size. */
  readReceipt(receipt: Readonly<ObjectCustodyReceipt>, signal: AbortSignal): Promise<Uint8Array>;
}
export function validateObjectKey(key: string): string {
  if (typeof key !== 'string' || key.length < 1 || key.length > 1024 || key.split('/').some((part) =>
    part.length < 1 || part.length > 255 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)
    || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('OBJECT_KEY_INVALID');
  }
  return key;
}
export function objectDigest(bytes: Uint8Array): string {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}
export function destinationIdentity(value: Readonly<Record<string, string>>): string {
  return objectDigest(Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))));
}
export function validateObjectBytes(bytes: Uint8Array, maxBytes = MAX_OBJECT_BYTES): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_OBJECT_BYTES
    || !(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) throw new Error('OBJECT_BYTES_INVALID');
}
export function validateObjectReceipt(receipt: Readonly<ObjectCustodyReceipt>, destination: string): void {
  if (!receipt || receipt.schema !== 'payload.object-custody.v1' || receipt.destination !== destination
    || !/^sha256:[a-f0-9]{64}$/.test(receipt.contentDigest) || !Number.isSafeInteger(receipt.byteLength)
    || receipt.byteLength < 0 || receipt.byteLength > MAX_OBJECT_BYTES) throw new Error('OBJECT_RECEIPT_INVALID');
  validateObjectKey(receipt.key);
}
/** Digest-addressed keys are checked in addition to the caller's explicit receipt. */
export function digestFromObjectKey(key: string): string | null {
  const raw = /^sha256\/([a-f0-9]{2})\/([a-f0-9]{64})$/.exec(key);
  if (raw) {
    if (raw[1] !== raw[2].slice(0, 2)) throw new Error('OBJECT_KEY_INVALID');
    return 'sha256:' + raw[2];
  }
  const artifact = /^sha256\/([a-f0-9]{64})\.json$/.exec(key);
  return artifact ? 'sha256:' + artifact[1] : null;
}
