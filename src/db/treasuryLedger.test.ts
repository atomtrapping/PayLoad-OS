/**
 * The four terms, against an actual PostgreSQL engine.
 *
 * The arrangement is the argument: each term is a different row in a different
 * table, so removing any one of them lets a movement through that should not
 * have gone. A schema with `approved boolean` on the proposal has one term and
 * three comments, and no test could tell the difference.
 *
 * The ledger stacks on the kernel for its principal registry and on the
 * warrant ledger for the budget chain a dispatch spends against.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ELIGIBILITY_PERMITS, ELIGIBILITY_STATES, TREASURY_AUTHORIZING_PRINCIPALS } from '@/domain/treasury';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from './executionLedger';
import { WARRANT_LEDGER_DDL } from './warrantLedger';
import { TREASURY_LEDGER_DDL, TREASURY_LEDGER_GUARDS } from './treasuryLedger';

let client: PGlite;
let scenario = 0;

const T_ON = '2026-09-01T09:00:00.000Z';
const T_PROPOSE = '2026-09-02T09:00:00.000Z';
const T_REVIEW = '2026-09-02T10:00:00.000Z';
const T_GRANT = '2026-09-02T11:00:00.000Z';
const T_REVOKE = '2026-09-02T11:30:00.000Z';
const T_DISPATCH = '2026-09-02T12:00:00.000Z';
const T_EXPIRE = '2026-09-03T11:00:00.000Z';
const T_STALE = '2026-09-04T09:00:00.000Z';

const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA tr_${scenario}; SET search_path TO tr_${scenario};
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}${WARRANT_LEDGER_DDL}${TREASURY_LEDGER_DDL}${TREASURY_LEDGER_GUARDS}`);
  await sql(`
    INSERT INTO principal VALUES ('operator:jo', 'HUMAN', 'Jo, treasurer', '${T_ON}');
    INSERT INTO principal VALUES ('operator:sam', 'HUMAN', 'Sam, operator', '${T_ON}');
    INSERT INTO principal VALUES ('agent:treasury', 'AGENT', 'Treasury agent', '${T_ON}')`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO tr_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO tr_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** Two accounts of one entity, one policy, an eligibility of each state, and a budget with one hold on it. */
async function standing() {
  await sql(`
    INSERT INTO treasury_account VALUES ('ACC-BANK', 'bank', 'Notation Systems Inc.', 'OPERATING', 'CAD', '${T_ON}');
    INSERT INTO treasury_account VALUES ('ACC-WALLET', 'exchange', 'Notation Systems Inc.', 'SETTLEMENT', 'USD', '${T_ON}');
    INSERT INTO treasury_account VALUES ('ACC-OTHER', 'bank', 'Someone Else Ltd.', 'OPERATING', 'CAD', '${T_ON}');
    INSERT INTO treasury_policy VALUES ('policy@1', 250000, 'operator:jo', '${T_ON}', NULL);
    INSERT INTO asset_eligibility VALUES ('EL-OK', 'net:main', 'contract:aaa', 'CA', 'Notation Systems Inc.', 'CONFIRMED', 'Provider onboarding complete.', '${T_ON}');
    INSERT INTO asset_eligibility VALUES ('EL-UNK', 'net:main', 'contract:bbb', 'CA', 'Notation Systems Inc.', 'UNRESOLVED', 'Issuer has not answered whether this entity may subscribe.', '${T_ON}');
    INSERT INTO asset_eligibility VALUES ('EL-NO', 'net:main', 'contract:ccc', 'CA', 'Notation Systems Inc.', 'BLOCKED', 'Issuer policy excludes this jurisdiction from acquiring.', '${T_ON}');
    INSERT INTO shared_budget VALUES ('B-OPS', 'Operating surplus above the reserve floor', 300000, '${T_ON}');
    INSERT INTO budget_reservation VALUES ('HOLD-1', 'B-OPS', 0, 'HELD', -100000, 300000, 200000, NULL, NULL, '${T_GRANT}')`);
}

