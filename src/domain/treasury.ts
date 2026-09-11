/**
 * The firm's own money, under human authority.
 *
 * This is not an autonomous agent with a wallet. The system does the research,
 * the arithmetic, the monitoring and the preparation; a person approves,
 * refuses, or sends it back. What follows is the machinery that makes that
 * division real rather than a screen with an Approve button on it.
 *
 * THE CONTROL RULE HAS FOUR TERMS, AND HUMAN APPROVAL IS ONE OF THEM
 *
 *   may execute = confirmed eligibility
 *               ∧ provider and account permission
 *               ∧ treasury-policy compliance
 *               ∧ human authorization
 *
 * Human approval is necessary and it is not sufficient. It cannot turn an
 * ineligible product into an eligible one, and changing a treasury policy is a
 * separate governed decision rather than an override on the transaction screen.
 * A system where the last click can clear every other term has three decorative
 * terms and one real one.
 *
 * UNKNOWN ELIGIBILITY IS BLOCKED, NOT PERMITTED
 *
 * The most important line in the module. Eligibility is a property of the
 * triple (asset, jurisdiction, entity) and it is frequently unresolved — a
 * provider page describes a product globally, an entity's province is not yet
 * confirmed, an onboarding is pending. An unresolved eligibility is not a
 * permission that has not been written down; it is a question nobody has
 * answered, and the same rule applies to it as to every other silence in this
 * repository. Absence of a prohibition is not a permission.
 *
 * PROVIDERS AND ASSETS ARE ADAPTERS
 *
 * Nothing here hard-codes an instrument. One tokenized note is currently
 * blocked for a Canadian entity by its issuer's own published rules; that
 * removes a product from the eligible set and leaves the architecture standing,
 * which is the entire point of keeping providers replaceable. A treasury
 * designed around a specific token would have had to be redesigned.
 *
 * SETTLEMENT AND INVESTMENT ARE DIFFERENT JOBS
 *
 * A dollar-referenced settlement token pays its holder nothing; yield is a
 * separate allocation into a separate account under separate terms. Holding
 * them as one line called "cash" hides both the currency mismatch and the fact
 * that one of them cannot be spent tomorrow without a sale, a settlement and a
 * conversion.
 *
 * TWO ASYMMETRIES THE AUTOMATION CANNOT SMOOTH OVER
 *
 * A card payment can become a dispute that debits the processor balance weeks
 * later. An outgoing on-chain transfer generally cannot be recalled at all.
 * "Tokens arrived" is therefore not "this balance is unencumbered capital", and
 * the ledger keeps the customer payment, the processor settlement, the reserve
 * requirement, the corporate allocation and the on-chain transaction as five
 * distinguishable facts rather than one number.
 *
 * And borrowing is not treasury management. Where an issuer classifies a
 * conversion as cash-like, interest begins immediately with no grace period,
 * and an asset paying a modest yield does not become attractive when funded
 * with much more expensive debt.
 *
 * SCOPE, STATED SO THE SECOND BUSINESS CANNOT APPEAR BY ACCIDENT
 *
 * Accepting payment for services the firm supplied is one activity. Holding,
 * converting or transmitting money on behalf of customers is a different one
 * with a different regulatory scope. This module is the first only. A customer
 * financial product does not emerge from adding a feature to a checkout.
 */
import { AUTHORIZING_PRINCIPALS } from '@/db/executionLedger';
import type { ReviewResponse } from './executionEnvelope';

/* ── Where money sits ── */

export const FUND_BUCKETS = ['OPERATING', 'SETTLEMENT', 'INVESTMENT', 'SPECULATIVE'] as const;
export type FundBucket = typeof FUND_BUCKETS[number];

export interface BucketContract {
  bucket: FundBucket;
  holds: string;
  rule: string;
  /** Whether a loss here may be replenished from another bucket automatically. */
  autoReplenished: boolean;
}

