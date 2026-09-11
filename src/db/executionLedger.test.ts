/**
 * The arrows, against an actual PostgreSQL engine.
 *
 * Raw SQL throughout, deliberately: these guarantees have to hold for a writer
 * that never heard of an application layer. The agent that retries fluently,
 * the operator repairing a row at the end of a bad day, the migration that
 * seemed harmless — none of them read a policy document, and all of them reach
 * the database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { AGENT_MAY_NEVER, RESPONSES_THAT_CLOSE, REVIEW_RESPONSES } from '@/domain/executionEnvelope';
import {
  AUTHORIZING_PRINCIPALS, EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS, PRINCIPAL_KINDS,
} from './executionLedger';

let client: PGlite;
let scenario = 0;

const T_REGISTER = '2026-04-01T08:00:00.000Z';
const T_PROPOSE = '2026-04-01T08:30:00.000Z';
const T_REVIEW = '2026-04-01T08:45:00.000Z';
const T_GRANT = '2026-04-01T09:00:00.000Z';
const T_TRY = '2026-04-01T09:05:00.000Z';
const T_LATER = '2026-04-01T09:10:00.000Z';
const T_REVOKE = '2026-04-01T09:07:00.000Z';
const T_EXPIRE = '2026-04-01T10:00:00.000Z';
const REVISION = 41;
const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;

/* The corpus tables the authorization's release foreign key points at. */

const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, title text NOT NULL, description text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA led_${scenario}; SET search_path TO led_${scenario};
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}`);
  await principals();
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO led_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO led_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** One of each kind. Nothing below may name a principal that is not here. */
const principals = () => sql(`
  INSERT INTO principal VALUES ('operator:jo', 'HUMAN', 'Jo, operator', '${T_REGISTER}');
  INSERT INTO principal VALUES ('operator:sam', 'HUMAN', 'Sam, operator', '${T_REGISTER}');
  INSERT INTO principal VALUES ('agent:planner', 'AGENT', 'Planning agent', '${T_REGISTER}');
  INSERT INTO principal VALUES ('policy:standing', 'POLICY', 'Standing policy', '${T_REGISTER}')`);

/** A release for the authorization to bind to. Nothing in the real corpus has one. */
const release = () => sql(`
  INSERT INTO corpora VALUES ('c', 'CARAVAN', 't', 'd', '{}'::jsonb);
  INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_GRANT}', '{}'::jsonb)`);

const proposal = (id = 'P1', by: string = 'AGENT', over: { revises?: string; corrects?: string } = {}) => sql(`
  INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at,
    revises_proposal_id, revision_reason, corrects_operation_id, correction_reason)
  VALUES ('${id}', 'book_freight', 'carrier:acme', '${by}', '${by === 'AGENT' ? 'agent:planner' : 'operator:jo'}', '${T_PROPOSE}',
    ${over.revises ? `'${over.revises}', 'Halved the load after the first was refused.'` : 'NULL, NULL'},
    ${over.corrects ? `'${over.corrects}', 'The confirmed booking named the wrong dock.'` : 'NULL, NULL'})`);

const packet = (proposalId = 'P1', digest = DIGEST) => sql(`
  INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against, sections,
    prepared_by_kind, prepared_by, prepared_at)
  VALUES ('K-${proposalId}', '${proposalId}', 'FREIGHT_BOOKING', '{"lane":"YVR-CGY","pallets":12}'::jsonb, '${digest}',
    'The lot stays in the yard and the customer’s window closes on Thursday.',
    'The rate is 9% above the lane median and the carrier’s on-time record is thin.',
    '["Proposed action","Evidence and alternatives"]'::jsonb, 'AGENT', 'agent:planner', '${T_PROPOSE}')`);

const review = (id = 'RV1', over: { proposal?: string; digest?: string; response?: string; kind?: string; reviewer?: string } = {}) => sql(`
  INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
  VALUES ('${id}', '${over.proposal ?? 'P1'}', '${over.digest ?? DIGEST}', '${over.response ?? 'APPROVE'}',
    '${over.kind ?? 'HUMAN'}', '${over.reviewer ?? 'operator:jo'}', 'Within the lane budget; the window is real.', '${T_REVIEW}')`);

