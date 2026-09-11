/**
 * The discovery layer's boundaries, against an actual PostgreSQL engine.
 *
 * Raw SQL throughout, deliberately. These guarantees have to hold for a writer
 * that never heard of an application layer: the analyst repairing a row, the
 * notebook that reached the database directly, the migration that seemed
 * harmless. None of them read a doctrine document and all of them reach the
 * tables.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { DERIVABLE_CLASSES, MINING_CONTRACTS } from '@/domain/discoveryLayer';
import {
  DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS, SERVING_PAIRS,
} from './discoveryLedger';

let client: PGlite;
let scenario = 0;

const T_KNOWN = '2026-05-01T08:00:00.000Z';
const T_START = '2026-05-01T09:00:00.000Z';
const T_DONE = '2026-05-01T09:05:00.000Z';
const T_LATER = '2026-05-01T10:00:00.000Z';
const T_HORIZON = '2026-06-01T00:00:00.000Z';
const FP = (n: number) => `sha256:${String(n).repeat(2).padStart(64, '0')}`;

/* The corpus tables the ledger's foreign keys point at. */

const CORPUS_DDL = `
CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
CREATE TABLE corpus_record (record_id text PRIMARY KEY, release_id text NOT NULL, subject_id text NOT NULL, predicate text NOT NULL, known_at timestamptz NOT NULL, UNIQUE (record_id, known_at));
`;

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA disc_${scenario}; SET search_path TO disc_${scenario};
    ${CORPUS_DDL}${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO disc_${scenario}; ${statement}`);
}
/**
 * A transaction, because the deferred guards are checked at commit.
 *
 * The rollback matters: PGlite is one connection shared by every case here, and
 * a failed statement inside an explicit BEGIN leaves it aborted until something
 * ends the block. Without this, the first refusal poisons every case after it
 * and they all fail for a reason that has nothing to do with what they assert.
 */
async function tx(statement: string) {
  try {
    await client.exec(`SET search_path TO disc_${scenario}; BEGIN; ${statement}; COMMIT;`);
  } catch (error) {
    await client.exec('ROLLBACK').catch(() => {});
    throw error;
  }
}
async function rows(query: string) {
  await client.query(`SET search_path TO disc_${scenario}`);
  return (await client.query(query)).rows as Record<string, unknown>[];
}

/** A release and two records for a computation to read. Nothing real has one. */
const corpus = () => sql(`
  INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb);
  INSERT INTO releases VALUES ('REL-1', 'c', 'CURRENT', '${T_KNOWN}', '{}'::jsonb);
  INSERT INTO corpus_record VALUES ('REC-1', 'REL-1', 'facility:1', 'supplies', '${T_KNOWN}');
  INSERT INTO corpus_record VALUES ('REC-2', 'REL-1', 'facility:2', 'supplies', '${T_KNOWN}')`);

const spec = (id = 'W1', kind = 'DESCRIPTIVE', produces = 'COMPUTED_RESULT', fingerprint = FP(1)) => sql(`
  INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
    implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
  VALUES ('${id}', '${kind}', '${produces}', '{"predicate":"supplies"}'::jsonb, 'relationship_count', '{"min":1}'::jsonb,
    'notationsos.mining', '0.1.0', 'payload.derived.v1', 'FIXED_POINT', '${fingerprint}')`);

const run = (id = 'R1', over: { status?: string; workload?: string; produces?: string; failure?: string; output?: string | null } = {}) => {
  const status = over.status ?? 'SUCCEEDED';
  const output = over.output === null ? 'NULL' : `'${over.output ?? FP(2)}'`;
  return sql(`
    INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at,
      status, input_fingerprint, output_fingerprint, failure_identity)
    VALUES ('${id}', '${over.workload ?? 'W1'}', '${over.produces ?? 'COMPUTED_RESULT'}', 'REL-1', '${T_START}',
      ${status === 'RUNNING' ? 'NULL' : `'${T_DONE}'`}, '${status}', '${FP(3)}',
      ${status === 'SUCCEEDED' ? output : 'NULL'},
      ${over.failure ? `'${over.failure}'` : 'NULL'})`);
};

const artifactValues = (id: string, over: { run?: string; cls?: string; at?: string; model?: string | null; confidence?: number | null; horizon?: string | null; rights?: string } = {}) => {
  const cls = over.cls ?? 'COMPUTED_RESULT';
  return `('${id}', '${over.run ?? 'R1'}', 'SUCCEEDED', '${cls}', 'facility:1', 'supplies facility:2', '${over.at ?? T_DONE}',
    ${over.model === undefined ? 'NULL' : over.model === null ? 'NULL' : `'${over.model}'`},
    ${over.confidence === undefined || over.confidence === null ? 'NULL' : over.confidence},
    ${over.horizon ? `'${over.horizon}'` : 'NULL'},
    ${over.rights ?? `'{acquisition,normalization}'`})`;
};

const ARTIFACT_COLUMNS = `INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, model_id, confidence, horizon_ends_at, rights) VALUES `;

const inputRow = (id: string, over: { artifact?: string; at?: string; record?: string; knownAt?: string; rights?: string } = {}) =>
  `INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind, source_record_id, source_known_at, input_rights)
   VALUES ('${id}', '${over.artifact ?? 'A1'}', '${over.at ?? T_DONE}', 'SOURCE_RECORD', '${over.record ?? 'REC-1'}', '${over.knownAt ?? T_KNOWN}', ${over.rights ?? `'{acquisition,normalization}'`})`;

/** An artifact and the one input that makes it a derivation rather than an assertion. */
const artifact = (id = 'A1', over: Parameters<typeof artifactValues>[1] = {}, inputOver: Parameters<typeof inputRow>[1] = {}) =>
  tx(`${ARTIFACT_COLUMNS}${artifactValues(id, over)}; ${inputRow(`I-${id}`, { artifact: id, at: over.at, ...inputOver })}`);

describe('a computation cannot produce evidence, or authority', () => {
  beforeEach(corpus);

  it('produces the four classes whose origin is computation', async () => {
    for (const [index, contract] of MINING_CONTRACTS.entries()) {
      await spec(`W-${index}`, contract.kind, contract.produces, FP(index + 1));
    }
    expect(await rows(`SELECT DISTINCT produces_class FROM workload_spec ORDER BY produces_class`))
      .toEqual([...DERIVABLE_CLASSES].sort().map((produces_class) => ({ produces_class })));
  });

  /*
   * The floor. Acquisition is the only path to a source observation, and no
   * amount of computation over the corpus opens a second one.
   */
  it('refuses a workload that claims to produce a source observation', async () => {
    await expect(spec('W1', 'DESCRIPTIVE', 'SOURCE_OBSERVATION'))
      .rejects.toThrow(/spec_kind_produces_its_class/);
  });

  /* And the ceiling. The action layer owns both of these. */
  it('refuses a workload that claims to produce a decision or an execution result', async () => {
    await expect(spec('W1', 'PRESCRIPTIVE', 'DECISION')).rejects.toThrow(/spec_kind_produces_its_class/);
    await expect(spec('W2', 'PRESCRIPTIVE', 'EXECUTION_RESULT')).rejects.toThrow(/spec_kind_produces_its_class/);
  });

  /*
   * The pairing check refuses those three before the column check is reached,
   * so the column's own accepted set is asserted directly. Both have to hold:
   * a new mining kind must not be able to open a path to a class the column
   * would otherwise have refused.
   */
  it('accepts only the computation-origin classes in the column itself', () => {
    const accepted = /produces_class text NOT NULL CHECK \(produces_class IN \(([^)]*)\)\)/.exec(DISCOVERY_LEDGER_DDL)?.[1];
    expect(accepted).toBeDefined();
    for (const cls of DERIVABLE_CLASSES) expect(accepted, cls).toContain(cls);
    for (const cls of ['SOURCE_OBSERVATION', 'DECISION', 'EXECUTION_RESULT']) {
      expect(accepted, cls).not.toContain(cls);
    }
  });

  it('refuses a descriptive workload that emits a prediction', async () => {
    await expect(spec('W1', 'DESCRIPTIVE', 'PREDICTION'))
      .rejects.toThrow(/spec_kind_produces_its_class/);
  });
});

describe('a derivation cannot be served as an observation', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); await artifact(); });

  /*
   * The sentence the whole layer exists to hold, as a row that will not go in.
   * A graph algorithm's likely dependency and a bill of lading's established
   * one are different objects, and served without a class they read the same.
   */
  it('refuses to serve a computed result as a source observation', async () => {
    await expect(sql(`INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, artifact_id, artifact_class)
      VALUES ('S1', '${T_LATER}', 'COMPUTATION', 'SOURCE_OBSERVATION', 'A1', 'COMPUTED_RESULT')`))
      .rejects.toThrow(/served_class_is_the_artifacts_own/);
  });

  /*
   * And with no artifact to disagree with either — an origin that owns neither
   * class still cannot serve one. This is the pair check on its own.
   */
  it('refuses an origin serving a class that is not its own', async () => {
    await expect(sql(`INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as)
      VALUES ('S1', '${T_LATER}', 'AUTHORIZATION', 'SOURCE_OBSERVATION')`))
      .rejects.toThrow(/served_class_matches_origin/);
  });

  it('refuses to serve a source record as anything but an observation', async () => {
    await expect(sql(`INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, source_record_id)
      VALUES ('S1', '${T_LATER}', 'ACQUISITION', 'MODEL_INFERENCE', 'REC-1')`))
      .rejects.toThrow(/served_class_matches_origin/);
  });

  it('refuses to relabel one derived class as another', async () => {
    await expect(sql(`INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, artifact_id, artifact_class)
      VALUES ('S1', '${T_LATER}', 'COMPUTATION', 'MODEL_INFERENCE', 'A1', 'COMPUTED_RESULT')`))
      .rejects.toThrow(/served_class_is_the_artifacts_own|served_class_matches_origin/);
  });

  it('serves it as what it is', async () => {
    await sql(`INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, artifact_id, artifact_class)
      VALUES ('S1', '${T_LATER}', 'COMPUTATION', 'COMPUTED_RESULT', 'A1', 'COMPUTED_RESULT')`);
    expect(await rows(`SELECT served_as FROM served_claim`)).toEqual([{ served_as: 'COMPUTED_RESULT' }]);
  });

  it('keeps the domain and the schema agreeing about which origin serves which class', () => {
    expect(SERVING_PAIRS).toContainEqual(['ACQUISITION', 'SOURCE_OBSERVATION']);
    expect(SERVING_PAIRS).toContainEqual(['COMPUTATION', 'COMPUTED_RESULT']);
    expect(SERVING_PAIRS).not.toContainEqual(['COMPUTATION', 'SOURCE_OBSERVATION']);
    expect(DISCOVERY_LEDGER_DDL).toContain(`('AUTHORIZATION', 'DECISION')`);
  });
});

describe('a failed run produced nothing', () => {
  beforeEach(async () => { await corpus(); await spec(); });

  it('refuses an artifact hanging off a failed run', async () => {
    await run('R1', { status: 'FAILED', failure: 'MINING_INPUT_SCHEMA_MISMATCH' });
    await expect(tx(`${ARTIFACT_COLUMNS}${artifactValues('A1')}`))
      .rejects.toThrow(/artifact_run|artifact_only_from_a_successful_run|foreign key/i);
  });

  /*
   * The case the honest writer produces. Denormalising 'FAILED' correctly
   * satisfies the foreign key, so the key does not refuse this one and the
   * CHECK is the only thing standing between a failed computation and a result
   * that outlived it. Written because a mutation that removed the CHECK left
   * every other case in this file passing.
   */
  it('refuses an artifact that correctly reports the failed run it came from', async () => {
    await run('R1', { status: 'FAILED', failure: 'MINING_INPUT_SCHEMA_MISMATCH' });
    await expect(tx(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, rights)
      VALUES ('A1', 'R1', 'FAILED', 'COMPUTED_RESULT', 'facility:1', 'supplies facility:2', '${T_DONE}', '{acquisition}')`))
      .rejects.toThrow(/artifact_only_from_a_successful_run/);
  });

  it('refuses an artifact hanging off a run still going', async () => {
    await run('R1', { status: 'RUNNING' });
    await expect(tx(`${ARTIFACT_COLUMNS}${artifactValues('A1')}`))
      .rejects.toThrow(/artifact_run|artifact_only_from_a_successful_run|foreign key/i);
  });

  /* A failure nobody can group is a failure nobody can fix. */
  it('refuses a failed run that does not name its failure', async () => {
    await expect(run('R1', { status: 'FAILED' })).rejects.toThrow(/run_failure_is_identified/);
  });

  it('refuses a successful run that names one', async () => {
    await expect(run('R1', { status: 'SUCCEEDED', failure: 'SOMETHING' }))
      .rejects.toThrow(/run_failure_is_identified/);
  });

  it('refuses a successful run with no output to point at', async () => {
    await expect(run('R1', { status: 'SUCCEEDED', output: null }))
      .rejects.toThrow(/run_output_only_on_success/);
  });

  /* A retry is a second run, not a second result. */
  it('counts results as artifacts however many times the workload was run', async () => {
    await run('R1', { status: 'FAILED', failure: 'MINING_TIMEOUT' });
    await run('R2');
    await artifact('A1', { run: 'R2' });
    expect(await rows(`SELECT run_id FROM workload_run`)).toHaveLength(2);
    expect(await rows(`SELECT artifact_id FROM derived_artifact`)).toHaveLength(1);
  });
});

