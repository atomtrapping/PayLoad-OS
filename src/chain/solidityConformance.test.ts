import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeType } from './eip712';
import { CLOCK_CODE, POST_RELEASE_CODE, RECEIPT_TYPES, STANDING_CODE, VERDICT_CODE } from './adjudicationReceipt';

/**
 * The two sides of the bridge, checked against each other.
 *
 * There is no Solidity compiler in this environment, so the contract is
 * unbuilt and this suite does not pretend otherwise. What it does check is the
 * class of mismatch a compiler would never catch anyway: the type string, the
 * field order and the enum values are agreements between two languages, and if
 * they drift the signature verification fails silently on-chain — or worse,
 * two differently-wrong encodings agree and money moves on a meaning neither
 * side holds.
 */
const SOURCE = readFileSync('contracts/ConditionalCustodyEscrow.sol', 'utf8');

const solidityConstant = (name: string): number => {
  const match = new RegExp(`uint8 internal constant ${name} = (\\d+);`).exec(SOURCE);
  if (!match) throw new Error(`${name} is not declared in the contract`);
  return Number(match[1]);
};

describe('the contract and the receipt agree', () => {
  it('uses the identical EIP-712 type string on both sides', () => {
    const solidity = /bytes32 public constant RECEIPT_TYPEHASH = keccak256\(\s*"([^"]+)"/.exec(SOURCE)?.[1];
    expect(solidity).toBeDefined();
    expect(solidity).toBe(encodeType('AdjudicationReceipt', RECEIPT_TYPES));
  });

  it('uses the identical domain type string', () => {
    const solidity = /bytes32 private constant DOMAIN_TYPEHASH = keccak256\(\s*"([^"]+)"/.exec(SOURCE)?.[1];
    expect(solidity).toBe(encodeType('EIP712Domain', {
      EIP712Domain: [
        { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      ],
    }));
  });

  it('encodes the struct fields in the declared order, which abi.encode does not check', () => {
    const body = /function hashReceipt\(Receipt calldata r\)[\s\S]*?RECEIPT_TYPEHASH,([\s\S]*?)\)\);/.exec(SOURCE)?.[1];
    expect(body).toBeDefined();
    const encoded = [...body!.matchAll(/r\.(\w+)/g)].map((m) => m[1]);
    expect(encoded).toEqual(RECEIPT_TYPES.AdjudicationReceipt.map((f) => f.name));
  });

  it('agrees on every enum value, so a verdict cannot mean one thing here and another there', () => {
    expect(solidityConstant('VERDICT_NOT_ADJUDICABLE')).toBe(VERDICT_CODE.NOT_ADJUDICABLE);
    expect(solidityConstant('VERDICT_GRANTED')).toBe(VERDICT_CODE.GRANTED);
    expect(solidityConstant('VERDICT_WITHHELD')).toBe(VERDICT_CODE.WITHHELD);
    expect(solidityConstant('POST_STANDS')).toBe(POST_RELEASE_CODE.STANDS);
    expect(solidityConstant('POST_REVERSED_ON_CORRECTION')).toBe(POST_RELEASE_CODE.REVERSED_ON_CORRECTION);
    expect(solidityConstant('POST_UNSUPPORTED_BY_WITHDRAWAL')).toBe(POST_RELEASE_CODE.UNSUPPORTED_BY_WITHDRAWAL);
    expect(solidityConstant('POST_RESTATED_WITHOUT_REVERSAL')).toBe(POST_RELEASE_CODE.RESTATED_WITHOUT_REVERSAL);
    expect(solidityConstant('STANDING_DEMONSTRATION')).toBe(STANDING_CODE.DEMONSTRATION);
    expect(solidityConstant('STANDING_BINDING')).toBe(STANDING_CODE.BINDING);
    expect(solidityConstant('CLOCK_WHAT_WE_HELD')).toBe(CLOCK_CODE.WHAT_WE_HELD);
  });
});