export const BUCKET_CONTRACTS: readonly BucketContract[] = [
  {
    bucket: 'OPERATING',
    holds: 'Fulfilment costs, refunds, taxes, infrastructure, payroll and other committed obligations.',
    rule: 'Held in the currency the obligation is payable in. A Canadian-dollar obligation is not funded by a US-dollar balance that would have to be converted first.',
    autoReplenished: false,
  },
  {
    bucket: 'SETTLEMENT',
    holds: 'Only the digital-asset balance needed for approved transfers and payments.',
    rule: 'Sized to approved movements, not to opportunity. A settlement balance larger than the payments it settles is an unmanaged investment.',
    autoReplenished: false,
  },
  {
    bucket: 'INVESTMENT',
    holds: 'Genuinely surplus funds, under an approved eligibility, liquidity and concentration policy.',
    rule: 'Maturities selected against when the firm needs the money back. A security that may have to be sold early is not immediately available cash.',
    autoReplenished: false,
  },
  {
    bucket: 'SPECULATIVE',
    holds: 'Separately authorized risk capital.',
    rule: 'Funded by explicit authorization only. No automatic replenishment from operating reserves after losses, ever.',
    autoReplenished: false,
  },
];

export function bucketContract(bucket: FundBucket): BucketContract {
  const found = BUCKET_CONTRACTS.find((entry) => entry.bucket === bucket);
  if (!found) throw new Error(`TREASURY_UNKNOWN_BUCKET:${bucket}`);
  return found;
}

/**
 * The sentence the buckets exist for. It is a statement about the information
 * business, not about risk appetite.
 */
export const INDEPENDENCE_RULE =
  'The firm’s ability to deliver dossiers and maintain customer infrastructure must not depend on a profitable trade or a timely redemption.';

/* ── What money is ── */

/**
 * A balance is not identified by its ticker.
 *
 * Two tokens can both call themselves a dollar and be different objects with
 * different issuers, different networks and different redemption terms. The
 * ledger stores the network and the contract identity, because "USDC" names a
 * family and a transfer goes to an address on a chain.
 */
export const ASSET_ROLES = ['CASH', 'SETTLEMENT_TOKEN', 'INVESTMENT'] as const;
export type AssetRole = typeof ASSET_ROLES[number];

export interface AssetIdentity {
  /** What it is for. Not what it is called. */
  role: AssetRole;
  /** Present for anything on a chain. A ticker alone does not identify a balance. */
  requiresNetworkAndContract: boolean;
  /** Whether holding it pays its holder anything. */
  paysHolder: boolean;
  /** Whether a balance is covered by deposit insurance. */
  depositInsured: boolean;
}

export const ASSET_CONTRACTS: Readonly<Record<AssetRole, AssetIdentity>> = {
  CASH: { role: 'CASH', requiresNetworkAndContract: false, paysHolder: false, depositInsured: true },
  SETTLEMENT_TOKEN: { role: 'SETTLEMENT_TOKEN', requiresNetworkAndContract: true, paysHolder: false, depositInsured: false },
  INVESTMENT: { role: 'INVESTMENT', requiresNetworkAndContract: false, paysHolder: true, depositInsured: false },
};

export const ASSET_DISTINCTION_RULE =
  'A bank balance, a settlement token and an investment holding are three objects, not three views of one. The settlement token pays its holder nothing, is not deposit-insured, and is identified by its network and contract rather than by its ticker.';

/* ── Liquidity ── */

/**
 * How far a holding is from being spendable, stated as steps rather than as a
 * label. A combined "cash" figure hides exactly this.
 */
export const LIQUIDITY_CLASSES = ['SPENDABLE', 'CONVERTIBLE', 'REALIZABLE'] as const;
export type LiquidityClass = typeof LIQUIDITY_CLASSES[number];

export const LIQUIDITY_STEPS: Readonly<Record<LiquidityClass, readonly string[]>> = {
  SPENDABLE: [],
  CONVERTIBLE: ['conversion', 'withdrawal'],
  REALIZABLE: ['sale', 'settlement', 'conversion', 'withdrawal'],
};

