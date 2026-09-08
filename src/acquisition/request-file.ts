import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { rejectDuplicateJsonKeys } from '../data-os/json-keys';
import { SourceConnectorError } from './errors';

export const SOURCE_REQUEST_MAX_BYTES = 8 * 1024;
export const CENSUS_BUILD_REQUEST_MAX_BYTES = 32 * 1024;
export const SOURCE_REQUEST_FILE_ERRORS = {
  INVALID_SOURCE_REQUEST_FILE: 'Use a readable regular UTF-8 JSON request file no larger than 8 KiB, without duplicate keys.',
  INVALID_CENSUS_BUILD_REQUEST_FILE: 'Use a readable regular UTF-8 JSON build request file no larger than 32 KiB, without duplicate keys.',
} as const;

/** Bounded operator input, independent of the source CLI and its command stores. */
export function readBoundedSourceRequest(path: string, maximum = SOURCE_REQUEST_MAX_BYTES): unknown {
  const code = maximum === CENSUS_BUILD_REQUEST_MAX_BYTES ? 'INVALID_CENSUS_BUILD_REQUEST_FILE' : 'INVALID_SOURCE_REQUEST_FILE';
  const fault = () => new SourceConnectorError(code, SOURCE_REQUEST_FILE_ERRORS[code]);
  try {
    const descriptor = openSync(resolve(path), constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    let bytes: Buffer;
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile() || stat.size > maximum) throw fault();
      const buffer = Buffer.alloc(maximum + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      if (length > maximum) throw fault();
      bytes = buffer.subarray(0, length);
    } finally { closeSync(descriptor); }
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    rejectDuplicateJsonKeys(json, fault);
    return value;
  } catch { throw fault(); }
}