const proposal = (id = 'PR1', over: { dest?: string; destEntity?: string; revises?: string } = {}) => sql(`
  INSERT INTO treasury_proposal (proposal_id, source_account_id, source_legal_entity, destination_account_id,
    destination_legal_entity, amount_minor, asset_network, asset_contract, purpose, doing_nothing, against,
    proposed_by, proposed_at, revises_proposal_id, revision_reason)
  VALUES ('${id}', 'ACC-BANK', 'Notation Systems Inc.', '${over.dest ?? 'ACC-WALLET'}',
    '${over.destEntity ?? 'Notation Systems Inc.'}', 100000, 'net:main', 'contract:aaa',
    'Fund settlement liquidity for approved transfers.',
    'Leaving it in the operating account earns nothing and costs nothing, and the reserve floor is unaffected either way.',
    'The balance is not deposit-insured and an outgoing transfer cannot be recalled.',
    'agent:treasury', '${T_PROPOSE}',
    ${over.revises ? `'${over.revises}', 'Halved the amount after the first was refused.'` : 'NULL, NULL'})`);

const review = (id = 'RV1', proposalId = 'PR1', response = 'APPROVE', kind = 'HUMAN', reviewer = 'operator:jo') => sql(`
  INSERT INTO treasury_review VALUES ('${id}', '${proposalId}', '${response}', '${kind}', '${reviewer}',
    'Surplus above the reserve floor; destination is the firm’s own wallet.', '${T_REVIEW}')`);

const authorization = (id = 'AU1', over: { proposal?: string; eligibility?: readonly [string, string]; amount?: number; dest?: string; bucket?: string; kind?: string; grantor?: string; response?: string } = {}) => sql(`
  INSERT INTO treasury_authorization (authorization_id, proposal_id, eligibility_id, eligibility_state,
    source_account_id, source_bucket, policy_version, granted_by_kind, granted_by,
    amount_minor, asset_network, asset_contract, destination_account_id, review_response, granted_at, expires_at)
  VALUES ('${id}', '${over.proposal ?? 'PR1'}', '${over.eligibility?.[0] ?? 'EL-OK'}', '${over.eligibility?.[1] ?? 'CONFIRMED'}',
    'ACC-BANK', '${over.bucket ?? 'OPERATING'}', 'policy@1', '${over.kind ?? 'HUMAN'}', '${over.grantor ?? (over.kind === 'AGENT' ? 'agent:treasury' : 'operator:jo')}',
    ${over.amount ?? 100000}, 'net:main', 'contract:aaa', '${over.dest ?? 'ACC-WALLET'}',
    '${over.response ?? 'APPROVE'}', '${T_GRANT}', '${T_EXPIRE}')`);

const revocation = (id = 'RX1', over: { at?: string; kind?: string; by?: string } = {}) => sql(`
  INSERT INTO treasury_revocation VALUES ('${id}', 'AU1', '${T_GRANT}', '${T_EXPIRE}', '${over.kind ?? 'HUMAN'}', '${over.by ?? 'operator:sam'}',
    'The counterparty wallet was re-keyed.', '${over.at ?? T_REVOKE}')`);

const dispatch = (id = 'DP1', over: { at?: string; kind?: string; value?: number | null; outcome?: string; amount?: number; reservation?: string; delta?: number; expires?: string } = {}) => sql(`
  INSERT INTO treasury_dispatch (dispatch_id, authorization_id, authorization_granted_at, authorization_expires_at, amount_minor,
    reservation_id, reservation_delta_minor, dispatched_at, movement_kind, reversibility, local_value_minor, outcome)
  VALUES ('${id}', 'AU1', '${T_GRANT}', '${over.expires ?? T_EXPIRE}', ${over.amount ?? 100000},
    '${over.reservation ?? 'HOLD-1'}', ${over.delta ?? -100000}, '${over.at ?? T_DISPATCH}',
    '${over.kind ?? 'TRANSFER'}', 'IRREVERSIBLE', ${over.value === undefined ? 'NULL' : over.value},
    '${over.outcome ?? 'CONFIRMED'}')`);