export const LIQUIDITY_RULE =
  'A brokerage holding is not an instantly spendable wallet balance and a wallet balance is not a bank deposit. The steps between a holding and a payment are represented rather than elided, and a single total called cash represents none of them.';

/**
 * And the mismatch a total also hides: a dollar-referenced token is not a hedge
 * for an obligation payable in another currency.
 */
export const CURRENCY_MISMATCH_RULE =
  'An asset referencing one currency does not fund an obligation payable in another. The mismatch appears in the decision packet rather than inside a combined cash figure.';

/* ── Eligibility ── */

/**
 * Three states, and the third is the one that matters.
 *
 * `UNRESOLVED` is the common case and the dangerous one: a provider page
 * describes a product globally, an entity's jurisdiction is not confirmed, an
 * onboarding is pending. It is not a permission awaiting paperwork.
 */
export const ELIGIBILITY_STATES = ['CONFIRMED', 'BLOCKED', 'UNRESOLVED'] as const;
export type EligibilityState = typeof ELIGIBILITY_STATES[number];

/** The only state that permits anything. */
export const ELIGIBILITY_PERMITS: readonly EligibilityState[] = ['CONFIRMED'];

export const UNKNOWN_ELIGIBILITY_RULE =
  'An unresolved eligibility is blocked, not permitted. Absence of a prohibition is not a permission, and a human approval does not resolve it — the question has to be answered by whoever can answer it.';

/**
 * Eligibility is a property of a triple, which is why one product being
 * unavailable says nothing about another.
 */
export const ELIGIBILITY_SUBJECT = ['asset', 'jurisdiction', 'entity'] as const;

export const ELIGIBILITY_SCOPE_RULE =
  'Eligibility attaches to the triple (asset, jurisdiction, entity). One issuer excluding one jurisdiction from one product is not a prohibition on the asset class, on the jurisdiction, or on anything else that issuer offers.';

/**
 * Independent gates. Passing one is not passing all, and a financial threshold
 * is not an issuer acceptance.
 */
export const ELIGIBILITY_GATES: readonly string[] = [
  'issuer product policy',
  'investor qualification',
  'jurisdictional distribution requirements',
  'issuer acceptance of this entity',
  'provider account approval',
];

export const ELIGIBILITY_GATE_RULE =
  'The gates are independent and all of them apply. Meeting a financial qualification threshold is not receiving issuer acceptance, and appearing on a regulator’s authorized-platform list is expressly not an endorsement or a guarantee of safety.';

/* ── The control rule ── */

export const EXECUTION_TERMS = [
  'CONFIRMED_ELIGIBILITY',
  'PROVIDER_AND_ACCOUNT_PERMISSION',
  'TREASURY_POLICY_COMPLIANCE',
  'HUMAN_AUTHORIZATION',
] as const;
export type ExecutionTerm = typeof EXECUTION_TERMS[number];

/** Every term, or nothing. Deliberately not a score and not a majority. */
export function mayExecute(terms: Readonly<Record<ExecutionTerm, boolean>>): boolean {
  return EXECUTION_TERMS.every((term) => terms[term] === true);
}

export const AUTHORIZATION_IS_NOT_SUFFICIENT =
  'Human authorization is one term of four. It cannot clear an eligibility block, a provider restriction or a policy breach, and changing a treasury policy is a separate governed decision rather than an override on the transaction screen.';

/** Who may authorize. The same principals the execution ledger accepts. */
export const TREASURY_AUTHORIZING_PRINCIPALS = AUTHORIZING_PRINCIPALS;

/* ── The decision packet ── */

/**
 * What a person is given before they decide.
 *
 * The purpose is that their job is judgment rather than reconstruction. A
 * packet missing a row makes the reviewer do the agent's work, and a reviewer
 * doing the agent's work will eventually stop doing it.
 */
export interface PacketSection {
  section: string;
  mustPresent: readonly string[];
}

