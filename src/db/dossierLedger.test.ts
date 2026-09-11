/**
 * Delivery, against an actual PostgreSQL engine.
 *
 * The case this file exists for is the one a tidier schema could not have
 * written: handing customer A's dossier to customer B. It is representable
 * here — the delivery names its own recipient — which is the only reason it can
 * be refused, and the only reason a test of the refusal proves anything.
 *
 * The release now rests on two authorizations in the execution ledger, so
 * this file stacks that ledger too, and the kernel's refusals — an agent
 * granting, an approval of the wrong digest — reach the dossier through the
 * keys rather than through a second copy of the rule.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { CANDIDATE_STANDINGS, COVERAGE_LEVELS, DOSSIER_STAGES, REUSABLE_STANDINGS, coverageLevel, estimateUnits } from '@/domain/dossierService';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from './discoveryLedger';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from './executionLedger';
import { DOSSIER_LEDGER_DDL } from './dossierLedger';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-07-01T08:00:00.000Z';
const T_ASK = '2026-07-02T09:00:00.000Z';
const T_QUOTE = '2026-07-02T10:00:00.000Z';
const T_ACCEPT = '2026-07-02T11:00:00.000Z';
const T_BUILD = '2026-07-03T10:00:00.000Z';
const T_RELEASE = '2026-07-03T11:00:00.000Z';
const T_DELIVER = '2026-07-03T12:00:00.000Z';
const T_EXPIRE = '2026-07-10T00:00:00.000Z';
const FP = (n: number) => `sha256:${String(n).repeat(2).padStart(64, '0')}`;
const QUOTE_DIGEST = FP(7);
const RELEASE_DIGEST = FP(8);
const RELEASE_2_DIGEST = FP(9);

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
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${DOSSIER_LEDGER_DDL}`);
  await sql(`
    INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb);
    INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_KNOWN}', '{}'::jsonb);
    INSERT INTO principal VALUES ('customer:acme', 'HUMAN', 'Acme, buyer', '${T_KNOWN}');
    INSERT INTO principal VALUES ('customer:boreal', 'HUMAN', 'Boreal, buyer', '${T_KNOWN}');
    INSERT INTO principal VALUES ('operator:jo', 'HUMAN', 'Jo, corpus steward', '${T_KNOWN}');
    INSERT INTO principal VALUES ('agent:dossier', 'AGENT', 'Dossier agent', '${T_KNOWN}')`);
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

/** Two customers, one asking a question with two facets. */
const specs = () => sql(`
  INSERT INTO dossier_spec VALUES ('D1', 'customer:acme', 'Alternative polypropylene suppliers.', 'BUILD', '${T_ASK}');
  INSERT INTO dossier_spec VALUES ('D2', 'customer:boreal', 'Corridor exposure.', 'SPEC', '${T_ASK}');
  INSERT INTO dossier_facet VALUES ('F1', 'D1', 'DEPENDENCY');
  INSERT INTO dossier_facet VALUES ('F2', 'D1', 'RISK')`);

const coverage = (id = 'C1', over: { facet?: string; level?: string; count?: number; runs?: number; ids?: string } = {}) => sql(`
  INSERT INTO dossier_coverage VALUES ('${id}', '${over.facet ?? 'F1'}', '${over.level ?? 'THIN'}', ${over.count ?? 1}, ${over.runs ?? 1},
    ${over.ids ?? `'{A1}'`}, 'One concentration artifact bears on it.', '${T_ASK}')`);

const estimate = (id = 'E1', units = 4) => sql(`
  INSERT INTO dossier_estimate VALUES ('${id}', 'D1', 'notationsos.dossier.estimate.v1', ${units},
    '[{"facet":"DEPENDENCY","level":"THIN","units":2},{"facet":"RISK","level":"THIN","units":2}]'::jsonb, '${FP(6)}', '${T_ASK}')`);

const policy = (rate = 120000) => sql(`INSERT INTO pricing_policy VALUES ('P-2026', 'operator:jo', '${T_ASK}', ${rate}, 'CAD', 'facet-coverage-unit')`);

