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
import { AGENT_MAY_NEVER } from '@/domain/executionEnvelope';
import {
  AUTHORIZING_PRINCIPALS, EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS, ledgerDdlColumns,
} from './executionLedger';

let client: PGlite;
let scenario = 0;

const T_GRANT = '2026-04-01T09:00:00.000Z';
const T_TRY = '2026-04-01T09:05:00.000Z';
const T_LATER = '2026-04-01T09:10:00.000Z';
const T_EXPIRE = '2026-04-01T10:00:00.000Z';
const REVISION = 41;

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
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO led_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO led_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** A release for the authorization to bind to. Nothing in the real corpus has one. */
const release = () => sql(`
  INSERT INTO corpora VALUES ('c', 'CARAVAN', 't', 'd', '{}'::jsonb);
  INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_GRANT}', '{}'::jsonb)`);

const proposal = (id = 'P1', by: string = 'AGENT') => sql(`
  INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at)
  VALUES ('${id}', 'book_freight', 'carrier:acme', '${by}', 'agent:planner', '${T_GRANT}')`);

const authorization = (id = 'A1', revision = REVISION, by = 'HUMAN') => sql(`
  INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by,
    corpus_release_id, state_revision, policy_version, granted_at, expires_at)
  VALUES ('${id}', 'P1', 'NARROW_ACTION', '${by}', 'operator:jo', 'REL-1', ${revision}, 'policy@3', '${T_GRANT}', '${T_EXPIRE}')`);

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

  /*
   * And that is where it stops. The rule is not a policy a writer applies; it is
   * a value the column will not hold.
   */
  it('refuses an authorization granted by an agent', async () => {
    await proposal('P1', 'AGENT');
    await expect(authorization('A1', REVISION, 'AGENT')).rejects.toThrow(/granted_by_kind/);
  });

  it('keeps the domain and the schema saying the same thing about who may authorize', () => {
    expect(AGENT_MAY_NEVER).toContain('authorize');
    expect(AUTHORIZING_PRINCIPALS).not.toContain('AGENT');
    expect(EXECUTION_LEDGER_DDL).toContain("granted_by_kind IN ('HUMAN', 'POLICY')");
  });

  it('refuses an authorization for anything but a narrow action', async () => {
    await proposal();
    await expect(sql(`INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by,
      corpus_release_id, state_revision, policy_version, granted_at, expires_at)
      VALUES ('A1', 'P1', 'READ_ONLY', 'HUMAN', 'operator:jo', 'REL-1', ${REVISION}, 'p', '${T_GRANT}', '${T_EXPIRE}')`))
      .rejects.toThrow(/authorization_only_for_action/);
  });
});

describe('nothing can be authorized while no release exists to bind to', () => {
  /*
   * The readiness claim, structural. Admitted records are zero and no connector
   * has been lit, so there is no release — and the foreign key has nothing to
   * point at. The block is not a flag someone remembered to check.
   */
  it('refuses an authorization when the corpus holds no release', async () => {
    await proposal();
    await expect(authorization()).rejects.toThrow(/corpus_release_id|foreign key/i);
    expect(await rows(`SELECT release_id FROM releases`)).toEqual([]);
  });
});

describe('an authorization binds to the state it was granted against', () => {
  beforeEach(async () => { await release(); await proposal(); await authorization(); await operation(); });

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

describe('a retry is not a second commitment', () => {
  beforeEach(async () => { await release(); await proposal(); await authorization(); await operation(); });

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
  beforeEach(async () => { await release(); await proposal(); await authorization(); await operation(); });

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

describe('the ledger starts empty', () => {
  it('holds no proposal, authorization, operation or attempt', async () => {
    for (const table of ['operation_proposal', 'execution_authorization', 'execution_operation', 'execution_attempt']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('creates the columns the drift check names', () => {
    expect(ledgerDdlColumns()['execution_attempt']).toContain('ran_at_state_revision');
    expect(ledgerDdlColumns()['execution_authorization']).toContain('corpus_release_id');
    expect(ledgerDdlColumns()['execution_operation']).toContain('idempotency_key');
  });
});
