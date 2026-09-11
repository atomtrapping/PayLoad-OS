/**
 * Delivery, against an actual PostgreSQL engine.
 *
 * The case this file exists for is the one a tidier schema could not have
 * written: handing customer A's dossier to customer B. It is representable
 * here — the delivery names its own recipient — which is the only reason it can
 * be refused, and the only reason a test of the refusal proves anything.
 *
 * The release rests on two authorizations in the execution ledger, so this
 * file stacks that ledger too, and the kernel's refusals — an agent granting,
 * an approval of the wrong digest — reach the dossier through the keys rather
 * than through a second copy of the rule.
 *
 * And coverage is assessed per artifact by the database: the evidence rows
 * beneath a coverage row are recomputed at commit from the artifact's rights,
 * validation, horizon and inputs, the coverage row is held to its evidence,
 * and a conclusion is held to present evidence. What is tested is that the
 * wrong assessment is a row somebody can write and the database refuses.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  CANDIDATE_STANDINGS, COVERAGE_ASSESSMENTS, COVERAGE_LEVELS, DOSSIER_STAGES, REUSABLE_STANDINGS,
  coverageLevel, estimateUnits, rollupAssessment, type CoverageAssessment,
} from '@/domain/dossierService';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from './discoveryLedger';
import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from './executionLedger';
import { DOSSIER_LEDGER_DDL, DOSSIER_LEDGER_GUARDS } from './dossierLedger';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-07-01T08:00:00.000Z';
const T_MINED = '2026-07-01T12:00:00.000Z';
const T_HORIZON_PAST = '2026-07-01T18:00:00.000Z';
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
CREATE TABLE retracted_record (retraction_id text NOT NULL, record_id text NOT NULL, kind text NOT NULL CHECK (kind IN ('CORRECTION', 'WITHDRAWAL')), issued_at timestamptz NOT NULL, PRIMARY KEY (retraction_id, record_id));
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA dos_${scenario}; SET search_path TO dos_${scenario};
    ${CORPUS_DDL}${EXECUTION_LEDGER_DDL}${EXECUTION_LEDGER_GUARDS}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${DOSSIER_LEDGER_DDL}${DOSSIER_LEDGER_GUARDS}`);
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

/** Two customers, one asking a question with two facets. A delivery exercises customer_delivery. */
const specs = () => sql(`
  INSERT INTO dossier_spec VALUES ('D1', 'customer:acme', 'Alternative polypropylene suppliers.', 'BUILD', '${T_ASK}', 'customer_delivery');
  INSERT INTO dossier_spec VALUES ('D2', 'customer:boreal', 'Corridor exposure.', 'SPEC', '${T_ASK}', 'customer_delivery');
  INSERT INTO dossier_facet VALUES ('F1', 'D1', 'DEPENDENCY');
  INSERT INTO dossier_facet VALUES ('F2', 'D1', 'RISK')`);

/* ── The inventory: records, two runs, and artifacts to assess ── */

const FULL = `'{acquisition,customer_delivery,normalization}'`;
const NO_DELIVERY = `'{acquisition,normalization}'`;

/** A computed artifact over one or more standing records. Every default earns PRESENT. */
async function artifact(id: string, over: { subject?: string; claim?: string; rights?: string; inputs?: string[]; validation?: string; run?: string; computedAt?: string } = {}) {
  const rights = over.rights ?? FULL;
  const at = over.computedAt ?? T_MINED;
  await tx([
    `INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, rights, validation)
     VALUES ('${id}', '${over.run ?? 'RUN1'}', 'SUCCEEDED', 'COMPUTED_RESULT', '${over.subject ?? 'org:meridian'}', '${over.claim ?? 'Concentration.'}', '${at}', ${rights}, '${over.validation ?? 'NOT_VALIDATED'}')`,
    ...(over.inputs ?? ['REC-1']).map((record, i) =>
      `INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
       VALUES ('I-${id}-${i}', '${id}', '${at}', 'SOURCE_RECORD', '${record}', '${T_KNOWN}', ${rights})`),
  ].join(';\n'));
}

