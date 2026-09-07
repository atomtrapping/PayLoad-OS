/**
 * EIP-712 typed-data hashing, enough of it to build a receipt a contract can
 * check and no more.
 *
 * The digest produced here is the value an EVM verifier recovers a signature
 * against. If it is wrong by a byte the signature check fails, the release does
 * not execute, and nothing says why — or worse, a differently-wrong encoding
 * agrees with a differently-wrong verifier and the pair moves money on a
 * meaning neither side holds. So this is checked against the canonical example
 * from the EIP itself, whose three intermediate values are published: the
 * domain separator, the struct hash and the final digest.
 *
 * Supported: string, bytes, address, bool, bytesN, uintN/intN, nested structs
 * and arrays of those. Not supported: anything else, which throws rather than
 * guessing an encoding.
 */
import { fromHex, keccak256, toHex } from './keccak';

export type TypedField = { name: string; type: string };
export type TypedTypes = Record<string, readonly TypedField[]>;

export interface TypedDomain {
  name?: string;
  version?: string;
  chainId?: number | bigint;
  verifyingContract?: string;
  salt?: string;
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};

const word = (value: bigint): Uint8Array => {
  if (value < 0n) value = (1n << 256n) + value;
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i -= 1) { out[i] = Number(value & 0xffn); value >>= 8n; }
  return out;
};

const isStruct = (type: string, types: TypedTypes): boolean => Object.hasOwn(types, type);
const arrayElement = (type: string): string | null => (type.endsWith(']') ? type.slice(0, type.lastIndexOf('[')) : null);

/** Every struct type the primary type reaches, sorted, as the EIP requires. */
function dependencies(primary: string, types: TypedTypes, found = new Set<string>()): string[] {
  if (found.has(primary) || !isStruct(primary, types)) return [...found];
  found.add(primary);
  for (const field of types[primary]) {
    const base = arrayElement(field.type) ?? field.type;
    if (isStruct(base, types)) dependencies(base, types, found);
  }
  return [...found];
}

export function encodeType(primary: string, types: TypedTypes): string {
  const deps = dependencies(primary, types).filter((t) => t !== primary).sort();
  return [primary, ...deps].map((name) => `${name}(${types[name].map((f) => `${f.type} ${f.name}`).join(',')})`).join('');
}

export const typeHash = (primary: string, types: TypedTypes): Uint8Array =>
  keccak256(new TextEncoder().encode(encodeType(primary, types)));

function encodeValue(type: string, value: unknown, types: TypedTypes): Uint8Array {
  const element = arrayElement(type);
  if (element !== null) {
    if (!Array.isArray(value)) throw new Error(`${type} expects an array`);
    return keccak256(concat(value.map((item) => encodeValue(element, item, types))));
  }
  if (isStruct(type, types)) return hashStruct(type, value as Record<string, unknown>, types);
  if (type === 'string') return keccak256(new TextEncoder().encode(String(value)));
  if (type === 'bytes') return keccak256(typeof value === 'string' ? fromHex(value) : (value as Uint8Array));
  if (type === 'address') {
    const bytes = fromHex(String(value));
    if (bytes.length !== 20) throw new Error('address must be 20 bytes');
    const out = new Uint8Array(32);
    out.set(bytes, 12);
    return out;
  }
  if (type === 'bool') return word(value ? 1n : 0n);
  if (/^bytes(\d+)$/.test(type)) {
    const bytes = fromHex(String(value));
    const size = Number(/^bytes(\d+)$/.exec(type)![1]);
    if (bytes.length !== size) throw new Error(`${type} expects ${size} bytes, got ${bytes.length}`);
    const out = new Uint8Array(32);
    out.set(bytes, 0);
    return out;
  }
  if (/^u?int\d*$/.test(type)) return word(BigInt(value as string | number | bigint));
  throw new Error(`unsupported EIP-712 type: ${type}`);
}

export function hashStruct(primary: string, data: Record<string, unknown>, types: TypedTypes): Uint8Array {
  const fields = types[primary];
  if (!fields) throw new Error(`unknown struct type: ${primary}`);
  return keccak256(concat([typeHash(primary, types), ...fields.map((f) => encodeValue(f.type, data[f.name], types))]));
}

const DOMAIN_FIELDS: readonly TypedField[] = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
];

export function domainSeparator(domain: TypedDomain): Uint8Array {
  const present = DOMAIN_FIELDS.filter((f) => domain[f.name as keyof TypedDomain] !== undefined);
  return hashStruct('EIP712Domain', domain as unknown as Record<string, unknown>, { EIP712Domain: present });
}

/** The 32 bytes a verifier recovers the signature against: 0x1901 ‖ domainSeparator ‖ hashStruct. */
export function typedDataDigest(domain: TypedDomain, primary: string, types: TypedTypes, data: Record<string, unknown>): string {
  return toHex(keccak256(concat([new Uint8Array([0x19, 0x01]), domainSeparator(domain), hashStruct(primary, data, types)])));
}
