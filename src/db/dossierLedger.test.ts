/**
 * Delivery, against an actual PostgreSQL engine.
 *
 * The case this file exists for is the one a tidier schema could not have
 * written: handing customer A's dossier to customer B. It is representable
 * here — the delivery names its own recipient — which is the only reason it can
 * be refused, and the only reason a test of the refusal proves anything.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { CANDIDATE_STANDINGS, REUSABLE_STANDINGS } from '@/domain/dossierService';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from './discoveryLedger';
import { DOSSIER_LEDGER_DDL, dossierDdlColumns } from './dossierLedger';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-07-01T08:00:00.000Z';
const T_ASK = '2026-07-02T09:00:00.000Z';
const T_QUOTE = '2026-07-02T10:00:00.000Z';
const T_BUILD = '2026-07-03T10:00:00.000Z';
const T_RELEASE = '2026-07-03T11:00:00.000Z';
const FP = (n: number) => `sha256:${String(n).repeat(2).padStart(64, '0')}`;

const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE TABLE corpus_record (record_id text PRIMARY KEY, release_id text NOT NULL, subject_id text NOT NULL, predicate text NOT NULL, known_at timestamptz NOT NULL, UNIQUE (record_id, known_at));
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA dos_${scenario}; SET search_path TO dos_${scenario};
    ${CORPUS_DDL}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${DOSSIER_LEDGER_DDL}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO dos_${scenario}; ${statement}`);
}
async function tx(statement: string) {
  try {
    await client.exec(`SET search_path TO dos_${scenario}; BEGIN; ${statement}; COMMIT;`);
  } catch (error) {
    await client.exec('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function rows(query: string) {
  await client.query(`SET search_path TO dos_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** Two customers, one asking a question. */
const specs = () => sql(`
  INSERT INTO dossier_spec VALUES ('D1', 'customer:acme', 'Alternative polypropylene suppliers.', 'BUILD', '${T_ASK}');
  INSERT INTO dossier_spec VALUES ('D2', 'customer:boreal', 'Corridor exposure.', 'SPEC', '${T_ASK}')`);

const policy = () => sql(`INSERT INTO pricing_policy VALUES ('P-2026', 'operator:jo', '${T_ASK}')`);

const quotation = (id = 'Q1', dossier = 'D1') => sql(`
  INSERT INTO dossier_quotation VALUES ('${id}', '${dossier}', 'P-2026', 480000, 'CAD', '${FP(1)}', '${T_QUOTE}')`);

const release = (id = 'R1', over: { dossier?: string; recipient?: string; version?: number; builtAt?: string } = {}) => sql(`
  INSERT INTO dossier_release (dossier_release_id, dossier_id, recipient_id, version, quotation_id,
    quoted_snapshot, quoted_at, built_snapshot, built_at, released_at, monitored)
  VALUES ('${id}', '${over.dossier ?? 'D1'}', '${over.recipient ?? 'customer:acme'}', ${over.version ?? 1}, 'Q1',
    '${FP(1)}', '${T_QUOTE}', '${FP(2)}', '${over.builtAt ?? T_BUILD}', '${T_RELEASE}', false)`);

