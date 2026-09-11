/**
 * The commercial boundaries, against an actual PostgreSQL engine.
 *
 * The plane where the doctrine is under the most commercial pressure: a hedge
 * costs a reply, an unsent draft costs nothing, and the person writing the SQL
 * at the end of a quarter has an incentive every other plane here does not.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SALES_AGENT_MAY, SALES_AGENT_MAY_NEVER } from '@/domain/commercialPlane';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from './discoveryLedger';
import { AUTHORIZING_PRINCIPALS, COMMERCIAL_LEDGER_DDL, COMMERCIAL_LEDGER_GUARDS } from './commercialLedger';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-05-01T08:00:00.000Z';
const T_DONE = '2026-05-01T09:00:00.000Z';
const T_DRAFT = '2026-05-02T09:00:00.000Z';
const T_AUTH = '2026-05-02T10:00:00.000Z';
const T_SENT = '2026-05-02T11:00:00.000Z';
const T_LATER = '2026-05-09T11:00:00.000Z';
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
  await client.exec(`CREATE SCHEMA com_${scenario}; SET search_path TO com_${scenario};
    ${CORPUS_DDL}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}${COMMERCIAL_LEDGER_DDL}${COMMERCIAL_LEDGER_GUARDS}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO com_${scenario}; ${statement}`);
}
async function tx(statement: string) {
  try {
    await client.exec(`SET search_path TO com_${scenario}; BEGIN; ${statement}; COMMIT;`);
  } catch (error) {
    await client.exec('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function rows(query: string) {
  await client.query(`SET search_path TO com_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/**
 * A mined corpus: one fitted artifact an opportunity can rest on, and one
 * deterministic one it must not be allowed to rest on.
 */