/** Proposal, packet and approval together: what every authorization below rests on. */
const proposed = async (id = 'P1') => { await proposal(id); await packet(id); await review(`RV-${id}`, { proposal: id }); };

const authorization = (id = 'A1', revision = REVISION, by = 'HUMAN', over: { proposal?: string; digest?: string; response?: string; grantor?: string } = {}) => sql(`
  INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by,
    corpus_release_id, state_revision, policy_version, granted_at, expires_at, action_digest, review_response)
  VALUES ('${id}', '${over.proposal ?? 'P1'}', 'NARROW_ACTION', '${by}', '${over.grantor ?? (by === 'AGENT' ? 'agent:planner' : 'operator:jo')}',
    'REL-1', ${revision}, 'policy@3', '${T_GRANT}', '${T_EXPIRE}', '${over.digest ?? DIGEST}', '${over.response ?? 'APPROVE'}')`);

const revocation = (id = 'X1', over: { at?: string; kind?: string; by?: string; granted?: string; expires?: string } = {}) => sql(`
  INSERT INTO authorization_revocation (revocation_id, authorization_id, authorization_granted_at, authorization_expires_at,
    revoked_by_kind, revoked_by, reason, revoked_at)
  VALUES ('${id}', 'A1', '${over.granted ?? T_GRANT}', '${over.expires ?? T_EXPIRE}', '${over.kind ?? 'HUMAN'}',
    '${over.by ?? 'operator:sam'}', 'The customer withdrew the order.', '${over.at ?? T_REVOKE}')`);

const operation = (id = 'O1', key = 'idem-1', auth = 'A1') => sql(`
  INSERT INTO execution_operation (operation_id, authorization_id, idempotency_key, opened_at)
  VALUES ('${id}', '${auth}', '${key}', '${T_GRANT}')`);

const attempt = (id: string, over: { revision?: number; at?: string; outcome?: string; receipt?: string | null; operation?: string } = {}) => sql(`
  INSERT INTO execution_attempt (attempt_id, operation_id, authorization_id, authorization_state_revision,
    authorization_granted_at, authorization_expires_at, ran_at_state_revision, attempted_at, outcome${over.receipt ? ', venue_receipt' : ''})
  VALUES ('${id}', '${over.operation ?? 'O1'}', 'A1', ${REVISION}, '${T_GRANT}', '${T_EXPIRE}',
    ${over.revision ?? REVISION}, '${over.at ?? T_TRY}', '${over.outcome ?? 'CONFIRMED'}'${over.receipt ? `, '${over.receipt}'` : ''})`);

describe('an agent cannot manufacture its own authority', () => {
  beforeEach(release);

  it('lets an agent author a proposal', async () => {
    await proposal('P1', 'AGENT');
    expect(await rows(`SELECT authored_by_kind FROM operation_proposal`)).toEqual([{ authored_by_kind: 'AGENT' }]);
  });

  it('lets an agent prepare the packet, which is its job', async () => {
    await proposal(); await packet();
    expect(await rows(`SELECT prepared_by_kind FROM decision_packet`)).toEqual([{ prepared_by_kind: 'AGENT' }]);
  });

  /*
   * And that is where it stops. The rule is not a policy a writer applies; it is
   * a value the column will not hold.
   */
  it('refuses an authorization granted by an agent', async () => {
    await proposed();
    await expect(authorization('A1', REVISION, 'AGENT')).rejects.toThrow(/granted_by_kind/);
  });

  it('refuses a review by an agent', async () => {
    await proposal(); await packet();
    await expect(review('RV1', { kind: 'AGENT', reviewer: 'agent:planner' })).rejects.toThrow(/reviewer_kind/);
  });

  it('keeps the domain and the schema saying the same thing about who may authorize', () => {
    expect(AGENT_MAY_NEVER).toContain('authorize');
    expect(AUTHORIZING_PRINCIPALS).not.toContain('AGENT');
    expect(PRINCIPAL_KINDS).toContain('AGENT');
    expect(EXECUTION_LEDGER_DDL).toContain("granted_by_kind IN ('HUMAN', 'POLICY')");
    expect(EXECUTION_LEDGER_DDL).toContain("reviewer_kind IN ('HUMAN', 'POLICY')");
    expect(EXECUTION_LEDGER_DDL).toContain("revoked_by_kind IN ('HUMAN', 'POLICY')");
  });

  it('refuses an authorization for anything but a narrow action', async () => {
    await proposed();
    await expect(sql(`INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by,
      corpus_release_id, state_revision, policy_version, granted_at, expires_at, action_digest, review_response)
      VALUES ('A1', 'P1', 'READ_ONLY', 'HUMAN', 'operator:jo', 'REL-1', ${REVISION}, 'p', '${T_GRANT}', '${T_EXPIRE}', '${DIGEST}', 'APPROVE')`))
      .rejects.toThrow(/authorization_only_for_action/);
  });
});