const quotation = (id = 'Q1', over: { dossier?: string; rate?: number; units?: number; amount?: number; digest?: string } = {}) => sql(`
  INSERT INTO dossier_quotation VALUES ('${id}', '${over.dossier ?? 'D1'}', 'P-2026', ${over.rate ?? 120000}, 'CAD', 'E1', ${over.units ?? 4},
    ${over.amount ?? 480000}, '${FP(1)}', '${T_QUOTE}', '${over.digest ?? QUOTE_DIGEST}')`);

/** A governed act in the kernel: proposal, packet, approval and authorization, of one digest. */
async function governed(tag: string, digest: string, reviewer: string, over: { grantorKind?: string; grantor?: string; response?: string } = {}) {
  await sql(`
    INSERT INTO operation_proposal (proposal_id, operation_kind, counterparty, authored_by_kind, authored_by, proposed_at)
      VALUES ('P-${tag}', 'DOSSIER_${tag}', '${reviewer}', 'AGENT', 'agent:dossier', '${T_QUOTE}');
    INSERT INTO decision_packet (packet_id, proposal_id, action_kind, action, action_digest, doing_nothing, against, prepared_by_kind, prepared_by, prepared_at)
      VALUES ('K-${tag}', 'P-${tag}', 'DOSSIER_${tag}', '{}'::jsonb, '${digest}', 'Nothing is delivered and the question stays open.', 'Two facets are thin.', 'AGENT', 'agent:dossier', '${T_QUOTE}');
    INSERT INTO proposal_review (review_id, proposal_id, reviewed_action_digest, response, reviewer_kind, reviewer, reasoning, reviewed_at)
      VALUES ('RV-${tag}', 'P-${tag}', '${digest}', '${over.response ?? 'APPROVE'}', 'HUMAN', '${reviewer}', 'Read it; the gaps are stated.', '${T_ACCEPT}')`);
  await sql(`
    INSERT INTO execution_authorization (authorization_id, proposal_id, envelope_class, granted_by_kind, granted_by, corpus_release_id,
      state_revision, policy_version, granted_at, expires_at, action_digest, review_response)
      VALUES ('AU-${tag}', 'P-${tag}', 'NARROW_ACTION', '${over.grantorKind ?? 'HUMAN'}', '${over.grantor ?? reviewer}', 'REL-1', 1, 'dossier@1',
        '${T_ACCEPT}', '${T_EXPIRE}', '${digest}', '${over.response ?? 'APPROVE'}')`);
}
const accepted = () => governed('SCOPE', QUOTE_DIGEST, 'customer:acme');
const reviewed = (tag = 'RELEASE', digest = RELEASE_DIGEST) => governed(tag, digest, 'operator:jo');

const release = (id = 'R1', over: { dossier?: string; recipient?: string; version?: number; builtAt?: string; quoteDigest?: string; scope?: string; digest?: string; auth?: string } = {}) => sql(`
  INSERT INTO dossier_release (dossier_release_id, dossier_id, recipient_id, version, quotation_id, quoted_snapshot, quoted_at,
    quotation_digest, scope_authorization_id, built_snapshot, built_at, release_digest, authorization_id, released_at, monitored)
  VALUES ('${id}', '${over.dossier ?? 'D1'}', '${over.recipient ?? 'customer:acme'}', ${over.version ?? 1}, 'Q1', '${FP(1)}', '${T_QUOTE}',
    '${over.quoteDigest ?? QUOTE_DIGEST}', '${over.scope ?? 'AU-SCOPE'}', '${FP(2)}', '${over.builtAt ?? T_BUILD}',
    '${over.digest ?? RELEASE_DIGEST}', '${over.auth ?? 'AU-RELEASE'}', '${T_RELEASE}', false)`);

/** Everything a first release needs. */
async function priced() { await specs(); await coverage(); await coverage('C2', { facet: 'F2' }); await estimate(); await policy(); await quotation(); }
async function released() { await priced(); await accepted(); await reviewed(); await release(); }

