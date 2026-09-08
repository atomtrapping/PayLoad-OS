import { rejectDuplicateJsonKeys } from '@/data-os/json-keys';

/** Strict UTF-8 JSON with duplicate object keys rejected, including escaped equivalents. */
export function parseReplayJson(bytes: Uint8Array, maximum: number): unknown {
  if (!bytes.byteLength || bytes.byteLength > maximum) throw new Error('REPLAY_JSON_SIZE');
  const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value: unknown = JSON.parse(json);
  rejectDuplicateJsonKeys(json, () => new Error('REPLAY_DUPLICATE_JSON_KEY'));
  return value;
}
