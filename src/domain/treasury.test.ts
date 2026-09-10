import { describe, expect, it } from 'vitest';
import {
  ADAPTER_RULE, APPROVAL_IS_NOT_VERIFICATION, APPROVAL_BINDS_TO, ASSET_CONTRACTS,
  ASSET_DISTINCTION_RULE, AUTHORIZATION_IS_NOT_SUFFICIENT, AUTOMATED_VS_AUTHORIZED,
  BALANCED_PRESENTATION_RULE, BORROWING_RULE, BUCKET_CONTRACTS, CURRENCY_MISMATCH_RULE,
  DECISION_PACKET, DENIAL_IS_PERSISTENT, DENIAL_ROUTES_REFUSED, ELIGIBILITY_GATES,
  ELIGIBILITY_GATE_RULE, ELIGIBILITY_PERMITS, ELIGIBILITY_SCOPE_RULE, ELIGIBILITY_STATES,
  ELIGIBILITY_SUBJECT, ENCUMBRANCE_RULE, EXECUTION_TERMS, FUND_BUCKETS, INDEPENDENCE_RULE,
  IN_SCOPE, LIQUIDITY_CLASSES, LIQUIDITY_RULE, LIQUIDITY_STEPS, MATERIAL_CHANGES,
  MOVEMENT_CONTRACTS, MOVEMENT_KINDS, NO_DEFAULT_RULE, OUT_OF_SCOPE, PROVIDER_ADAPTERS,
  RECHECK_RULE, RECORD_KEEPING, REVERSIBILITY_RULE, REVIEW_RESPONSES, ROLLOUT_STAGES,
  ROUND_TRIP, ROUND_TRIP_RULE, SAME_ENTITY_RULE, SCOPE_RULE, SETTLEMENT_STAGES,
  TREASURY_AUTHORIZING_PRINCIPALS, TREASURY_BLOCKED_ON, UNKNOWN_ELIGIBILITY_RULE,
  bucketContract, carryCost, mayExecute, treasuryStanding,
} from './treasury';

const ALL_TRUE = {
  CONFIRMED_ELIGIBILITY: true,
  PROVIDER_AND_ACCOUNT_PERMISSION: true,
  TREASURY_POLICY_COMPLIANCE: true,
  HUMAN_AUTHORIZATION: true,
} as const;

describe('the control rule has four terms', () => {
  it('executes only when every term holds', () => {
    expect(EXECUTION_TERMS).toEqual([
      'CONFIRMED_ELIGIBILITY', 'PROVIDER_AND_ACCOUNT_PERMISSION',
      'TREASURY_POLICY_COMPLIANCE', 'HUMAN_AUTHORIZATION',
    ]);
    expect(mayExecute(ALL_TRUE)).toBe(true);
  });

  /*
   * The whole point. A system where the last click clears the other three has
   * three decorative terms and one real one.
   */
  it('refuses when any single term fails, human authorization included', () => {
    for (const term of EXECUTION_TERMS) {
      expect(mayExecute({ ...ALL_TRUE, [term]: false }), term).toBe(false);
    }
  });

  it('does not let a human approval clear an eligibility block', () => {
    expect(mayExecute({ ...ALL_TRUE, CONFIRMED_ELIGIBILITY: false, HUMAN_AUTHORIZATION: true })).toBe(false);
    expect(AUTHORIZATION_IS_NOT_SUFFICIENT).toContain('one term of four');
    expect(AUTHORIZATION_IS_NOT_SUFFICIENT).toContain('separate governed decision');
  });

  it('authorizes through the same principals the execution ledger accepts', () => {
    expect(TREASURY_AUTHORIZING_PRINCIPALS).not.toContain('AGENT' as never);
    expect(TREASURY_AUTHORIZING_PRINCIPALS).toContain('HUMAN' as never);
  });
});

