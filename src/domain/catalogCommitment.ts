import { createHash } from 'node:crypto';

/** Pure bounded content addressing for catalogue documents; no rail/store imports. */
function canonical(value: unknown, depth = 0): string {
  if (depth > 20) throw new Error('CATALOG_JSON_TOO_DEEP');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, (entry) => canonical(entry, depth + 1)).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== 'string')) throw new Error('CATALOG_JSON_SYMBOL');
    return `{${(keys as string[]).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw new Error('CATALOG_JSON_PROPERTY');
      return `${JSON.stringify(key)}:${canonical(descriptor.value, depth + 1)}`;
    }).join(',')}}`;
  }
  throw new Error('CATALOG_JSON_INVALID');
}

export function catalogDigest(value: unknown): string {
  const bytes = Buffer.from(canonical(value), 'utf8');
  if (bytes.length > 16 * 1024 * 1024) throw new Error('CATALOG_JSON_TOO_LARGE');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** Required/optional property names are closed without interpreting the values. */
export function exactCatalogFields(value: unknown, required: readonly string[], optional: readonly string[] = []): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('CATALOG_OBJECT_REQUIRED');
  if (required.some((key) => !Object.hasOwn(value, key)) ||
      Reflect.ownKeys(value).some((key) => typeof key !== 'string' || (!required.includes(key) && !optional.includes(key)))) throw new Error('CATALOG_FIELDS_INVALID');
}
