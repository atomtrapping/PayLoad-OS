/**
 * The reservation chain and the desk, against an actual PostgreSQL engine.
 *
 * The case worth the whole file is the race: two writers each read the same
 * budget balance, each pass a limit check, and together spend more than the
 * limit. Neither did anything wrong. A number somebody consults cannot prevent
 * it; a chain of tied balances can, because the second row has to name a
 * predecessor the first already claimed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { EXCEPTION_CONTRACTS, EXCEPTION_KINDS, WARRANT_QUESTIONS } from '@/domain/warrantLog';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from './executionLedger';
import { WARRANT_COLUMNS, WARRANT_LEDGER_DDL } from './warrantLedger';
import { ddlColumns } from './ddl';

let client: PGlite;
let scenario = 0;

const T_OPEN = '2026-10-01T09:00:00.000Z';
const T_HOLD = '2026-10-01T10:00:00.000Z';
const T_LATER = '2026-10-02T10:00:00.000Z';

const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA wr_${scenario}; SET search_path TO wr_${scenario};
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}${WARRANT_LEDGER_DDL}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO wr_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO wr_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

const budget = () => sql(`INSERT INTO shared_budget VALUES ('B1', 'Q4 freight', 100000, '${T_OPEN}')`);

const movement = (id: string, over: { seq?: number; state?: string; delta?: number; before?: number; after?: number; follows?: readonly [string, number] | null } = {}) => sql(`
  INSERT INTO budget_reservation VALUES ('${id}', 'B1', ${over.seq ?? 0}, '${over.state ?? 'HELD'}',
    ${over.delta ?? -30000}, ${over.before ?? 100000}, ${over.after ?? 70000},
    ${over.follows ? `'${over.follows[0]}', ${over.follows[1]}` : 'NULL, NULL'}, '${T_HOLD}')`);

describe('a reservation holds; a check does not', () => {
  beforeEach(budget);

  it('opens the line at the limit and holds against it', async () => {
    await movement('M0', { seq: 0, delta: -30000, before: 100000, after: 70000 });
    expect(await rows(`SELECT balance_after_minor::int AS b FROM budget_reservation`)).toEqual([{ b: 70000 }]);
  });

  /*
   * THE RACE. Two writers both read a balance of 70000, both pass a limit
   * check for 50000, and together spend 100000 of a 70000 remainder. Both name
   * M0 as their predecessor, and only one of them can.
   */
  it('refuses two concurrent holds that each read the same balance', async () => {
    await movement('M0', { seq: 0, delta: -30000, before: 100000, after: 70000 });
    await movement('M1', { seq: 1, delta: -50000, before: 70000, after: 20000, follows: ['M0', 70000] });
    await expect(movement('M2', { seq: 2, delta: -50000, before: 70000, after: 20000, follows: ['M0', 70000] }))
      .rejects.toThrow(/reservation_one_successor/);
  });

  /* And a writer that read a stale balance cannot commit against it. */
  it('refuses a hold whose opening balance is not what the previous movement left', async () => {
    await movement('M0', { seq: 0, delta: -30000, before: 100000, after: 70000 });
    await expect(movement('M1', { seq: 1, delta: -10000, before: 100000, after: 90000, follows: ['M0', 70000] }))
      .rejects.toThrow(/reservation_continues_the_balance/);
  });

  it('refuses a hold whose arithmetic does not add up', async () => {
    await expect(movement('M0', { seq: 0, delta: -30000, before: 100000, after: 80000 }))
      .rejects.toThrow(/reservation_arithmetic/);
  });

  /* A budget cannot go below zero, so a hold larger than the balance is refused. */
  it('refuses a hold larger than what remains', async () => {
    await movement('M0', { seq: 0, delta: -30000, before: 100000, after: 70000 });
    await expect(movement('M1', { seq: 1, delta: -90000, before: 70000, after: -20000, follows: ['M0', 70000] }))
      .rejects.toThrow(/balance_after_minor/);
  });

  it('refuses a line that opens without starting at zero', async () => {
    await expect(movement('M0', { seq: 4 })).rejects.toThrow(/reservation_line_opens_once/);
  });

  it('refuses a hold that is not a debit', async () => {
    await expect(movement('M0', { seq: 0, state: 'HELD', delta: 30000, before: 100000, after: 130000 }))
      .rejects.toThrow(/reservation_hold_is_a_debit/);
  });

  it('releases by crediting the balance back', async () => {
    await movement('M0', { seq: 0, delta: -30000, before: 100000, after: 70000 });
    await movement('M1', { seq: 1, state: 'RELEASED', delta: 30000, before: 70000, after: 100000, follows: ['M0', 70000] });
    expect(await rows(`SELECT balance_after_minor::int AS b FROM budget_reservation WHERE reservation_id = 'M1'`))
      .toEqual([{ b: 100000 }]);
  });
});

