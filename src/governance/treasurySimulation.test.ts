import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GovernanceLedger } from './ledger';
import { runTreasurySimulation, SIMULATION, type TreasurySimulationReceipt } from './treasurySimulation';

let ledger: GovernanceLedger;
let receipt: TreasurySimulationReceipt;

beforeAll(async () => {
  ledger = await GovernanceLedger.open('treasury_sim', 'TREASURY');
  receipt = await runTreasurySimulation(ledger);
}, 60_000);
afterAll(async () => { await ledger?.close(); });

describe('the treasury, simulated, in its own database', () => {
  it('refuses to run on the products stack', async () => {
    const products = await GovernanceLedger.open('wrong', 'PRODUCTS');
    try { await expect(runTreasurySimulation(products)).rejects.toThrow(/own database/); }
    finally { await products.close(); }
  });

  it('names everything as simulated and says nothing moved', () => {
    expect(receipt.simulated).toBe(true);
    expect(receipt.entity).toMatch(/SIMULATION/);
    for (const account of receipt.accounts) expect(account.provider).toMatch(/^simulated-/);
    expect(receipt.nothingMoved).toMatch(/No money exists/);
    const confirmed = receipt.proposals.find((p) => p.proposalId === 'TP-1')!;
    expect(confirmed.reconciliation!.basis).toMatch(/^SIMULATED receipt sha256:/);
  });

  it('runs one movement through all four terms and reconciles it', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-1')!;
    expect(p.standing).toBe('DISPATCHED_AND_RECONCILED');
    expect(p.review!.reviewer).toBe('operator:treasurer');
    expect(p.grantedBy).toBe('operator:treasurer');
    expect(p.hold).toMatchObject({ sequence: 0, deltaMinor: -100000, balanceBeforeMinor: 300000, balanceAfterMinor: 200000 });
    expect(p.dispatch!.outcome).toBe('CONFIRMED');
    expect(p.reconciliation!.found).toBe('DID_HAPPEN');
  });

  it('denies on the reserve, and refuses both routes around the denial', () => {
    const denied = receipt.proposals.find((x) => x.proposalId === 'TP-2')!;
    expect(denied.standing).toBe('DENIED');
    expect(denied.review!.response).toBe('DENY');
    expect(denied.review!.reasoning).toMatch(/Reserve check: 200000/);
    expect(denied.authorizationId).toBeNull();
    const split = receipt.proposals.find((x) => x.proposalId === 'TP-3')!;
    expect(split.revises).toBe('TP-2');
    expect(split.review!.reviewer).toBe('operator:second-reviewer');
    expect(split.review!.response).toBe('APPROVE');
    expect(split.standing).toBe('REFUSED_AT_AUTHORIZATION');
    expect(split.refusedBy).toBe('treasury_authorization_descends_from_a_denial:TP-2');
  });

  it('takes authority back, and the dispatch after it is refused', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-4')!;
    expect(p.authorizationId).toBe('TA-4');
    expect(p.revocation!.revokedBy).toBe('operator:treasurer');
    expect(p.standing).toBe('REVOKED_BEFORE_DISPATCH');
    expect(p.refusedBy).toMatch(/^treasury_dispatch_after_revocation:/);
    expect(p.dispatch).toBeNull();
  });

  it('refuses an approved movement into a blocked or unresolved asset: approval is necessary, not sufficient', () => {
    for (const id of ['TP-5', 'TP-6']) {
      const p = receipt.proposals.find((x) => x.proposalId === id)!;
      expect(p.review!.response).toBe('APPROVE');
      expect(p.standing).toBe('REFUSED_AT_AUTHORIZATION');
      expect(p.refusedBy).toBe('authorization_needs_confirmed_eligibility');
    }
    expect(receipt.eligibility.map((e) => e.state).sort()).toEqual(['BLOCKED', 'CONFIRMED', 'UNRESOLVED']);
  });

  it('refuses the agent granting its own proposal', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-7')!;
    expect(p.refusedBy).toBe('treasury_authorization_granted_by_kind_check');
  });

  it('refuses a hold larger than the surplus, by the chain and not by a check', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-8')!;
    expect(p.authorizationId).toBe('TA-8');
    expect(p.refusedBy).toMatch(/balance_after_minor/);
    expect(receipt.budget.chain.map((m) => m.balanceAfterMinor)).toEqual([200000, 150000, 90000, 70000]);
    expect(receipt.budget.remainingMinor).toBe(70000);
    expect(receipt.budget.limitMinor).toBe(SIMULATION.operatingBalanceMinor - SIMULATION.reserveFloorMinor);
    expect(receipt.budget.chain.map((m) => m.follows)).toEqual([null, 'HOLD-TP-1', 'HOLD-TP-4', 'HOLD-TP-10']);
  });

  it('refuses the race: a second hold naming a predecessor another hold already follows', () => {
    expect(receipt.refusals.find((r) => r.label.includes('the race'))!.refusedBy).toBe('reservation_one_successor');
  });

  it('lets an authorization expire, and refuses the dispatch after its window', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-11')!;
    expect(p.authorizationId).toBe('TA-11');
    expect(p.standing).toBe('EXPIRED_BEFORE_DISPATCH');
    expect(p.refusedBy).toBe('dispatch_within_the_authorization');
    expect(p.dispatch).toBeNull();
  });

  it('refuses money leaving the entity before it is a proposal', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-9')!;
    expect(p.standing).toBe('REFUSED_AS_A_PROPOSAL');
    expect(p.refusedBy).toBe('proposal_stays_within_the_entity');
    expect(p.review).toBeNull();
  });

  it('carries an unknown outcome as unresolved rather than as done or undone', () => {
    const p = receipt.proposals.find((x) => x.proposalId === 'TP-10')!;
    expect(p.dispatch!.outcome).toBe('OUTCOME_UNKNOWN');
    expect(p.reconciliation!.found).toBe('STILL_UNKNOWN');
    expect(p.standing).toBe('DISPATCHED_OUTCOME_UNRESOLVED');
    expect(receipt.counts.unresolved).toBe(1);
  });

  it('observed every refusal it claims', () => {
    expect(receipt.refusals.map((r) => [r.label, r.refusedBy])).toEqual([
      ['dispatch the same authorization again against the same hold', 'dispatch_hold_once'],
      ['authorize a denied proposal', 'treasury_authorization_descends_from_a_denial:TP-2'],
      ['authorize the split of a denied proposal, approved by a second reviewer', 'treasury_authorization_descends_from_a_denial:TP-2'],
      ['hold against a balance another hold has already moved past (the race)', 'reservation_one_successor'],
      ['dispatch after the authorization was revoked', 'treasury_dispatch_after_revocation:2026-09-10 12:30:00+00'],
      ['authorize an approved movement into an asset whose eligibility is BLOCKED', 'authorization_needs_confirmed_eligibility'],
      ['authorize an approved movement into an asset whose eligibility is UNRESOLVED', 'authorization_needs_confirmed_eligibility'],
      ['have the agent grant the authorization for its own proposal', 'treasury_authorization_granted_by_kind_check'],
      ['hold more than remains above the reserve floor', 'budget_reservation_balance_after_minor_check'],
      ['propose paying out to another legal entity', 'proposal_stays_within_the_entity'],
      ['dispatch after the authorization expired', 'dispatch_within_the_authorization'],
    ]);
  });

  it('counts what it wrote', () => {
    expect(receipt.counts).toEqual({ proposals: 10, reviews: 10, approved: 9, denied: 1, authorizations: 5, revocations: 1, holds: 4, dispatches: 2, reconciliations: 2, unresolved: 1, refusals: 11 });
  });

  it('gives the same receipt again', async () => {
    const again = await GovernanceLedger.open('treasury_sim_again', 'TREASURY');
    try { expect(await runTreasurySimulation(again)).toEqual(receipt); }
    finally { await again.close(); }
  }, 60_000);
});