/** A dispatch in the kernel, for a delivery to name. */
const dispatched = (tag = 'RELEASE', attempt = 'T1', outcome = 'CONFIRMED') => sql(`
  INSERT INTO execution_operation VALUES ('O-${tag}', 'AU-${tag}', 'deliver:${tag}', '${T_RELEASE}');
  INSERT INTO execution_attempt (attempt_id, operation_id, authorization_id, authorization_state_revision, authorization_granted_at,
    authorization_expires_at, ran_at_state_revision, attempted_at, outcome, venue_receipt)
    VALUES ('${attempt}', 'O-${tag}', 'AU-${tag}', 1, '${T_ACCEPT}', '${T_EXPIRE}', 1, '${T_DELIVER}', '${outcome}', ${outcome === 'CONFIRMED' ? `'SIMULATED_LOCAL:${FP(3)}'` : 'NULL'})`);

const delivery = (id = 'DL1', over: { release?: string; recipient?: string; attempt?: string } = {}) => sql(`
  INSERT INTO dossier_delivery VALUES ('${id}', '${over.release ?? 'R1'}', '${over.recipient ?? 'customer:acme'}', '${over.attempt ?? 'T1'}',
    'SIMULATED_LOCAL: no customer exists; the receipt is the attempt row.', '${T_DELIVER}')`);