describe('a principal is a row, not a string', () => {
  beforeEach(release);

  /*
   * The request body said approvedBy: "operator:kim". Nobody registered Kim.
   * The name is a string, and a string is not a reviewer.
   */
  it('refuses a review by a name nobody registered', async () => {
    await proposal(); await packet();
    await expect(review('RV1', { reviewer: 'operator:kim' })).rejects.toThrow(/review_reviewer|foreign key/i);
  });

  it('refuses a reviewer whose kind is misreported', async () => {
    await proposal(); await packet();
    await expect(review('RV1', { kind: 'POLICY', reviewer: 'operator:jo' })).rejects.toThrow(/review_reviewer|foreign key/i);
  });

  it('refuses a grantor nobody registered, even with a real approval behind it', async () => {
    await proposed();
    await expect(authorization('A1', REVISION, 'HUMAN', { grantor: 'operator:kim' })).rejects.toThrow(/authorization_grantor|foreign key/i);
  });

  it('refuses a proposal authored by a name nobody registered', async () => {
    await expect(sql(`INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at)
      VALUES ('P9', 'book_freight', 'carrier:acme', 'AGENT', 'agent:nobody', '${T_PROPOSE}')`)).rejects.toThrow(/proposal_author|foreign key/i);
  });
});

describe('an approval is of a digest', () => {
  beforeEach(release);

  it('authorizes the digest that was reviewed', async () => {
    await proposed(); await authorization();
    expect(await rows(`SELECT action_digest FROM execution_authorization`)).toEqual([{ action_digest: DIGEST }]);
  });

  /*
   * The draft was approved. The draft was then edited. The edited bytes have a
   * different digest, so the approval is not of them.
   */
  it('refuses an authorization for bytes other than the ones reviewed', async () => {
    await proposed();
    await expect(authorization('A1', REVISION, 'HUMAN', { digest: OTHER_DIGEST }))
      .rejects.toThrow(/authorization_is_of_the_reviewed_action|foreign key/i);
  });

  it('refuses a review of a digest the packet does not carry', async () => {
    await proposal(); await packet();
    await expect(review('RV1', { digest: OTHER_DIGEST })).rejects.toThrow(/review_is_of_the_packet|foreign key/i);
  });

  it('refuses an authorization with no review behind it', async () => {
    await proposal(); await packet();
    await expect(authorization()).rejects.toThrow(/authorization_is_of_the_reviewed_action|foreign key/i);
  });

  it('refuses an authorization with no packet behind it, so nothing is approved unseen', async () => {
    await proposal();
    await expect(review()).rejects.toThrow(/review_is_of_the_packet|foreign key/i);
  });

  it('requires the packet to argue against itself and against doing nothing', async () => {
    await proposal();
    await expect(sql(`INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against,
      prepared_by_kind, prepared_by, prepared_at)
      VALUES ('K1', 'P1', 'FREIGHT_BOOKING', '{}'::jsonb, '${DIGEST}', 'Nothing.', '  ', 'AGENT', 'agent:planner', '${T_PROPOSE}')`))
      .rejects.toThrow(/against/);
  });
});

