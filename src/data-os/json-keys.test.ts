import { describe, expect, it, vi } from 'vitest';
import { rejectDuplicateJsonKeys } from './json-keys';

function scan(json: string, duplicate: () => Error) {
  JSON.parse(json); // Required precondition; syntax/encoding remain the caller's responsibility.
  rejectDuplicateJsonKeys(json, duplicate);
}

describe('shared duplicate-key scan without changing a caller codec', () => {
  it.each([
    'null', '0', '"a string, with {braces}"', '[]', '{}',
    '{"a":null,"b":0,"c":false}',
    '[{"id":1},{"id":2}]', '{"id":1,"nested":{"id":2}}',
    '{"a":"quoted \\"punctuation{,}\\"","b":"escaped \\\\ backslash"}',
    '{"\\u0061":1,"b":[{"x":"y"},{"x":"z"}]}',
    '{"__proto__":1,"constructor":2,"toString":3}',
    '{"é":1,"é":2}', // No Unicode normalization of source keys.
  ])('accepts independently scoped keys and quoted punctuation: %s', (json) => {
    const duplicate = vi.fn(() => new Error('caller-specific'));
    expect(() => scan(json, duplicate)).not.toThrow();
    expect(duplicate).not.toHaveBeenCalled();
  });

  it.each([
    '{"id":1,"id":2}', '{"id":1,"\\u0069d":2}',
    '{"parent":{"id":1,"id":2}}', '[{"id":1,"id":2}]',
    '{"a":[0,1,{"x":null,"x":false}]}',
    '{"__proto__":1,"__proto__":2}', '{"":0,"":1}',
    '{"\\uD83D\\uDE80":1,"🚀":2}',
  ])('rejects decoded duplicates with the caller error unchanged: %s', (json) => {
    const error = new Error('caller-specific');
    const duplicate = vi.fn(() => error);
    expect(() => scan(json, duplicate)).toThrow(error);
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it('walks deeply nested valid JSON iteratively', () => {
    const json = '['.repeat(2048) + '{"id":1,"id":2}' + ']'.repeat(2048);
    expect(() => scan(json, () => new Error('duplicate'))).toThrow('duplicate');
  });
});
