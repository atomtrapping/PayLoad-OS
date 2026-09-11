/**
 * The firm's money, simulated, under the same mechanism and in its own
 * database.
 *
 * Nothing here is a balance the firm holds, a provider it uses or a movement
 * that happened. The accounts are named as simulated, the provider is named
 * as simulated, the legal entity carries the word, and the one confirmed
 * dispatch's reconciliation says its receipt was simulated. What is real is
 * the ledger's behaviour: which rows it took and which it refused, by name.
 *
 * THE FOUR TERMS, EXERCISED ONE AT A TIME
 *
 * A proposal to a confirmed asset, approved by the treasurer, is authorized,
 * held against the surplus, dispatched and reconciled. The same proposal to
 * a blocked asset, or to one whose eligibility nobody has resolved, is
 * approved by the same treasurer and refused all the same — a person saying
 * yes does not make an unresolved question a permission. An authorization
 * granted by the agent is refused by the column. A payment out of the entity
 * is refused before it is a proposal.
 *
 * DENIAL, SPLIT, ROUTE-AROUND
 *
 * A proposal that would breach the reserve floor is denied, and the denial
 * is a row. A revision that halves it — a split — is approved by a second
 * reviewer and refused at authorization because its line contains the
 * denial. Both routes around the refusal are rows the database does not
 * accept.
 *
 * REVOCATION, THE RESERVE, AND AN OUTCOME NOBODY KNOWS
 *
 * An authorization is taken back by the treasurer with a reason, and the
 * dispatch after it is refused. A hold larger than the surplus is refused
 * by the chain, not by a check somebody ran. And a dispatch can end
 * OUTCOME_UNKNOWN with a reconciliation that says STILL_UNKNOWN, which is a
 * state the receipt carries as unresolved rather than a row it tidies away.
 */
import { sqlText } from '@/db/ddl';
import type { ReviewResponse } from '@/domain/executionEnvelope';
import { digestOf, type GovernanceLedger, type Principal, type Refusal } from './ledger';
import { ALL_PRINCIPALS, PRINCIPALS } from './principals';

export const TREASURY_INSTANTS = {
  onboarded: '2026-09-10T08:00:00.000Z',
  proposed: '2026-09-10T09:00:00.000Z',
  reviewed: '2026-09-10T10:00:00.000Z',
  granted: '2026-09-10T11:00:00.000Z',
  held: '2026-09-10T11:30:00.000Z',
  dispatched: '2026-09-10T12:00:00.000Z',
  revoked: '2026-09-10T12:30:00.000Z',
  dispatchedAgain: '2026-09-10T13:00:00.000Z',
  reconciled: '2026-09-10T14:00:00.000Z',
  expires: '2026-09-11T11:00:00.000Z',
} as const;

export const SIMULATION = {
  legalEntity: 'Notation Systems Inc. (SIMULATION)',
  otherEntity: 'Someone Else Ltd. (SIMULATION)',
  operatingBalanceMinor: 550000,
  reserveFloorMinor: 250000,
  currency: 'CAD',
  accounts: {
    operating: 'SIM-OPERATING',
    settlement: 'SIM-SETTLEMENT',
    outside: 'SIM-OUTSIDE',
  },
  assets: {
    confirmed: { network: 'sim:network', contract: 'sim:settlement-token', eligibilityId: 'ELIG-CONFIRMED' },
    blocked: { network: 'sim:network', contract: 'sim:tokenized-note', eligibilityId: 'ELIG-BLOCKED' },
    unresolved: { network: 'sim:network', contract: 'sim:fund-share', eligibilityId: 'ELIG-UNRESOLVED' },
  },
  policyVersion: 'SIM-POLICY@1',
  budgetId: 'SIM-SURPLUS',
} as const;

export type ProposalStanding =
  | 'DISPATCHED_AND_RECONCILED'
  | 'DENIED'
  | 'REFUSED_AT_AUTHORIZATION'
  | 'REVOKED_BEFORE_DISPATCH'
  | 'REFUSED_AS_A_PROPOSAL'
  | 'DISPATCHED_OUTCOME_UNRESOLVED';