describe('a denial is persistent, and unsplittable', () => {
  beforeEach(release);

  /*
   * The denial line is walked before the row's own checks run, and a denied
   * proposal is the shortest line there is. So the refusal names the denial,
   * whatever response the authorization claims to rest on.
   */
  it('refuses authorizing a denied proposal, naming the denial', async () => {
    await proposal(); await packet(); await review('RV1', { response: 'DENY' });
    await expect(authorization('A1', REVISION, 'HUMAN', { response: 'DENY' })).rejects.toThrow(/authorization_descends_from_a_denial:P1/);
    await expect(authorization()).rejects.toThrow(/authorization_descends_from_a_denial:P1/);
  });

  /* A response that neither approves nor denies authorizes nothing either. */
  it('refuses authorizing a deferred proposal, or one sent back for revision', async () => {
    await proposal(); await packet(); await review('RV1', { response: 'DEFER' });
    await expect(authorization('A1', REVISION, 'HUMAN', { response: 'DEFER' })).rejects.toThrow(/authorization_rests_on_an_approval/);
    await review('RV2', { response: 'REQUEST_REVISION', reviewer: 'operator:sam' });
    await expect(authorization('A1', REVISION, 'HUMAN', { response: 'REQUEST_REVISION' })).rejects.toThrow(/authorization_rests_on_an_approval/);
    // And claiming APPROVE when no approval was recorded is a row with nothing to point at.
    await expect(authorization()).rejects.toThrow(/authorization_is_of_the_reviewed_action|foreign key/i);
  });

  /* Route it to another approver: the second closing response has nowhere to go. */
  it('refuses a second closing review on one proposal', async () => {
    await proposal(); await packet(); await review('RV1', { response: 'DENY' });
    await expect(review('RV2', { response: 'APPROVE', reviewer: 'operator:sam' })).rejects.toThrow(/review_closes_once/);
  });

  it('lets a deferral or a revision request precede the decision', async () => {
    await proposal(); await packet();
    await review('RV1', { response: 'DEFER' });
    await review('RV2', { response: 'REQUEST_REVISION', reviewer: 'operator:sam' });
    await review('RV3', { response: 'APPROVE' });
    expect(await rows(`SELECT count(*)::int AS n FROM proposal_review`)).toEqual([{ n: 3 }]);
  });

  it('keeps the closing set the domain declares', () => {
    expect(RESPONSES_THAT_CLOSE).toEqual(['APPROVE', 'DENY']);
    expect(REVIEW_RESPONSES).toHaveLength(4);
    expect(EXECUTION_LEDGER_DDL).toContain("WHERE response IN ('APPROVE', 'DENY')");
  });

  /* Split it: a smaller proposal descending from the denied one is still the denied one. */
  it('refuses authorizing a proposal that descends from a denied one', async () => {
    await proposal('P1'); await packet('P1'); await review('RV1', { proposal: 'P1', response: 'DENY' });
    await proposal('P2', 'AGENT', { revises: 'P1' }); await packet('P2'); await review('RV2', { proposal: 'P2' });
    await expect(authorization('A2', REVISION, 'HUMAN', { proposal: 'P2' })).rejects.toThrow(/authorization_descends_from_a_denial:P1/);
  });

  it('permits a revision whose line contains no denial', async () => {
    await proposal('P1'); await packet('P1'); await review('RV1', { proposal: 'P1', response: 'REQUEST_REVISION' });
    await proposal('P2', 'AGENT', { revises: 'P1' }); await packet('P2'); await review('RV2', { proposal: 'P2' });
    await authorization('A2', REVISION, 'HUMAN', { proposal: 'P2' });
    expect(await rows(`SELECT proposal_id FROM execution_authorization`)).toEqual([{ proposal_id: 'P2' }]);
  });

  it('requires a revision to say what changed', async () => {
    await proposal('P1');
    await expect(sql(`INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at, revises_proposal_id)
      VALUES ('P2', 'book_freight', 'carrier:acme', 'AGENT', 'agent:planner', '${T_PROPOSE}', 'P1')`))
      .rejects.toThrow(/proposal_revision_says_what_changed/);
  });
});

describe('nothing can be authorized while no release exists to bind to', () => {
  /*
   * The readiness claim, structural. Admitted records are zero and no connector
   * has been lit, so there is no release — and the foreign key has nothing to
   * point at. The block is not a flag someone remembered to check.
   */
  it('refuses an authorization when the corpus holds no release', async () => {
    await proposed();
    await expect(authorization()).rejects.toThrow(/corpus_release_id|foreign key/i);
    expect(await rows(`SELECT release_id FROM releases`)).toEqual([]);
  });
});