/** A mined artifact for a conclusion to rest on. */
async function mined() {
  await sql(`
    INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb);
    INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_KNOWN}', '{}'::jsonb);
    INSERT INTO corpus_record VALUES ('REC-1', 'REL-1', 'org:meridian', 'supplies', '${T_KNOWN}');
    INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
      implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
    VALUES ('W1', 'DESCRIPTIVE', 'COMPUTED_RESULT', '{}'::jsonb, 'm', '{}'::jsonb, 'i', '1', 'o', 'FIXED_POINT', '${FP(3)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('RUN1', 'W1', 'COMPUTED_RESULT', 'REL-1', '${T_KNOWN}', '${T_BUILD}', 'SUCCEEDED', '${FP(4)}', '${FP(5)}')`);
  await tx(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, rights)
    VALUES ('A1', 'RUN1', 'SUCCEEDED', 'COMPUTED_RESULT', 'org:meridian', 'Concentration.', '${T_BUILD}', '{READ}');
    INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
    VALUES ('I1', 'A1', '${T_BUILD}', 'SOURCE_RECORD', 'REC-1', '${T_KNOWN}', '{READ}')`);
}

describe('a dossier goes to the customer who asked for it', () => {
  beforeEach(async () => { await specs(); await policy(); await quotation(); await release(); });

  /*
   * The case a tidier schema could not have written. The delivery names its own
   * recipient, so the wrong one is a row somebody can write — and it does not
   * go in. Note the release EXISTS: it is only the recipient that is wrong, so
   * the composite key is the sole refuser rather than a missing-row lookup.
   */
  it('refuses delivering one customer’s dossier to another', async () => {
    await expect(sql(`INSERT INTO dossier_delivery VALUES ('X1', 'R1', 'customer:boreal', '${T_RELEASE}')`))
      .rejects.toThrow(/delivery_goes_to_the_dossiers_recipient|foreign key/i);
  });

  it('delivers it to the customer who asked', async () => {
    await sql(`INSERT INTO dossier_delivery VALUES ('X1', 'R1', 'customer:acme', '${T_RELEASE}')`);
    expect(await rows(`SELECT recipient_id FROM dossier_delivery`)).toEqual([{ recipient_id: 'customer:acme' }]);
  });

  /* And a release cannot claim a recipient its own spec does not have. */
  it('refuses a release whose recipient is not the spec’s', async () => {
    await expect(release('R2', { version: 2, recipient: 'customer:boreal' }))
      .rejects.toThrow(/release_spec|foreign key/i);
  });
});

describe('an approval belongs to one customer and one application', () => {
  beforeEach(specs);

  /*
   * The most valuable line in a dossier and the most tempting to reuse. There
   * is no column in the corpus table in which it can live.
   */
  it('refuses a corpus candidate carrying a customer approval', async () => {
    await expect(sql(`INSERT INTO corpus_candidate VALUES ('C1', 'org:meridian', 'CUSTOMER_APPROVED', '${T_ASK}')`))
      .rejects.toThrow(/standing/);
  });

  it('accepts the two standings the corpus does own', async () => {
    for (const [index, standing] of REUSABLE_STANDINGS.entries()) {
      await sql(`INSERT INTO corpus_candidate VALUES ('C${index}', 'org:meridian', '${standing}', '${T_ASK}')`);
    }
    expect(await rows(`SELECT count(*)::int AS n FROM corpus_candidate`)).toEqual([{ n: REUSABLE_STANDINGS.length }]);
  });

  it('holds a customer approval with the customer and the application that scope it', async () => {
    await sql(`INSERT INTO customer_approval VALUES ('AP1', 'org:meridian', 'customer:acme', 'PP-homopolymer-MFI-12', 'CUSTOMER_APPROVED', '${T_ASK}')`);
    expect(await rows(`SELECT application FROM customer_approval`)).toEqual([{ application: 'PP-homopolymer-MFI-12' }]);
  });

  /* A different application is a different question, even for the same buyer. */
  it('scopes the approval to its application rather than to the supplier', async () => {
    await sql(`
      INSERT INTO customer_approval VALUES ('AP1', 'org:meridian', 'customer:acme', 'PP-homopolymer-MFI-12', 'CUSTOMER_APPROVED', '${T_ASK}');
      INSERT INTO customer_approval VALUES ('AP2', 'org:meridian', 'customer:acme', 'PP-copolymer-MFI-3', 'CUSTOMER_APPROVED', '${T_ASK}')`);
    expect(await rows(`SELECT count(*)::int AS n FROM customer_approval`)).toEqual([{ n: 2 }]);
    await expect(sql(`INSERT INTO customer_approval VALUES ('AP3', 'org:meridian', 'customer:acme', 'PP-homopolymer-MFI-12', 'CUSTOMER_APPROVED', '${T_ASK}')`))
      .rejects.toThrow(/approval_once/);
  });

  it('refuses a non-customer standing in the customer table', async () => {
    await expect(sql(`INSERT INTO customer_approval VALUES ('AP1', 'org:meridian', 'customer:acme', 'app', 'EVIDENCE_SUPPORTED', '${T_ASK}')`))
      .rejects.toThrow(/approval_is_customer_held/);
  });

  it('keeps the domain and the schema agreeing about who owns which standing', () => {
    expect(CANDIDATE_STANDINGS).toEqual(['DISCOVERED', 'EVIDENCE_SUPPORTED', 'CUSTOMER_APPROVED']);
    expect(REUSABLE_STANDINGS).toEqual(['DISCOVERED', 'EVIDENCE_SUPPORTED']);
    expect(REUSABLE_STANDINGS).not.toContain('CUSTOMER_APPROVED');
  });
});

describe('the quote and the build are two snapshots', () => {
  beforeEach(async () => { await specs(); await policy(); await quotation(); });

  it('keeps both, and they may differ', async () => {
    await release();
    const [row] = await rows(`SELECT quoted_snapshot, built_snapshot FROM dossier_release`);
    expect(row.quoted_snapshot).not.toBe(row.built_snapshot);
  });

  /* A build reads the corpus when it runs, so it cannot have read it earlier. */
  it('refuses a build that predates its own quote', async () => {
    await expect(release('R1', { builtAt: '2026-07-01T00:00:00.000Z' }))
      .rejects.toThrow(/release_built_after_quoted/);
  });

  it('refuses a release whose quotation snapshot is not the quotation’s', async () => {
    await expect(sql(`INSERT INTO dossier_release (dossier_release_id, dossier_id, recipient_id, version, quotation_id,
      quoted_snapshot, quoted_at, built_snapshot, built_at, released_at, monitored)
      VALUES ('R1', 'D1', 'customer:acme', 1, 'Q1', '${FP(9)}', '${T_QUOTE}', '${FP(2)}', '${T_BUILD}', '${T_RELEASE}', false)`))
      .rejects.toThrow(/release_quotation|foreign key/i);
  });
});

describe('an agent may not invent a price', () => {
  beforeEach(specs);

  /*
   * The structural form of the rule. A quoted number is a commitment, and with
   * no approved policy there is nothing for the key to point at.
   */
  it('refuses a quotation with no approved pricing policy to price it under', async () => {
    await expect(quotation()).rejects.toThrow(/pricing_policy_id|foreign key/i);
    expect(await rows(`SELECT policy_id FROM pricing_policy`)).toEqual([]);
  });

  it('accepts one once a policy is approved', async () => {
    await policy();
    await quotation();
    expect(await rows(`SELECT amount_minor::int AS a FROM dossier_quotation`)).toEqual([{ a: 480000 }]);
  });
});

describe('a refresh is a new release', () => {
  beforeEach(async () => { await specs(); await policy(); await quotation(); await release(); await release('R2', { version: 2 }); });

  it('succeeds forward and leaves the predecessor standing', async () => {
    await sql(`INSERT INTO release_succession VALUES ('S1', 'R2', 2, 'R1', 1)`);
    expect(await rows(`SELECT count(*)::int AS n FROM dossier_release`)).toEqual([{ n: 2 }]);
  });

  it('refuses a succession that moves backwards', async () => {
    await expect(sql(`INSERT INTO release_succession VALUES ('S1', 'R1', 1, 'R2', 2)`))
      .rejects.toThrow(/succession_moves_forward/);
  });

  /* Self-succession is refused by the same ordering rule, not by a separate one. */
  it('refuses a release succeeding itself', async () => {
    await expect(sql(`INSERT INTO release_succession VALUES ('S1', 'R1', 1, 'R1', 1)`))
      .rejects.toThrow(/succession_moves_forward/);
  });

  it('refuses two releases at the same version of one dossier', async () => {
    await expect(release('R3', { version: 2 })).rejects.toThrow(/release_version_once/);
  });
});

describe('a conclusion is served at the class it was computed at', () => {
  beforeEach(async () => { await specs(); await policy(); await quotation(); await release(); await mined(); });

  const conclusion = (presentedAs: string, cls = 'COMPUTED_RESULT') => sql(`
    INSERT INTO dossier_conclusion VALUES ('K1', 'R1', 'DEPENDENCY', 'They share one upstream producer.',
      'Two of the five carry no customs record at all.', 'A1', '${cls}', '${presentedAs}')`);

  /* A dossier is a serving surface and being well-written does not exempt it. */
  it('refuses presenting a computed result as something a source observed', async () => {
    await expect(conclusion('SOURCE_OBSERVATION'))
      .rejects.toThrow(/conclusion_presented_at_its_class/);
  });

  it('refuses presenting it as a different derived class', async () => {
    await expect(conclusion('MODEL_INFERENCE'))
      .rejects.toThrow(/conclusion_presented_at_its_class/);
  });

  it('accepts it presented as what it is', async () => {
    await conclusion('COMPUTED_RESULT');
    expect(await rows(`SELECT presented_as FROM dossier_conclusion`)).toEqual([{ presented_as: 'COMPUTED_RESULT' }]);
  });

  /* An omitted gap reads as completeness. */
  it('refuses a conclusion that does not say what it did not cover', async () => {
    await expect(sql(`INSERT INTO dossier_conclusion VALUES ('K1', 'R1', 'RISK', 'Fine.', '   ', 'A1', 'COMPUTED_RESULT', 'COMPUTED_RESULT')`))
      .rejects.toThrow(/not_covered/);
  });
});

describe('nothing has been asked', () => {
  it('holds no spec, quotation, release, conclusion or delivery', async () => {
    for (const table of ['dossier_spec', 'pricing_policy', 'dossier_quotation', 'dossier_release',
      'dossier_conclusion', 'corpus_candidate', 'customer_approval', 'dossier_delivery']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('creates the columns the drift check names', () => {
    expect(dossierDdlColumns()['dossier_release']).toContain('built_snapshot');
    expect(dossierDdlColumns()['dossier_delivery']).toContain('recipient_id');
    expect(dossierDdlColumns()['dossier_conclusion']).toContain('not_covered');
  });
});