describe('the contract refuses what the doctrine refuses', () => {
  const fn = (name: string): string => {
    const start = SOURCE.indexOf(`function ${name}(`);
    expect(start, `${name} is not in the contract`).toBeGreaterThan(-1);
    // Crude but sufficient: to the next top-level function declaration.
    const rest = SOURCE.slice(start + 1);
    const next = rest.indexOf('\n    function ');
    return next === -1 ? rest : rest.slice(0, next);
  };

  it('executes only on a BINDING receipt, so the admission gate reaches the chain', () => {
    expect(fn('releasePrimary')).toContain('r.standing != STANDING_BINDING');
    expect(fn('_checkPostReleaseReceipt')).toContain('r.standing != STANDING_BINDING');
  });

  it('accepts only the corpus knowledge clock, refusing the question this system cannot bound', () => {
    expect(fn('releasePrimary')).toContain('r.clockProvenance != CLOCK_WHAT_WE_HELD');
    expect(fn('_checkPostReleaseReceipt')).toContain('r.clockProvenance != CLOCK_WHAT_WE_HELD');
  });

  it('moves no money on a withdrawal, because nothing contrary has been established', () => {
    const freeze = fn('freezeOnWithdrawal');
    expect(freeze).toContain('POST_UNSUPPORTED_BY_WITHDRAWAL');
    // The whole point: this path has no transfer in it, and extends instead.
    expect(freeze).not.toContain('vault.transfer');
    expect(freeze).toContain('e.expiry = block.timestamp + e.windowSeconds');
    // And the diverting path is reachable only by an actual contrary finding.
    expect(fn('divertOnCorrection')).toContain('r.postRelease != POST_REVERSED_ON_CORRECTION');
  });

  it('binds only on a proven adjudication, so the venue is a terminus and never an entry point', () => {
    expect(fn('releasePrimary')).toContain('r.proofDigest == bytes32(0)');
    expect(fn('_checkPostReleaseReceipt')).toContain('r.proofDigest == bytes32(0)');
    expect(SOURCE).toContain('error Unproven()');
  });

  it('checks post-release receipts against stored terms rather than calldata', () => {
    const check = fn('_checkPostReleaseReceipt');
    expect(check).toContain('r.exposureWindowSeconds != e.windowSeconds');
    expect(check).toContain('keccak256(bytes(r.conditionId)) != e.conditionHash');
    expect(check).toContain('r.nonce != e.nextNonce');
  });

  it('requires a threshold of distinct signers and consumes evidence once', () => {
    const verify = fn('_verify');
    expect(verify).toContain('signatures.length < threshold');
    expect(verify).toContain('signer <= previous');
    expect(verify).toContain('evidenceUsed[r.evidenceDigest]');
    // Malleability: the high-s half is rejected so one authorisation is one signature.
    expect(fn('_recover')).toContain('0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0');
  });

  it('never claims a yield it did not generate: shares are held, and assets are asked of the vault', () => {
    expect(SOURCE).toContain('uint256 sharesHeld');
    expect(SOURCE).toContain('vault.convertToAssets');
    // No arithmetic invents a rate; there is no APY, no rate and no accrual term.
    expect(/\b(apy|interestRate|accrue|ratePerSecond)\b/i.test(SOURCE)).toBe(false);
  });

  it('models the third route state, so a route that never closes is not a deposit locked forever', () => {
    expect(SOURCE).toContain('UNCLOSED }');
    const reclaim = fn('reclaimUnclosed');
    expect(reclaim).toContain('block.timestamp < e.closingDeadline');
    expect(reclaim).toContain('msg.sender != e.depositor');
    expect(reclaim).toContain('e.state = State.UNCLOSED');
    expect(reclaim).toContain('vault.transfer(e.depositor');
    // A deadline is mandatory, because a route without one has no way out.
    expect(fn('deposit')).toContain('closingDeadline > block.timestamp');
  });

  it('requires both parties before a closing can fire, so the proof persuades rather than compels', () => {
    expect(fn('accept')).toContain('msg.sender != e.beneficiary');
    const release = fn('releasePrimary');
    expect(release).toContain('!e.counterpartyAccepted');
    expect(release).toContain('block.timestamp >= e.closingDeadline');
  });
});
