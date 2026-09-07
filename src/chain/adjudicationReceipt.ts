/**
 * The receipt a settlement contract verifies, built from a real ruling.
 *
 * This is the seam. On one side a ReleaseDecision, which knows what evidence it
 * stood on, which clock bounded it, and whether the corpus that produced it had
 * ever restated anything. On the other side a contract that will do exactly
 * what the signed bytes say, forever, with no sense of doubt. Everything the
 * decision knows that the contract would otherwise have to assume is carried
 * across explicitly, because a field the receipt omits is a field the contract
 * invents a default for.
 *
 * Four things are carried that a conventional oracle receipt does not have, and
 * each of them exists because leaving it out is a specific failure:
 *
 * `standing` — DEMONSTRATION or BINDING. The admission gate is enforced in the
 * repository, which is worth nothing to a contract that cannot see it. It rides
 * on the receipt so the contract can refuse a fixture-fed release itself rather
 * than trusting that nobody upstream made a mistake. Every decision over the
 * committed corpus is DEMONSTRATION, so every receipt buildable today is one a
 * correct contract rejects, which is the honest state of this system.
 *
 * `postRelease` — the terminal state, not a boolean. A withdrawal removes
 * support and a correction supplies a contrary finding, and a contract handed
 * one flag for both will route money the same way for each. That is the
 * general-oracle failure committed at the last mile, so the four states cross
 * the seam separately and the contract branches on them separately.
 *
 * `clockProvenance` — which as-of question the knowledge time answers. Two
 * clocks that mean different things and arrive as the same uint256 is the
 * conflation the corpus refuses at the type level, re-imported by a wire format
 * that flattened it.
 *
 * `observedLongestLagSeconds` alongside the declared `exposureWindowSeconds` —
 * the chain enforces whatever window is signed and cannot tell whether it is
 * right. Carrying the measured basis beside the declared parameter means a
 * reader can see that the window rests on a corpus that has observed almost
 * nothing, rather than inferring that a signed number is an estimated one.
 */
import { canonicalJson } from '@/fixtures/digest';
import { keccak256, toHex } from './keccak';
import { typedDataDigest, type TypedDomain, type TypedTypes } from './eip712';
import type { DecisionStanding, PostReleaseState, ReleaseDecision, ReleaseExposure, ReleaseVerdict } from '@/domain/collateralVehicle';
import { restatementExposure } from '@/domain/collateralVehicle';
import type { Corpus } from '@/domain/corpus';

export const RECEIPT_METHOD = 'notationsos.adjudication-receipt.v1';

/* ── Closed vocabularies, encoded as the contract sees them ── */

export const VERDICT_CODE: Record<ReleaseVerdict, number> = { NOT_ADJUDICABLE: 0, GRANTED: 1, WITHHELD: 2 };
export const POST_RELEASE_CODE: Record<PostReleaseState, number> = {
  STANDS: 0, REVERSED_ON_CORRECTION: 1, UNSUPPORTED_BY_WITHDRAWAL: 2, RESTATED_WITHOUT_REVERSAL: 3,
};
export const STANDING_CODE: Record<DecisionStanding, number> = { DEMONSTRATION: 0, BINDING: 1 };
/** Only one is answerable over this corpus; the other exists so the receipt cannot imply it. */
export const CLOCK_CODE = { WHAT_WE_HELD: 0, WHAT_THE_SOURCE_KNEW: 1 } as const;