export interface TreasuryProposalRecord {
  proposalId: string;
  purpose: string;
  amountMinor: number;
  destination: string;
  asset: string;
  eligibility: string;
  revises: string | null;
  review: { reviewId: string; response: ReviewResponse; reviewer: string; reasoning: string } | null;
  authorizationId: string | null;
  grantedBy: string | null;
  revocation: { revocationId: string; revokedBy: string; reason: string; at: string } | null;
  hold: { reservationId: string; sequence: number; deltaMinor: number; balanceBeforeMinor: number; balanceAfterMinor: number } | null;
  dispatch: { dispatchId: string; outcome: string; at: string } | null;
  reconciliation: { reconciliationId: string; found: string; basis: string } | null;
  standing: ProposalStanding;
  refusedBy: string | null;
}

export interface TreasurySimulationReceipt {
  readonly fixture_only: true;
  readonly simulated: true;
  readonly nothingMoved: string;
  readonly entity: string;
  readonly accounts: ReadonlyArray<{ accountId: string; provider: string; bucket: string; currency: string; entity: string }>;
  readonly policy: { version: string; reserveFloorMinor: number; adoptedBy: string };
  readonly eligibility: ReadonlyArray<{ eligibilityId: string; contract: string; state: string; basis: string }>;
  readonly budget: { budgetId: string; limitMinor: number; because: string; chain: ReadonlyArray<{ reservationId: string; sequence: number; state: string; deltaMinor: number; balanceAfterMinor: number; follows: string | null }>; remainingMinor: number };
  readonly proposals: readonly TreasuryProposalRecord[];
  readonly refusals: readonly Refusal[];
  readonly counts: { proposals: number; reviews: number; approved: number; denied: number; authorizations: number; revocations: number; holds: number; dispatches: number; reconciliations: number; unresolved: number; refusals: number };
}

const { treasurer, secondReviewer, agent } = PRINCIPALS;