describe('unknown eligibility is blocked, not permitted', () => {
  /* The most important line in the module. */
  it('permits only a confirmed eligibility', () => {
    expect(ELIGIBILITY_STATES).toEqual(['CONFIRMED', 'BLOCKED', 'UNRESOLVED']);
    expect(ELIGIBILITY_PERMITS).toEqual(['CONFIRMED']);
    expect(ELIGIBILITY_PERMITS).not.toContain('UNRESOLVED');
    expect(UNKNOWN_ELIGIBILITY_RULE).toContain('Absence of a prohibition is not a permission');
  });

  it('attaches eligibility to a triple, so one block is not a class prohibition', () => {
    expect(ELIGIBILITY_SUBJECT).toEqual(['asset', 'jurisdiction', 'entity']);
    expect(ELIGIBILITY_SCOPE_RULE).toContain('is not a prohibition on the asset class');
  });

  /* Independent gates: a threshold is not an acceptance. */
  it('keeps the gates independent and all of them applicable', () => {
    expect(ELIGIBILITY_GATES).toContain('issuer acceptance of this entity');
    expect(ELIGIBILITY_GATES).toContain('jurisdictional distribution requirements');
    expect(ELIGIBILITY_GATE_RULE).toContain('is not receiving issuer acceptance');
    expect(ELIGIBILITY_GATE_RULE).toContain('not an endorsement or a guarantee of safety');
  });
});

describe('four buckets, none of them replenished behind your back', () => {
  it('keeps operating, settlement, investment and speculative apart', () => {
    expect(FUND_BUCKETS).toEqual(['OPERATING', 'SETTLEMENT', 'INVESTMENT', 'SPECULATIVE']);
    for (const contract of BUCKET_CONTRACTS) expect(contract.autoReplenished, contract.bucket).toBe(false);
    expect(bucketContract('SPECULATIVE').rule).toContain('No automatic replenishment');
  });

  it('funds an obligation in the currency it is payable in', () => {
    expect(bucketContract('OPERATING').rule).toContain('not funded by a US-dollar balance');
  });

  it('sizes settlement to approved movements rather than to opportunity', () => {
    expect(bucketContract('SETTLEMENT').rule).toContain('is an unmanaged investment');
  });

  it('states why the buckets exist at all', () => {
    expect(INDEPENDENCE_RULE).toContain('must not depend on a profitable trade');
  });

  it('refuses a bucket it does not carry', () => {
    expect(() => bucketContract('YIELD' as never)).toThrow(/TREASURY_UNKNOWN_BUCKET/);
  });
});

describe('three objects, not three views of one', () => {
  it('gives the settlement token no yield, no insurance, and a network identity', () => {
    expect(ASSET_CONTRACTS.SETTLEMENT_TOKEN.paysHolder).toBe(false);
    expect(ASSET_CONTRACTS.SETTLEMENT_TOKEN.depositInsured).toBe(false);
    expect(ASSET_CONTRACTS.SETTLEMENT_TOKEN.requiresNetworkAndContract).toBe(true);
    expect(ASSET_CONTRACTS.CASH.depositInsured).toBe(true);
    expect(ASSET_CONTRACTS.INVESTMENT.paysHolder).toBe(true);
    expect(ASSET_DISTINCTION_RULE).toContain('rather than by its ticker');
  });

  it('counts the steps between a holding and a payment', () => {
    expect(LIQUIDITY_CLASSES).toEqual(['SPENDABLE', 'CONVERTIBLE', 'REALIZABLE']);
    expect(LIQUIDITY_STEPS.SPENDABLE).toEqual([]);
    expect(LIQUIDITY_STEPS.REALIZABLE.length).toBeGreaterThan(LIQUIDITY_STEPS.CONVERTIBLE.length);
    expect(LIQUIDITY_STEPS.REALIZABLE).toContain('sale');
    expect(LIQUIDITY_RULE).toContain('a single total called cash represents none of them');
  });

  it('keeps the currency mismatch out of the combined figure', () => {
    expect(CURRENCY_MISMATCH_RULE).toContain('rather than inside a combined cash figure');
  });
});

describe('the decision packet', () => {
  it('carries all six sections, each with what it must present', () => {
    expect(DECISION_PACKET.map((section) => section.section)).toEqual([
      'Proposed action', 'Funding basis', 'Effect on liquidity',
      'Economics and uncertainty', 'Exit route', 'Evidence and alternatives',
    ]);
    for (const section of DECISION_PACKET) expect(section.mustPresent.length, section.section).toBeGreaterThan(0);
  });

  it('names the network and the destination in the proposed action', () => {
    const action = DECISION_PACKET[0].mustPresent;
    for (const field of ['exact amount', 'source account', 'destination', 'asset', 'network', 'purpose']) {
      expect(action, field).toContain(field);
    }
  });

  it('distinguishes borrowing from revenue in the funding basis', () => {
    expect(DECISION_PACKET[1].mustPresent[0]).toContain('borrowing');
    expect(DECISION_PACKET[1].mustPresent).toContain('obligations still attached to it');
  });

  /* The row easiest to drop and worst to drop. */
  it('requires the comparison with doing nothing, and unfavourable evidence', () => {
    expect(DECISION_PACKET.at(-1)!.mustPresent).toContain('the comparison with doing nothing');
    expect(BALANCED_PRESENTATION_RULE).toContain('unfavourable evidence as clearly as favourable');
    expect(BALANCED_PRESENTATION_RULE).toContain('not to reconstruct what the preparation omitted');
  });
});