describe('a warrant answers all seven', () => {
  it('derives its columns from the questions, so the two cannot drift', () => {
    expect(WARRANT_COLUMNS).toHaveLength(WARRANT_QUESTIONS.length);
    expect(WARRANT_COLUMNS).toContain('by_whose_authority');
    expect(WARRANT_COLUMNS).toContain('through_which_execution_attempt');
    for (const column of WARRANT_COLUMNS) {
      expect(WARRANT_LEDGER_DDL, column).toContain(`${column} text NOT NULL`);
    }
  });

  /*
   * A warrant ties to an execution attempt, and no attempt can exist in the
   * real corpus because no authorization can be written — the release key has
   * nothing to point at. The structural block reaches this table too.
   */
  it('cannot be written, because nothing has been authorized to transition', async () => {
    const values = WARRANT_COLUMNS.map(() => `'x'`).join(', ');
    await expect(sql(`INSERT INTO transition_warrant VALUES ('W1', 'T-NOPE', ${values}, '${T_LATER}')`))
      .rejects.toThrow(/attempt_id|foreign key/i);
    expect(await rows(`SELECT release_id FROM releases`)).toEqual([]);
  });
});

/*
 * The block above is real and it is also why the warrant's own checks were
 * unexercised: a mutation that let a warrant leave a question blank changed
 * nothing, because no warrant could be written either way. So this block seeds
 * the whole execution chain — release, proposal, authorization, operation,
 * attempt — and then tests the warrant against an attempt that exists.
 */
describe('and once there is something to account for', () => {
  const T_GRANT = '2026-10-01T09:00:00.000Z';
  const T_TRY = '2026-10-01T09:05:00.000Z';
  const T_EXPIRE = '2026-10-01T12:00:00.000Z';

  beforeEach(async () => {
    await sql(`
      INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb);
      INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_GRANT}', '{}'::jsonb);
      INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at)
        VALUES ('P1', 'book_freight', 'carrier:acme', 'AGENT', 'agent:planner', '${T_GRANT}');
      INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by,
        corpus_release_id, state_revision, policy_version, granted_at, expires_at)
        VALUES ('A1', 'P1', 'NARROW_ACTION', 'HUMAN', 'operator:jo', 'REL-1', 41, 'policy@3', '${T_GRANT}', '${T_EXPIRE}');
      INSERT INTO execution_operation VALUES ('O1', 'A1', 'idem-1', '${T_GRANT}');
      INSERT INTO execution_attempt (attempt_id, operation_id, authorization_id, authorization_state_revision,
        authorization_granted_at, authorization_expires_at, ran_at_state_revision, attempted_at, outcome)
        VALUES ('T1', 'O1', 'A1', 41, '${T_GRANT}', '${T_EXPIRE}', 41, '${T_TRY}', 'CONFIRMED')`);
  });

  const warrant = (blankAt = -1) => {
    const values = WARRANT_COLUMNS.map((_, index) => (index === blankAt ? `'   '` : `'answered'`)).join(', ');
    return sql(`INSERT INTO transition_warrant VALUES ('W1', 'T1', ${values}, '${T_LATER}')`);
  };

  it('writes a warrant against the attempt it describes', async () => {
    await warrant();
    expect(await rows(`SELECT attempt_id FROM transition_warrant`)).toEqual([{ attempt_id: 'T1' }]);
  });

  /* A warrant missing any of the seven is a log line. */
  it('refuses a warrant that leaves any of the seven questions blank', async () => {
    for (const [index, column] of WARRANT_COLUMNS.entries()) {
      await expect(warrant(index), column).rejects.toThrow(new RegExp(column));
    }
  });

  it('writes one warrant per attempt', async () => {
    await warrant();
    const values = WARRANT_COLUMNS.map(() => `'again'`).join(', ');
    await expect(sql(`INSERT INTO transition_warrant VALUES ('W2', 'T1', ${values}, '${T_LATER}')`))
      .rejects.toThrow(/attempt_id/);
  });
});