describe('a computation identity is its method, parameters and implementation', () => {
  beforeEach(corpus);

  /* Two specs differing in any of them are two computations, not one re-run. */
  it('refuses a second workload reusing a fingerprint', async () => {
    await spec('W1');
    await expect(spec('W2', 'DESCRIPTIVE', 'COMPUTED_RESULT', FP(1))).rejects.toThrow(/spec_fingerprint/);
  });

  it('refuses a fingerprint that is not a content digest', async () => {
    await expect(spec('W1', 'DESCRIPTIVE', 'COMPUTED_RESULT', 'latest'))
      .rejects.toThrow(/spec_fingerprint/);
  });
});

describe('a computation cannot read what did not exist yet', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); });

  it('refuses an input knowable only after the computation ran', async () => {
    await sql(`INSERT INTO corpus_record VALUES ('REC-3', 'REL-1', 'facility:3', 'supplies', '${T_LATER}')`);
    await expect(artifact('A1', {}, { record: 'REC-3', knownAt: T_LATER }))
      .rejects.toThrow(/input_source_not_ahead/);
  });

  /* Backdating the copy to get under the check fails the foreign key instead. */
  it('refuses an input that backdates its own knowledge time', async () => {
    await sql(`INSERT INTO corpus_record VALUES ('REC-3', 'REL-1', 'facility:3', 'supplies', '${T_LATER}')`);
    await expect(artifact('A1', {}, { record: 'REC-3', knownAt: T_KNOWN }))
      .rejects.toThrow(/input_source_record|foreign key/i);
  });

  it('accepts one knowable before it', async () => {
    await artifact('A1');
    expect(await rows(`SELECT artifact_id FROM derived_artifact`)).toEqual([{ artifact_id: 'A1' }]);
  });
});