describe('the response, and what is not one', () => {
  it('offers four responses and no default', () => {
    expect(REVIEW_RESPONSES).toEqual(['APPROVE', 'DENY', 'REQUEST_REVISION', 'DEFER']);
    expect(NO_DEFAULT_RULE).toContain('neither is consent');
    expect(NO_DEFAULT_RULE).toContain('no default assumption');
  });

  /* All three routes around a refusal, named because all three get tried. */
  it('makes a denial persistent against every route around it', () => {
    expect(DENIAL_ROUTES_REFUSED).toEqual([
      'retrying the same proposal',
      'splitting it into smaller transactions',
      'routing it to a different approver',
    ]);
    expect(DENIAL_IS_PERSISTENT).toContain('new identity');
    expect(DENIAL_IS_PERSISTENT).toContain('visible explanation of what changed');
  });
});

describe('what an approval binds to', () => {
  it('binds to one operation with its bounds and an expiry', () => {
    for (const field of ['the specific operation', 'its limits', 'its destination', 'its expiry']) {
      expect(APPROVAL_BINDS_TO, field).toContain(field);
    }
    expect(MATERIAL_CHANGES).toContain('a different destination');
    expect(MATERIAL_CHANGES).toContain('terms outside the approved limits');
  });

  it('rechecks at dispatch rather than trusting an earlier click', () => {
    expect(RECHECK_RULE).toContain('immediately before dispatch');
    expect(RECHECK_RULE).toContain('may not be valid when used');
  });

  it('does not treat approval as verification', () => {
    expect(APPROVAL_IS_NOT_VERIFICATION).toContain('does not verify its completion');
    expect(APPROVAL_IS_NOT_VERIFICATION).toContain('does not validate its thesis');
  });
});

describe('a transfer and a disposition are different events', () => {
  it('requires a valuation on a disposition and not on a transfer', () => {
    expect(MOVEMENT_KINDS).toEqual(['TRANSFER', 'DISPOSITION']);
    expect(MOVEMENT_CONTRACTS.TRANSFER.requiresValuation).toBe(false);
    expect(MOVEMENT_CONTRACTS.DISPOSITION.requiresValuation).toBe(true);
    expect(MOVEMENT_CONTRACTS.TRANSFER.is).toContain('same taxpayer');
  });

  it('keeps the records a disposition needs', () => {
    expect(RECORD_KEEPING).toContain('local-currency value at the time');
    expect(RECORD_KEEPING).toContain('wallet addresses');
  });
});

describe('reversibility, and the five facts a balance would collapse', () => {
  it('states the asymmetry between a card dispute and an on-chain transfer', () => {
    expect(REVERSIBILITY_RULE).toContain('generally cannot be recalled');
    expect(REVERSIBILITY_RULE).toContain('does not extinguish the original refund exposure');
  });

  it('keeps the settlement stages distinguishable', () => {
    expect(SETTLEMENT_STAGES).toEqual([
      'customer payment', 'processor settlement', 'reserve requirement',
      'corporate allocation', 'on-chain transaction',
    ]);
    expect(ENCUMBRANCE_RULE).toContain('is not this balance being unencumbered');
  });

  it('prices borrowing at the issuer’s actual terms', () => {
    expect(BORROWING_RULE).toContain('no grace period');
    expect(BORROWING_RULE).toContain('rather than assuming free financing');
    /* A modest yield funded with expensive debt is negative, and visibly so. */
    expect(carryCost(10_000, 0.04, 0.24)).toBe(-2_000);
    expect(carryCost(10_000, 0.04, 0)).toBe(400);
  });
});