/** A prediction, which is the class that carries a horizon. */
async function prediction(id: string, horizon: string) {
  await tx(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, model_id, confidence, horizon_ends_at, rights, validation)
     VALUES ('${id}', 'RUN-P', 'SUCCEEDED', 'PREDICTION', 'org:meridian', 'Will concentrate further.', '${T_MINED}', 'm@1', 0.6, '${horizon}', ${FULL}, 'NOT_VALIDATED');
    INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
     VALUES ('I-${id}', '${id}', '${T_MINED}', 'SOURCE_RECORD', 'REC-1', '${T_KNOWN}', ${FULL})`);
}

/** Two records, two descriptive runs and a predictive one, and three artifacts: two deliverable, one not. */
async function mined() {
  await sql(`
    INSERT INTO corpus_record VALUES ('REC-1', 'REL-1', 'org:meridian', 'supplies', '${T_KNOWN}');
    INSERT INTO corpus_record VALUES ('REC-2', 'REL-1', 'corridor:x', 'exposes', '${T_KNOWN}');
    INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
      implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
    VALUES ('W1', 'DESCRIPTIVE', 'COMPUTED_RESULT', '{}'::jsonb, 'm', '{}'::jsonb, 'i', '1', 'o', 'FIXED_POINT', '${FP(3)}');
    INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
      implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
    VALUES ('W2', 'PREDICTIVE', 'PREDICTION', '{}'::jsonb, 'p', '{}'::jsonb, 'i', '1', 'o', 'FLOATING_POINT', '${FP(4)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('RUN1', 'W1', 'COMPUTED_RESULT', 'REL-1', '${T_KNOWN}', '${T_MINED}', 'SUCCEEDED', '${FP(4)}', '${FP(5)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('RUN2', 'W1', 'COMPUTED_RESULT', 'REL-1', '${T_KNOWN}', '${T_MINED}', 'SUCCEEDED', '${FP(4)}', '${FP(6)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('RUN-P', 'W2', 'PREDICTION', 'REL-1', '${T_KNOWN}', '${T_MINED}', 'SUCCEEDED', '${FP(4)}', '${FP(7)}')`);
  await artifact('A1');
  await artifact('A2', { subject: 'corridor:x', claim: 'Exposure.', inputs: ['REC-2'], run: 'RUN2' });
  await artifact('A3', { subject: 'org:meridian-b', claim: 'Concentration, unlicensed.', rights: NO_DELIVERY });
}

interface Evidence { artifact: string; run?: string; assessment: CoverageAssessment; because?: string }

/**
 * A coverage row with its evidence rows, in one transaction. The counts,
 * runs, level and assessment are what the domain derives from the evidence
 * unless a test overrides them — which is how a test writes the wrong row.
 */
const coverage = async (id = 'C1', over: {
  facet?: string; evidence?: Evidence[]; assessedAt?: string; withEvidence?: boolean;
  level?: string; assessment?: string; available?: number; present?: number; stale?: number; conflicting?: number; disallowed?: number;
  runs?: number; runsUsable?: number; ids?: string[];
} = {}) => {
  const evidence = over.evidence ?? [{ artifact: 'A1', assessment: 'PRESENT' }];
  const rollup = rollupAssessment(evidence.map((e) => e.assessment));
  const runs = new Set(evidence.map((e) => e.run ?? 'RUN1')).size;
  const runsUsable = new Set(evidence.filter((e) => e.assessment === 'PRESENT').map((e) => e.run ?? 'RUN1')).size;
  const ids = over.ids ?? evidence.map((e) => e.artifact);
  await tx([
    `INSERT INTO dossier_coverage (coverage_id, dossier_facet_id, level, assessment, artifacts_available, artifacts_present, artifacts_stale, artifacts_conflicting, artifacts_disallowed,
      runs_represented, runs_usable, artifact_ids, basis, assessed_at)
     VALUES ('${id}', '${over.facet ?? 'F1'}', '${over.level ?? coverageLevel(rollup.present, runsUsable)}', '${over.assessment ?? rollup.assessment}', ${over.available ?? ids.length},
      ${over.present ?? rollup.present}, ${over.stale ?? rollup.stale}, ${over.conflicting ?? rollup.conflicting}, ${over.disallowed ?? rollup.disallowed},
      ${over.runs ?? runs}, ${over.runsUsable ?? runsUsable}, '{${ids.join(',')}}', 'What bears on it, assessed.', '${over.assessedAt ?? T_ASK}')`,
    ...(over.withEvidence === false ? [] : evidence.map((e, i) =>
      `INSERT INTO dossier_coverage_evidence VALUES ('${id}-E${i}', '${id}', '${e.artifact}', '${e.run ?? 'RUN1'}', '${e.assessment}', '${e.because ?? 'Assessed.'}')`)),
  ].join(';\n'));
};

const retracted = (kind: 'CORRECTION' | 'WITHDRAWAL', issuedAt: string, record = 'REC-1') =>
  sql(`INSERT INTO retracted_record VALUES ('RET-${kind}', '${record}', '${kind}', '${issuedAt}')`);

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

/** Everything a first release needs: the dependency facet with one present and one disallowed artifact, the risk facet with one present. */
async function covered() {
  await specs(); await mined();
  await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A3', assessment: 'DISALLOWED' }] });
  await coverage('C2', { facet: 'F2', evidence: [{ artifact: 'A2', run: 'RUN2', assessment: 'PRESENT' }] });
}
async function priced() { await covered(); await estimate(); await policy(); await quotation(); }
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

const conclusion = (id: string, facet: string, artifactId: string, over: { release?: string; cls?: string; presentedAs?: string; notCovered?: string } = {}) => tx(`
  INSERT INTO dossier_conclusion VALUES ('${id}', '${over.release ?? 'R1'}', '${facet}', 'They share one upstream producer.',
    '${over.notCovered ?? 'Two of the five carry no customs record at all.'}', '${artifactId}', '${over.cls ?? 'COMPUTED_RESULT'}', '${over.presentedAs ?? over.cls ?? 'COMPUTED_RESULT'}')`);

const coverageRow = async (id = 'C1') => (await rows(`SELECT level, assessment, artifacts_available AS available, artifacts_present AS present, artifacts_stale AS stale,
  artifacts_conflicting AS conflicting, artifacts_disallowed AS disallowed, runs_represented AS runs, runs_usable FROM dossier_coverage WHERE coverage_id = '${id}'`))[0];

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

describe('coverage is assessed per artifact, by the database', () => {
  beforeEach(async () => { await specs(); await mined(); });

  it('accepts PRESENT for an artifact carrying the delivery right over standing records, not refuted, with no horizon passed', async () => {
    await coverage();
    expect(await coverageRow()).toEqual({ level: 'THIN', assessment: 'PRESENT', available: 1, present: 1, stale: 0, conflicting: 0, disallowed: 0, runs: 1, runs_usable: 1 });
  });

  /* The firm's rights decide whether the buyer hears about the artifact at all. */
  it('refuses PRESENT for an artifact whose rights do not carry the right the delivery exercises', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A3', assessment: 'PRESENT' }] }))
      .rejects.toThrow(/evidence_assessment_is_not_the_artifacts:A3:PRESENT recorded, DISALLOWED from the artifact/);
    await coverage('C1', { evidence: [{ artifact: 'A3', assessment: 'DISALLOWED' }] });
    expect(await coverageRow()).toEqual({ level: 'NONE', assessment: 'DISALLOWED', available: 1, present: 0, stale: 0, conflicting: 0, disallowed: 1, runs: 1, runs_usable: 0 });
  });

  it('names a disallowed artifact beside a present one, and the headline is the disallowed one', async () => {
    await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A3', assessment: 'DISALLOWED' }] });
    expect(await coverageRow()).toEqual({ level: 'THIN', assessment: 'DISALLOWED', available: 2, present: 1, stale: 0, conflicting: 0, disallowed: 1, runs: 1, runs_usable: 1 });
  });

  it('refuses hiding the disallowed artifact under a PRESENT headline', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A3', assessment: 'DISALLOWED' }], assessment: 'PRESENT' }))
      .rejects.toThrow(/coverage_assessment_is_the_rollup/);
  });

  /* The CHECK relating the assessment to the level: only what is present counts toward it. */
  it('refuses counting the disallowed artifact toward the level', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A3', assessment: 'DISALLOWED' }], level: 'SUPPORTED' }))
      .rejects.toThrow(/coverage_level_counts_the_present/);
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }], level: 'NONE' }))
      .rejects.toThrow(/coverage_level_counts_the_present/);
    await expect(coverage('C1', { evidence: [{ artifact: 'A3', assessment: 'DISALLOWED' }], level: 'THIN' }))
      .rejects.toThrow(/coverage_level_counts_the_present/);
  });

  it('reaches SUPPORTED only over present artifacts from two runs', async () => {
    await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A2', run: 'RUN2', assessment: 'PRESENT' }] });
    expect(await coverageRow()).toMatchObject({ level: 'SUPPORTED', assessment: 'PRESENT', present: 2, runs: 2, runs_usable: 2 });
  });

  /* Worst-first: a stale artifact outranks a disallowed one in the headline, and a conflicting one outranks both. */
  it('headlines the worse assessment when a facet carries several', async () => {
    await prediction('AP-PAST', T_HORIZON_PAST);
    await artifact('A-REFUTED', { subject: 'org:other', claim: 'Refuted.', validation: 'FALSIFIED' });
    const staleAndDisallowed: Evidence[] = [{ artifact: 'A3', assessment: 'DISALLOWED' }, { artifact: 'AP-PAST', run: 'RUN-P', assessment: 'STALE' }];
    await expect(coverage('C1', { evidence: staleAndDisallowed, assessment: 'DISALLOWED' })).rejects.toThrow(/coverage_assessment_is_the_rollup/);
    await coverage('C1', { evidence: staleAndDisallowed });
    expect(await coverageRow('C1')).toMatchObject({ level: 'NONE', assessment: 'STALE', stale: 1, disallowed: 1 });
    const allThree: Evidence[] = [...staleAndDisallowed, { artifact: 'A-REFUTED', assessment: 'CONFLICTING' }];
    await expect(coverage('C2', { facet: 'F2', evidence: allThree, assessment: 'STALE' })).rejects.toThrow(/coverage_assessment_is_the_rollup/);
    await coverage('C2', { facet: 'F2', evidence: allThree });
    expect(await coverageRow('C2')).toMatchObject({ level: 'NONE', assessment: 'CONFLICTING', stale: 1, disallowed: 1, conflicting: 1 });
  });

  it('reads a horizon as of the assessment instant', async () => {
    await prediction('AP-PAST', T_HORIZON_PAST);
    await prediction('AP-AHEAD', T_BUILD);
    await expect(coverage('C1', { evidence: [{ artifact: 'AP-PAST', run: 'RUN-P', assessment: 'PRESENT' }] }))
      .rejects.toThrow(/evidence_assessment_is_not_the_artifacts:AP-PAST:PRESENT recorded, STALE/);
    await coverage('C1', { evidence: [{ artifact: 'AP-PAST', run: 'RUN-P', assessment: 'STALE' }, { artifact: 'AP-AHEAD', run: 'RUN-P', assessment: 'PRESENT' }] });
    expect(await coverageRow()).toMatchObject({ level: 'THIN', assessment: 'STALE', present: 1, stale: 1 });
  });

  it('makes an artifact stale when a record it read was withdrawn before the assessment, and not when after', async () => {
    await retracted('WITHDRAWAL', T_MINED);
    await expect(coverage()).rejects.toThrow(/evidence_assessment_is_not_the_artifacts:A1:PRESENT recorded, STALE/);
    await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'STALE' }] });
    expect(await coverageRow()).toMatchObject({ level: 'NONE', assessment: 'STALE', stale: 1 });
  });

  it('does not yet know a withdrawal issued after the assessment', async () => {
    await retracted('WITHDRAWAL', T_BUILD);
    await coverage();
    expect(await coverageRow()).toMatchObject({ assessment: 'PRESENT' });
  });

  /* A corrected record means the corpus now says something else about what the artifact read. */
  it('makes an artifact conflicting when a record it read was corrected', async () => {
    await retracted('CORRECTION', T_MINED);
    await expect(coverage()).rejects.toThrow(/evidence_assessment_is_not_the_artifacts:A1:PRESENT recorded, CONFLICTING/);
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'STALE' }] })).rejects.toThrow(/CONFLICTING from the artifact/);
    await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'CONFLICTING' }] });
    expect(await coverageRow()).toMatchObject({ level: 'NONE', assessment: 'CONFLICTING', conflicting: 1 });
  });

  it('makes a refuted artifact conflicting', async () => {
    await artifact('A-REFUTED', { subject: 'org:other', claim: 'Refuted.', validation: 'FALSIFIED' });
    await expect(coverage('C1', { evidence: [{ artifact: 'A-REFUTED', assessment: 'PRESENT' }] })).rejects.toThrow(/CONFLICTING from the artifact/);
    await coverage('C1', { evidence: [{ artifact: 'A-REFUTED', assessment: 'CONFLICTING' }] });
    expect(await coverageRow()).toMatchObject({ assessment: 'CONFLICTING' });
  });

  it('makes two artifacts on one facet that disagree about one subject both conflicting', async () => {
    await artifact('A-DISAGREES', { claim: 'Dispersion.' });
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A-DISAGREES', assessment: 'CONFLICTING' }] }))
      .rejects.toThrow(/evidence_assessment_is_not_the_artifacts:A1:PRESENT recorded, CONFLICTING/);
    await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'CONFLICTING' }, { artifact: 'A-DISAGREES', assessment: 'CONFLICTING' }] });
    expect(await coverageRow()).toMatchObject({ level: 'NONE', assessment: 'CONFLICTING', conflicting: 2 });
  });

  it('does not read the same disagreement across two facets as a conflict', async () => {
    await artifact('A-DISAGREES', { claim: 'Dispersion.' });
    await coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }] });
    await coverage('C2', { facet: 'F2', evidence: [{ artifact: 'A-DISAGREES', assessment: 'PRESENT' }] });
    expect(await coverageRow('C2')).toMatchObject({ assessment: 'PRESENT' });
  });

  it('refuses evidence computed after the assessment that names it', async () => {
    await artifact('A-LATER', { subject: 'org:later', claim: 'Later.', computedAt: T_BUILD });
    await expect(coverage('C1', { evidence: [{ artifact: 'A-LATER', assessment: 'PRESENT' }] })).rejects.toThrow(/evidence_computed_after_it_was_assessed:A-LATER/);
  });

  it('refuses a spec whose required right is not a permitted use', async () => {
    await expect(sql(`INSERT INTO dossier_spec VALUES ('D3', 'customer:acme', 'q', 'SPEC', '${T_ASK}', 'EXPORT')`)).rejects.toThrow(/required_right/);
  });

  it('assesses the way the domain does', () => {
    expect(COVERAGE_ASSESSMENTS).toEqual(['PRESENT', 'STALE', 'CONFLICTING', 'MISSING', 'DISALLOWED']);
    expect(rollupAssessment([])).toMatchObject({ assessment: 'MISSING' });
    expect(rollupAssessment(['PRESENT', 'DISALLOWED'])).toMatchObject({ assessment: 'DISALLOWED', present: 1, disallowed: 1 });
    expect(rollupAssessment(['STALE', 'DISALLOWED', 'CONFLICTING'])).toMatchObject({ assessment: 'CONFLICTING' });
  });
});