describe('four terms, four rows', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); });

  it('authorizes when all four hold', async () => {
    await authorization();
    expect(await rows(`SELECT granted_by_kind FROM treasury_authorization`)).toEqual([{ granted_by_kind: 'HUMAN' }]);
  });

  /*
   * TERM 1, and the most important line in the module. An unresolved
   * eligibility is a refusal rather than a gap: absence of a prohibition is not
   * a permission, and a human approval does not answer the question.
   */
  it('refuses an authorization on an unresolved eligibility', async () => {
    await expect(authorization('AU1', { eligibility: ['EL-UNK', 'UNRESOLVED'] }))
      .rejects.toThrow(/authorization_needs_confirmed_eligibility/);
  });

  it('refuses one on a blocked eligibility', async () => {
    await expect(authorization('AU1', { eligibility: ['EL-NO', 'BLOCKED'] }))
      .rejects.toThrow(/authorization_needs_confirmed_eligibility/);
  });

  /* And the state cannot be misreported to slip past it. */
  it('refuses an authorization that claims an eligibility state the row does not have', async () => {
    await expect(authorization('AU1', { eligibility: ['EL-UNK', 'CONFIRMED'] }))
      .rejects.toThrow(/authorization_eligibility|foreign key/i);
  });

  /* TERM 4: an agent may prepare the packet and may not grant the authority. */
  it('refuses an authorization granted by an agent', async () => {
    await expect(authorization('AU1', { kind: 'AGENT' })).rejects.toThrow(/granted_by_kind/);
  });

  it('refuses an authorization granted by a name nobody registered', async () => {
    await expect(authorization('AU1', { grantor: 'operator:kim' })).rejects.toThrow(/treasury_grantor|foreign key/i);
  });

  it('keeps the domain and the schema agreeing about who may grant, and what permits', () => {
    expect(TREASURY_AUTHORIZING_PRINCIPALS).not.toContain('AGENT' as never);
    expect(ELIGIBILITY_PERMITS).toEqual(['CONFIRMED']);
    expect(ELIGIBILITY_STATES).toContain('UNRESOLVED');
    expect(TREASURY_LEDGER_DDL).toContain(`eligibility_state IN ('CONFIRMED')`);
  });
});

describe('a reviewer is a row', () => {
  beforeEach(async () => { await standing(); await proposal(); });

  it('refuses a review by a name nobody registered', async () => {
    await expect(review('RV1', 'PR1', 'APPROVE', 'HUMAN', 'operator:kim')).rejects.toThrow(/treasury_reviewer|foreign key/i);
  });

  it('refuses a review by an agent', async () => {
    await expect(review('RV1', 'PR1', 'APPROVE', 'AGENT', 'agent:treasury')).rejects.toThrow(/reviewer_kind/);
  });
});

describe('an approval binds to one operation', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); });

  /*
   * A material change is a different proposal, not a stretched approval. Each
   * of these is the authorization claiming to be about something the proposal
   * is not.
   */
  it('refuses an authorization for a different amount', async () => {
    await expect(authorization('AU1', { amount: 150000 }))
      .rejects.toThrow(/authorization_is_the_proposals_action|foreign key/i);
  });

  it('refuses an authorization for a different destination', async () => {
    await expect(authorization('AU1', { dest: 'ACC-BANK' }))
      .rejects.toThrow(/authorization_is_the_proposals_action|foreign key/i);
  });

  it('refuses an authorization with no review behind it', async () => {
    await sql(`DELETE FROM treasury_review`);
    await expect(authorization()).rejects.toThrow(/authorization_review|foreign key/i);
  });
});