describe('an artifact cannot appear in its own ancestry', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); await artifact('A1'); });

  it('refuses an artifact that reads itself', async () => {
    await expect(sql(`INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
      input_artifact_id, input_claim_class, input_computed_at, input_rights)
      VALUES ('I2', 'A1', '${T_DONE}', 'DERIVED_ARTIFACT', 'A1', 'COMPUTED_RESULT', '${T_DONE}', '{acquisition}')`))
      .rejects.toThrow(/input_not_itself|input_artifact_computed_earlier/);
  });

  /*
   * And the general case, without a recursive check. A derived input must have
   * been computed strictly earlier, and `<` on a total order admits no cycles,
   * so the acyclicity falls out of the ordering at any depth.
   */
  it('refuses reading an artifact computed at the same instant or later', async () => {
    await run('R2');
    await artifact('A2', { run: 'R2', at: T_LATER });
    await expect(sql(`INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
      input_artifact_id, input_claim_class, input_computed_at, input_rights)
      VALUES ('I3', 'A1', '${T_DONE}', 'DERIVED_ARTIFACT', 'A2', 'COMPUTED_RESULT', '${T_LATER}', '{acquisition}')`))
      .rejects.toThrow(/input_artifact_computed_earlier/);
  });

  /*
   * The instant that separates `<` from `<=`. Two artifacts stamped at the same
   * moment, one reading the other, is the shape a cycle would take — and it is
   * the only shape that distinguishes the two operators, so it is the one the
   * acyclicity argument actually rests on. Written because relaxing `<` to `<=`
   * left every other case in this file passing.
   */
  it('refuses reading an artifact computed at the very same instant', async () => {
    await run('R2');
    await artifact('A2', { run: 'R2', at: T_DONE });
    await expect(sql(`INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
      input_artifact_id, input_claim_class, input_computed_at, input_rights)
      VALUES ('I4', 'A2', '${T_DONE}', 'DERIVED_ARTIFACT', 'A1', 'COMPUTED_RESULT', '${T_DONE}', '{acquisition,normalization}')`))
      .rejects.toThrow(/input_artifact_computed_earlier/);
  });

  it('accepts reading one computed strictly before it', async () => {
    await run('R2');
    await tx(`${ARTIFACT_COLUMNS}${artifactValues('A2', { run: 'R2', at: T_LATER })};
      INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
        input_artifact_id, input_claim_class, input_computed_at, input_rights)
      VALUES ('I-A2', 'A2', '${T_LATER}', 'DERIVED_ARTIFACT', 'A1', 'COMPUTED_RESULT', '${T_DONE}', '{acquisition,normalization}')`);
    expect(await rows(`SELECT input_artifact_id FROM artifact_input WHERE artifact_id = 'A2'`))
      .toEqual([{ input_artifact_id: 'A1' }]);
  });

  /* And a derived input cannot misreport what class it was. */
  it('refuses an input claiming its source artifact was a different class', async () => {
    await run('R2');
    await expect(tx(`${ARTIFACT_COLUMNS}${artifactValues('A2', { run: 'R2', at: T_LATER })};
      INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
        input_artifact_id, input_claim_class, input_computed_at, input_rights)
      VALUES ('I-A2', 'A2', '${T_LATER}', 'DERIVED_ARTIFACT', 'A1', 'MODEL_INFERENCE', '${T_DONE}', '{acquisition}')`))
      .rejects.toThrow(/input_artifact_class|foreign key/i);
  });
});

