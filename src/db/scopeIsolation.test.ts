/**
 * The boundary, against an actual PostgreSQL engine.
 *
 * Each case below is written where the constraint it names is the SOLE thing
 * refusing the row. That discipline is the whole reason this file is arranged
 * the way it is: the sentence the module is named for — a customer's private
 * contract cannot reach the reusable corpus — is refused by the holder check
 * before the flow check is ever consulted, so a test written from that sentence
 * would pass with the flow check deleted and prove nothing about it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PERMITTED_FLOWS, SCOPE_CONTRACTS, TRAINABLE_SCOPES, flowPermitted } from '@/domain/governedScopes';
import { FIRM_HELD_CLASSES, SCOPE_ISOLATION_DDL } from './scopeIsolation';

let client: PGlite;
let scenario = 0;

const T_OPEN = '2026-06-01T09:00:00.000Z';
const T_CROSS = '2026-06-02T09:00:00.000Z';

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA iso_${scenario}; SET search_path TO iso_${scenario}; ${SCOPE_ISOLATION_DDL}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO iso_${scenario}; ${statement}`);
}
async function rows(query: string) {
  await client.query(`SET search_path TO iso_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

const scope = (id: string, cls: string, holder: string, door = `door:${id}`) => sql(`
  INSERT INTO governed_scope (scope_id, scope_class, holder_id, admission_authority, opened_at)
  VALUES ('${id}', '${cls}', '${holder}', '${door}', '${T_OPEN}')`);

/** The firm's own scopes, and two customers'. */
async function opened() {
  await scope('S-CORPUS', 'REUSABLE_CORPUS', 'firm');
  await scope('S-OPS', 'FIRM_OPERATIONAL', 'firm');
  await scope('S-RESEARCH', 'RESEARCH_ACCOUNT', 'firm');
  await scope('S-LIVE', 'EXECUTION_ACCOUNT', 'firm');
  await scope('S-ACME', 'CUSTOMER_PRIVATE', 'customer:acme');
  await scope('S-BOREAL', 'CUSTOMER_PRIVATE', 'customer:boreal');
}

const crossing = (id: string, from: readonly [string, string, string], to: readonly [string, string, string], surface = 'COMPUTATION') => sql(`
  INSERT INTO scope_crossing (crossing_id, surface, from_scope_id, from_scope_class, from_holder_id,
    to_scope_id, to_scope_class, to_holder_id, crossed_at)
  VALUES ('${id}', '${surface}', '${from[0]}', '${from[1]}', '${from[2]}', '${to[0]}', '${to[1]}', '${to[2]}', '${T_CROSS}')`);

const CORPUS = ['S-CORPUS', 'REUSABLE_CORPUS', 'firm'] as const;
const OPS = ['S-OPS', 'FIRM_OPERATIONAL', 'firm'] as const;
const RESEARCH = ['S-RESEARCH', 'RESEARCH_ACCOUNT', 'firm'] as const;
const LIVE = ['S-LIVE', 'EXECUTION_ACCOUNT', 'firm'] as const;
const ACME = ['S-ACME', 'CUSTOMER_PRIVATE', 'customer:acme'] as const;
const BOREAL = ['S-BOREAL', 'CUSTOMER_PRIVATE', 'customer:boreal'] as const;