describe('a denial is persistent, and unsplittable', () => {
  beforeEach(standing);

  it('refuses authorizing a denied proposal', async () => {
    await proposal(); await review('RV1', 'PR1', 'DENY');
    await expect(authorization('AU1', { response: 'DENY' })).rejects.toThrow(/treasury_authorization_descends_from_a_denial:PR1/);
    await expect(authorization()).rejects.toThrow(/treasury_authorization_descends_from_a_denial:PR1/);
  });

  /*
   * Split it: a smaller proposal descending from the denied one is still the
   * denied one, and the trigger walks the line.
   */
  it('refuses authorizing a proposal that descends from a denied one', async () => {
    await proposal('PR1'); await review('RV1', 'PR1', 'DENY');
    await proposal('PR2', { revises: 'PR1' }); await review('RV2', 'PR2', 'APPROVE');
    await expect(authorization('AU2', { proposal: 'PR2' })).rejects.toThrow(/treasury_authorization_descends_from_a_denial:PR1/);
  });

  it('refuses authorizing a deferred proposal', async () => {
    await proposal(); await review('RV1', 'PR1', 'DEFER');
    await expect(authorization('AU1', { response: 'DEFER' })).rejects.toThrow(/authorization_rests_on_an_approval/);
  });

  it('refuses authorizing one sent back for revision', async () => {
    await proposal(); await review('RV1', 'PR1', 'REQUEST_REVISION');
    await expect(authorization('AU1', { response: 'REQUEST_REVISION' })).rejects.toThrow(/authorization_rests_on_an_approval/);
  });

  it('permits a revision whose line contains no denial', async () => {
    await proposal('PR1'); await review('RV1', 'PR1', 'REQUEST_REVISION');
    await proposal('PR2', { revises: 'PR1' }); await review('RV2', 'PR2', 'APPROVE');
    await authorization('AU2', { proposal: 'PR2' });
    expect(await rows(`SELECT proposal_id FROM treasury_authorization`)).toEqual([{ proposal_id: 'PR2' }]);
  });

  it('requires a revision to say what changed', async () => {
    await proposal('PR1');
    await expect(sql(`INSERT INTO treasury_proposal (proposal_id, source_account_id, source_legal_entity, destination_account_id,
      destination_legal_entity, amount_minor, asset_network, asset_contract, purpose, doing_nothing, against, proposed_by, proposed_at, revises_proposal_id)
      VALUES ('PR2', 'ACC-BANK', 'Notation Systems Inc.', 'ACC-WALLET', 'Notation Systems Inc.', 50000, 'net:main', 'contract:aaa', 'p', 'd', 'a', 'agent:treasury', '${T_PROPOSE}', 'PR1')`))
      .rejects.toThrow(/proposal_revision_says_what_changed/);
  });

  it('refuses authorizing a proposal nobody reviewed', async () => {
    await proposal();
    await expect(authorization()).rejects.toThrow(/authorization_review|foreign key/i);
  });
});

describe('money moves within the entity', () => {
  beforeEach(standing);

  /* A counterparty that is not the firm is not a destination this treasury has. */
  it('refuses a proposal paying out to another legal entity', async () => {
    await expect(proposal('PR1', { dest: 'ACC-OTHER', destEntity: 'Someone Else Ltd.' }))
      .rejects.toThrow(/proposal_stays_within_the_entity/);
  });

  it('refuses a destination whose entity is misreported', async () => {
    await expect(proposal('PR1', { dest: 'ACC-OTHER', destEntity: 'Notation Systems Inc.' }))
      .rejects.toThrow(/proposal_destination|foreign key/i);
  });

  it('refuses a proposal that moves nowhere', async () => {
    await expect(proposal('PR1', { dest: 'ACC-BANK' })).rejects.toThrow(/proposal_moves_somewhere/);
  });

  it('refuses a proposal with no comparison against doing nothing', async () => {
    await expect(sql(`INSERT INTO treasury_proposal (proposal_id, source_account_id, source_legal_entity, destination_account_id,
      destination_legal_entity, amount_minor, asset_network, asset_contract, purpose, doing_nothing, against, proposed_by, proposed_at)
      VALUES ('PR1', 'ACC-BANK', 'Notation Systems Inc.', 'ACC-WALLET', 'Notation Systems Inc.', 100000, 'net:main', 'contract:aaa',
        'Fund settlement.', '   ', 'Not insured.', 'agent:treasury', '${T_PROPOSE}')`))
      .rejects.toThrow(/doing_nothing/);
  });
});