async function mined() {
  await sql(`
    INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb);
    INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_KNOWN}', '{}'::jsonb);
    INSERT INTO corpus_record VALUES ('REC-1', 'REL-1', 'facility:1', 'supplies', '${T_KNOWN}');
    INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
      implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
    VALUES ('W-INF', 'INFERENTIAL', 'MODEL_INFERENCE', '{}'::jsonb, 'dependency_link', '{}'::jsonb, 'i', '1', 'o', 'FLOATING_POINT', '${FP(1)}');
    INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
      implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
    VALUES ('W-CNT', 'DESCRIPTIVE', 'COMPUTED_RESULT', '{}'::jsonb, 'relationship_count', '{}'::jsonb, 'i', '1', 'o', 'FIXED_POINT', '${FP(2)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('R-INF', 'W-INF', 'MODEL_INFERENCE', 'REL-1', '${T_KNOWN}', '${T_DONE}', 'SUCCEEDED', '${FP(3)}', '${FP(4)}');
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at, status, input_fingerprint, output_fingerprint)
    VALUES ('R-CNT', 'W-CNT', 'COMPUTED_RESULT', 'REL-1', '${T_KNOWN}', '${T_DONE}', 'SUCCEEDED', '${FP(5)}', '${FP(6)}')`);

  for (const [id, run, cls, extra] of [
    ['A-INF', 'R-INF', 'MODEL_INFERENCE', `, 'm@1', 0.68`],
    ['A-CNT', 'R-CNT', 'COMPUTED_RESULT', `, NULL, NULL`],
  ] as const) {
    await tx(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, model_id, confidence, rights)
      VALUES ('${id}', '${run}', 'SUCCEEDED', '${cls}', 'org:meridian', 'Concentration in the apparent supply network.', '${T_DONE}'${extra}, '{acquisition,normalization}');
      INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
      VALUES ('I-${id}', '${id}', '${T_DONE}', 'SOURCE_RECORD', 'REC-1', '${T_KNOWN}', '{acquisition,normalization}')`);
  }
}

const opportunity = (id = 'O1', artifact = 'A-INF', cls = 'MODEL_INFERENCE', confidence = 0.68) => sql(`
  INSERT INTO commercial_opportunity (opportunity_id, account, artifact_id, artifact_class, trigger,
    need_hypothesis, product_fit, confidence, detected_at)
  VALUES ('${id}', 'org:meridian', '${artifact}', '${cls}',
    'Every retained claim about their inbound lane traces to one source.',
    'They may be unable to see a second-source option before a disruption.',
    'Caravan corridor intelligence.', ${confidence}, '${T_DONE}')`);

const proposalRow = (over: { standing?: string; auth?: string; sent?: boolean; refusal?: string } = {}) => {
  const standing = over.standing ?? 'DRAFTED';
  const authorized = standing === 'AUTHORIZED' || standing === 'SENT';
  return `INSERT INTO engagement_proposal (proposal_id, opportunity_id, contact, contact_basis, channel,
    message, drafted_by, drafted_at, standing, authorized_by_kind, authorized_by, authorized_at, refusal_reason, sent_at)
  VALUES ('P1', 'O1', 'contact:jo', 'Published procurement contact on their own site.', 'EMAIL',
    'Our evidence suggests concentration in your apparent inbound lane.', 'agent:sales', '${T_DRAFT}', '${standing}',
    ${authorized ? `'${over.auth ?? 'HUMAN'}'` : 'NULL'}, ${authorized ? `'operator:jo'` : 'NULL'},
    ${authorized ? `'${T_AUTH}'` : 'NULL'}, ${over.refusal ? `'${over.refusal}'` : 'NULL'},
    ${standing === 'SENT' ? `'${T_SENT}'` : 'NULL'})`;
};

const claimRow = (id = 'C1', presentedAs = 'MODEL_INFERENCE', artifact = 'A-INF', cls = 'MODEL_INFERENCE') =>
  `INSERT INTO engagement_claim (engagement_claim_id, proposal_id, assertion, presented_as, artifact_id, artifact_class)
   VALUES ('${id}', 'P1', 'Our evidence suggests concentration in your apparent inbound lane.', '${presentedAs}', '${artifact}', '${cls}')`;

describe('an opportunity is a fitted claim about an account, not a fact about it', () => {
  beforeEach(mined);

  it('accepts one resting on a model inference', async () => {
    await opportunity();
    expect(await rows(`SELECT artifact_class FROM commercial_opportunity`)).toEqual([{ artifact_class: 'MODEL_INFERENCE' }]);
  });

  /*
   * A count is not a hypothesis about an organization's situation. Arithmetic
   * does not produce claims about intentions, and the column will not let it
   * pretend to.
   */
  it('refuses one resting on a deterministic count', async () => {
    await expect(opportunity('O1', 'A-CNT', 'COMPUTED_RESULT'))
      .rejects.toThrow(/opportunity_is_a_fitted_claim/);
  });

  it('refuses one that misreports the class of the artifact behind it', async () => {
    await expect(opportunity('O1', 'A-CNT', 'MODEL_INFERENCE'))
      .rejects.toThrow(/opportunity_artifact|foreign key/i);
  });

  /* A fitted claim reporting certainty about an account reported a defect. */
  it('refuses a certainty', async () => {
    await expect(opportunity('O1', 'A-INF', 'MODEL_INFERENCE', 1))
      .rejects.toThrow(/opportunity_confidence_is_uncertain/);
  });
});

describe('a claim in a message is a served claim', () => {
  beforeEach(async () => { await mined(); await opportunity(); await tx(`${proposalRow()}; ${claimRow()}`); });

  /*
   * The constraint that matters most on this plane. "We identified
   * concentration in your supply network" reads better than the hedged version
   * and is a claim the corpus cannot support. The recipient is a reader like
   * any other, and the one most likely to act on it.
   */
  it('refuses presenting an inference as something a source observed', async () => {
    await expect(sql(claimRow('C2', 'SOURCE_OBSERVATION')))
      .rejects.toThrow(/engagement_claim_presented_at_its_class|engagement_claim_artifact|foreign key/i);
  });

  it('refuses presenting an inference as a deterministic result either', async () => {
    await expect(sql(claimRow('C2', 'COMPUTED_RESULT')))
      .rejects.toThrow(/engagement_claim_presented_at_its_class|engagement_claim_artifact|foreign key/i);
  });

  it('accepts it presented as what it is', async () => {
    expect(await rows(`SELECT presented_as FROM engagement_claim`)).toEqual([{ presented_as: 'MODEL_INFERENCE' }]);
  });

  it('refuses a claim citing an artifact that does not exist', async () => {
    await expect(sql(claimRow('C2', 'MODEL_INFERENCE', 'A-NOPE')))
      .rejects.toThrow(/engagement_claim_artifact|foreign key/i);
  });
});

describe('an agent may draft and may not send', () => {
  beforeEach(async () => { await mined(); await opportunity(); });

  it('lets an agent draft one', async () => {
    await tx(`${proposalRow()}; ${claimRow()}`);
    expect(await rows(`SELECT drafted_by, standing FROM engagement_proposal`))
      .toEqual([{ drafted_by: 'agent:sales', standing: 'DRAFTED' }]);
  });

  /* And that is where it stops. */
  it('refuses an authorization granted by an agent', async () => {
    await expect(tx(`${proposalRow({ standing: 'AUTHORIZED', auth: 'AGENT' })}; ${claimRow()}`))
      .rejects.toThrow(/authorized_by_kind/);
  });

  it('refuses a send that nobody authorized', async () => {
    await expect(tx(`INSERT INTO engagement_proposal (proposal_id, opportunity_id, contact, contact_basis, channel,
      message, drafted_by, drafted_at, standing, sent_at)
      VALUES ('P1', 'O1', 'contact:jo', 'basis', 'EMAIL', 'message', 'agent:sales', '${T_DRAFT}', 'SENT', '${T_SENT}');
      ${claimRow()}`))
      .rejects.toThrow(/engagement_authorized_names_a_principal/);
  });

  it('keeps the domain and the schema saying the same thing about who may send', () => {
    expect(SALES_AGENT_MAY).toContain('draft');
    expect(SALES_AGENT_MAY_NEVER).toEqual(['authorize', 'send']);
    for (const step of SALES_AGENT_MAY) expect(SALES_AGENT_MAY_NEVER, step).not.toContain(step);
    expect(AUTHORIZING_PRINCIPALS).not.toContain('AGENT' as never);
  });

  it('refuses a refusal that gives no reason', async () => {
    await expect(tx(`${proposalRow({ standing: 'REFUSED' })}; ${claimRow()}`))
      .rejects.toThrow(/engagement_refusal_has_a_reason/);
  });

  /*
   * A message that went out asserting things nobody recorded is a message
   * nobody can answer for. Deferred, because the send and the claims are
   * written together.
   */
  it('refuses a send whose claims were never recorded', async () => {
    await expect(tx(proposalRow({ standing: 'SENT' })))
      .rejects.toThrow(/engagement_sent_without_recorded_claims/);
  });

  it('accepts a send that was authorized and whose claims are on the record', async () => {
    await tx(`${proposalRow({ standing: 'SENT' })}; ${claimRow()}`);
    expect(await rows(`SELECT standing, authorized_by FROM engagement_proposal`))
      .toEqual([{ standing: 'SENT', authorized_by: 'operator:jo' }]);
  });
});

describe('a sent message is not an outcome', () => {
  beforeEach(async () => { await mined(); await opportunity(); });

  const outcome = (value = 'NO_RESPONSE', standing = 'SENT') => sql(`
    INSERT INTO engagement_outcome (outcome_id, proposal_id, proposal_standing, outcome, observed_at, admitted_via)
    VALUES ('X1', 'P1', '${standing}', '${value}', '${T_LATER}', 'admission:commercial-observations')`);

  it('refuses an outcome for an engagement that was never sent', async () => {
    await tx(`${proposalRow()}; ${claimRow()}`);
    await expect(outcome('NO_RESPONSE', 'DRAFTED')).rejects.toThrow(/outcome_only_for_a_sent_engagement/);
  });

  /*
   * NO_RESPONSE is a row. An engagement with no outcome row has not been
   * observed yet, which is a different fact from having been ignored.
   */
  it('records silence as an observed outcome rather than as a missing row', async () => {
    await tx(`${proposalRow({ standing: 'SENT' })}; ${claimRow()}`);
    await outcome('NO_RESPONSE');
    expect(await rows(`SELECT outcome FROM engagement_outcome`)).toEqual([{ outcome: 'NO_RESPONSE' }]);
  });

  /* The firm's own data has no privileged path into the corpus. */
  it('refuses an outcome that did not come through an admission', async () => {
    await tx(`${proposalRow({ standing: 'SENT' })}; ${claimRow()}`);
    await expect(sql(`INSERT INTO engagement_outcome (outcome_id, proposal_id, proposal_standing, outcome, observed_at, admitted_via)
      VALUES ('X1', 'P1', 'SENT', 'RESPONDED', '${T_LATER}', '  ')`))
      .rejects.toThrow(/admitted_via/);
  });

  it('records one outcome per engagement', async () => {
    await tx(`${proposalRow({ standing: 'SENT' })}; ${claimRow()}`);
    await outcome('RESPONDED');
    await expect(sql(`INSERT INTO engagement_outcome (outcome_id, proposal_id, proposal_standing, outcome, observed_at, admitted_via)
      VALUES ('X2', 'P1', 'SENT', 'MEETING', '${T_LATER}', 'admission:commercial-observations')`))
      .rejects.toThrow(/proposal_id/);
  });
});

describe('nothing can be sold, and the block is structural', () => {
  it('refuses an opportunity when nothing has been mined to rest it on', async () => {
    await sql(`INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb)`);
    await expect(opportunity()).rejects.toThrow(/opportunity_artifact|foreign key/i);
    expect(await rows(`SELECT artifact_id FROM derived_artifact`)).toEqual([]);
  });

  it('holds no opportunity, proposal, claim or outcome', async () => {
    for (const table of ['commercial_opportunity', 'engagement_proposal', 'engagement_claim', 'engagement_outcome']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });
});
