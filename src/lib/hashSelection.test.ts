import { describe, expect, it } from 'vitest';
import { formatHash, readHash, readHashValue } from './hashSelection';

const read = (hash: string) => Object.fromEntries(readHash(hash));

describe('what a hash carries', () => {
  it('reads pairs with or without the leading hash', () => {
    expect(read('#notation=n-1')).toEqual({ notation: 'n-1' });
    expect(read('notation=n-1')).toEqual({ notation: 'n-1' });
    expect(read('#notation=n-1&relation=r-2')).toEqual({ notation: 'n-1', relation: 'r-2' });
  });

  it('carries a value through characters that mean something in a URL', () => {
    // Record ids in this corpus carry colons and dots, and nothing stops one
    // carrying an ampersand. A codec that split first and decoded never would
    // return half an id and call it an id.
    for (const id of ['a&b', 'a=b', 'a b', 'notation://claim/x', 'REL-CAR-2026.09.01', '100%']) {
      const hash = formatHash({ k: id });
      expect(readHashValue(hash, id === 'k' ? 'x' : 'k'), id).toBe(id);
    }
  });

  it('takes the first of a repeated key, so one link is one thing to two readers', () => {
    expect(readHashValue('#k=first&k=second', 'k')).toBe('first');
  });

  it('reads a key with no value as nothing selected rather than as the empty string', () => {
    // `#notation=` selects nothing while looking like it selects something.
    expect(readHashValue('#notation=', 'notation')).toBeNull();
    expect(read('#notation=&relation=r-2')).toEqual({ relation: 'r-2' });
  });

  it('is total on anything a URL bar can contain', () => {
    for (const junk of ['', '#', '#&&', '#=x', '#novalue', '#%zz=1', '#k=%zz', '#&k=v&']) {
      expect(() => readHash(junk), junk).not.toThrow();
    }
    // A bad escape is text, not an exception, and simply matches nothing.
    expect(readHashValue('#k=%zz', 'k')).toBe('%zz');
    expect(read('#=x')).toEqual({});
    expect(read('#novalue')).toEqual({});
  });
});

describe('what a hash is written as', () => {
  it('writes the keys in the order given, so two links to one thing are one string', () => {
    expect(formatHash({ notation: 'n-1', relation: 'r-2' })).toBe('notation=n-1&relation=r-2');
  });

  it('writes nothing for absent, null and empty, which are the same thing here', () => {
    expect(formatHash({ notation: null, relation: undefined, other: '' })).toBe('');
    expect(formatHash({ notation: 'n-1', relation: null })).toBe('notation=n-1');
  });

  it('round-trips whatever it wrote', () => {
    const selection = { notation: 'notation://entity/lot?x=1', relation: 'r&2' };
    expect(read(formatHash(selection))).toEqual(selection);
  });
});
