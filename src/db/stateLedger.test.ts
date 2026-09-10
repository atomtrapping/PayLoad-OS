/**
 * The three meanings, against an actual PostgreSQL engine.
 *
 * The arrangement here is the point. An earlier design put each kind in its own
 * table with its kind pinned to a literal, and every check comparing a child's
 * denormalised copy would then have been unfireable — a parent that can hold
 * only one value gives the copy nothing to disagree with. One parent holding
 * all three makes the keys discriminate, and the cases below are written to
 * prove that they do.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { INDEPENDENT_KINDS, OBSERVATION_BASES, STATE_KINDS } from '@/domain/stateKinds';
import { STATE_LEDGER_DDL, stateDdlColumns } from './stateLedger';

let client: PGlite;
let scenario = 0;

const T_JAN = '2026-01-15T00:00:00.000Z';
const T_FEB = '2026-02-15T00:00:00.000Z';
const T_MAR = '2026-03-15T00:00:00.000Z';
const FP = (n: number) => `sha256:${String(n).repeat(2).padStart(64, '0')}`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA st_${scenario}; SET search_path TO st_${scenario}; ${STATE_LEDGER_DDL}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO st_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO st_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** One subject of each kind, so a child can name the wrong one on purpose. */
async function subjects() {
  await sql(`
    INSERT INTO state_subject VALUES ('S-PLANT', 'PHYSICAL', 'Plant utilization', 'CAPACITY', '${T_JAN}');
    INSERT INTO state_subject VALUES ('S-EST', 'ESTIMATED', 'An estimate of it', NULL, '${T_JAN}');
    INSERT INTO state_subject VALUES ('S-JOB', 'OPERATIONAL', 'The dossier job', NULL, '${T_JAN}')`);
}

const estimate = (id: string, over: { subject?: string; kind?: string; describes?: string; known?: string; supersedes?: readonly [string, string, string] } = {}) => sql(`
  INSERT INTO state_estimate (estimate_id, subject_id, subject_kind, describes_at, evidence_known_by,
    evidence_snapshot, model_version, uncertainty, applicability_limit,
    supersedes_estimate_id, supersedes_describes_at, supersedes_evidence_known_by)
  VALUES ('${id}', '${over.subject ?? 'S-PLANT'}', '${over.kind ?? 'PHYSICAL'}', '${over.describes ?? T_JAN}', '${over.known ?? T_FEB}',
    '${FP(1)}', 'm@1.2.0', '±18% at one sigma',
    'Fitted on continuous-process lines above 40kt. Not fitted for batch plants, and not for any line outside North America.',
    ${over.supersedes ? `'${over.supersedes[0]}', '${over.supersedes[1]}', '${over.supersedes[2]}'` : 'NULL, NULL, NULL'})`);

describe('the parent holds three kinds, so the keys discriminate', () => {
  beforeEach(subjects);

  /*
   * Each of these names a subject that EXISTS. Only its kind is wrong — which
   * is the case that isolates the kind check from a missing-row lookup, and the
   * case a one-value parent could not have produced.
   */
  it('refuses a reading about a subject that is not the world', async () => {
    await expect(sql(`INSERT INTO variable_reading VALUES ('R1', 'S-JOB', 'OPERATIONAL', 'DIRECT_OBSERVATION', 'x', '${T_JAN}')`))
      .rejects.toThrow(/reading_is_about_the_physical/);
  });

  it('refuses an estimate about an operational scope', async () => {
    await expect(estimate('E1', { subject: 'S-JOB', kind: 'OPERATIONAL' }))
      .rejects.toThrow(/estimate_is_about_the_physical/);
  });

  it('refuses a revision on the world, which does not have versions', async () => {
    await expect(sql(`INSERT INTO accepted_revision VALUES ('V1', 'S-PLANT', 'PHYSICAL', 0, NULL, 'e', '${T_JAN}')`))
      .rejects.toThrow(/revision_is_operational/);
  });

  /* And a kind that does not match the subject fails the key rather than the check. */
  it('refuses a child that misreports its subject’s kind', async () => {
    await expect(sql(`INSERT INTO variable_reading VALUES ('R1', 'S-JOB', 'PHYSICAL', 'DIRECT_OBSERVATION', 'x', '${T_JAN}')`))
      .rejects.toThrow(/reading_subject|foreign key/i);
  });

  it('accepts each child on a subject of its own kind', async () => {
    await sql(`INSERT INTO variable_reading VALUES ('R1', 'S-PLANT', 'PHYSICAL', 'DIRECT_OBSERVATION', 'Two trucks left the gate.', '${T_JAN}')`);
    await estimate('E1');
    await sql(`INSERT INTO accepted_revision VALUES ('V1', 'S-JOB', 'OPERATIONAL', 0, NULL, 'quote accepted', '${T_JAN}')`);
    expect(await rows(`SELECT count(*)::int AS n FROM variable_reading`)).toEqual([{ n: 1 }]);
    expect(await rows(`SELECT count(*)::int AS n FROM state_estimate`)).toEqual([{ n: 1 }]);
    expect(await rows(`SELECT count(*)::int AS n FROM accepted_revision`)).toEqual([{ n: 1 }]);
  });

  it('keeps the block on the physical subject and off the others', async () => {
    await expect(sql(`INSERT INTO state_subject VALUES ('S-X', 'OPERATIONAL', 'x', 'CAPACITY', '${T_JAN}')`))
      .rejects.toThrow(/subject_block_only_on_physical/);
    await expect(sql(`INSERT INTO state_subject VALUES ('S-Y', 'PHYSICAL', 'y', NULL, '${T_JAN}')`))
      .rejects.toThrow(/subject_block_only_on_physical/);
  });

  it('keeps the domain and the schema agreeing about the three', () => {
    expect(STATE_KINDS).toEqual(['PHYSICAL', 'ESTIMATED', 'OPERATIONAL']);
    expect(INDEPENDENT_KINDS).toEqual(['PHYSICAL']);
  });
});