describe('an artifact that read nothing asserted nothing', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); });

  /*
   * The claim about the corpus produced without consulting it. Deferred to
   * commit, because the artifact and its inputs are written together.
   */
  it('refuses an artifact with no inputs at all', async () => {
    await expect(tx(`${ARTIFACT_COLUMNS}${artifactValues('A1')}`))
      .rejects.toThrow(/artifact_read_nothing/);
  });

  it('accepts one that names what it read', async () => {
    await artifact('A1');
    expect(await rows(`SELECT count(*)::int AS n FROM artifact_input WHERE artifact_id = 'A1'`))
      .toEqual([{ n: 1 }]);
  });
});

describe('confidence belongs to fitted things', () => {
  beforeEach(async () => { await corpus(); await spec('W1', 'INFERENTIAL', 'MODEL_INFERENCE'); await run('R1', { produces: 'MODEL_INFERENCE' }); });

  it('refuses a model inference with no confidence', async () => {
    await expect(artifact('A1', { cls: 'MODEL_INFERENCE', model: 'm@1' }))
      .rejects.toThrow(/artifact_fitted_carries_confidence/);
  });

  it('refuses a model inference with no model', async () => {
    await expect(artifact('A1', { cls: 'MODEL_INFERENCE', confidence: 0.7 }))
      .rejects.toThrow(/artifact_fitted_names_model/);
  });

  /* A fitted model reporting certainty reported a defect. */
  it('refuses a confidence of one', async () => {
    await expect(artifact('A1', { cls: 'MODEL_INFERENCE', model: 'm@1', confidence: 1 }))
      .rejects.toThrow(/artifact_confidence_is_uncertain/);
  });

  it('accepts one that is uncertain', async () => {
    await artifact('A1', { cls: 'MODEL_INFERENCE', model: 'm@1', confidence: 0.72 });
    expect(await rows(`SELECT confidence::float8 AS c FROM derived_artifact`)).toEqual([{ c: 0.72 }]);
  });

  it('refuses a confidence on a deterministic result', async () => {
    await spec('W2', 'DESCRIPTIVE', 'COMPUTED_RESULT', FP(9));
    await run('R2', { workload: 'W2' });
    await expect(artifact('A2', { run: 'R2', confidence: 0.5 }))
      .rejects.toThrow(/artifact_fitted_carries_confidence/);
  });
});