describe('the authorization is rechecked at dispatch', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); await authorization(); });

  /* An approval that was valid when granted is not valid when stale. */
  it('refuses a dispatch after the authority expired', async () => {
    await expect(dispatch('DP1', { at: T_STALE })).rejects.toThrow(/dispatch_within_the_authorization/);
  });

  it('refuses one before it was granted', async () => {
    await expect(dispatch('DP1', { at: T_PROPOSE })).rejects.toThrow(/dispatch_within_the_authorization/);
  });

  it('refuses a dispatch that widens the window it was granted', async () => {
    await expect(dispatch('DP1', { at: T_STALE, expires: '2026-12-31T00:00:00.000Z' }))
      .rejects.toThrow(/dispatch_authorization|foreign key/i);
  });

  it('accepts one inside the window', async () => {
    await dispatch();
    expect(await rows(`SELECT outcome FROM treasury_dispatch`)).toEqual([{ outcome: 'CONFIRMED' }]);
  });
});

describe('authority can be taken back before it expires', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); await authorization(); });

  it('refuses a dispatch at or after the revocation', async () => {
    await revocation();
    await expect(dispatch('DP1', { at: T_REVOKE })).rejects.toThrow(/treasury_dispatch_after_revocation/);
    await expect(dispatch('DP1', { at: T_DISPATCH })).rejects.toThrow(/treasury_dispatch_after_revocation/);
  });

  it('leaves a dispatch made before the revocation standing', async () => {
    await dispatch('DP1', { at: '2026-09-02T11:15:00.000Z' });
    await revocation();
    expect(await rows(`SELECT dispatch_id FROM treasury_dispatch`)).toEqual([{ dispatch_id: 'DP1' }]);
  });

  it('refuses a revocation by an agent, or by a name nobody registered', async () => {
    await expect(revocation('RX1', { kind: 'AGENT', by: 'agent:treasury' })).rejects.toThrow(/revoked_by_kind/);
    await expect(revocation('RX1', { by: 'operator:kim' })).rejects.toThrow(/treasury_revoker|foreign key/i);
  });

  it('refuses revoking authority that has already expired', async () => {
    await expect(revocation('RX1', { at: T_STALE })).rejects.toThrow(/treasury_revocation_within_the_window/);
  });
});

describe('the reserve is a chain, not a number', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); await authorization(); });

  it('spends a hold that exists, is HELD, and is for the authorized amount', async () => {
    await dispatch();
    expect(await rows(`SELECT reservation_id FROM treasury_dispatch`)).toEqual([{ reservation_id: 'HOLD-1' }]);
  });

  it('refuses a dispatch with no hold behind it', async () => {
    await expect(dispatch('DP1', { reservation: 'HOLD-NOPE' })).rejects.toThrow(/dispatch_reservation|foreign key/i);
  });

  /*
   * A released movement is a credit, and a dispatch spends a debit equal to
   * its amount, so a release can never be the hold a dispatch spends: the
   * sign check refuses it, and no separate HELD check is needed to.
   */
  it('refuses a dispatch against a hold that was released', async () => {
    await sql(`INSERT INTO budget_reservation VALUES ('REL-1', 'B-OPS', 1, 'RELEASED', 100000, 200000, 300000, 'HOLD-1', 200000, '${T_GRANT}')`);
    await expect(dispatch('DP1', { reservation: 'REL-1', delta: 100000 })).rejects.toThrow(/dispatch_spends_its_own_amount/);
    await expect(dispatch('DP1', { reservation: 'REL-1', delta: -100000 })).rejects.toThrow(/dispatch_reservation_size|foreign key/i);
  });

  /* The hold is for the amount the authorization carries, not a smaller one. */
  it('refuses a dispatch against a hold of a different size', async () => {
    await sql(`INSERT INTO budget_reservation VALUES ('HOLD-2', 'B-OPS', 1, 'HELD', -40000, 200000, 160000, 'HOLD-1', 200000, '${T_GRANT}')`);
    await expect(dispatch('DP1', { reservation: 'HOLD-2', delta: -40000 })).rejects.toThrow(/dispatch_spends_its_own_amount/);
    await expect(dispatch('DP1', { reservation: 'HOLD-2', delta: -100000 })).rejects.toThrow(/dispatch_reservation_size|foreign key/i);
  });

  /* A hold of the right size for the wrong amount: the authorization carries 100000, not 40000. */
  it('refuses a dispatch claiming an amount its authorization does not carry', async () => {
    await sql(`INSERT INTO budget_reservation VALUES ('HOLD-2', 'B-OPS', 1, 'HELD', -40000, 200000, 160000, 'HOLD-1', 200000, '${T_GRANT}')`);
    await expect(dispatch('DP1', { amount: 40000, reservation: 'HOLD-2', delta: -40000 })).rejects.toThrow(/dispatch_amount|foreign key/i);
  });

  it('spends a hold once', async () => {
    await dispatch('DP1');
    await expect(dispatch('DP2', { at: '2026-09-02T12:30:00.000Z' })).rejects.toThrow(/dispatch_hold_once/);
  });

  /* A hold larger than what remains is refused by the chain, before any dispatch. */
  it('cannot hold more than the budget has left', async () => {
    await expect(sql(`INSERT INTO budget_reservation VALUES ('HOLD-2', 'B-OPS', 1, 'HELD', -250000, 200000, -50000, 'HOLD-1', 200000, '${T_GRANT}')`))
      .rejects.toThrow(/balance_after_minor/);
  });
});