describe('a correction moves knowledge, not the event', () => {
  beforeEach(async () => { await subjects(); await estimate('E1', { describes: T_JAN, known: T_FEB }); });

  /*
   * The sharp case. An estimate that "corrects" a January figure by restating
   * it as a February figure has answered a different question and kept the old
   * question's audience — harder to notice than a wrong number, and worse,
   * because a wrong number would eventually be contradicted.
   */
  it('refuses a correction that restates which period it is about', async () => {
    await expect(estimate('E2', { describes: T_FEB, known: T_MAR, supersedes: ['E1', T_JAN, T_FEB] }))
      .rejects.toThrow(/estimate_correction_keeps_the_period|estimate_supersedes|foreign key/i);
  });

  it('refuses a correction that knows no more than what it corrects', async () => {
    await expect(estimate('E2', { describes: T_JAN, known: T_FEB, supersedes: ['E1', T_JAN, T_FEB] }))
      .rejects.toThrow(/estimate_correction_knows_later/);
  });

  /* Self-supersession is refused by the same ordering, not by a separate rule. */
  it('refuses an estimate superseding itself', async () => {
    await expect(estimate('E1', { describes: T_JAN, known: T_FEB, supersedes: ['E1', T_JAN, T_FEB] }))
      .rejects.toThrow(/estimate_correction_knows_later|estimate_id/);
  });

  it('accepts a later reading of the same period', async () => {
    await estimate('E2', { describes: T_JAN, known: T_MAR, supersedes: ['E1', T_JAN, T_FEB] });
    const [row] = await rows(`SELECT describes_at, evidence_known_by FROM state_estimate WHERE estimate_id = 'E2'`);
    expect(row.describes_at).toEqual(row.describes_at);
    expect(await rows(`SELECT count(*)::int AS n FROM state_estimate`)).toEqual([{ n: 2 }]);
  });

  /*
   * The claimed evidence time is EARLIER than E2's, so the ordering check
   * passes and the composite key is the only thing left — which is what makes
   * this a test of the key rather than of the ordering it sits beside.
   */
  it('refuses a supersession that misreports what it supersedes', async () => {
    const NOT_E1S_TIME = '2026-02-20T00:00:00.000Z';
    await expect(estimate('E2', { describes: T_JAN, known: T_MAR, supersedes: ['E1', T_JAN, NOT_E1S_TIME] }))
      .rejects.toThrow(/estimate_supersedes|foreign key/i);
  });
});

describe('an estimate says where it does not apply', () => {
  beforeEach(subjects);

  const bare = (limit: string) => sql(`
    INSERT INTO state_estimate (estimate_id, subject_id, subject_kind, describes_at, evidence_known_by,
      evidence_snapshot, model_version, uncertainty, applicability_limit)
    VALUES ('E1', 'S-PLANT', 'PHYSICAL', '${T_JAN}', '${T_FEB}', '${FP(1)}', 'm@1', '±18%', '${limit}')`);

  /* The field nothing in this repository had before. */
  it('refuses an estimate with no stated limit', async () => {
    await expect(bare('   ')).rejects.toThrow(/applicability_limit/);
  });

  it('accepts one that names the regime it was not fitted for', async () => {
    await bare('Not fitted for batch plants.');
    expect(await rows(`SELECT applicability_limit FROM state_estimate`))
      .toEqual([{ applicability_limit: 'Not fitted for batch plants.' }]);
  });

  it('requires the model version and the uncertainty too', async () => {
    await expect(sql(`INSERT INTO state_estimate (estimate_id, subject_id, subject_kind, describes_at, evidence_known_by,
      evidence_snapshot, model_version, uncertainty, applicability_limit)
      VALUES ('E1', 'S-PLANT', 'PHYSICAL', '${T_JAN}', '${T_FEB}', '${FP(1)}', '  ', '±18%', 'x')`))
      .rejects.toThrow(/model_version/);
  });
});