describe('a coverage row is the sum of its evidence rows', () => {
  beforeEach(async () => { await specs(); await mined(); });

  it('refuses a coverage row naming an artifact with no evidence row beneath it', async () => {
    await expect(coverage('C1', { withEvidence: false })).rejects.toThrow(/coverage_does_not_match_its_evidence:C1:names \{A1\} but its evidence rows are \{\}/);
  });

  it('refuses counts the evidence rows do not give', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A3', assessment: 'DISALLOWED' }], present: 2, disallowed: 0, assessment: 'PRESENT' }))
      .rejects.toThrow(/coverage_does_not_match_its_evidence:C1:counts 2\/0\/0\/0 but its evidence rows are 1\/0\/0\/1/);
  });

  it('refuses runs the evidence rows do not represent', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A2', run: 'RUN2', assessment: 'PRESENT' }], runs: 1, runsUsable: 1, level: 'THIN' }))
      .rejects.toThrow(/coverage_does_not_match_its_evidence:C1:runs 1\/1 but its evidence rows are 2\/2/);
  });

  it('refuses an evidence row arriving after the count was taken', async () => {
    await coverage();
    await expect(tx(`INSERT INTO dossier_coverage_evidence VALUES ('C1-LATE', 'C1', 'A3', 'RUN1', 'DISALLOWED', 'Late.')`))
      .rejects.toThrow(/coverage_does_not_match_its_evidence:C1:names \{A1\} but its evidence rows are \{A1,A3\}/);
  });

  it('refuses removing an evidence row from under a coverage row', async () => {
    await coverage();
    await expect(tx(`DELETE FROM dossier_coverage_evidence WHERE artifact_id = 'A1'`)).rejects.toThrow(/coverage_does_not_match_its_evidence/);
  });

  it('refuses evidence of no coverage, and evidence of no artifact', async () => {
    await expect(tx(`INSERT INTO dossier_coverage_evidence VALUES ('E', 'C-NOPE', 'A1', 'RUN1', 'PRESENT', 'x')`)).rejects.toThrow(/coverage_id|foreign key/i);
    await coverage();
    await expect(tx(`INSERT INTO dossier_coverage_evidence VALUES ('E', 'C1', 'A-NOPE', 'RUN1', 'PRESENT', 'x')`)).rejects.toThrow(/evidence_artifact|foreign key/i);
  });

  it('refuses evidence assessed MISSING, which is the assessment of nothing', async () => {
    // The coverage row is written as if the artifact were present, so that it is the evidence row's own check that refuses.
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'MISSING' }], present: 1, runsUsable: 1, level: 'THIN', assessment: 'PRESENT' }))
      .rejects.toThrow(/dossier_coverage_evidence_assessment_check/);
  });

  it('carries one evidence row per artifact per coverage', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A1', assessment: 'PRESENT' }, { artifact: 'A1', assessment: 'PRESENT' }], ids: ['A1'], present: 1 }))
      .rejects.toThrow(/evidence_once_per_coverage/);
  });

  it('calls a facet with nothing behind it MISSING and nothing else', async () => {
    await coverage('C1', { evidence: [] });
    expect(await coverageRow()).toEqual({ level: 'NONE', assessment: 'MISSING', available: 0, present: 0, stale: 0, conflicting: 0, disallowed: 0, runs: 0, runs_usable: 0 });
    await expect(coverage('C2', { facet: 'F2', evidence: [], assessment: 'PRESENT' })).rejects.toThrow(/coverage_assessment_is_the_rollup/);
    await expect(coverage('C2', { facet: 'F2', evidence: [{ artifact: 'A1', assessment: 'PRESENT' }], assessment: 'MISSING' })).rejects.toThrow(/coverage_assessment_is_the_rollup/);
  });

  it('refuses counts that do not add up to what is available', async () => {
    await expect(coverage('C1', { stale: 1, assessment: 'STALE' })).rejects.toThrow(/coverage_counts_add_up/);
    await expect(coverage('C1', { ids: ['A1', 'A3'] })).rejects.toThrow(/coverage_counts_add_up/);
  });

  it('refuses a count that is not the count of what it names', async () => {
    await expect(coverage('C1', { available: 2, present: 2 })).rejects.toThrow(/coverage_names_what_it_counts/);
  });

  it('refuses usable runs among artifacts that are not present', async () => {
    await expect(coverage('C1', { evidence: [{ artifact: 'A3', assessment: 'DISALLOWED' }], runsUsable: 1 })).rejects.toThrow(/coverage_runs_are_among_artifacts/);
    await expect(coverage('C1', { runs: 2 })).rejects.toThrow(/coverage_runs_are_among_artifacts/);
  });
});