export const DECISION_PACKET: readonly PacketSection[] = [
  {
    section: 'Proposed action',
    mustPresent: ['exact amount', 'source account', 'destination', 'asset', 'network', 'purpose'],
  },
  {
    section: 'Funding basis',
    mustPresent: ['settled revenue, contributed capital or borrowing', 'obligations still attached to it'],
  },
  {
    section: 'Effect on liquidity',
    mustPresent: ['available operating cash before', 'available operating cash after', 'reserve requirements', 'pending commitments'],
  },
  {
    section: 'Economics and uncertainty',
    mustPresent: ['estimated fees', 'financing costs where relevant', 'expected return assumptions', 'downside scenarios'],
  },
  {
    section: 'Exit route',
    mustPresent: ['how funds return to the corporate bank account', 'verified restrictions', 'unresolved dependencies'],
  },
  {
    section: 'Evidence and alternatives',
    mustPresent: ['supporting records', 'freshness', 'missing information', 'the comparison with doing nothing'],
  },
];

/**
 * The row that is easiest to drop and worst to drop. A packet that argues for
 * its own proposal is a recommendation wearing a review's clothes.
 */
export const BALANCED_PRESENTATION_RULE =
  'The packet shows unfavourable evidence as clearly as favourable evidence, and always includes the comparison with doing nothing. A reviewer’s job is to exercise judgment, not to reconstruct what the preparation omitted.';

/* ── The response ── */

/**
 * The review vocabulary is the action layer's, stated once in
 * `executionEnvelope` and re-exported here because the treasury was where a
 * person was first asked to decide and its readers still look here.
 */
export {
  DENIAL_IS_PERSISTENT, DENIAL_ROUTES_REFUSED, NO_DEFAULT_RULE, RESPONSES_THAT_CLOSE, REVIEW_RESPONSES,
} from './executionEnvelope';
export type { ReviewResponse } from './executionEnvelope';

/* ── What an approval binds to ── */

/**
 * "Approve an investment" authorizes nothing. An approval names an operation
 * and its bounds, and a material change invalidates it rather than stretching
 * to cover it.
 */
export const APPROVAL_BINDS_TO: readonly string[] = [
  'the specific operation', 'its limits', 'its destination', 'its asset and network', 'its expiry',
];

export const MATERIAL_CHANGES: readonly string[] = [
  'a different asset', 'a different destination', 'a different amount', 'terms outside the approved limits',
];

export const RECHECK_RULE =
  'The execution service checks the authorization immediately before dispatch rather than trusting that an approval was recorded earlier. An approval that was valid when granted may not be valid when used.';

export const APPROVAL_IS_NOT_VERIFICATION =
  'Approving a transfer does not verify its completion, and approving an investment does not validate its thesis. What actually happened is reconciled afterwards and recorded separately.';

/* ── What a movement is ── */

/**
 * A movement between the firm's own wallets and a movement that disposes of an
 * asset are different events with different records, and the difference is not
 * cosmetic — one of them creates an obligation to record a value.
 */
export const MOVEMENT_KINDS = ['TRANSFER', 'DISPOSITION'] as const;
export type MovementKind = typeof MOVEMENT_KINDS[number];

export const MOVEMENT_CONTRACTS: Readonly<Record<MovementKind, { is: string; requiresValuation: boolean }>> = {
  TRANSFER: {
    is: 'A movement between accounts or wallets owned by the same taxpayer. Nothing is disposed of.',
    requiresValuation: false,
  },
  DISPOSITION: {
    is: 'Exchanging one asset for another, or paying for goods and services with one. Something is disposed of.',
    requiresValuation: true,
  },
};

export const RECORD_KEEPING: readonly string[] = [
  'local-currency value at the time', 'wallet addresses', 'quantities', 'transaction times',
];

/* ── Reversibility ── */

/**
 * The asymmetry that makes "convert receipts to tokens" a decision rather than
 * a transfer.
 */