describe('an authorization binds to the state it was granted against', () => {
  beforeEach(async () => { await release(); await proposed(); await authorization(); await operation(); });

  /*
   * Revision 41 approved; a quality hold arrives; the state is now 42. The old
   * approval does not silently apply.
   */
  it('refuses a dispatch that ran at a later revision than the one authorized', async () => {
    await expect(attempt('T1', { revision: REVISION + 1 }))
      .rejects.toThrow(/attempt_runs_at_authorized_revision/);
  });

  it('refuses an attempt that widens the window it was granted', async () => {
    await expect(sql(`INSERT INTO execution_attempt (attempt_id, operation_id, authorization_id, authorization_state_revision,
      authorization_granted_at, authorization_expires_at, ran_at_state_revision, attempted_at, outcome)
      VALUES ('T1', 'O1', 'A1', ${REVISION}, '${T_GRANT}', '2026-04-01T23:00:00.000Z', ${REVISION}, '${T_TRY}', 'CONFIRMED')`))
      .rejects.toThrow(/attempt_authorization|foreign key/i);
  });

  it('refuses an attempt after the authority expired', async () => {
    await expect(attempt('T1', { at: '2026-04-01T11:00:00.000Z' }))
      .rejects.toThrow(/attempt_within_authorization/);
  });

  it('accepts one that ran at the authorized revision, inside the window', async () => {
    await attempt('T1', { receipt: 'carrier:ack-77' });
    expect(await rows(`SELECT venue_receipt FROM execution_attempt`)).toEqual([{ venue_receipt: 'carrier:ack-77' }]);
  });

  it('refuses a receipt on an attempt that was not confirmed', async () => {
    await expect(attempt('T1', { outcome: 'REJECTED', receipt: 'carrier:ack-77' }))
      .rejects.toThrow(/attempt_receipt_only_when_confirmed/);
  });
});

describe('authority can be taken back before it expires', () => {
  beforeEach(async () => { await release(); await proposed(); await authorization(); await operation(); });

  it('refuses a dispatch at or after the revocation', async () => {
    await revocation();
    await expect(attempt('T1', { at: T_REVOKE })).rejects.toThrow(/attempt_after_revocation/);
    await expect(attempt('T1', { at: T_LATER })).rejects.toThrow(/attempt_after_revocation/);
  });

  /* The row that was already written stands. A revocation reaches forward, not back. */
  it('leaves an attempt made before the revocation standing', async () => {
    await attempt('T1', { at: T_TRY });
    await revocation();
    expect(await rows(`SELECT attempt_id FROM execution_attempt`)).toEqual([{ attempt_id: 'T1' }]);
  });

  it('refuses a revocation by an agent', async () => {
    await expect(revocation('X1', { kind: 'AGENT', by: 'agent:planner' })).rejects.toThrow(/revoked_by_kind/);
  });

  it('refuses a revocation by a name nobody registered', async () => {
    await expect(revocation('X1', { by: 'operator:kim' })).rejects.toThrow(/revocation_revoker|foreign key/i);
  });

  it('refuses revoking authority that has already expired', async () => {
    await expect(revocation('X1', { at: '2026-04-01T11:00:00.000Z' })).rejects.toThrow(/revocation_within_the_window/);
  });

  it('refuses a revocation that misreports the window it revokes', async () => {
    await expect(revocation('X1', { expires: '2026-04-01T23:00:00.000Z' })).rejects.toThrow(/revocation_authorization|foreign key/i);
  });

  it('revokes once; a second row is not an un-revocation', async () => {
    await revocation('X1');
    await expect(revocation('X2')).rejects.toThrow(/authorization_id/);
  });
});

describe('a retry is not a second commitment', () => {
  beforeEach(async () => { await release(); await proposed(); await authorization(); await operation(); });

  /*
   * Agents retry fluently, and fluency plus side effects is how one booking
   * becomes two. The idempotency key is what makes the commitment countable.
   */
  it('refuses a second operation reusing the same idempotency key', async () => {
    await expect(operation('O2', 'idem-1')).rejects.toThrow(/idempotency_key/);
  });

  it('counts commitments as operations however many times dispatch was tried', async () => {
    await attempt('T1', { outcome: 'REJECTED' });
    await attempt('T2', { at: T_LATER, outcome: 'CONFIRMED' });
    expect(await rows(`SELECT operation_id FROM execution_operation`)).toHaveLength(1);
    expect(await rows(`SELECT attempt_id FROM execution_attempt`)).toHaveLength(2);
  });

  it('refuses two attempts stamped at the same instant on one operation', async () => {
    await attempt('T1', { outcome: 'REJECTED' });
    await expect(attempt('T2', { outcome: 'REJECTED' })).rejects.toThrow(/attempt_once/);
  });
});