describe('a conclusion rests on present evidence', () => {
  beforeEach(released);

  it('accepts a conclusion on evidence assessed PRESENT for its facet', async () => {
    await conclusion('K1', 'DEPENDENCY', 'A1');
    await conclusion('K2', 'RISK', 'A2');
    expect(await rows(`SELECT count(*)::int AS n FROM dossier_conclusion`)).toEqual([{ n: 2 }]);
  });

  /* What was disallowed for this customer holds nothing up. */
  it('refuses a conclusion resting on the disallowed artifact', async () => {
    await expect(conclusion('K1', 'DEPENDENCY', 'A3')).rejects.toThrow(/conclusion_rests_on_no_present_evidence:A3:DEPENDENCY in R1/);
  });

  it('refuses a conclusion resting on evidence assessed for a different facet', async () => {
    await expect(conclusion('K1', 'RISK', 'A1')).rejects.toThrow(/conclusion_rests_on_no_present_evidence:A1:RISK/);
  });

  it('refuses a conclusion resting on an artifact no coverage row names', async () => {
    await artifact('A-UNNAMED', { subject: 'org:unnamed', claim: 'Unnamed.' });
    await expect(conclusion('K1', 'DEPENDENCY', 'A-UNNAMED')).rejects.toThrow(/conclusion_rests_on_no_present_evidence:A-UNNAMED/);
  });
});