describe('the same entity lives in many scopes', () => {
  beforeEach(opened);

  /*
   * The property the whole substrate is built on, asserted here so that a
   * later "fix" adding a unique index on entity_id fails loudly.
   */
  it('lets two customers hold records about the same manufacturer', async () => {
    await sql(`
      INSERT INTO scoped_record VALUES ('R1', 'S-ACME', 'CUSTOMER_PRIVATE', 'customer:acme', 'org:meridian', 'door:S-ACME', '${T_OPEN}');
      INSERT INTO scoped_record VALUES ('R2', 'S-BOREAL', 'CUSTOMER_PRIVATE', 'customer:boreal', 'org:meridian', 'door:S-BOREAL', '${T_OPEN}')`);
    expect(await rows(`SELECT count(*)::int AS n FROM scoped_record WHERE entity_id = 'org:meridian'`))
      .toEqual([{ n: 2 }]);
  });

  /* And the door is a column. A record admitted elsewhere does not go in. */
  it('refuses a record admitted through another scope’s authority', async () => {
    await expect(sql(`INSERT INTO scoped_record
      VALUES ('R1', 'S-ACME', 'CUSTOMER_PRIVATE', 'customer:acme', 'org:meridian', 'door:S-CORPUS', '${T_OPEN}')`))
      .rejects.toThrow(/record_admitted_through_the_scopes_door|foreign key/i);
  });

  it('gives a holder one scope of each class', async () => {
    await expect(scope('S-ACME-2', 'CUSTOMER_PRIVATE', 'customer:acme', 'door:S-ACME-2'))
      .rejects.toThrow(/scope_one_per_holder_and_class/);
  });
});

describe('a crossing stays with its holder', () => {
  beforeEach(opened);

  /*
   * The sentence the module is named for — and TWO constraints refuse it
   * independently, because CUSTOMER_PRIVATE appears in no permitted flow at
   * all. PostgreSQL does not define which of two violated CHECKs it reports,
   * so this case names both rather than pretending to know. What it proves is
   * that the row does not go in; which constraint stopped it is proved below.
   */
  it('refuses a customer’s record reaching the reusable corpus', async () => {
    await expect(crossing('X1', ACME, CORPUS))
      .rejects.toThrow(/crossing_stays_with_its_holder|crossing_is_a_permitted_flow/);
  });

  /*
   * And this is where the holder check is the SOLE refuser. Both scopes are
   * CUSTOMER_PRIVATE, so from_scope_class = to_scope_class and the flow check
   * passes; only the differing holder stands in the way. Delete
   * crossing_stays_with_its_holder and this is the case that goes green.
   */
  it('refuses one customer’s record reaching another customer', async () => {
    await expect(crossing('X1', ACME, BOREAL))
      .rejects.toThrow(/crossing_stays_with_its_holder/);
  });

  it('lets the corpus reach a customer, because the corpus is not holder-partitioned', async () => {
    await crossing('X1', CORPUS, ACME);
    expect(await rows(`SELECT to_holder_id FROM scope_crossing`)).toEqual([{ to_holder_id: 'customer:acme' }]);
  });

  /* Within one holder, a crossing between two of their own scopes is fine. */
  it('lets a customer’s scope feed itself', async () => {
    await crossing('X1', ACME, ACME);
    expect(await rows(`SELECT crossing_id FROM scope_crossing`)).toEqual([{ crossing_id: 'X1' }]);
  });
});

describe('a crossing is a permitted flow', () => {
  beforeEach(opened);

  /*
   * Written between two of the FIRM's own scopes on purpose. Both holders are
   * 'firm', so the holder check passes and the flow check is the only thing
   * left — which makes this the one case where a failure proves the flow rule
   * rather than the holder rule.
   */
  it('refuses a firm scope feeding another firm scope the flow table does not permit', async () => {
    expect(FIRM_HELD_CLASSES).toContain('RESEARCH_ACCOUNT');
    expect(FIRM_HELD_CLASSES).toContain('FIRM_OPERATIONAL');
    expect(flowPermitted('RESEARCH_ACCOUNT', 'FIRM_OPERATIONAL')).toBe(false);
    await expect(crossing('X1', RESEARCH, OPS))
      .rejects.toThrow(/crossing_is_a_permitted_flow/);
  });

  it('refuses a live account feeding research, which would be hindsight', async () => {
    expect(flowPermitted('EXECUTION_ACCOUNT', 'RESEARCH_ACCOUNT')).toBe(false);
    await expect(crossing('X1', LIVE, RESEARCH))
      .rejects.toThrow(/crossing_is_a_permitted_flow/);
  });

  /* The one permitted crossing from paper into money. */
  it('lets research reach a live account', async () => {
    expect(flowPermitted('RESEARCH_ACCOUNT', 'EXECUTION_ACCOUNT')).toBe(true);
    await crossing('X1', RESEARCH, LIVE);
    expect(await rows(`SELECT to_scope_class FROM scope_crossing`)).toEqual([{ to_scope_class: 'EXECUTION_ACCOUNT' }]);
  });

  it('keeps the domain and the schema agreeing about the flows', () => {
    expect(PERMITTED_FLOWS.some((flow) => flow.from === 'CUSTOMER_PRIVATE')).toBe(false);
    for (const flow of PERMITTED_FLOWS) {
      expect(SCOPE_ISOLATION_DDL, `${flow.from}->${flow.to}`).toContain(`('${flow.from}', '${flow.to}')`);
    }
  });
});