export const REVERSIBILITY = ['REVERSIBLE_BY_COUNTERPARTY', 'IRREVERSIBLE'] as const;
export type Reversibility = typeof REVERSIBILITY[number];

export const REVERSIBILITY_RULE =
  'A card payment can become a dispute that debits the processor balance later; an outgoing on-chain transfer generally cannot be recalled. Converting reversible receipts into irreversible holdings does not extinguish the original refund exposure.';

/** Five facts a single balance would collapse into one. */
export const SETTLEMENT_STAGES: readonly string[] = [
  'customer payment', 'processor settlement', 'reserve requirement', 'corporate allocation', 'on-chain transaction',
];

export const ENCUMBRANCE_RULE =
  'Tokens arriving is not this balance being unencumbered investment capital. The stages stay distinguishable so the reserve held against a refund is visible rather than spent.';

/* ── Borrowing ── */

export const BORROWING_RULE =
  'Borrowing to fund holdings is a financing decision, not treasury management. Where an issuer classifies a conversion as cash-like, interest begins immediately with no grace period, and an asset paying a modest yield does not become attractive funded with much more expensive debt. The model uses the issuer’s actual terms rather than assuming free financing.';

/**
 * The arithmetic, so the sign is visible rather than argued about.
 *
 * Rounded to cents because it is money. The unrounded product of a principal
 * and a rate difference lands a fraction of a cent off — 10,000 at 4% against
 * 24% comes out -1999.9999999999998 — and a treasury figure that disagrees with
 * itself in the fifteenth decimal place is a figure nobody can reconcile
 * against a statement.
 */
export function carryCost(principal: number, yieldRate: number, financingRate: number): number {
  return Math.round(principal * (yieldRate - financingRate) * 100) / 100;
}

/* ── Providers ── */

export const PROVIDER_STATES = ['APPROVED', 'EVALUATING', 'CONDITIONAL', 'BLOCKED'] as const;
export type ProviderState = typeof PROVIDER_STATES[number];

export interface ProviderAdapter {
  adapter: string;
  provides: string;
  state: ProviderState;
  /** What must be confirmed before it moves out of its current state. */
  outstanding: string;
}

/**
 * Adapters, not decisions. Every row here is replaceable, which is why a single
 * blocked product does not require the architecture to change.
 */
export const PROVIDER_ADAPTERS: readonly ProviderAdapter[] = [
  {
    adapter: 'Corporate banking',
    provides: 'Operating cash in the currencies obligations are payable in.',
    state: 'EVALUATING',
    outstanding: 'Entity, province and account approvals are unconfirmed.',
  },
  {
    adapter: 'Merchant payment provider',
    provides: 'Settlement of card revenue to the corporate bank account.',
    state: 'EVALUATING',
    outstanding: 'Acquirer, country and supported settlement route unconfirmed.',
  },
  {
    adapter: 'Authorized business crypto account',
    provides: 'Funding from a same-name business bank account, and withdrawal to a business-owned wallet.',
    state: 'EVALUATING',
    outstanding: 'Asset, network, limits, fees and the full withdrawal route need confirming for this entity — a global product page is not an approval.',
  },
  {
    adapter: 'Corporate brokerage',
    provides: 'Short-dated government securities for surplus funds.',
    state: 'EVALUATING',
    outstanding: 'Account approval, product permissions and trading permissions unconfirmed.',
  },
  {
    adapter: 'Direct issuer mint and redemption',
    provides: 'Minting and redemption of a settlement token at scale.',
    state: 'CONDITIONAL',
    outstanding: 'An institutional onboarding with its own eligibility review. Never a launch dependency.',
  },
  {
    adapter: 'Tokenized note',
    provides: 'On-chain yield.',
    state: 'BLOCKED',
    outstanding: 'The issuer’s published policy excludes the jurisdiction from subscribing, acquiring and redeeming. Self-custody, a secondary market or a different wallet does not resolve a prohibition on acquiring.',
  },
];