describe('a conclusion rests on an assessment no later than its build', () => {
  it('refuses a conclusion resting on evidence assessed after the release was built', async () => {
    await specs(); await mined();
    await coverage('C1');
    await coverage('C2', { facet: 'F2', evidence: [{ artifact: 'A2', run: 'RUN2', assessment: 'PRESENT' }], assessedAt: T_RELEASE });
    await estimate(); await policy(); await quotation(); await accepted(); await reviewed(); await release();
    await conclusion('K1', 'DEPENDENCY', 'A1');
    await expect(conclusion('K2', 'RISK', 'A2')).rejects.toThrow(/conclusion_rests_on_no_present_evidence:A2:RISK/);
  });
});

describe('the estimate is a count and the price is a policy', () => {
  beforeEach(async () => { await covered(); await estimate(); await policy(); });

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
  beforeEach(async () => { await covered(); await estimate(); });

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
  beforeEach(released);

  /* A dossier is a serving surface and being well-written does not exempt it. */
  it('refuses presenting a computed result as something a source observed', async () => {
    await expect(conclusion('K1', 'DEPENDENCY', 'A1', { presentedAs: 'SOURCE_OBSERVATION' }))
      .rejects.toThrow(/conclusion_presented_at_its_class/);
  });

  it('refuses presenting it as a different derived class', async () => {
    await expect(conclusion('K1', 'DEPENDENCY', 'A1', { presentedAs: 'MODEL_INFERENCE' }))
      .rejects.toThrow(/conclusion_presented_at_its_class/);
  });

  it('accepts it presented as what it is', async () => {
    await conclusion('K1', 'DEPENDENCY', 'A1');
    expect(await rows(`SELECT presented_as FROM dossier_conclusion`)).toEqual([{ presented_as: 'COMPUTED_RESULT' }]);
  });

  /* An omitted gap reads as completeness. */
  it('refuses a conclusion that does not say what it did not cover', async () => {
    await expect(conclusion('K1', 'DEPENDENCY', 'A1', { notCovered: '   ' })).rejects.toThrow(/not_covered/);
  });

  it('concludes once per facet per release', async () => {
    await conclusion('K1', 'DEPENDENCY', 'A1');
    await expect(conclusion('K2', 'DEPENDENCY', 'A1')).rejects.toThrow(/conclusion_once_per_facet/);
  });
});

describe('nothing has been asked', () => {
  it('holds no spec, coverage, evidence, estimate, quotation, release, conclusion or delivery', async () => {
    for (const table of ['dossier_spec', 'dossier_coverage', 'dossier_coverage_evidence', 'dossier_estimate', 'pricing_policy', 'dossier_quotation', 'dossier_release',
      'dossier_conclusion', 'corpus_candidate', 'customer_approval', 'dossier_delivery']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  it('keeps the stages the domain declares, in the order a dossier passes through them', () => {
    expect(DOSSIER_STAGES).toEqual(['SPEC', 'COVERAGE', 'ESTIMATE', 'QUOTATION', 'SCOPE', 'BUILD', 'RELEASE', 'DELIVERED', 'MONITORING']);
  });
});
