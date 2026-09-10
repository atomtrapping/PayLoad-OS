/**
 * The four terms, against an actual PostgreSQL engine.
 *
 * The arrangement is the argument: each term is a different row in a different
 * table, so removing any one of them lets a movement through that should not
 * have gone. A schema with `approved boolean` on the proposal has one term and
 * three comments, and no test could tell the difference.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ELIGIBILITY_PERMITS, ELIGIBILITY_STATES, TREASURY_AUTHORIZING_PRINCIPALS } from '@/domain/treasury';
import { TREASURY_LEDGER_DDL, TREASURY_LEDGER_GUARDS, treasuryDdlColumns } from './treasuryLedger';

let client: PGlite;
let scenario = 0;

const T_ON = '2026-09-01T09:00:00.000Z';
const T_PROPOSE = '2026-09-02T09:00:00.000Z';
const T_REVIEW = '2026-09-02T10:00:00.000Z';
const T_GRANT = '2026-09-02T11:00:00.000Z';
const T_DISPATCH = '2026-09-02T12:00:00.000Z';
const T_EXPIRE = '2026-09-03T11:00:00.000Z';
const T_STALE = '2026-09-04T09:00:00.000Z';

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA tr_${scenario}; SET search_path TO tr_${scenario};
    ${TREASURY_LEDGER_DDL}${TREASURY_LEDGER_GUARDS}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO tr_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO tr_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** Two accounts of one entity, one policy, and an eligibility of each state. */