export const ADAPTER_RULE =
  'Providers and assets are interchangeable adapters. Nothing hard-codes an instrument, so a product becoming unavailable removes a row from the eligible set and leaves the architecture standing.';

/* ── The same-entity rule ── */

export const SAME_ENTITY_RULE =
  'Bank funding comes from a business account in the same name, and crypto movements go to business-owned wallets. A counterparty that is not the same legal entity is not a destination this treasury has.';

/* ── Proving the route ── */

/**
 * The round trip, which is a prerequisite rather than a milestone. A route that
 * has only been travelled outbound has not been tested.
 */
export const ROUND_TRIP: readonly string[] = [
  'corporate bank',
  'approved settlement route',
  'company-owned wallet',
  'approved conversion route',
  'the same corporate bank account',
];

export const ROUND_TRIP_RULE =
  'The complete round trip completes and reconciles before anything operational depends on it. Design the off-ramp before relying on the on-ramp.';

/* ── Scope ── */

export const IN_SCOPE = 'Accepting payment for services the firm supplied, and managing the firm’s own funds.';

export const OUT_OF_SCOPE: readonly string[] = [
  'customer financial accounts',
  'pooled yield products',
  'third-party remittance',
  'conversion or custody on behalf of customers',
];

export const SCOPE_RULE =
  'Accepting payment for your own services and acting as a payment intermediary are different activities with different regulatory scope. The second does not emerge from adding a feature to the first, and it is out of scope here.';

/* ── Rollout ── */

export const ROLLOUT_STAGES = [
  { order: 1, stage: 'Read-only', does: 'Balance aggregation, reconciliation and calculation. No movement.' },
  { order: 2, stage: 'Proposal preparation', does: 'Decision packets prepared and presented. Still no movement.' },
  { order: 3, stage: 'Manually approved transfers', does: 'Small, reconciled movements, each individually authorized.' },
  { order: 4, stage: 'Proven round trip', does: 'The complete out-and-back route, reconciled end to end.' },
] as const;

export const AUTOMATED_VS_AUTHORIZED = {
  automated: ['observation', 'reconciliation', 'calculation', 'proposal preparation'],
  requiresHuman: ['capital movements', 'investments', 'treasury policy changes'],
} as const;

/* ── Standing ── */

export const TREASURY_BLOCKED_ON: readonly string[] = [
  'No provider account is approved, so no route exists to move anything through.',
  'No round trip has been completed, so no route has been proven.',
  'No proposal has been prepared, reviewed, approved or denied.',
  'The firm holds nothing under this treasury.',
];

export interface TreasuryProposal {
  proposalId: string;
  bucket: FundBucket;
  eligibility: EligibilityState;
  response: ReviewResponse | null;
}

/** None. No account is approved and no route is proven. */
export const TREASURY_PROPOSALS: readonly TreasuryProposal[] = [];

export function treasuryStanding(proposals: readonly TreasuryProposal[] = TREASURY_PROPOSALS) {
  const at = (response: ReviewResponse) => proposals.filter((entry) => entry.response === response).length;
  return {
    proposals: proposals.length,
    approved: at('APPROVE'),
    denied: at('DENY'),
    /* Pending is a state, not a queue that drains into approval. */
    pending: proposals.filter((entry) => entry.response === null).length,
    blockedByEligibility: proposals.filter((entry) => !ELIGIBILITY_PERMITS.includes(entry.eligibility)).length,
    providersApproved: PROVIDER_ADAPTERS.filter((entry) => entry.state === 'APPROVED').length,
    providersBlocked: PROVIDER_ADAPTERS.filter((entry) => entry.state === 'BLOCKED').length,
    roundTripProven: false,
    blockedOn: proposals.length > 0 ? [] : [...TREASURY_BLOCKED_ON],
    coverage: proposals.length === 0 ? 'CONTRACT_ONLY_NOTHING_HELD' : 'PROPOSALS_PRESENT',
  } as const;
}