/** A mined artifact for a conclusion to rest on. */
async function mined() {
  await sql(`
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
  beforeEach(async () => { await released(); await dispatched(); });

  /*
   * The case the schema exists for. Representable, therefore refusable: the
   * delivery names customer B, and the composite key says the release was A's.
   */
  it('refuses delivering one customer’s dossier to another', async () => {
    await expect(delivery('DL1', { recipient: 'customer:boreal' }))
      .rejects.toThrow(/delivery_goes_to_the_dossiers_recipient|foreign key/i);
  });

  it('delivers it to the customer who asked', async () => {
    await delivery();
    expect(await rows(`SELECT recipient_id, attempt_id FROM dossier_delivery`)).toEqual([{ recipient_id: 'customer:acme', attempt_id: 'T1' }]);
  });

  it('refuses a release whose recipient is not the spec’s', async () => {
    await expect(release('R2', { version: 2, recipient: 'customer:boreal', digest: RELEASE_2_DIGEST, auth: 'AU-RELEASE2' }))
      .rejects.toThrow(/release_spec|foreign key/i);
  });
});

describe('a delivery is a dispatch', () => {
  beforeEach(released);

  /* "Delivered" is what the action layer recorded, not a column somebody set. */
  it('refuses a delivery that names no execution attempt', async () => {
    await expect(delivery('DL1', { attempt: 'T-NOPE' })).rejects.toThrow(/attempt_id|foreign key/i);
  });

  it('records a delivery whose dispatch was confirmed, with what the receipt rests on', async () => {
    await dispatched(); await delivery();
    expect(await rows(`SELECT receipt_basis FROM dossier_delivery`)).toEqual([{ receipt_basis: 'SIMULATED_LOCAL: no customer exists; the receipt is the attempt row.' }]);
    expect(await rows(`SELECT venue_receipt FROM execution_attempt`)).toEqual([{ venue_receipt: `SIMULATED_LOCAL:${FP(3)}` }]);
  });

  it('carries one delivery per attempt', async () => {
    await dispatched(); await delivery();
    await expect(delivery('DL2')).rejects.toThrow(/attempt_id/);
  });

  it('requires the delivery to say what its receipt rests on', async () => {
    await dispatched();
    await expect(sql(`INSERT INTO dossier_delivery VALUES ('DL1', 'R1', 'customer:acme', 'T1', '  ', '${T_DELIVER}')`))
      .rejects.toThrow(/receipt_basis/);
  });
});

describe('an approval belongs to one customer and one application', () => {
  const candidate = (standing: string) => sql(`INSERT INTO corpus_candidate VALUES ('C-${standing}', 'org:meridian', '${standing}', '${T_ASK}')`);
  const approval = (id: string, recipient: string, application: string, standing = 'CUSTOMER_APPROVED') => sql(`
    INSERT INTO customer_approval VALUES ('${id}', 'org:meridian', '${recipient}', '${application}', '${standing}', '${T_ASK}')`);

  it('refuses a corpus candidate carrying a customer approval', async () => {
    await expect(candidate('CUSTOMER_APPROVED')).rejects.toThrow(/standing/);
  });

  it('accepts the two standings the corpus does own', async () => {
    await candidate('DISCOVERED');
    await candidate('EVIDENCE_SUPPORTED');
    expect(await rows(`SELECT standing FROM corpus_candidate ORDER BY standing`))
      .toEqual([{ standing: 'DISCOVERED' }, { standing: 'EVIDENCE_SUPPORTED' }]);
  });

  it('holds a customer approval with the customer and the application that scope it', async () => {
    await approval('AP1', 'customer:acme', 'PP homopolymer, injection grade');
    expect(await rows(`SELECT recipient_id FROM customer_approval`)).toEqual([{ recipient_id: 'customer:acme' }]);
  });

  it('scopes the approval to its application rather than to the supplier', async () => {
    await approval('AP1', 'customer:acme', 'PP homopolymer, injection grade');
    await approval('AP2', 'customer:acme', 'PP copolymer, film grade');
    await approval('AP3', 'customer:boreal', 'PP homopolymer, injection grade');
    await expect(approval('AP4', 'customer:acme', 'PP homopolymer, injection grade')).rejects.toThrow(/approval_once/);
  });

  it('refuses a non-customer standing in the customer table', async () => {
    await expect(approval('AP1', 'customer:acme', 'PP', 'DISCOVERED')).rejects.toThrow(/approval_is_customer_held/);
  });

  it('keeps the domain and the schema agreeing about who owns which standing', () => {
    expect(REUSABLE_STANDINGS).toEqual(['DISCOVERED', 'EVIDENCE_SUPPORTED']);
    expect(CANDIDATE_STANDINGS).toContain('CUSTOMER_APPROVED');
    expect(DOSSIER_LEDGER_DDL).toContain("standing IN ('DISCOVERED', 'EVIDENCE_SUPPORTED')");
  });
});

describe('the estimate is a count and the price is a policy', () => {
  beforeEach(async () => { await specs(); await coverage(); await coverage('C2', { facet: 'F2' }); await estimate(); await policy(); });

  it('quotes the estimate’s units at the policy’s rate', async () => {
    await quotation();
    expect(await rows(`SELECT amount_minor::int AS a, units FROM dossier_quotation`)).toEqual([{ a: 480000, units: 4 }]);
  });

  /* The one arithmetic that is a single-row fact, and it is checked. */
  it('refuses a quotation whose amount is not units times the rate', async () => {
    await expect(quotation('Q1', { amount: 500000 })).rejects.toThrow(/quotation_is_units_at_the_rate/);
  });

  it('refuses a quotation claiming units the estimate did not count', async () => {
    await expect(quotation('Q1', { units: 6, amount: 720000 })).rejects.toThrow(/quotation_estimate|foreign key/i);
  });

  it('refuses a quotation claiming a rate the policy does not set', async () => {
    await expect(quotation('Q1', { rate: 100000, amount: 400000 })).rejects.toThrow(/quotation_policy|foreign key/i);
  });

  it('counts coverage the way the domain does', () => {
    expect(coverageLevel(0, 0)).toBe('NONE');
    expect(coverageLevel(1, 1)).toBe('THIN');
    expect(coverageLevel(2, 1)).toBe('THIN');
    expect(coverageLevel(2, 2)).toBe('SUPPORTED');
    expect(estimateUnits([{ facet: 'DEPENDENCY', level: 'THIN' }, { facet: 'RISK', level: 'THIN' }])).toBe(4);
    expect(COVERAGE_LEVELS).toEqual(['NONE', 'THIN', 'SUPPORTED']);
  });

  it('refuses coverage that says NONE and counts something, or counts nothing and says otherwise', async () => {
    await expect(coverage('C3', { facet: 'F2', level: 'NONE', count: 1 })).rejects.toThrow(/coverage_none_is_zero|coverage_names_what_it_counts/);
    await expect(coverage('C3', { facet: 'F2', level: 'THIN', count: 0, ids: `'{}'` })).rejects.toThrow(/coverage_none_is_zero/);
  });

  it('refuses coverage whose count is not the count of what it names', async () => {
    await expect(coverage('C3', { facet: 'F2', level: 'THIN', count: 2, ids: `'{A1}'` })).rejects.toThrow(/coverage_names_what_it_counts/);
  });
});

describe('a release is authorized twice, and both times of a digest', () => {
  beforeEach(priced);

  it('releases under an accepted scope and a reviewed digest', async () => {
    await accepted(); await reviewed(); await release();
    expect(await rows(`SELECT scope_authorization_id, authorization_id FROM dossier_release`))
      .toEqual([{ scope_authorization_id: 'AU-SCOPE', authorization_id: 'AU-RELEASE' }]);
  });

  /* The customer accepted a quotation. A build against one they did not accept has nothing to name. */
  it('refuses a release against a quotation the customer did not accept', async () => {
    await reviewed();
    await expect(release()).rejects.toThrow(/release_scope_accepted|foreign key/i);
  });

  it('refuses a release whose accepted scope is a different quotation than the one that priced it', async () => {
    await governed('SCOPE', FP(11), 'customer:acme'); await reviewed();
    await expect(release()).rejects.toThrow(/release_scope_accepted|foreign key/i);
  });

  /* The reviewer approved bytes. The release carries other bytes. */
  it('refuses a release edited after review', async () => {
    await accepted(); await reviewed();
    await expect(release('R1', { digest: RELEASE_2_DIGEST })).rejects.toThrow(/release_reviewed|foreign key/i);
  });

  it('refuses a release nobody reviewed', async () => {
    await accepted();
    await expect(release()).rejects.toThrow(/release_reviewed|foreign key/i);
  });

  it('refuses a release whose review was by an agent, through the kernel', async () => {
    await accepted();
    await expect(governed('RELEASE', RELEASE_DIGEST, 'operator:jo', { grantorKind: 'AGENT', grantor: 'agent:dossier' })).rejects.toThrow(/granted_by_kind/);
  });

  it('refuses a release whose review said no', async () => {
    await accepted();
    await expect(governed('RELEASE', RELEASE_DIGEST, 'operator:jo', { response: 'DENY' })).rejects.toThrow(/authorization_descends_from_a_denial/);
  });

  /* One approval releases one version. The refresh is reviewed again. */
  it('refuses a second version under the first version’s approval', async () => {
    await accepted(); await reviewed(); await release();
    await expect(release('R2', { version: 2 })).rejects.toThrow(/release_authorization_once/);
    await reviewed('RELEASE2', RELEASE_2_DIGEST);
    await release('R2', { version: 2, digest: RELEASE_2_DIGEST, auth: 'AU-RELEASE2' });
    expect(await rows(`SELECT count(*)::int AS n FROM dossier_release`)).toEqual([{ n: 2 }]);
  });

  it('refuses the same authorization standing in for both', async () => {
    await accepted(); await reviewed();
    await expect(release('R1', { scope: 'AU-RELEASE', quoteDigest: RELEASE_DIGEST })).rejects.toThrow(/release_two_authorizations|release_quotation_digest|foreign key/i);
  });
});

describe('the quote and the build are two snapshots', () => {
  beforeEach(async () => { await priced(); await accepted(); await reviewed(); });

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
    await expect(sql(`INSERT INTO dossier_release (dossier_release_id, dossier_id, recipient_id, version, quotation_id, quoted_snapshot, quoted_at,
      quotation_digest, scope_authorization_id, built_snapshot, built_at, release_digest, authorization_id, released_at, monitored)
      VALUES ('R1', 'D1', 'customer:acme', 1, 'Q1', '${FP(9)}', '${T_QUOTE}', '${QUOTE_DIGEST}', 'AU-SCOPE', '${FP(2)}', '${T_BUILD}', '${RELEASE_DIGEST}', 'AU-RELEASE', '${T_RELEASE}', false)`))
      .rejects.toThrow(/release_quotation|foreign key/i);
  });
});

describe('an agent may not invent a price', () => {
  beforeEach(async () => { await specs(); await coverage(); await coverage('C2', { facet: 'F2' }); await estimate(); });

  /*
   * The structural form of the rule. A quoted number is a commitment, and with
   * no approved policy there is nothing for the key to point at.
   */
  it('refuses a quotation with no approved pricing policy to price it under', async () => {
    await expect(quotation()).rejects.toThrow(/quotation_policy|foreign key/i);
    expect(await rows(`SELECT policy_id FROM pricing_policy`)).toEqual([]);
  });

  it('accepts one once a policy is approved', async () => {
    await policy();
    await quotation();
    expect(await rows(`SELECT amount_minor::int AS a FROM dossier_quotation`)).toEqual([{ a: 480000 }]);
  });
});

describe('a refresh is a new release', () => {
  beforeEach(async () => {
    await released(); await reviewed('RELEASE2', RELEASE_2_DIGEST);
    await release('R2', { version: 2, digest: RELEASE_2_DIGEST, auth: 'AU-RELEASE2' });
  });

  it('succeeds forward, says why, and leaves the predecessor standing', async () => {
    await sql(`INSERT INTO release_succession VALUES ('S1', 'R2', 2, 'R1', 1, 'The RISK conclusion omitted the records the corpus had taken back.')`);
    expect(await rows(`SELECT count(*)::int AS n FROM dossier_release`)).toEqual([{ n: 2 }]);
  });

  it('refuses a succession that does not say why', async () => {
    await expect(sql(`INSERT INTO release_succession VALUES ('S1', 'R2', 2, 'R1', 1, ' ')`)).rejects.toThrow(/because/);
  });

  it('refuses a succession that moves backwards', async () => {
    await expect(sql(`INSERT INTO release_succession VALUES ('S1', 'R1', 1, 'R2', 2, 'x')`))
      .rejects.toThrow(/succession_moves_forward/);
  });

  /* Self-succession is refused by the same ordering rule, not by a separate one. */
  it('refuses a release succeeding itself', async () => {
    await expect(sql(`INSERT INTO release_succession VALUES ('S1', 'R1', 1, 'R1', 1, 'x')`))
      .rejects.toThrow(/succession_moves_forward/);
  });

  it('refuses two releases at the same version of one dossier', async () => {
    await reviewed('RELEASE3', FP(12));
    await expect(release('R3', { version: 2, digest: FP(12), auth: 'AU-RELEASE3' })).rejects.toThrow(/release_version_once/);
  });
});

describe('a conclusion is served at the class it was computed at', () => {
  beforeEach(async () => { await released(); await mined(); });

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

  it('concludes once per facet per release', async () => {
    await conclusion('COMPUTED_RESULT');
    await expect(sql(`INSERT INTO dossier_conclusion VALUES ('K2', 'R1', 'DEPENDENCY', 'Again.', 'Again.', 'A1', 'COMPUTED_RESULT', 'COMPUTED_RESULT')`))
      .rejects.toThrow(/conclusion_once_per_facet/);
  });
});

describe('nothing has been asked', () => {
  it('holds no spec, coverage, estimate, quotation, release, conclusion or delivery', async () => {
    for (const table of ['dossier_spec', 'dossier_coverage', 'dossier_estimate', 'pricing_policy', 'dossier_quotation', 'dossier_release',
      'dossier_conclusion', 'corpus_candidate', 'customer_approval', 'dossier_delivery']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('keeps the stages the domain declares, in the order a dossier passes through them', () => {
    expect(DOSSIER_STAGES).toEqual(['SPEC', 'COVERAGE', 'ESTIMATE', 'QUOTATION', 'SCOPE', 'BUILD', 'RELEASE', 'DELIVERED', 'MONITORING']);
  });
});
