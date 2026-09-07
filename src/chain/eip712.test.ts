import { describe, expect, it } from 'vitest';
import { toHex } from './keccak';
import { domainSeparator, encodeType, hashStruct, typedDataDigest, type TypedTypes } from './eip712';

/**
 * The canonical example from EIP-712 itself. The spec publishes the three
 * intermediate values, which is what makes a hand-written encoder checkable
 * rather than merely self-consistent.
 */
const DOMAIN = { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' };
const TYPES: TypedTypes = {
  Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }],
  Mail: [{ name: 'from', type: 'Person' }, { name: 'to', type: 'Person' }, { name: 'contents', type: 'string' }],
};
const MAIL = {
  from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
  to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
  contents: 'Hello, Bob!',
};

describe('EIP-712 typed data', () => {
  it('encodes the type with dependencies sorted, as the spec requires', () => {
    expect(encodeType('Mail', TYPES)).toBe('Mail(Person from,Person to,string contents)Person(string name,address wallet)');
  });

  it('reproduces all three published values of the canonical example', () => {
    expect(toHex(domainSeparator(DOMAIN))).toBe('0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f');
    expect(toHex(hashStruct('Mail', MAIL, TYPES))).toBe('0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e');
    expect(typedDataDigest(DOMAIN, 'Mail', TYPES, MAIL)).toBe('0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2');
  });

  it('binds the digest to the verifying contract, so a receipt cannot be replayed at another address', () => {
    const elsewhere = typedDataDigest({ ...DOMAIN, verifyingContract: '0x0000000000000000000000000000000000000001' }, 'Mail', TYPES, MAIL);
    expect(elsewhere).not.toBe(typedDataDigest(DOMAIN, 'Mail', TYPES, MAIL));
  });

  it('refuses an encoding it does not know rather than guessing one', () => {
    expect(() => typedDataDigest(DOMAIN, 'X', { X: [{ name: 'a', type: 'fixed128x18' }] }, { a: 1 })).toThrow(/unsupported EIP-712 type/);
    expect(() => typedDataDigest(DOMAIN, 'X', { X: [{ name: 'a', type: 'address' }] }, { a: '0x00' })).toThrow(/20 bytes/);
    expect(() => typedDataDigest(DOMAIN, 'X', { X: [{ name: 'a', type: 'bytes32' }] }, { a: '0xdeadbeef' })).toThrow(/expects 32 bytes/);
  });
});
