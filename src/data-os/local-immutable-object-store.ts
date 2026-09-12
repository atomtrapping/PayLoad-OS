import { resolve } from 'node:path';
import { publishImmutableFile, readImmutableFile } from './local-files';
import { destinationIdentity, digestFromObjectKey, MAX_OBJECT_BYTES, objectDigest, validateObjectBytes,
  validateObjectKey, validateObjectReceipt, type ImmutableObjectStore, type ObjectCustodyReceipt } from './immutable-object-store';

export function localObjectDestination(root: string): string {
  if (typeof root !== 'string' || !root.trim()) throw new Error('OBJECT_ROOT_REQUIRED');
  return destinationIdentity({ adapter: 'payload.local-immutable.v1', root: resolve(root) });
}
function active(signal: AbortSignal): void {
  if (!(signal instanceof AbortSignal) || signal.aborted) throw new Error('OBJECT_CANCELLED');
}
/** Trusted local filesystem, create-only publication. No WORM/power-loss claim. */
export class LocalImmutableObjectStore implements ImmutableObjectStore {
  readonly root: string;
  readonly destination: string;
  constructor(root: string) {
    this.destination = localObjectDestination(root);
    this.root = resolve(root);
  }
  async ensure(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<ObjectCustodyReceipt> {
    active(signal); validateObjectKey(key); validateObjectBytes(bytes);
    const content = Buffer.from(bytes);
    const contentDigest = objectDigest(content);
    const embedded = digestFromObjectKey(key);
    if (embedded && embedded !== contentDigest) throw new Error('OBJECT_INTEGRITY_FAILED');
    publishImmutableFile(this.root, key.split('/'), content, MAX_OBJECT_BYTES);
    const receipt: ObjectCustodyReceipt = { schema: 'payload.object-custody.v1', provider: 'local',
      destination: this.destination, key, contentDigest, byteLength: content.length, versionId: null };
    await this.readReceipt(receipt, signal);
    return receipt;
  }
  async get(key: string, maxBytes: number, signal: AbortSignal): Promise<Uint8Array | null> {
    active(signal); validateObjectKey(key);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_OBJECT_BYTES) throw new Error('OBJECT_BYTES_INVALID');
    const bytes = readImmutableFile(this.root, key.split('/'), maxBytes);
    const embedded = digestFromObjectKey(key);
    if (bytes && embedded && objectDigest(bytes) !== embedded) throw new Error('OBJECT_INTEGRITY_FAILED');
    return bytes ?? null;
  }
  async readReceipt(receipt: Readonly<ObjectCustodyReceipt>, signal: AbortSignal): Promise<Uint8Array> {
    active(signal); validateObjectReceipt(receipt, this.destination);
    if (receipt.provider !== 'local' || receipt.versionId !== null) throw new Error('OBJECT_RECEIPT_INVALID');
    const expected = { ...receipt };
    const bytes = await this.get(expected.key, Math.max(1, expected.byteLength), signal);
    active(signal);
    if (!bytes || bytes.byteLength !== expected.byteLength || objectDigest(bytes) !== expected.contentDigest) throw new Error('OBJECT_INTEGRITY_FAILED');
    return bytes;
  }
}