async function standing() {
  await sql(`
    INSERT INTO treasury_account VALUES ('ACC-BANK', 'bank', 'Notation Systems Inc.', 'OPERATING', 'CAD', '${T_ON}');
    INSERT INTO treasury_account VALUES ('ACC-WALLET', 'exchange', 'Notation Systems Inc.', 'SETTLEMENT', 'USD', '${T_ON}');
    INSERT INTO treasury_account VALUES ('ACC-OTHER', 'bank', 'Someone Else Ltd.', 'OPERATING', 'CAD', '${T_ON}');
    INSERT INTO treasury_policy VALUES ('policy@1', 250000, 'operator:jo', '${T_ON}', NULL);
    INSERT INTO asset_eligibility VALUES ('EL-OK', 'net:main', 'contract:aaa', 'CA', 'Notation Systems Inc.', 'CONFIRMED', 'Provider onboarding complete.', '${T_ON}');
    INSERT INTO asset_eligibility VALUES ('EL-UNK', 'net:main', 'contract:bbb', 'CA', 'Notation Systems Inc.', 'UNRESOLVED', 'Issuer has not answered whether this entity may subscribe.', '${T_ON}');
    INSERT INTO asset_eligibility VALUES ('EL-NO', 'net:main', 'contract:ccc', 'CA', 'Notation Systems Inc.', 'BLOCKED', 'Issuer policy excludes this jurisdiction from acquiring.', '${T_ON}')`);
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

const review = (id = 'RV1', proposalId = 'PR1', response = 'APPROVE', kind = 'HUMAN') => sql(`
  INSERT INTO proposal_review VALUES ('${id}', '${proposalId}', '${response}', '${kind}', 'operator:jo',
    'Surplus above the reserve floor; destination is the firm’s own wallet.', '${T_REVIEW}')`);

const authorization = (id = 'AU1', over: { proposal?: string; eligibility?: readonly [string, string]; amount?: number; dest?: string; bucket?: string; kind?: string; response?: string } = {}) => sql(`
  INSERT INTO treasury_authorization (authorization_id, proposal_id, eligibility_id, eligibility_state,
    source_account_id, source_bucket, policy_version, granted_by_kind, granted_by,
    amount_minor, asset_network, asset_contract, destination_account_id, review_response, granted_at, expires_at)
  VALUES ('${id}', '${over.proposal ?? 'PR1'}', '${over.eligibility?.[0] ?? 'EL-OK'}', '${over.eligibility?.[1] ?? 'CONFIRMED'}',
    'ACC-BANK', '${over.bucket ?? 'OPERATING'}', 'policy@1', '${over.kind ?? 'HUMAN'}', 'operator:jo',
    ${over.amount ?? 100000}, 'net:main', 'contract:aaa', '${over.dest ?? 'ACC-WALLET'}',
    '${over.response ?? 'APPROVE'}', '${T_GRANT}', '${T_EXPIRE}')`);

const dispatch = (id = 'DP1', over: { at?: string; kind?: string; value?: number | null; outcome?: string } = {}) => sql(`
  INSERT INTO treasury_dispatch VALUES ('${id}', 'AU1', '${T_GRANT}', '${T_EXPIRE}', '${over.at ?? T_DISPATCH}',
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

  it('keeps the domain and the schema agreeing about who may grant, and what permits', () => {
    expect(TREASURY_AUTHORIZING_PRINCIPALS).not.toContain('AGENT' as never);
    expect(ELIGIBILITY_PERMITS).toEqual(['CONFIRMED']);
    expect(ELIGIBILITY_STATES).toContain('UNRESOLVED');
    expect(TREASURY_LEDGER_DDL).toContain(`eligibility_state IN ('CONFIRMED')`);
  });
});

describe('an approval binds to one operation', () => {
  beforeEach(async () => { await standing(); await proposal(); await review(); });

  /*
   * A material change is a different proposal, not a stretched approval. Each
   * of these names a proposal that exists and differs in one bound field.
   */
  it('refuses an authorization for a different amount', async () => {
    await expect(authorization('AU1', { amount: 900000 }))
      .rejects.toThrow(/authorization_is_the_proposals_action|foreign key/i);
  });

  it('refuses an authorization for a different destination', async () => {
    await expect(authorization('AU1', { dest: 'ACC-BANK' }))
      .rejects.toThrow(/authorization_is_the_proposals_action|foreign key/i);
  });

  it('refuses an authorization with no review behind it', async () => {
    await proposal('PR2');
    await expect(authorization('AU2', { proposal: 'PR2' }))
      .rejects.toThrow(/authorization_review|foreign key/i);
  });
});

describe('a denial is persistent, and unsplittable', () => {
  beforeEach(async () => { await standing(); await proposal(); });

  it('refuses authorizing a denied proposal', async () => {
    await review('RV1', 'PR1', 'DENY');
    await expect(authorization())
      .rejects.toThrow(/authorization_rests_on_an_approval|authorization_review|authorization_descends_from_a_denial|foreign key/i);
  });

  /*
   * The route a motivated proposer takes: refused once, propose half. The
   * revision is permitted as a record — it carries a new identity and says what
   * changed — and authorizing it without revisiting the denial is not.
   */
  it('refuses authorizing a proposal that descends from a denied one', async () => {
    await review('RV1', 'PR1', 'DENY');
    await proposal('PR2', { revises: 'PR1' });
    await review('RV2', 'PR2', 'APPROVE');
    await expect(authorization('AU1', { proposal: 'PR2' }))
      .rejects.toThrow(/authorization_descends_from_a_denial/);
  });

  /*
   * The case that isolates the approval check. A denied proposal is caught by
   * the descent trigger first, so this uses DEFER: the trigger looks only for
   * denials and passes, the review key resolves because the deferral exists,
   * and only authorization_rests_on_an_approval is left. It is also the rule
   * stated plainly — there is no default by which a proposal eventually becomes
   * a transaction, and a deferral is not a quiet yes.
   */
  it('refuses authorizing a deferred proposal', async () => {
    await review('RV1', 'PR1', 'DEFER');
    await expect(authorization('AU1', { response: 'DEFER' }))
      .rejects.toThrow(/authorization_rests_on_an_approval/);
  });

  it('refuses authorizing one sent back for revision', async () => {
    await review('RV1', 'PR1', 'REQUEST_REVISION');
    await expect(authorization('AU1', { response: 'REQUEST_REVISION' }))
      .rejects.toThrow(/authorization_rests_on_an_approval/);
  });

  /* A revision of an APPROVED proposal is not caught by the same rule. */
  it('permits a revision whose line contains no denial', async () => {
    await review('RV1', 'PR1', 'APPROVE');
    await proposal('PR2', { revises: 'PR1' });
    await review('RV2', 'PR2', 'APPROVE');
    await authorization('AU1', { proposal: 'PR2' });
    expect(await rows(`SELECT proposal_id FROM treasury_authorization`)).toEqual([{ proposal_id: 'PR2' }]);
  });

  it('requires a revision to say what changed', async () => {
    await expect(sql(`INSERT INTO treasury_proposal (proposal_id, source_account_id, source_legal_entity,
      destination_account_id, destination_legal_entity, amount_minor, asset_network, asset_contract, purpose,
      doing_nothing, against, proposed_by, proposed_at, revises_proposal_id, revision_reason)
      VALUES ('PR2', 'ACC-BANK', 'Notation Systems Inc.', 'ACC-WALLET', 'Notation Systems Inc.', 50000,
        'net:main', 'contract:aaa', 'p', 'n', 'a', 'agent:treasury', '${T_PROPOSE}', 'PR1', NULL)`))
      .rejects.toThrow(/proposal_revision_says_what_changed/);
  });

  /* Silence is not consent: a proposal with no review has no authorization. */
  it('refuses authorizing a proposal nobody reviewed', async () => {
    await expect(authorization()).rejects.toThrow(/authorization_review|foreign key/i);
    expect(await rows(`SELECT review_id FROM proposal_review`)).toEqual([]);
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
    await expect(proposal('PR1', { dest: 'ACC-OTHER' }))
      .rejects.toThrow(/proposal_destination|foreign key/i);
  });

  it('refuses a proposal that moves nowhere', async () => {
    await expect(proposal('PR1', { dest: 'ACC-BANK' })).rejects.toThrow(/proposal_moves_somewhere/);
  });

  /* The packet argues both ways or it is not a packet. */
  it('refuses a proposal with no comparison against doing nothing', async () => {
    await expect(sql(`INSERT INTO treasury_proposal (proposal_id, source_account_id, source_legal_entity,
      destination_account_id, destination_legal_entity, amount_minor, asset_network, asset_contract, purpose,
      doing_nothing, against, proposed_by, proposed_at)
      VALUES ('PR1', 'ACC-BANK', 'Notation Systems Inc.', 'ACC-WALLET', 'Notation Systems Inc.', 100000,
        'net:main', 'contract:aaa', 'p', '   ', 'a', 'agent:treasury', '${T_PROPOSE}')`))
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
    await expect(sql(`INSERT INTO treasury_dispatch VALUES ('DP1', 'AU1', '${T_GRANT}', '2026-12-31T00:00:00.000Z',
      '${T_STALE}', 'TRANSFER', 'IRREVERSIBLE', NULL, 'CONFIRMED')`))
      .rejects.toThrow(/dispatch_authorization|foreign key/i);
  });

  it('accepts one inside the window', async () => {
    await dispatch();
    expect(await rows(`SELECT outcome FROM treasury_dispatch`)).toEqual([{ outcome: 'CONFIRMED' }]);
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

  it('holds no eligibility, account, policy, proposal, authorization or dispatch', async () => {
    for (const table of ['asset_eligibility', 'treasury_account', 'treasury_policy', 'treasury_proposal',
      'proposal_review', 'treasury_authorization', 'treasury_dispatch', 'dispatch_reconciliation']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('creates the columns the drift check names', () => {
    expect(treasuryDdlColumns()['asset_eligibility']).toContain('asset_contract');
    expect(treasuryDdlColumns()['treasury_proposal']).toContain('doing_nothing');
    expect(treasuryDdlColumns()['treasury_authorization']).toContain('eligibility_state');
  });
});