export async function runTreasurySimulation(ledger: GovernanceLedger): Promise<TreasurySimulationReceipt> {
  if (ledger.stack !== 'TREASURY') throw new Error('The treasury simulation runs in its own database, on the TREASURY stack.');
  const T = TREASURY_INSTANTS;
  const S = SIMULATION;
  const refusalsBefore = ledger.refusals.length;
  await ledger.principals(ALL_PRINCIPALS, T.onboarded);

  /* ── what the firm is simulated to hold ── */
  const accounts = [
    { accountId: S.accounts.operating, provider: 'simulated-bank', bucket: 'OPERATING', currency: S.currency, entity: S.legalEntity },
    { accountId: S.accounts.settlement, provider: 'simulated-exchange', bucket: 'SETTLEMENT', currency: 'USD', entity: S.legalEntity },
    { accountId: S.accounts.outside, provider: 'simulated-bank', bucket: 'OPERATING', currency: S.currency, entity: S.otherEntity },
  ];
  const eligibility = [
    { eligibilityId: S.assets.confirmed.eligibilityId, contract: S.assets.confirmed.contract, state: 'CONFIRMED', basis: 'Simulated provider onboarding complete for this entity in this jurisdiction.' },
    { eligibilityId: S.assets.blocked.eligibilityId, contract: S.assets.blocked.contract, state: 'BLOCKED', basis: 'The simulated issuer’s published rules exclude this jurisdiction from acquiring.' },
    { eligibilityId: S.assets.unresolved.eligibilityId, contract: S.assets.unresolved.contract, state: 'UNRESOLVED', basis: 'The simulated issuer has not answered whether this entity may subscribe. An unanswered question is not a permission.' },
  ];
  const limitMinor = S.operatingBalanceMinor - S.reserveFloorMinor;
  await ledger.write([
    ...accounts.map((a) => `INSERT INTO treasury_account VALUES (${sqlText(a.accountId)}, ${sqlText(a.provider)}, ${sqlText(a.entity)}, '${a.bucket}', '${a.currency}', '${T.onboarded}')`),
    `INSERT INTO treasury_policy VALUES (${sqlText(S.policyVersion)}, ${S.reserveFloorMinor}, ${sqlText(treasurer.principalId)}, '${T.onboarded}', NULL)`,
    ...eligibility.map((e) => `INSERT INTO asset_eligibility VALUES (${sqlText(e.eligibilityId)}, 'sim:network', ${sqlText(e.contract)}, 'CA', ${sqlText(S.legalEntity)}, '${e.state}', ${sqlText(e.basis)}, '${T.onboarded}')`),
    `INSERT INTO shared_budget VALUES (${sqlText(S.budgetId)}, ${sqlText(`Operating surplus above the reserve floor: simulated balance ${S.operatingBalanceMinor} less floor ${S.reserveFloorMinor}`)}, ${limitMinor}, '${T.onboarded}')`,
  ].join(';\n'));

  const chain: Array<{ reservationId: string; sequence: number; state: string; deltaMinor: number; balanceAfterMinor: number; follows: string | null }> = [];
  const hold = async (reservationId: string, deltaMinor: number) => {
    const previous = chain[chain.length - 1] ?? null;
    const before = previous ? previous.balanceAfterMinor : limitMinor;
    const after = before + deltaMinor;
    const sequence = chain.length;
    await ledger.write(`INSERT INTO budget_reservation VALUES (${sqlText(reservationId)}, ${sqlText(S.budgetId)}, ${sequence}, 'HELD', ${deltaMinor}, ${before}, ${after},
      ${previous ? `${sqlText(previous.reservationId)}, ${previous.balanceAfterMinor}` : 'NULL, NULL'}, '${T.held}')`);
    const movement = { reservationId, sequence, state: 'HELD', deltaMinor, balanceAfterMinor: after, follows: previous?.reservationId ?? null };
    chain.push(movement);
    return { reservationId, sequence, deltaMinor, balanceBeforeMinor: before, balanceAfterMinor: after };
  };

  const proposalRow = (p: { id: string; amount: number; dest: string; destEntity?: string; asset: { network: string; contract: string }; purpose: string; doingNothing: string; against: string; revises?: { id: string; reason: string } }) =>
    `INSERT INTO treasury_proposal (proposal_id, source_account_id, source_legal_entity, destination_account_id, destination_legal_entity, amount_minor, asset_network, asset_contract,
      purpose, doing_nothing, against, proposed_by, proposed_at, revises_proposal_id, revision_reason)
     VALUES (${sqlText(p.id)}, ${sqlText(S.accounts.operating)}, ${sqlText(S.legalEntity)}, ${sqlText(p.dest)}, ${sqlText(p.destEntity ?? S.legalEntity)}, ${p.amount}, ${sqlText(p.asset.network)}, ${sqlText(p.asset.contract)},
      ${sqlText(p.purpose)}, ${sqlText(p.doingNothing)}, ${sqlText(p.against)}, ${sqlText(agent.principalId)}, '${T.proposed}',
      ${p.revises ? `${sqlText(p.revises.id)}, ${sqlText(p.revises.reason)}` : 'NULL, NULL'})`;
  const reviewRow = (id: string, proposalId: string, response: ReviewResponse, reviewer: Principal, reasoning: string) =>
    `INSERT INTO treasury_review VALUES (${sqlText(id)}, ${sqlText(proposalId)}, '${response}', '${reviewer.kind}', ${sqlText(reviewer.principalId)}, ${sqlText(reasoning)}, '${T.reviewed}')`;
  const authorizationRow = (id: string, proposalId: string, elig: { eligibilityId: string; state: string }, amount: number, asset: { network: string; contract: string }, dest: string, grantor: Principal) =>
    `INSERT INTO treasury_authorization (authorization_id, proposal_id, eligibility_id, eligibility_state, source_account_id, source_bucket, policy_version, granted_by_kind, granted_by,
      amount_minor, asset_network, asset_contract, destination_account_id, review_response, granted_at, expires_at)
     VALUES (${sqlText(id)}, ${sqlText(proposalId)}, ${sqlText(elig.eligibilityId)}, '${elig.state}', ${sqlText(S.accounts.operating)}, 'OPERATING', ${sqlText(S.policyVersion)}, '${grantor.kind}', ${sqlText(grantor.principalId)},
      ${amount}, ${sqlText(asset.network)}, ${sqlText(asset.contract)}, ${sqlText(dest)}, 'APPROVE', '${T.granted}', '${T.expires}')`;
  const dispatchRow = (id: string, authorizationId: string, amount: number, reservationId: string, at: string, outcome: string) =>
    `INSERT INTO treasury_dispatch (dispatch_id, authorization_id, authorization_granted_at, authorization_expires_at, amount_minor, reservation_id, reservation_delta_minor,
      dispatched_at, movement_kind, reversibility, local_value_minor, outcome)
     VALUES (${sqlText(id)}, ${sqlText(authorizationId)}, '${T.granted}', '${T.expires}', ${amount}, ${sqlText(reservationId)}, ${-amount}, '${at}', 'TRANSFER', 'IRREVERSIBLE', NULL, '${outcome}')`;

  const proposals: TreasuryProposalRecord[] = [];
  const base = (p: Partial<TreasuryProposalRecord> & Pick<TreasuryProposalRecord, 'proposalId' | 'purpose' | 'amountMinor' | 'destination' | 'asset' | 'eligibility' | 'standing'>): TreasuryProposalRecord => ({
    revises: null, review: null, authorizationId: null, grantedBy: null, revocation: null, hold: null, dispatch: null, reconciliation: null, refusedBy: null, ...p,
  });
  const CONFIRMED = { eligibilityId: S.assets.confirmed.eligibilityId, state: 'CONFIRMED' };
  const commonDoingNothing = 'The surplus stays in the simulated operating account. It earns nothing and costs nothing, and the reserve floor is unaffected either way.';
  const commonAgainst = 'An outgoing transfer cannot be recalled, and the settlement balance is not deposit-insured.';

  /* ── P1: the path that goes through ── */
  await ledger.write(proposalRow({ id: 'TP-1', amount: 100000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Fund simulated settlement liquidity for approved transfers.', doingNothing: commonDoingNothing, against: commonAgainst }));
  await ledger.write(reviewRow('TR-1', 'TP-1', 'APPROVE', treasurer, `Within the surplus (${limitMinor} minor above the floor); destination is the entity’s own settlement account; asset eligibility is CONFIRMED.`));
  await ledger.write(authorizationRow('TA-1', 'TP-1', CONFIRMED, 100000, S.assets.confirmed, S.accounts.settlement, treasurer));
  const hold1 = await hold('HOLD-TP-1', -100000);
  await ledger.write(dispatchRow('TD-1', 'TA-1', 100000, hold1.reservationId, T.dispatched, 'CONFIRMED'));
  await ledger.refuse('dispatch the same authorization again against the same hold', dispatchRow('TD-1-AGAIN', 'TA-1', 100000, hold1.reservationId, T.dispatchedAgain, 'CONFIRMED'));
  const reconciliation1 = { reconciliationId: 'TRC-1', found: 'DID_HAPPEN', basis: `SIMULATED receipt ${digestOf({ dispatch: 'TD-1', amount: 100000 })}: nothing moved anywhere; the dispatch row is the whole of what happened.` };
  await ledger.write(`INSERT INTO dispatch_reconciliation VALUES ('TRC-1', 'TD-1', 'DID_HAPPEN', ${sqlText(reconciliation1.basis)}, '${T.reconciled}')`);
  proposals.push(base({
    proposalId: 'TP-1', purpose: 'Fund simulated settlement liquidity for approved transfers.', amountMinor: 100000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED',
    review: { reviewId: 'TR-1', response: 'APPROVE', reviewer: treasurer.principalId, reasoning: `Within the surplus (${limitMinor} minor above the floor); destination is the entity’s own settlement account; asset eligibility is CONFIRMED.` },
    authorizationId: 'TA-1', grantedBy: treasurer.principalId, hold: hold1, dispatch: { dispatchId: 'TD-1', outcome: 'CONFIRMED', at: T.dispatched }, reconciliation: reconciliation1, standing: 'DISPATCHED_AND_RECONCILED',
  }));

  /* ── P2: denied on the reserve; P3: the split, refused ── */
  const remainingAfter1 = hold1.balanceAfterMinor;
  await ledger.write(proposalRow({ id: 'TP-2', amount: 250000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Pre-fund a quarter of simulated settlement volume.', doingNothing: commonDoingNothing, against: `Moving 250000 leaves ${remainingAfter1 - 250000} against the surplus; the reserve floor would be breached.` }));
  const denial = `Reserve check: ${remainingAfter1} minor remains above the floor after TP-1 and this asks for 250000. Denied. A denial is an outcome; it is not a request for a smaller number.`;
  await ledger.write(reviewRow('TR-2', 'TP-2', 'DENY', treasurer, denial));
  const p2 = await ledger.refuse('authorize a denied proposal', authorizationRow('TA-2', 'TP-2', CONFIRMED, 250000, S.assets.confirmed, S.accounts.settlement, treasurer));
  proposals.push(base({ proposalId: 'TP-2', purpose: 'Pre-fund a quarter of simulated settlement volume.', amountMinor: 250000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED',
    review: { reviewId: 'TR-2', response: 'DENY', reviewer: treasurer.principalId, reasoning: denial }, standing: 'DENIED', refusedBy: p2.refusedBy }));

  await ledger.write(proposalRow({ id: 'TP-3', amount: 120000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Pre-fund a quarter of simulated settlement volume — first half.', doingNothing: commonDoingNothing, against: 'It is the denied proposal in two pieces.', revises: { id: 'TP-2', reason: 'Split the denied amount into two transfers, the first within the surplus.' } }));
  await ledger.write(reviewRow('TR-3', 'TP-3', 'APPROVE', secondReviewer, 'Within the surplus on its own. (A second reviewer, asked after the first said no.)'));
  const p3 = await ledger.refuse('authorize the split of a denied proposal, approved by a second reviewer', authorizationRow('TA-3', 'TP-3', CONFIRMED, 120000, S.assets.confirmed, S.accounts.settlement, secondReviewer));
  proposals.push(base({ proposalId: 'TP-3', purpose: 'Pre-fund a quarter of simulated settlement volume — first half.', amountMinor: 120000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED', revises: 'TP-2',
    review: { reviewId: 'TR-3', response: 'APPROVE', reviewer: secondReviewer.principalId, reasoning: 'Within the surplus on its own. (A second reviewer, asked after the first said no.)' }, standing: 'REFUSED_AT_AUTHORIZATION', refusedBy: p3.refusedBy }));

  /* ── P4: approved, authorized, revoked; the dispatch refused ── */
  await ledger.write(proposalRow({ id: 'TP-4', amount: 50000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Top up simulated settlement liquidity.', doingNothing: commonDoingNothing, against: commonAgainst }));
  await ledger.write(reviewRow('TR-4', 'TP-4', 'APPROVE', treasurer, 'Within the surplus; same destination as TP-1.'));
  await ledger.write(authorizationRow('TA-4', 'TP-4', CONFIRMED, 50000, S.assets.confirmed, S.accounts.settlement, treasurer));
  const revocation4 = { revocationId: 'TX-4', revokedBy: treasurer.principalId, reason: 'The simulated counterparty wallet was re-keyed between grant and dispatch. Whatever the authorization says, it is not to be spent.', at: T.revoked };
  await ledger.write(`INSERT INTO treasury_revocation VALUES ('TX-4', 'TA-4', '${T.granted}', '${T.expires}', '${treasurer.kind}', ${sqlText(treasurer.principalId)}, ${sqlText(revocation4.reason)}, '${T.revoked}')`);
  const hold4 = await hold('HOLD-TP-4', -50000);
  const p4 = await ledger.refuse('dispatch after the authorization was revoked', dispatchRow('TD-4', 'TA-4', 50000, hold4.reservationId, T.dispatchedAgain, 'CONFIRMED'));
  proposals.push(base({ proposalId: 'TP-4', purpose: 'Top up simulated settlement liquidity.', amountMinor: 50000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED',
    review: { reviewId: 'TR-4', response: 'APPROVE', reviewer: treasurer.principalId, reasoning: 'Within the surplus; same destination as TP-1.' }, authorizationId: 'TA-4', grantedBy: treasurer.principalId,
    revocation: revocation4, hold: hold4, standing: 'REVOKED_BEFORE_DISPATCH', refusedBy: p4.refusedBy }));

  /* ── P5, P6: a person said yes, and the asset is not eligible ── */
  for (const [id, asset, label] of [['TP-5', S.assets.blocked, 'BLOCKED'], ['TP-6', S.assets.unresolved, 'UNRESOLVED']] as const) {
    await ledger.write(proposalRow({ id, amount: 30000, dest: S.accounts.settlement, asset, purpose: `Acquire a simulated ${asset.contract} position.`, doingNothing: commonDoingNothing, against: `Eligibility for this asset is ${label}.` }));
    await ledger.write(reviewRow(`TR-${id.slice(3)}`, id, 'APPROVE', treasurer, 'Approved on the economics. (Approval is necessary; it is not sufficient.)'));
    const refusal = await ledger.refuse(`authorize an approved movement into an asset whose eligibility is ${label}`, authorizationRow(`TA-${id.slice(3)}`, id, { eligibilityId: asset.eligibilityId, state: label }, 30000, asset, S.accounts.settlement, treasurer));
    proposals.push(base({ proposalId: id, purpose: `Acquire a simulated ${asset.contract} position.`, amountMinor: 30000, destination: S.accounts.settlement, asset: asset.contract, eligibility: label,
      review: { reviewId: `TR-${id.slice(3)}`, response: 'APPROVE', reviewer: treasurer.principalId, reasoning: 'Approved on the economics. (Approval is necessary; it is not sufficient.)' }, standing: 'REFUSED_AT_AUTHORIZATION', refusedBy: refusal.refusedBy }));
  }

  /* ── P7: the agent grants its own proposal ── */
  await ledger.write(proposalRow({ id: 'TP-7', amount: 40000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Rebalance simulated settlement liquidity.', doingNothing: commonDoingNothing, against: commonAgainst }));
  await ledger.write(reviewRow('TR-7', 'TP-7', 'APPROVE', treasurer, 'Within the surplus.'));
  const p7 = await ledger.refuse('have the agent grant the authorization for its own proposal', authorizationRow('TA-7', 'TP-7', CONFIRMED, 40000, S.assets.confirmed, S.accounts.settlement, agent));
  proposals.push(base({ proposalId: 'TP-7', purpose: 'Rebalance simulated settlement liquidity.', amountMinor: 40000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED',
    review: { reviewId: 'TR-7', response: 'APPROVE', reviewer: treasurer.principalId, reasoning: 'Within the surplus.' }, standing: 'REFUSED_AT_AUTHORIZATION', refusedBy: p7.refusedBy }));

  /* ── P8: a hold larger than the surplus, refused by the chain ── */
  const remaining = chain[chain.length - 1].balanceAfterMinor;
  await ledger.write(proposalRow({ id: 'TP-8', amount: remaining + 50000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Move the whole surplus and then some.', doingNothing: commonDoingNothing, against: `Exceeds the ${remaining} minor remaining above the floor.` }));
  await ledger.write(reviewRow('TR-8', 'TP-8', 'APPROVE', treasurer, 'Approved in error, to show the chain refuses what the reviewer missed.'));
  await ledger.write(authorizationRow('TA-8', 'TP-8', CONFIRMED, remaining + 50000, S.assets.confirmed, S.accounts.settlement, treasurer));
  const previous = chain[chain.length - 1];
  const p8 = await ledger.refuse('hold more than remains above the reserve floor', `INSERT INTO budget_reservation VALUES ('HOLD-TP-8', ${sqlText(S.budgetId)}, ${chain.length}, 'HELD', ${-(remaining + 50000)}, ${remaining}, ${remaining - (remaining + 50000)}, ${sqlText(previous.reservationId)}, ${previous.balanceAfterMinor}, '${T.held}')`);
  proposals.push(base({ proposalId: 'TP-8', purpose: 'Move the whole surplus and then some.', amountMinor: remaining + 50000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED',
    review: { reviewId: 'TR-8', response: 'APPROVE', reviewer: treasurer.principalId, reasoning: 'Approved in error, to show the chain refuses what the reviewer missed.' }, authorizationId: 'TA-8', grantedBy: treasurer.principalId,
    standing: 'REFUSED_AT_AUTHORIZATION', refusedBy: p8.refusedBy }));

  /* ── P9: money leaving the entity is not a proposal ── */
  const p9 = await ledger.refuse('propose paying out to another legal entity', proposalRow({ id: 'TP-9', amount: 10000, dest: S.accounts.outside, destEntity: S.otherEntity, asset: S.assets.confirmed, purpose: 'Pay a simulated counterparty.', doingNothing: commonDoingNothing, against: 'The destination is not the firm.' }));
  proposals.push(base({ proposalId: 'TP-9', purpose: 'Pay a simulated counterparty.', amountMinor: 10000, destination: S.accounts.outside, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED', standing: 'REFUSED_AS_A_PROPOSAL', refusedBy: p9.refusedBy }));

  /* ── P10: dispatched, and nobody knows what happened ── */
  await ledger.write(proposalRow({ id: 'TP-10', amount: 60000, dest: S.accounts.settlement, asset: S.assets.confirmed, purpose: 'Fund a simulated settlement window.', doingNothing: commonDoingNothing, against: commonAgainst }));
  await ledger.write(reviewRow('TR-10', 'TP-10', 'APPROVE', treasurer, 'Within the surplus.'));
  await ledger.write(authorizationRow('TA-10', 'TP-10', CONFIRMED, 60000, S.assets.confirmed, S.accounts.settlement, treasurer));
  const hold10 = await hold('HOLD-TP-10', -60000);
  await ledger.write(dispatchRow('TD-10', 'TA-10', 60000, hold10.reservationId, T.dispatchedAgain, 'OUTCOME_UNKNOWN'));
  const reconciliation10 = { reconciliationId: 'TRC-10', found: 'STILL_UNKNOWN', basis: 'The simulated provider returned no answer within the window. Not treated as nothing happened; not retried; open on the record.' };
  await ledger.write(`INSERT INTO dispatch_reconciliation VALUES ('TRC-10', 'TD-10', 'STILL_UNKNOWN', ${sqlText(reconciliation10.basis)}, '${T.reconciled}')`);
  proposals.push(base({ proposalId: 'TP-10', purpose: 'Fund a simulated settlement window.', amountMinor: 60000, destination: S.accounts.settlement, asset: S.assets.confirmed.contract, eligibility: 'CONFIRMED',
    review: { reviewId: 'TR-10', response: 'APPROVE', reviewer: treasurer.principalId, reasoning: 'Within the surplus.' }, authorizationId: 'TA-10', grantedBy: treasurer.principalId,
    hold: hold10, dispatch: { dispatchId: 'TD-10', outcome: 'OUTCOME_UNKNOWN', at: T.dispatchedAgain }, reconciliation: reconciliation10, standing: 'DISPATCHED_OUTCOME_UNRESOLVED' }));

  const counts = {
    proposals: await ledger.count('treasury_proposal'), reviews: await ledger.count('treasury_review'),
    approved: await ledger.count('treasury_review', "response = 'APPROVE'"), denied: await ledger.count('treasury_review', "response = 'DENY'"),
    authorizations: await ledger.count('treasury_authorization'), revocations: await ledger.count('treasury_revocation'),
    holds: await ledger.count('budget_reservation'), dispatches: await ledger.count('treasury_dispatch'), reconciliations: await ledger.count('dispatch_reconciliation'),
    unresolved: await ledger.count('dispatch_reconciliation', "found = 'STILL_UNKNOWN'"),
    refusals: ledger.refusals.length - refusalsBefore,
  };

  return {
    fixture_only: true, simulated: true,
    nothingMoved: 'Every account, provider, balance and receipt here is simulated and named as such. No money exists, no provider was contacted, and no movement happened; the rows record what the ledger accepted and refused.',
    entity: S.legalEntity, accounts,
    policy: { version: S.policyVersion, reserveFloorMinor: S.reserveFloorMinor, adoptedBy: treasurer.principalId },
    eligibility,
    budget: { budgetId: S.budgetId, limitMinor, because: `simulated balance ${S.operatingBalanceMinor} − reserve floor ${S.reserveFloorMinor}`, chain, remainingMinor: chain[chain.length - 1].balanceAfterMinor },
    proposals,
    refusals: ledger.refusals.slice(refusalsBefore),
    counts,
  };
}
