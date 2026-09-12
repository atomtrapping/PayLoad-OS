import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, utf8Bytes } from './sha256';

const native = (input: string | Uint8Array) => createHash('sha256').update(input).digest('hex');

describe('sha256Hex', () => {
  it('matches the published vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu')).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
  });

  it('agrees with node:crypto at every length across the block and padding boundaries', () => {
    for (let length = 0; length <= 200; length += 1) {
      const bytes = randomBytes(length);
      expect(sha256Hex(new Uint8Array(bytes)), `length ${length}`).toBe(native(bytes));
    }
    for (const length of [1000, 4095, 4096, 4097, 65535, 65536, 65537, 1 << 20]) {
      const bytes = randomBytes(length);
      expect(sha256Hex(new Uint8Array(bytes)), `length ${length}`).toBe(native(bytes));
    }
  });

  it('takes a string as its UTF-8 bytes, astral and combining characters included', () => {
    for (const text of ['é', 'naïve façade', '😀 astral', ' private use', 'ﬁ ligature', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(119)]) {
      expect(sha256Hex(text)).toBe(native(text));
      expect(sha256Hex(utf8Bytes(text))).toBe(native(Buffer.from(text, 'utf8')));
    }
  });

  it('hashes a subarray as the bytes in view, not the whole buffer beneath it', () => {
    const whole = new Uint8Array(randomBytes(300));
    const view = whole.subarray(100, 200);
    expect(sha256Hex(view)).toBe(native(Buffer.from(whole.slice(100, 200))));
  });
});