describe('a claim reaching past its evidence says how far', () => {
  beforeEach(async () => { await corpus(); await spec('W1', 'PREDICTIVE', 'PREDICTION'); await run('R1', { produces: 'PREDICTION' }); });

  it('refuses a prediction with no horizon', async () => {
    await expect(artifact('A1', { cls: 'PREDICTION', model: 'm@1', confidence: 0.6 }))
      .rejects.toThrow(/artifact_forward_claim_has_horizon/);
  });

  it('refuses a horizon that is not ahead of the computation', async () => {
    await expect(artifact('A1', { cls: 'PREDICTION', model: 'm@1', confidence: 0.6, horizon: T_KNOWN }))
      .rejects.toThrow(/artifact_horizon_is_ahead/);
  });

  it('accepts one that reaches forward', async () => {
    await artifact('A1', { cls: 'PREDICTION', model: 'm@1', confidence: 0.6, horizon: T_HORIZON });
    expect(await rows(`SELECT claim_class FROM derived_artifact`)).toEqual([{ claim_class: 'PREDICTION' }]);
  });

  it('refuses a horizon on a result that does not reach forward', async () => {
    await spec('W2', 'DESCRIPTIVE', 'COMPUTED_RESULT', FP(9));
    await run('R2', { workload: 'W2' });
    await expect(artifact('A2', { run: 'R2', horizon: T_HORIZON }))
      .rejects.toThrow(/artifact_forward_claim_has_horizon/);
  });
});