describe('providers are adapters', () => {
  it('carries a blocked row without the architecture depending on it', () => {
    const blocked = PROVIDER_ADAPTERS.filter((entry) => entry.state === 'BLOCKED');
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].outstanding).toContain('does not resolve a prohibition');
    expect(ADAPTER_RULE).toContain('leaves the architecture standing');
  });

  it('does not treat a global product page as an approval', () => {
    const account = PROVIDER_ADAPTERS.find((entry) => entry.adapter === 'Authorized business crypto account')!;
    expect(account.outstanding).toContain('a global product page is not an approval');
  });

  it('keeps direct issuer access conditional rather than required', () => {
    const mint = PROVIDER_ADAPTERS.find((entry) => entry.adapter === 'Direct issuer mint and redemption')!;
    expect(mint.state).toBe('CONDITIONAL');
    expect(mint.outstanding).toContain('Never a launch dependency');
  });

  it('has approved none of them yet', () => {
    expect(PROVIDER_ADAPTERS.filter((entry) => entry.state === 'APPROVED')).toEqual([]);
  });

  it('sends money only to the same legal entity', () => {
    expect(SAME_ENTITY_RULE).toContain('not the same legal entity is not a destination');
  });
});

describe('the route is proven before it is relied on', () => {
  it('runs out and back to the same account', () => {
    expect(ROUND_TRIP[0]).toBe('corporate bank');
    expect(ROUND_TRIP.at(-1)).toBe('the same corporate bank account');
    expect(ROUND_TRIP_RULE).toContain('before anything operational depends on it');
    expect(ROUND_TRIP_RULE).toContain('Design the off-ramp before relying on the on-ramp');
  });

  it('starts read-only and reaches movement only at stage three', () => {
    expect(ROLLOUT_STAGES[0].stage).toBe('Read-only');
    expect(ROLLOUT_STAGES[0].does).toContain('No movement');
    expect(ROLLOUT_STAGES[2].stage).toBe('Manually approved transfers');
  });

  it('automates preparation and requires a human for movement', () => {
    expect(AUTOMATED_VS_AUTHORIZED.automated).toContain('proposal preparation');
    expect(AUTOMATED_VS_AUTHORIZED.requiresHuman).toContain('capital movements');
    expect(AUTOMATED_VS_AUTHORIZED.requiresHuman).toContain('treasury policy changes');
    for (const item of AUTOMATED_VS_AUTHORIZED.automated) {
      expect(AUTOMATED_VS_AUTHORIZED.requiresHuman, item).not.toContain(item);
    }
  });
});

describe('scope, so the second business cannot appear by accident', () => {
  it('is the firm’s own funds, and not a customer financial product', () => {
    expect(IN_SCOPE).toContain('the firm’s own funds');
    expect(OUT_OF_SCOPE).toContain('third-party remittance');
    expect(OUT_OF_SCOPE).toContain('customer financial accounts');
    expect(SCOPE_RULE).toContain('does not emerge from adding a feature');
  });
});

describe('the firm holds nothing, and the zero is derived', () => {
  it('reports no proposals, no approved provider, and an unproven route', () => {
    const standing = treasuryStanding();
    expect(standing.proposals).toBe(0);
    expect(standing.approved).toBe(0);
    expect(standing.providersApproved).toBe(0);
    expect(standing.providersBlocked).toBeGreaterThan(0);
    expect(standing.roundTripProven).toBe(false);
    expect(standing.blockedOn).toEqual([...TREASURY_BLOCKED_ON]);
    expect(standing.coverage).toBe('CONTRACT_ONLY_NOTHING_HELD');
  });

  /* Pending is a state, not a queue that drains into approval. */
  it('counts a pending proposal as pending rather than as almost-approved', () => {
    const standing = treasuryStanding([
      { proposalId: 'T1', bucket: 'INVESTMENT', eligibility: 'UNRESOLVED', response: null },
      { proposalId: 'T2', bucket: 'SETTLEMENT', eligibility: 'CONFIRMED', response: 'APPROVE' },
      { proposalId: 'T3', bucket: 'SPECULATIVE', eligibility: 'BLOCKED', response: 'DENY' },
    ]);
    expect(standing.proposals).toBe(3);
    expect(standing.pending).toBe(1);
    expect(standing.approved).toBe(1);
    expect(standing.denied).toBe(1);
    expect(standing.blockedByEligibility).toBe(2);
    expect(standing.blockedOn).toEqual([]);
  });
});
