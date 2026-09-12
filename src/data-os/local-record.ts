/**
 * The local record encoding for Node callers: local-json.ts with the bytes
 * handed back as a Buffer, which is what the stores, contracts and CLIs
 * write and compare. Browser-reachable modules import local-json.ts
 * directly; this file is the only one of the two that names Buffer.
 */
import { DEFAULT_RECORD_BYTES, localRecordBytes } from './local-json';

export { exactFields, localJson, localRecordDigest } from './local-json';

export function encodeLocalRecord(value: unknown, maxBytes = DEFAULT_RECORD_BYTES): Buffer {
  return Buffer.from(localRecordBytes(value, maxBytes));
}