describe('a transfer and a disposition are different events', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); await authorization(); });

  it('requires a value on a disposition', async () => {
    await expect(dispatch('DP1', { kind: 'DISPOSITION' }))
      .rejects.toThrow(/dispatch_disposition_is_valued/);
  });

  it('refuses a value on a transfer between the firm’s own accounts', async () => {
    await expect(dispatch('DP1', { kind: 'TRANSFER', value: 100000 }))
      .rejects.toThrow(/dispatch_disposition_is_valued/);
  });

  it('accepts a valued disposition', async () => {
    await dispatch('DP1', { kind: 'DISPOSITION', value: 137450 });
    expect(await rows(`SELECT local_value_minor::int AS v FROM treasury_dispatch`)).toEqual([{ v: 137450 }]);
  });
});

describe('approving is not verifying', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); await authorization(); });

  /* A dispatch can end unknown, and what happened is a separate row. */
  it('records an unknown outcome without a reconciliation', async () => {
    await dispatch('DP1', { outcome: 'OUTCOME_UNKNOWN' });
    expect(await rows(`SELECT outcome FROM treasury_dispatch`)).toEqual([{ outcome: 'OUTCOME_UNKNOWN' }]);
    expect(await rows(`SELECT reconciliation_id FROM dispatch_reconciliation`)).toEqual([]);
  });

  it('reconciles it afterwards, saying what that rested on', async () => {
    await dispatch('DP1', { outcome: 'OUTCOME_UNKNOWN' });
    await sql(`INSERT INTO dispatch_reconciliation VALUES ('RC1', 'DP1', 'DID_NOT_HAPPEN', 'Bank statement shows no debit.', '${T_STALE}')`);
    expect(await rows(`SELECT found FROM dispatch_reconciliation`)).toEqual([{ found: 'DID_NOT_HAPPEN' }]);
  });

  it('refuses a reconciliation that does not say what it rested on', async () => {
    await dispatch('DP1', { outcome: 'OUTCOME_UNKNOWN' });
    await expect(sql(`INSERT INTO dispatch_reconciliation VALUES ('RC1', 'DP1', 'DID_HAPPEN', '  ', '${T_STALE}')`))
      .rejects.toThrow(/basis/);
  });
});

describe('the firm holds nothing', () => {
  it('refuses a proposal when no account is approved to move from', async () => {
    await expect(proposal()).rejects.toThrow(/proposal_source|foreign key/i);
    expect(await rows(`SELECT account_id FROM treasury_account`)).toEqual([]);
  });

  it('holds no eligibility, account, policy, proposal, review, authorization, revocation or dispatch', async () => {
    for (const table of ['asset_eligibility', 'treasury_account', 'treasury_policy', 'treasury_proposal',
      'treasury_review', 'treasury_authorization', 'treasury_revocation', 'treasury_dispatch', 'dispatch_reconciliation']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });
});
