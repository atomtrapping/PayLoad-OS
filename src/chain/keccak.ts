/**
 * Keccak-256, self-contained.
 *
 * This is the hash an EVM verifier computes, and it is not SHA3-256: the two
 * differ only in the padding byte (0x01 here, 0x06 for NIST SHA3), which is
 * exactly the kind of difference that produces a working implementation that
 * agrees with nothing. Node's crypto offers sha3-256 and not this one.
 *
 * Written here rather than taken from a package on purpose. A receipt digest is
 * the value a contract checks a signature against, so a wrong hash does not
 * fail loudly — it moves money to the wrong place or refuses to move it at all,
 * forever, on an immutable ledger. That is the one path in this repository
 * where a transitive dependency is worth more scrutiny than a hundred lines,
 * and where the arithmetic being reproducible from the source rather than from
 * a lockfile is the point.
 *
 * Correctness is not asserted here. keccak.test.ts checks it against the
 * canonical vectors, including the empty string, which is the value every other
 * implementation in the world agrees on.
 */

const ROUND_CONSTANTS: readonly bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rho offsets, indexed by lane = x + 5y. */
const ROTATIONS: readonly number[] = [
  0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];

const MASK64 = (1n << 64n) - 1n;
const rotl = (value: bigint, by: number): bigint =>
  by === 0 ? value : ((value << BigInt(by)) | (value >> BigInt(64 - by))) & MASK64;

/** Keccak-f[1600] on 25 lanes, in place. */
function permute(lanes: bigint[]): void {
  for (const rc of ROUND_CONSTANTS) {
    // theta
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x += 1) c[x] = lanes[x] ^ lanes[x + 5] ^ lanes[x + 10] ^ lanes[x + 15] ^ lanes[x + 20];
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) lanes[x + 5 * y] ^= d;
    }
    // rho and pi
    const b = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(lanes[x + 5 * y], ROTATIONS[x + 5 * y]);
      }
    }
    // chi
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        lanes[x + 5 * y] = b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y] & MASK64) & b[((x + 2) % 5) + 5 * y]);
      }
    }
    // iota
    lanes[0] ^= rc;
  }
}

const RATE_BYTES = 136;

/** Keccak-256 of the given bytes. */
export function keccak256(input: Uint8Array): Uint8Array {
  // Pad: 0x01 ... 0x80, the original Keccak padding rather than SHA3's 0x06.
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE_BYTES) * RATE_BYTES);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const lanes = new Array<bigint>(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE_BYTES) {
    for (let lane = 0; lane < RATE_BYTES / 8; lane += 1) {
      let value = 0n;
      for (let byte = 7; byte >= 0; byte -= 1) value = (value << 8n) | BigInt(padded[offset + lane * 8 + byte]);
      lanes[lane] ^= value;
    }
    permute(lanes);
  }

  const out = new Uint8Array(32);
  for (let lane = 0; lane < 4; lane += 1) {
    let value = lanes[lane];
    for (let byte = 0; byte < 8; byte += 1) {
      out[lane * 8 + byte] = Number(value & 0xffn);
      value >>= 8n;
    }
  }
  return out;
}

export const toHex = (bytes: Uint8Array): string => `0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('hex string has an odd length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Keccak-256 of a UTF-8 string, as 0x-prefixed hex. This is Solidity's keccak256(bytes(s)). */
export const keccakUtf8 = (text: string): string => toHex(keccak256(new TextEncoder().encode(text)));