describe('an unknown outcome is terminal until it is reconciled', () => {
  beforeEach(async () => { await release(); await proposed(); await authorization(); await operation(); });

  /*
   * The failure this closes: an ambiguous timeout treated as "nothing
   * happened", retried, and the counterparty holding two bookings.
   */
  it('refuses a further attempt after an unknown outcome', async () => {
    await attempt('T1', { outcome: 'OUTCOME_UNKNOWN' });
    await expect(attempt('T2', { at: T_LATER }))
      .rejects.toThrow(/attempt_after_unresolved_unknown_outcome/);
  });

  it('still refuses when the reconciliation could not settle it either', async () => {
    await attempt('T1', { outcome: 'OUTCOME_UNKNOWN' });
    await sql(`INSERT INTO attempt_reconciliation (reconciliation_id, attempt_id, reconciled_at, found, basis)
      VALUES ('R1', 'T1', '${T_LATER}', 'STILL_UNKNOWN', 'Carrier could not confirm either way.')`);
    await expect(attempt('T2', { at: T_LATER })).rejects.toThrow(/attempt_after_unresolved_unknown_outcome/);
  });

  it('allows the next attempt once the reconciliation found it did not happen', async () => {
    await attempt('T1', { outcome: 'OUTCOME_UNKNOWN' });
    await sql(`INSERT INTO attempt_reconciliation (reconciliation_id, attempt_id, reconciled_at, found, basis)
      VALUES ('R1', 'T1', '${T_LATER}', 'DID_NOT_HAPPEN', 'Carrier booking list has no reference for this operation.')`);
    await attempt('T2', { at: T_LATER });
    expect(await rows(`SELECT attempt_id FROM execution_attempt ORDER BY attempt_id`)).toHaveLength(2);
  });

  it('requires a reconciliation to say what it was based on', async () => {
    await attempt('T1', { outcome: 'OUTCOME_UNKNOWN' });
    await expect(sql(`INSERT INTO attempt_reconciliation (reconciliation_id, attempt_id, reconciled_at, found, basis)
      VALUES ('R1', 'T1', '${T_LATER}', 'DID_NOT_HAPPEN', '  ')`)).rejects.toThrow(/basis/);
  });
});

describe('a correction names what it corrects', () => {
  beforeEach(async () => { await release(); await proposed(); await authorization(); await operation(); await attempt('T1', { receipt: 'carrier:ack-77' }); });

  it('lets a new proposal name the operation it corrects, with a reason', async () => {
    await proposal('P2', 'AGENT', { corrects: 'O1' });
    expect(await rows(`SELECT corrects_operation_id FROM operation_proposal WHERE proposal_id = 'P2'`)).toEqual([{ corrects_operation_id: 'O1' }]);
  });

  it('refuses a correction of an operation that does not exist', async () => {
    await expect(proposal('P2', 'AGENT', { corrects: 'O-NOPE' })).rejects.toThrow(/proposal_corrects_a_real_operation|foreign key/i);
  });

  it('requires a correction to say why', async () => {
    await expect(sql(`INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at, corrects_operation_id)
      VALUES ('P2', 'book_freight', 'carrier:acme', 'AGENT', 'agent:planner', '${T_PROPOSE}', 'O1')`))
      .rejects.toThrow(/proposal_correction_says_why/);
  });

  /* The corrected operation is not edited, retracted or deleted. It stands, and the correction points at it. */
  it('leaves the corrected operation and its confirmed attempt standing', async () => {
    await proposal('P2', 'AGENT', { corrects: 'O1' });
    expect(await rows(`SELECT venue_receipt FROM execution_attempt WHERE operation_id = 'O1'`)).toEqual([{ venue_receipt: 'carrier:ack-77' }]);
  });
});

describe('the ledger starts empty', () => {
  it('holds no proposal, packet, review, authorization, revocation, operation or attempt', async () => {
    for (const table of ['operation_proposal', 'decision_packet', 'proposal_review', 'execution_authorization', 'authorization_revocation', 'execution_operation', 'execution_attempt']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });
});
