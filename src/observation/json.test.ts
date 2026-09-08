import { describe, expect, it } from 'vitest';
import { parseReplayJson } from './json';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('replay JSON boundary over the shared key scanner', () => {
  it('preserves omission, null, zero and independent object key scopes', () => {
    expect(parseReplayJson(bytes('[{"x":null},{"x":0},{}]'), 100)).toEqual([{ x: null }, { x: 0 }, {}]);
  });

  it.each(['{"x":1,"x":2}', '{"nested":{"x":1,"\\u0078":2}}'])('rejects duplicate decoded keys: %s', (text) => {
    expect(() => parseReplayJson(bytes(text), 100)).toThrow('REPLAY_DUPLICATE_JSON_KEY');
  });

  it('keeps fatal UTF-8, BOM, JSON syntax and byte-size policies at the replay boundary', () => {
    expect(() => parseReplayJson(new Uint8Array([0xff]), 100)).toThrow();
    expect(() => parseReplayJson(bytes('\uFEFF{}'), 100)).toThrow(SyntaxError);
    expect(() => parseReplayJson(bytes('{'), 100)).toThrow(SyntaxError);
    expect(() => parseReplayJson(bytes(''), 100)).toThrow('REPLAY_JSON_SIZE');
    expect(() => parseReplayJson(bytes('{}'), 1)).toThrow('REPLAY_JSON_SIZE');
    expect(parseReplayJson(bytes('{}'), 2)).toEqual({});
  });
});