describe('three bases that must not acquire identical standing', () => {
  beforeEach(subjects);

  it('carries the basis with the reading rather than inferring it later', async () => {
    for (const [index, basis] of OBSERVATION_BASES.entries()) {
      await sql(`INSERT INTO variable_reading VALUES ('R${index}', 'S-PLANT', 'PHYSICAL', '${basis}', 'x', '${T_JAN}')`);
    }
    expect(await rows(`SELECT count(DISTINCT basis)::int AS n FROM variable_reading`))
      .toEqual([{ n: OBSERVATION_BASES.length }]);
  });

  it('refuses a basis it does not carry', async () => {
    await expect(sql(`INSERT INTO variable_reading VALUES ('R1', 'S-PLANT', 'PHYSICAL', 'SOMEBODY_SAID_SO', 'x', '${T_JAN}')`))
      .rejects.toThrow(/basis/);
  });
});

describe('a contradiction is recorded, not refused', () => {
  beforeEach(async () => {
    await subjects();
    await sql(`
      INSERT INTO accepted_revision VALUES ('V0', 'S-JOB', 'OPERATIONAL', 0, NULL, 'opened', '${T_JAN}');
      INSERT INTO accepted_revision VALUES ('V1', 'S-JOB', 'OPERATIONAL', 1, 0, 'source A says delivered', '${T_FEB}');
      INSERT INTO accepted_revision VALUES ('V2', 'S-JOB', 'OPERATIONAL', 2, 1, 'source B says not delivered', '${T_MAR}')`);
  });

  /*
   * The inversion. Canonical means authoritative for the record, not true about
   * the world, so a disagreement is a legitimate state — and the requirement is
   * that it be written down rather than that it not happen.
   */
  it('records two accepted revisions that disagree', async () => {
    await sql(`INSERT INTO recorded_contradiction VALUES ('C1', 'S-JOB', 1, 2, 'Delivery asserted and denied by two sources.', '${T_MAR}')`);
    expect(await rows(`SELECT disagreement FROM recorded_contradiction`))
      .toEqual([{ disagreement: 'Delivery asserted and denied by two sources.' }]);
  });

  it('refuses a revision contradicting itself', async () => {
    await expect(sql(`INSERT INTO recorded_contradiction VALUES ('C1', 'S-JOB', 1, 1, 'x', '${T_MAR}')`))
      .rejects.toThrow(/contradiction_is_between_two/);
  });

  it('refuses a contradiction naming a revision the scope does not have', async () => {
    await expect(sql(`INSERT INTO recorded_contradiction VALUES ('C1', 'S-JOB', 1, 9, 'x', '${T_MAR}')`))
      .rejects.toThrow(/contradiction_right|foreign key/i);
  });

  it('refuses a disagreement that does not say what it is', async () => {
    await expect(sql(`INSERT INTO recorded_contradiction VALUES ('C1', 'S-JOB', 1, 2, '  ', '${T_MAR}')`))
      .rejects.toThrow(/disagreement/);
  });
});

describe('operational state advances by version', () => {
  beforeEach(subjects);

  it('opens a line at zero and succeeds forward', async () => {
    await sql(`
      INSERT INTO accepted_revision VALUES ('V0', 'S-JOB', 'OPERATIONAL', 0, NULL, 'opened', '${T_JAN}');
      INSERT INTO accepted_revision VALUES ('V1', 'S-JOB', 'OPERATIONAL', 1, 0, 'quote accepted', '${T_FEB}')`);
    expect(await rows(`SELECT count(*)::int AS n FROM accepted_revision`)).toEqual([{ n: 2 }]);
  });

  /* A headless line starting partway through is the half that survives. */
  it('refuses a line that opens somewhere other than zero', async () => {
    await expect(sql(`INSERT INTO accepted_revision VALUES ('V7', 'S-JOB', 'OPERATIONAL', 7, NULL, 'x', '${T_JAN}')`))
      .rejects.toThrow(/revision_line_opens_at_zero/);
  });

  it('refuses a revision succeeding a later one', async () => {
    await sql(`INSERT INTO accepted_revision VALUES ('V0', 'S-JOB', 'OPERATIONAL', 0, NULL, 'opened', '${T_JAN}')`);
    await expect(sql(`INSERT INTO accepted_revision VALUES ('V1', 'S-JOB', 'OPERATIONAL', 1, 5, 'x', '${T_FEB}')`))
      .rejects.toThrow(/revision_succeeds_an_earlier_one/);
  });

  it('refuses two revisions at the same version of one scope', async () => {
    await sql(`INSERT INTO accepted_revision VALUES ('V0', 'S-JOB', 'OPERATIONAL', 0, NULL, 'opened', '${T_JAN}')`);
    await expect(sql(`INSERT INTO accepted_revision VALUES ('V0b', 'S-JOB', 'OPERATIONAL', 0, NULL, 'again', '${T_FEB}')`))
      .rejects.toThrow(/revision_once_per_scope/);
  });
});

describe('nothing is declared', () => {
  it('holds no subject, reading, estimate, revision or contradiction', async () => {
    for (const table of ['state_subject', 'variable_reading', 'state_estimate',
      'accepted_revision', 'recorded_contradiction']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('creates the columns the drift check names', () => {
    expect(stateDdlColumns()['state_estimate']).toContain('applicability_limit');
    expect(stateDdlColumns()['state_estimate']).toContain('evidence_known_by');
    expect(stateDdlColumns()['variable_reading']).toContain('basis');
  });
});