describe('rights are inherited, never widened', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); });

  /*
   * The quiet failure: a source that may not be redistributed is aggregated,
   * and the aggregate is redistributed because nobody recorded the descent.
   */
  it('refuses an artifact claiming an operation its input does not carry', async () => {
    await expect(artifact('A1', { rights: `'{acquisition,normalization,redistribution}'` }, { rights: `'{acquisition,normalization}'` }))
      .rejects.toThrow(/artifact_rights_wider_than_inputs/);
  });

  it('refuses a later input that is narrower than the rights already claimed', async () => {
    await artifact('A1', { rights: `'{acquisition,normalization}'` }, { rights: `'{acquisition,normalization}'` });
    await expect(tx(inputRow('I2', { record: 'REC-2', rights: `'{acquisition}'` })))
      .rejects.toThrow(/artifact_rights_wider_than_inputs/);
  });

  it('accepts rights no wider than every input', async () => {
    await artifact('A1', { rights: `'{acquisition}'` }, { rights: `'{acquisition,normalization}'` });
    expect(await rows(`SELECT rights FROM derived_artifact`)).toEqual([{ rights: ['acquisition'] }]);
  });
});

describe('a threshold declared after the result is not a threshold', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); await artifact('A1'); });

  const validation = (over: { declaredAt?: string; result?: number; threshold?: number; direction?: string; passed?: boolean } = {}) => sql(`
    INSERT INTO artifact_validation (validation_id, artifact_id, method, metric, baseline, direction,
      result, threshold, threshold_declared_at, validated_at, passed, evidence)
    VALUES ('V1', 'A1', 'held_out_comparison', 'precision', 'majority_class', '${over.direction ?? 'HIGHER_IS_BETTER'}',
      ${over.result ?? 0.9}, ${over.threshold ?? 0.8}, '${over.declaredAt ?? T_START}', '${T_LATER}',
      ${over.passed ?? true}, 'Held-out records REC-2.')`);

  it('refuses a threshold declared after the measurement', async () => {
    await expect(validation({ declaredAt: T_HORIZON }))
      .rejects.toThrow(/validation_threshold_declared_first/);
  });

  /* And the pass is the numbers, not a claim beside them. */
  it('refuses a pass the metric does not support', async () => {
    await expect(validation({ result: 0.5, threshold: 0.8, passed: true }))
      .rejects.toThrow(/validation_pass_matches_the_metric/);
  });

  it('refuses a failure the metric does not support either', async () => {
    await expect(validation({ result: 0.9, threshold: 0.8, passed: false }))
      .rejects.toThrow(/validation_pass_matches_the_metric/);
  });

  it('reads the direction of the metric rather than assuming higher is better', async () => {
    await validation({ direction: 'LOWER_IS_BETTER', result: 0.2, threshold: 0.3, passed: true });
    expect(await rows(`SELECT passed FROM artifact_validation`)).toEqual([{ passed: true }]);
  });

  /*
   * A run exiting zero is not a validated result. The artifact is written with
   * NOT_VALIDATED and stays there until something checks it.
   */
  it('leaves an artifact unvalidated until a validation says otherwise', async () => {
    expect(await rows(`SELECT validation FROM derived_artifact`)).toEqual([{ validation: 'NOT_VALIDATED' }]);
    expect(await rows(`SELECT validation_id FROM artifact_validation`)).toEqual([]);
  });
});

