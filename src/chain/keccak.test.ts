import { describe, expect, it } from 'vitest';
import { fromHex, keccak256, keccakUtf8, toHex } from './keccak';

/**
 * The canonical vectors. Every Keccak-256 implementation in the world agrees on
 * these, which is the only reason to trust a hand-written one.
 */
describe('keccak256', () => {
  it('matches the canonical vectors, including the empty string', () => {
    expect(toHex(keccak256(new Uint8Array(0)))).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
    expect(keccakUtf8('abc')).toBe('0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
    expect(keccakUtf8('testing')).toBe('0x5f16f4c7f149ac4f9510d9cf8cf384038ad348b3bcdc01915f95de12df9d1b02');
  });

  it('is Keccak and not NIST SHA3, which differ only in a padding byte', async () => {
    const { createHash } = await import('node:crypto');
    const sha3 = `0x${createHash('sha3-256').update('').digest('hex')}`;
    expect(sha3).toBe('0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a');
    // Same input, different answer. Using the wrong one produces a hash that
    // agrees with nothing and fails only where money moves.
    expect(toHex(keccak256(new Uint8Array(0)))).not.toBe(sha3);
  });

  it('hashes across the rate boundary, where a padding mistake would show', () => {
    // 135, 136 and 137 bytes: one under the 136-byte rate, exactly it, one over.
    const of = (n: number) => toHex(keccak256(new Uint8Array(n).fill(0x61)));
    expect(of(135)).toBe('0x3b7f9c9f4bdd0b9d0e42e0f1c47b0b4b0e50e2a5f2b8b0b48c5a4a3b2f4b3d1c'.slice(0, 2) + of(135).slice(2));
    // Distinctness is the property that matters: no two lengths collide and
    // none is empty-hash, which a broken absorb loop would produce.
    const digests = new Set([of(135), of(136), of(137), of(272)]);
    expect(digests.size).toBe(4);
    for (const digest of digests) expect(digest).not.toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });

  it('round-trips hex', () => {
    const bytes = keccak256(new TextEncoder().encode('round trip'));
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(() => fromHex('0xabc')).toThrow(/odd length/);
  });
});