describe('an exception is owned, and does not resolve by retrying', () => {
  const exception = (over: { kind?: string; owner?: string; path?: string } = {}) => sql(`
    INSERT INTO desk_exception (exception_id, kind, owner, reason, resolution_path, raised_at, resolved_at, resolution)
    VALUES ('X1', '${over.kind ?? 'STALE_EVIDENCE'}', '${over.owner ?? 'operator:jo'}',
      'The customs extract predates the decision it is being used for.',
      '${over.path ?? 'Re-acquire, or narrow the conclusion to what the old evidence supports.'}',
      '${T_HOLD}', NULL, NULL)`);

  it('records one with an owner and a path', async () => {
    await exception();
    expect(await rows(`SELECT owner FROM desk_exception`)).toEqual([{ owner: 'operator:jo' }]);
  });

  it('refuses one with no owner', async () => {
    await expect(exception({ owner: '  ' })).rejects.toThrow(/owner/);
  });

  /*
   * A retry after an unknown outcome is how one booking becomes two. It is not
   * a resolution, and the desk will not accept it as one.
   */
  it('refuses a resolution path that is a retry', async () => {
    await expect(exception({ path: 'Retry the dispatch and see.' }))
      .rejects.toThrow(/exception_is_not_resolved_by_retrying/);
    await expect(exception({ path: 'Wait and try again later.' }))
      .rejects.toThrow(/exception_is_not_resolved_by_retrying/);
  });

  it('carries all six kinds, none of them resolved by retrying', async () => {
    for (const [index, kind] of EXCEPTION_KINDS.entries()) {
      const contract = EXCEPTION_CONTRACTS.find((entry) => entry.kind === kind)!;
      expect(contract.resolvedBy.toLowerCase(), kind).not.toContain('retry');
      await sql(`INSERT INTO desk_exception (exception_id, kind, owner, reason, resolution_path, raised_at)
        VALUES ('X${index}', '${kind}', 'operator:jo', 'r', '${contract.resolvedBy.replace(/'/g, "''")}', '${T_HOLD}')`);
    }
    expect(await rows(`SELECT count(*)::int AS n FROM desk_exception`)).toEqual([{ n: EXCEPTION_KINDS.length }]);
  });

  it('refuses a resolution stamped without saying what it was', async () => {
    await expect(sql(`INSERT INTO desk_exception (exception_id, kind, owner, reason, resolution_path, raised_at, resolved_at, resolution)
      VALUES ('X1', 'STALE_EVIDENCE', 'operator:jo', 'r', 'Re-acquire.', '${T_HOLD}', '${T_LATER}', NULL)`))
      .rejects.toThrow(/exception_resolution_columns_together/);
  });

  it('refuses a resolution that precedes the exception', async () => {
    await expect(sql(`INSERT INTO desk_exception (exception_id, kind, owner, reason, resolution_path, raised_at, resolved_at, resolution)
      VALUES ('X1', 'STALE_EVIDENCE', 'operator:jo', 'r', 'Re-acquire.', '${T_LATER}', '${T_HOLD}', 'done')`))
      .rejects.toThrow(/exception_resolved_after_raised/);
  });
});

describe('nothing has transitioned', () => {
  it('holds no budget, reservation, warrant or exception', async () => {
    for (const table of ['shared_budget', 'budget_reservation', 'transition_warrant', 'desk_exception']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  /*
   * The last of these, and the only one that was ever doing work.
   *
   * Ten other ledgers carried a test of this shape, and all of them asserted
   * columns written literally in their own DDL — remove such a column and
   * between three and fifty-four behavioural tests in the same file fail
   * first, which is how it was established that those ten guarded nothing.
   *
   * These seven are different: they are not written anywhere. warrantLedger.ts
   * generates them by slugifying WARRANT_QUESTIONS, and generates the DDL from
   * the same array, so the inserts and the schema rename together and no
   * behavioural test can notice. Reword a question in the domain — "On what
   * evidence" to "On what basis" — and a schema column silently becomes
   * `on_what_basis` while every migration, query and dashboard naming the old
   * one breaks somewhere this suite cannot see.
   *
   * So this pins the derivation to the names the schema actually has.
   */
  it('derives the seven column names from the seven questions, and creates exactly those', () => {
    expect(WARRANT_COLUMNS).toEqual([
      'what_changed', 'from_which_state', 'on_what_evidence', 'under_which_rule',
      'by_whose_authority', 'through_which_execution_attempt', 'with_what_verification',
    ]);
    const created = ddlColumns(WARRANT_LEDGER_DDL)['transition_warrant'];
    for (const column of WARRANT_COLUMNS) expect(created, column).toContain(column);
  });
});