describe('a gap produces a proposal and never an acquisition', () => {
  beforeEach(async () => {
    await corpus(); await spec(); await run(); await artifact('A1');
    await sql(`INSERT INTO gap_detection (gap_id, artifact_id, missing, expected_uncertainty_reduction, detected_at)
      VALUES ('G1', 'A1', 'No customs record covers the facility:2 lane.', 0.4, '${T_LATER}')`);
  });

  it('refuses a gap that would reduce nothing', async () => {
    await expect(sql(`INSERT INTO gap_detection (gap_id, artifact_id, missing, expected_uncertainty_reduction, detected_at)
      VALUES ('G2', 'A1', 'Something.', 0, '${T_LATER}')`))
      .rejects.toThrow(/expected_uncertainty_reduction/);
  });

  /* An agent is not a value this column holds, as in the execution ledger. */
  it('refuses an acquisition authorized by an agent', async () => {
    await expect(sql(`INSERT INTO acquisition_proposal (proposal_id, gap_id, target_source, proposed_at, standing,
      authorized_by_kind, authorized_by, authorized_at)
      VALUES ('P1', 'G1', 'customs.br', '${T_LATER}', 'AUTHORIZED', 'AGENT', 'agent:miner', '${T_LATER}')`))
      .rejects.toThrow(/authorized_by_kind/);
  });

  it('refuses an authorization that names nobody', async () => {
    await expect(sql(`INSERT INTO acquisition_proposal (proposal_id, gap_id, target_source, proposed_at, standing)
      VALUES ('P1', 'G1', 'customs.br', '${T_LATER}', 'AUTHORIZED')`))
      .rejects.toThrow(/proposal_authorized_names_a_principal/);
  });

  it('refuses a refusal that gives no reason', async () => {
    await expect(sql(`INSERT INTO acquisition_proposal (proposal_id, gap_id, target_source, proposed_at, standing)
      VALUES ('P1', 'G1', 'customs.br', '${T_LATER}', 'REFUSED')`))
      .rejects.toThrow(/proposal_refusal_has_a_reason/);
  });

  it('lets the engine propose, and leaves it proposed', async () => {
    await sql(`INSERT INTO acquisition_proposal (proposal_id, gap_id, target_source, proposed_at, standing)
      VALUES ('P1', 'G1', 'customs.br', '${T_LATER}', 'PROPOSED')`);
    expect(await rows(`SELECT standing FROM acquisition_proposal`)).toEqual([{ standing: 'PROPOSED' }]);
  });
});

describe('the ledger starts empty', () => {
  it('holds no workload, run, artifact, validation, gap or proposal', async () => {
    for (const table of ['workload_spec', 'workload_run', 'derived_artifact', 'artifact_input',
      'artifact_validation', 'served_claim', 'gap_detection', 'acquisition_proposal']) {
      expect(await rows(`SELECT 1 FROM ${table}`), table).toEqual([]);
    }
  });

  /*
   * The readiness claim, structural. A run binds to a release and there are
   * none, so nothing can be computed at all.
   */
  it('refuses a run when the corpus holds no release', async () => {
    await sql(`INSERT INTO corpora VALUES ('c', 'CARAVAN', '{}'::jsonb)`);
    await spec();
    await expect(run()).rejects.toThrow(/corpus_release_id|foreign key/i);
    expect(await rows(`SELECT release_id FROM releases`)).toEqual([]);
  });
});

describe('rights are one vocabulary', () => {
  beforeEach(async () => { await corpus(); await spec(); await run(); });

  /*
   * A source-policy operation name is not a permitted use. Two vocabularies
   * in one column let a comparison between them succeed or fail by accident,
   * which is what happened before this check existed.
   */
  it('refuses an artifact whose rights name a source operation rather than a permitted use', async () => {
    await expect(artifact('A1', { rights: `'{DERIVE,INGEST}'` }, { rights: `'{DERIVE,INGEST}'` }))
      .rejects.toThrow(/artifact_rights_are_permitted_uses/);
  });

  it('refuses an input whose rights are not permitted uses', async () => {
    await expect(artifact('A1', { rights: `'{acquisition}'` }, { rights: `'{acquisition,READ}'` }))
      .rejects.toThrow(/input_rights_are_permitted_uses/);
  });

  it('accepts an artifact with no rights at all, which is a floor rather than an error', async () => {
    await artifact('A1', { rights: `'{}'` }, { rights: `'{}'` });
    expect(await rows(`SELECT rights FROM derived_artifact`)).toEqual([{ rights: [] }]);
  });
});
