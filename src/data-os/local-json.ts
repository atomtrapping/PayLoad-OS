/**
 * The local record encoding and its digest, with nothing from Node in it.
 *
 * local-record.ts is imported by sixty server modules (stores, contracts,
 * CLIs, routes) and hands them a Buffer. It was also imported by the spatial
 * contracts, which the spatial inquiry renders in the browser, so the whole
 * of crypto-browserify and Buffer (428 KB) rode into that route for one
 * exact-field check and one digest. This is the part of local-record.ts that
 * the browser may hold: the encoding, the field check, the bytes as a
 * Uint8Array and the digest over them, byte for byte what local-record.ts
 * produces, which re-exports these and adds only the Buffer wrapper.
 */
import { sha256Hex } from '../lib/sha256';
import { requireRecord } from './validation';

export const DEFAULT_RECORD_BYTES = 64 * 1024;

export function exactFields(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  requireRecord(value, 'record');
  const record = value as Record<string, unknown>;
  if (required.some((key) => !Object.hasOwn(record, key)) || Object.keys(record).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error(`Expected only these fields: ${[...required, ...optional].join(', ')}.`);
  }
}

// Preserve the existing local acquisition encoding byte-for-byte. This is a
// versioned local JSON encoding, not the Kernel canonical object grammar.
export function localJson(value: unknown, depth = 0): string {
  if (depth > 20) throw new Error('Intake metadata is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => localJson(entry, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${localJson((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`;
  }
  throw new Error('Intake metadata must contain plain, finite JSON values.');
}

/** The UTF-8 bytes of the encoding, refused past the byte limit with the same words as before. */
export function localRecordBytes(value: unknown, maxBytes = DEFAULT_RECORD_BYTES): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer.');
  const bytes = new TextEncoder().encode(localJson(value));
  if (bytes.length > maxBytes) {
    throw new Error(maxBytes === DEFAULT_RECORD_BYTES ? 'Intake metadata exceeds 64 KiB.' : `Local metadata exceeds ${maxBytes} bytes.`);
  }
  return bytes;
}

export function localRecordDigest(value: unknown, maxBytes = DEFAULT_RECORD_BYTES): string {
  return `sha256:${sha256Hex(localRecordBytes(value, maxBytes))}`;
}