export const RECEIPT_TYPES: TypedTypes = {
  AdjudicationReceipt: [
    { name: 'tradeId', type: 'bytes32' },
    { name: 'conditionId', type: 'string' },
    { name: 'verdict', type: 'uint8' },
    { name: 'postRelease', type: 'uint8' },
    { name: 'standing', type: 'uint8' },
    { name: 'clockProvenance', type: 'uint8' },
    { name: 'validAt', type: 'uint256' },
    { name: 'decidedAtKnowledge', type: 'uint256' },
    { name: 'exposureWindowSeconds', type: 'uint256' },
    { name: 'observedLongestLagSeconds', type: 'uint256' },
    { name: 'evidenceDigest', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
  ],
};

export interface AdjudicationReceipt {
  tradeId: string;
  conditionId: string;
  verdict: number;
  postRelease: number;
  standing: number;
  clockProvenance: number;
  validAt: number;
  decidedAtKnowledge: number;
  exposureWindowSeconds: number;
  observedLongestLagSeconds: number;
  evidenceDigest: string;
  nonce: number;
}

export interface ReceiptBundle {
  receipt: AdjudicationReceipt;
  /** The 32 bytes a verifier recovers a signature against. Nothing here signs. */
  digest: string;
  domain: TypedDomain;
  /** What a reader must not take the receipt for. */
  loss: readonly string[];
}

const seconds = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

/**
 * The evidence digest: a commitment to exactly the records the decision stood
 * on and the terms it was decided under. Not a hash of the answer — a hash of
 * what would have to be reproduced to check it.
 */
export function evidenceDigestOf(decision: ReleaseDecision): string {
  return toHex(keccak256(new TextEncoder().encode(canonicalJson({
    method: RECEIPT_METHOD,
    releaseId: decision.releaseId,
    condition: decision.condition,
    decidedAtKnowledge: decision.decidedAtKnowledge,
    reliedOn: [...decision.reliedOn].sort(),
    verdict: decision.verdict,
  }))));
}

export class ReceiptRefusal extends Error {}

export interface ReceiptRequest {
  tradeId: string;
  domain: TypedDomain;
  /** Declared by the operator as policy. The chain enforces it; only the estate makes it right. */
  exposureWindowSeconds: number;
  nonce: number;
  exposure?: ReleaseExposure;
}

/**
 * Pure: build the receipt and its digest from a decision. Signs nothing, sends
 * nothing, and moves nothing.
 *
 * It refuses rather than emitting a receipt whose fields would mislead a
 * contract: a declared exposure window of zero (which would collapse the whole
 * staged-release design into an immediate full payout), an exposure computed
 * against a different decision, and a verifying contract the domain does not
 * name — without which the receipt is replayable at any address.
 */
export function buildReceipt(corpus: Corpus, decision: ReleaseDecision, request: ReceiptRequest): ReceiptBundle {
  if (!request.domain.verifyingContract) {
    throw new ReceiptRefusal('The domain names no verifying contract, so the receipt would be replayable at any address. EIP-712 domain binding is the only thing preventing that, and it is not optional here.');
  }
  if (!Number.isFinite(request.exposureWindowSeconds) || request.exposureWindowSeconds <= 0) {
    throw new ReceiptRefusal('The declared exposure window must be positive. A window of zero settles the buffer immediately, which is the design this receipt exists to prevent — and the corpus cannot supply the number, so it has to be declared as policy rather than defaulted.');
  }
  if (request.exposure && request.exposure.decision !== decision) {
    throw new ReceiptRefusal('The exposure supplied was computed against a different decision. A post-release state that belongs to another ruling is worse than none.');
  }

  const measured = restatementExposure(corpus, decision.decidedAtKnowledge);
  const receipt: AdjudicationReceipt = {
    tradeId: request.tradeId,
    conditionId: decision.condition.conditionId,
    verdict: VERDICT_CODE[decision.verdict],
    postRelease: POST_RELEASE_CODE[request.exposure?.state ?? 'STANDS'],
    standing: STANDING_CODE[decision.standing],
    clockProvenance: CLOCK_CODE.WHAT_WE_HELD,
    // The condition as modelled asks about the world at the instant it is
    // decided, so validAt and the knowledge time coincide today. Carried as its
    // own field because they are different questions that happen to share an
    // answer here, and a wire format that dropped one would make the day they
    // diverge invisible.
    validAt: seconds(decision.decidedAtKnowledge),
    decidedAtKnowledge: seconds(decision.decidedAtKnowledge),
    exposureWindowSeconds: request.exposureWindowSeconds,
    observedLongestLagSeconds: measured.longestLagDays === null ? 0 : Math.round(measured.longestLagDays * 86_400),
    evidenceDigest: evidenceDigestOf(decision),
    nonce: request.nonce,
  };

  return {
    receipt,
    digest: typedDataDigest(request.domain, 'AdjudicationReceipt', RECEIPT_TYPES, receipt as unknown as Record<string, unknown>),
    domain: request.domain,
    loss: [
      'The receipt attests the adjudication and not the world. It says this condition, on this evidence, at this instant, reached this verdict — never that the cargo is fit or the delivery occurred.',
      `Standing is ${decision.standing}. A correct contract executes only on BINDING, and every decision over a committed demonstration corpus is the other one.`,
      'The exposure window is declared by the operator and enforced by the chain. observedLongestLagSeconds is what the corpus had actually seen by the decision instant, carried so nobody reads the declared window as an estimated one.',
      'A zero observed lag is an absence of observed corrections, not evidence that none was coming.',
      'The clock is the corpus knowledge time and answers what this system held. It does not answer what the source knew, and the receipt says which so the two cannot be read as one.',
      'validAt and decidedAtKnowledge coincide because the condition asks about the world at the instant it is decided. They are separate fields because they are separate questions.',
      'Nothing here signs. The digest is the value a signature would be taken over, and producing one is an operator act with an operator key.',
    ],
  };
}