describe('the boundary applies at four surfaces', () => {
  beforeEach(opened);

  /*
   * A boundary enforced only at retrieval is a user-interface boundary. Each
   * surface is a value the column holds, so a computation that crosses is
   * recorded and refused on the same terms as a read that crosses.
   */
  it('refuses the same illegal crossing at every surface', async () => {
    /* Customer to customer, so the holder check is the only refuser at each. */
    for (const [index, surface] of ['RETRIEVAL', 'COMPUTATION', 'EXPORT', 'LEARNING'].entries()) {
      await expect(crossing(`X${index}`, ACME, BOREAL, surface), surface)
        .rejects.toThrow(/crossing_stays_with_its_holder/);
    }
  });

  it('refuses a surface it does not carry', async () => {
    await expect(crossing('X1', CORPUS, ACME, 'RENDERING')).rejects.toThrow(/surface/);
  });
});

describe('learning is a separate failure', () => {
  beforeEach(opened);

  /*
   * A model fitted on a customer's private constraint carries it wherever the
   * model goes and cannot be asked to forget, so this is refused at the row
   * rather than reviewed at the pull request.
   */
  it('refuses fitting a model on a customer’s private scope', async () => {
    await expect(sql(`INSERT INTO training_input VALUES ('T1', 'm@1', 'S-ACME', 'CUSTOMER_PRIVATE', '${T_OPEN}')`))
      .rejects.toThrow(/training_only_on_trainable_scopes/);
  });

  /* And on the firm's own live fills, which would learn its own market impact. */
  it('refuses fitting a model on a live execution account', async () => {
    await expect(sql(`INSERT INTO training_input VALUES ('T1', 'm@1', 'S-LIVE', 'EXECUTION_ACCOUNT', '${T_OPEN}')`))
      .rejects.toThrow(/training_only_on_trainable_scopes/);
  });

  it('permits the reusable corpus', async () => {
    await sql(`INSERT INTO training_input VALUES ('T1', 'm@1', 'S-CORPUS', 'REUSABLE_CORPUS', '${T_OPEN}')`);
    expect(await rows(`SELECT scope_class FROM training_input`)).toEqual([{ scope_class: 'REUSABLE_CORPUS' }]);
  });

  it('keeps the domain and the schema agreeing about what may be trained on', () => {
    expect(TRAINABLE_SCOPES).not.toContain('CUSTOMER_PRIVATE');
    expect(TRAINABLE_SCOPES).not.toContain('EXECUTION_ACCOUNT');
    for (const cls of TRAINABLE_SCOPES) expect(SCOPE_CONTRACTS[cls].mayTrain, cls).toBe(true);
  });
});

describe('nothing is isolated yet', () => {
  it('holds no scope, record, crossing or training input', async () => {
    for (const table of ['governed_scope', 'scoped_record', 'scope_crossing', 'training_input']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });
});
