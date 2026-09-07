import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { currentRelease } from '@/domain/corpus';
import { evaluateRelease, exposureAfter, scalar, type ReleaseCondition } from '@/domain/collateralVehicle';
import {
  CARD_FUNCTIONS, CLOCK_CODE, ZERO_DIGEST, POST_RELEASE_CODE, RECEIPT_TYPES, ReceiptRefusal, STANDING_CODE, VERDICT_CODE,
  buildReceipt, evidenceDigestOf,
} from './adjudicationReceipt';

const corpus = CARAVAN_CORPUS;
const release = currentRelease(corpus);
const DOMAIN = { name: 'NotationsOS.Adjudication', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' };
const TIGHT: ReleaseCondition = {
  conditionId: 'COND-GROSS-40-05',
  agreedText: 'Release on confirmation that the gross quantity of lot 5B-221 does not exceed 40.05 t.',
  root: scalar('LOT-5B-221', 'quantity.gross', 'AT_MOST', 40.05, 'Gross quantity not to exceed 40.05 t.'),
};
const TRADE = `0x${'11'.repeat(32)}`;
const WINDOW = 18 * 86_400;

describe('the adjudication receipt', () => {
  it('carries the admission standing across the seam, so a contract can refuse a fixture itself', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const { receipt } = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0 });
    // Every decision over this corpus is a demonstration, so every receipt
    // buildable today is one a correct contract rejects. That is the honest state.
    expect(receipt.standing).toBe(STANDING_CODE.DEMONSTRATION);
    expect(receipt.standing).not.toBe(STANDING_CODE.BINDING);
    expect(receipt.verdict).toBe(VERDICT_CODE.GRANTED);
  });

  it('crosses the seam with the terminal state rather than a boolean, so a withdrawal cannot route as a correction', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const reversed = exposureAfter(corpus, release, decision, '2026-09-01T12:00:00Z');
    const { receipt } = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0, exposure: reversed });
    expect(reversed.state).toBe('REVERSED_ON_CORRECTION');
    expect(receipt.postRelease).toBe(POST_RELEASE_CODE.REVERSED_ON_CORRECTION);
    // The four codes are distinct, which is the whole point of not sending a flag.
    expect(new Set(Object.values(POST_RELEASE_CODE)).size).toBe(4);
    expect(POST_RELEASE_CODE.UNSUPPORTED_BY_WITHDRAWAL).not.toBe(POST_RELEASE_CODE.REVERSED_ON_CORRECTION);
  });

  it('names which as-of question its clock answers', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const { receipt } = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0 });
    expect(receipt.clockProvenance).toBe(CLOCK_CODE.WHAT_WE_HELD);
    expect(receipt.decidedAtKnowledge).toBe(Math.floor(Date.parse('2026-08-20T00:00:00Z') / 1000));
  });

  it('carries the measured basis beside the declared window, so a signed number is not read as an estimated one', () => {
    const early = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const late = evaluateRelease(corpus, release, TIGHT, '2026-09-01T12:00:00Z');
    const a = buildReceipt(corpus, early, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0 });
    const b = buildReceipt(corpus, late, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 1 });
    // The declared window is the same policy number in both; the observed basis is not.
    expect(a.receipt.exposureWindowSeconds).toBe(WINDOW);
    expect(a.receipt.observedLongestLagSeconds).toBe(0);
    expect(b.receipt.observedLongestLagSeconds).toBeGreaterThan(0);
    expect(a.loss.some((l) => l.includes('not evidence that none was coming'))).toBe(true);
  });

  it('commits to the evidence rather than to the answer, and changes when the evidence does', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const other = evaluateRelease(corpus, release, { ...TIGHT, conditionId: 'COND-OTHER' }, '2026-08-20T00:00:00Z');
    expect(evidenceDigestOf(decision)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(evidenceDigestOf(decision)).not.toBe(evidenceDigestOf(other));
    // Deterministic: the same decision digests the same way every time.
    expect(evidenceDigestOf(decision)).toBe(evidenceDigestOf(evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z')));
  });

  it('binds the digest to the verifying contract and to the nonce', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const base = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0 });
    const elsewhere = buildReceipt(corpus, decision, { tradeId: TRADE, domain: { ...DOMAIN, verifyingContract: '0x0000000000000000000000000000000000000002' }, exposureWindowSeconds: WINDOW, nonce: 0 });
    const replayed = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 1 });
    expect(base.digest).toMatch(/^0x[0-9a-f]{64}$/);
    expect(base.digest).not.toBe(elsewhere.digest);
    expect(base.digest).not.toBe(replayed.digest);
  });

  it('refuses to emit a receipt whose fields would mislead a contract', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    expect(() => buildReceipt(corpus, decision, { tradeId: TRADE, domain: { ...DOMAIN, verifyingContract: undefined }, exposureWindowSeconds: WINDOW, nonce: 0 }))
      .toThrow(ReceiptRefusal);
    expect(() => buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: 0, nonce: 0 }))
      .toThrow(/window must be positive/);
    const foreign = exposureAfter(corpus, release, evaluateRelease(corpus, release, { ...TIGHT, conditionId: 'X' }, '2026-08-20T00:00:00Z'), '2026-09-01T12:00:00Z');
    expect(() => buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0, exposure: foreign }))
      .toThrow(/different decision/);
  });

  it('keeps the wire type in step with the fields it encodes', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const { receipt } = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0 });
    expect(RECEIPT_TYPES.AdjudicationReceipt.map((f) => f.name).sort()).toEqual(Object.keys(receipt).sort());
  });

  it('carries a zero proof today, which is what a correct contract refuses to bind on', () => {
    const decision = evaluateRelease(corpus, release, TIGHT, '2026-08-20T00:00:00Z');
    const unproven = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0 });
    expect(unproven.receipt.proofDigest).toBe(ZERO_DIGEST);
    expect(unproven.loss.some((l) => l.includes('terminus of a verification chain'))).toBe(true);

    // A proof changes the digest, so the signature covers whether one existed.
    const proven = buildReceipt(corpus, decision, { tradeId: TRADE, domain: DOMAIN, exposureWindowSeconds: WINDOW, nonce: 0, proofDigest: `0x${'ab'.repeat(32)}` });
    expect(proven.receipt.proofDigest).not.toBe(ZERO_DIGEST);
    expect(proven.digest).not.toBe(unproven.digest);
  });

  it('keeps the card\u2019s two functions apart, and points the archival one elsewhere', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync(CARD_FUNCTIONS.asRecord.gradedIn)).toBe(true);
    expect(CARD_FUNCTIONS.asRecord.question).toContain('does not exist yet');
    expect(CARD_FUNCTIONS.asAuthorisation.question).toContain('without re-deriving');
    // The authorisation conditions are the refusals this module actually enforces.
    for (const term of ['BINDING', 'non-zero proof', 'stored terms', 'distinct signers', 'spent once']) {
      expect(CARD_FUNCTIONS.asAuthorisation.gradedHere).toContain(term);
    }
    expect(CARD_FUNCTIONS.theRisk).toContain('invents a default');
  });
});
