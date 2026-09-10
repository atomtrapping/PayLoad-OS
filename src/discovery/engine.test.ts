/**
 * The mining path, end to end, over the corpus this repository actually holds.
 *
 * Not a synthetic fixture built to make the test pass: the committed
 * demonstration corpora, their real records, their real sources and their real
 * rights schedules. The computation runs, the artifacts are written to a
 * PostgreSQL engine through the ledger's own DDL, and they are read back and
 * checked. If the boundary constraints and the engine disagree about anything,
 * this is where it shows.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { FIXTURE_CORPORA } from '@/fixtures';
import type { Corpus, CorpusRecord } from '@/domain/corpus';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from '@/db/discoveryLedger';
import { inputFingerprint, outputFingerprint, runWorkload, specFingerprint } from './engine';
import { evidenceConcentrationWorkload, concentrationOf, gapsFrom, type ConcentrationDetail } from './evidenceConcentration';
import { sqlArray, sqlText } from '@/db/ddl';

const CARAVAN = FIXTURE_CORPORA.find((corpus) => corpus.domain === 'CARAVAN') as Corpus;
const RECORDS = CARAVAN.records;
const RELEASE = CARAVAN.releases[CARAVAN.releases.length - 1];

/*
 * After the corpus knew everything it reads, derived rather than chosen.
 *
 * The first attempt at this file hard-coded a date and the ledger refused the
 * inputs: some committed records become knowable later than the date picked,
 * and a computation cannot read what the system does not yet hold. The
 * constraint was right and the test was wrong, so the clock now comes from the
 * records.
 */
const LATEST_KNOWN = RECORDS.reduce((latest, record) => (record.knownAt > latest ? record.knownAt : latest), RECORDS[0].knownAt);
const T_START = new Date(Date.parse(LATEST_KNOWN) + 60_000).toISOString();
const T_DONE = new Date(Date.parse(LATEST_KNOWN) + 64_000).toISOString();

/** The real rights, read from the release's schedules rather than invented. */
const rightsOf = (record: CorpusRecord): readonly string[] => {
  const schedule = RELEASE.sources.find((source) => source.sourceId === record.provenance.sourceId);
  return schedule ? [...schedule.registration.allowedOperations].sort() : [];
};

const run = (parameters = { minRecords: 1 }, records: readonly CorpusRecord[] = RECORDS) =>
  runWorkload(evidenceConcentrationWorkload(parameters), records, {
    runId: 'RUN-1', startedAt: T_START, completedAt: T_DONE, rightsOf,
  });

describe('the computation, over the corpus that exists', () => {
  it('reads the committed records and finds the single-sourced subjects', () => {
    const result = run();
    expect(result.status).toBe('SUCCEEDED');
    expect(result.artifacts.length).toBeGreaterThan(0);
    /* Every artifact is a computed result, and none of them is evidence. */
    for (const artifact of result.artifacts) expect(artifact.claimClass).toBe('COMPUTED_RESULT');
    const single = result.artifacts.filter((a) => (a.detail as ConcentrationDetail).singleSourced);
    expect(single.length).toBeGreaterThan(0);
    expect(single[0].claim).toContain('rest on one source');
  });

  it('computes the index by hand for a subject and gets the same number', () => {
    const subject = RECORDS[0].subjectId;
    const group = RECORDS.filter((record) => record.subjectId === subject);
    const bySource = new Map<string, number>();
    for (const record of group) bySource.set(record.provenance.sourceId, (bySource.get(record.provenance.sourceId) ?? 0) + 1);
    const expected = Math.round(([...bySource.values()].reduce((s, n) => s + n * n, 0) / (group.length ** 2)) * 1e6) / 1e6;
    expect(concentrationOf(group).herfindahl).toBe(expected);
  });

  /* One source holding everything is 1; n equal sources are 1/n. */
  it('anchors the measure at both ends', () => {
    const one = RECORDS.filter((r) => r.provenance.sourceId === RECORDS[0].provenance.sourceId).slice(0, 3);
    expect(concentrationOf(one).herfindahl).toBe(1);
    expect(concentrationOf(one).singleSourced).toBe(true);
  });

  it('carries what the measure cannot see, with the result', () => {
    const detail = run().artifacts[0].detail as ConcentrationDetail;
    expect(detail.limit).toContain('not independent ones');
  });
});

describe('a deterministic workload produces a deterministic fingerprint', () => {
  it('gives the same three fingerprints on a second run of the same thing', () => {
    const a = run();
    const b = run();
    expect(b.specFingerprint).toBe(a.specFingerprint);
    expect(b.inputFingerprint).toBe(a.inputFingerprint);
    expect(b.outputFingerprint).toBe(a.outputFingerprint);
    expect(a.outputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  /* Order is not information. The same records read in another order read the same. */
  it('does not change when the input arrives in a different order', () => {
    expect(inputFingerprint([...RECORDS].reverse())).toBe(inputFingerprint(RECORDS));
  });

  it('changes when an input changes', () => {
    const fewer = RECORDS.slice(0, RECORDS.length - 1);
    expect(inputFingerprint(fewer)).not.toBe(inputFingerprint(RECORDS));
    expect(run({ minRecords: 1 }, fewer).outputFingerprint).not.toBe(run().outputFingerprint);
  });

  /*
   * A changed parameter is a different computation, not a re-run of the same
   * one. That is what makes two results comparable rather than one silently
   * replacing the other.
   */
  it('changes the computation identity when a parameter changes', () => {
    expect(specFingerprint(evidenceConcentrationWorkload({ minRecords: 2 })))
      .not.toBe(specFingerprint(evidenceConcentrationWorkload({ minRecords: 1 })));
  });

  /* And a rename is not a new computation. */
  it('does not change the identity when only the workload name does', () => {
    const renamed = { ...evidenceConcentrationWorkload(), workloadId: 'something-else' };
    expect(specFingerprint(renamed)).toBe(specFingerprint(evidenceConcentrationWorkload()));
  });

  it('is order-independent in the output too', () => {
    const claims = [{ subject: 'b', claim: 'x', readRecordIds: ['1'], detail: {} }, { subject: 'a', claim: 'y', readRecordIds: ['2'], detail: {} }];
    expect(outputFingerprint(claims)).toBe(outputFingerprint([...claims].reverse()));
  });
});

describe('a failure keeps its identity', () => {
  it('names the failure rather than reporting that computation failed', () => {
    const result = run({ minRecords: 1 }, []);
    expect(result.status).toBe('FAILED');
    expect(result.failureIdentity).toBe('MINING_NO_INPUT_SELECTED');
  });

  /* A failed run produced no output to fingerprint, and no artifacts. */
  it('leaves no result behind', () => {
    const result = run({ minRecords: 1 }, []);
    expect(result.outputFingerprint).toBeNull();
    expect(result.artifacts).toEqual([]);
  });

  it('still records what it read, so the failure is diagnosable', () => {
    expect(run({ minRecords: 1 }, []).inputFingerprint).toMatch(/^sha256:/);
  });

  /* A deterministic result carrying a confidence is a defect, not a result. */
  it('refuses a confidence on a deterministic class', () => {
    const definition = evidenceConcentrationWorkload();
    const rigged = { ...definition, compute: () => [{ subject: 's', claim: 'c', confidence: 0.5, readRecordIds: [RECORDS[0].recordId], detail: {} }] };
    const result = runWorkload(rigged, RECORDS, { runId: 'R', startedAt: T_START, completedAt: T_DONE, rightsOf });
    expect(result.status).toBe('FAILED');
    expect(result.failureIdentity).toBe('MINING_CONFIDENCE_ON_DETERMINISTIC_RESULT');
  });

  it('refuses a claim that read nothing', () => {
    const definition = evidenceConcentrationWorkload();
    const rigged = { ...definition, compute: () => [{ subject: 's', claim: 'c', readRecordIds: [], detail: {} }] };
    const result = runWorkload(rigged, RECORDS, { runId: 'R', startedAt: T_START, completedAt: T_DONE, rightsOf });
    expect(result.failureIdentity).toBe('MINING_CLAIM_READ_NOTHING');
  });

  it('turns a throwing computation into a named failure rather than a crash', () => {
    const definition = evidenceConcentrationWorkload();
    const rigged = { ...definition, compute: () => { throw new Error('boom'); } };
    expect(runWorkload(rigged, RECORDS, { runId: 'R', startedAt: T_START, completedAt: T_DONE, rightsOf }).failureIdentity)
      .toBe('MINING_COMPUTE_THREW');
  });
});

describe('rights descend into the result', () => {
  /*
   * Computed from the records each claim actually read, against the real
   * schedules on the release. A claim that never touched a restricted record
   * is not restricted by it, and one that did cannot be wider than it.
   */
  it('gives every artifact no more than its own inputs allow', () => {
    for (const artifact of run().artifacts) {
      for (const operation of artifact.rights) {
        for (const input of artifact.inputs) {
          expect(input.rights, `${artifact.artifactId} claims ${operation}`).toContain(operation);
        }
      }
    }
  });

  it('reads the rights from the release rather than inventing them', () => {
    const artifact = run().artifacts[0];
    const known = new Set(RELEASE.sources.flatMap((source) => source.registration.allowedOperations as readonly string[]));
    for (const input of artifact.inputs) for (const operation of input.rights) expect(known).toContain(operation);
  });
});

describe('the gap the finding implies', () => {
  it('ranks the single-sourced subjects above the diverse ones', () => {
    const details = run().artifacts.map((a) => ({ subject: a.subject, detail: a.detail as ConcentrationDetail }));
    const gaps = gapsFrom(details);
    expect(gaps.length).toBeGreaterThan(0);
    const first = details.find((d) => d.subject === gaps[0].subject)!;
    expect(first.detail.herfindahl).toBe(1);
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i - 1].expectedUncertaintyReduction).toBeGreaterThanOrEqual(gaps[i].expectedUncertaintyReduction);
    }
  });

  /* A gap is a finding. It is not an acquisition and it does not become one here. */
  it('produces a description of what is missing and stops', () => {
    const gaps = gapsFrom(run().artifacts.map((a) => ({ subject: a.subject, detail: a.detail as ConcentrationDetail })));
    expect(gaps[0].missing).toContain('No independent source covers it');
    expect(Object.keys(gaps[0]).sort()).toEqual(['expectedUncertaintyReduction', 'missing', 'subject']);
  });
});

/* ── Persistence, against a real engine ── */

describe('the result survives being written down and read back', () => {
  let client: PGlite;
  let scenario = 0;

  beforeAll(async () => { client = new PGlite(); await client.waitReady; });
  afterAll(async () => { await client?.close(); });

  beforeEach(async () => {
    scenario += 1;
    await client.exec(`CREATE SCHEMA mine_${scenario}; SET search_path TO mine_${scenario};
      CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
      CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
      CREATE TABLE corpus_record (record_id text PRIMARY KEY, release_id text NOT NULL, subject_id text NOT NULL, predicate text NOT NULL, known_at timestamptz NOT NULL, UNIQUE (record_id, known_at));
      ${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}`);
  });

  const q = async (query: string) => {
    await client.query(`SET search_path TO mine_${scenario}`);
    return (await client.query(query)).rows as Record<string, unknown>[];
  };

  /** Seed the corpus the computation read, then persist what it produced. */
  async function persist() {
    const result = run();
    const statements: string[] = [
      `INSERT INTO corpora VALUES (${sqlText(CARAVAN.corpusId)}, 'CARAVAN', '{}'::jsonb)`,
      `INSERT INTO releases VALUES (${sqlText(RELEASE.releaseId)}, ${sqlText(CARAVAN.corpusId)}, 'CURRENT', ${sqlText(RELEASE.knownAt)}, '{}'::jsonb)`,
      ...RECORDS.map((r) => `INSERT INTO corpus_record VALUES (${sqlText(r.recordId)}, ${sqlText(RELEASE.releaseId)}, ${sqlText(r.subjectId)}, ${sqlText(r.predicate)}, ${sqlText(r.knownAt)})`),
      `INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
         implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
       VALUES ('evidence-concentration', 'DESCRIPTIVE', 'COMPUTED_RESULT', '{"all":true}'::jsonb,
         'notationsos.mining.evidence-concentration.v1', '{"minRecords":1}'::jsonb,
         'notationsos.discovery', '0.1.0', 'payload.derived.evidence-concentration.v1', 'FIXED_POINT', ${sqlText(result.specFingerprint)})`,
      `INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at,
         status, input_fingerprint, output_fingerprint)
       VALUES (${sqlText(result.runId)}, 'evidence-concentration', 'COMPUTED_RESULT', ${sqlText(RELEASE.releaseId)},
         ${sqlText(result.startedAt)}, ${sqlText(result.completedAt)}, 'SUCCEEDED', ${sqlText(result.inputFingerprint)}, ${sqlText(result.outputFingerprint!)})`,
    ];
    for (const artifact of result.artifacts) {
      statements.push(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, rights)
        VALUES (${sqlText(artifact.artifactId)}, ${sqlText(result.runId)}, 'SUCCEEDED', 'COMPUTED_RESULT', ${sqlText(artifact.subject)},
          ${sqlText(artifact.claim)}, ${sqlText(artifact.computedAt)}, ${sqlArray(artifact.rights)})`);
      for (const [index, input] of artifact.inputs.entries()) {
        statements.push(`INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
          source_record_id, source_known_at, input_rights)
          VALUES (${sqlText(`${artifact.artifactId}-I${index}`)}, ${sqlText(artifact.artifactId)}, ${sqlText(artifact.computedAt)},
            'SOURCE_RECORD', ${sqlText(input.recordId)}, ${sqlText(input.knownAt)}, ${sqlArray(input.rights)})`);
      }
    }
    try {
      await client.exec(`SET search_path TO mine_${scenario}; BEGIN; ${statements.join('; ')}; COMMIT;`);
    } catch (error) {
      /* Or the aborted block poisons every case after this one. */
      await client.exec('ROLLBACK').catch(() => {});
      throw error;
    }
    return result;
  }

  it('writes the run and every artifact, and reads them back unchanged', async () => {
    const result = await persist();
    expect(await q(`SELECT count(*)::int AS n FROM derived_artifact`)).toEqual([{ n: result.artifacts.length }]);
    const [row] = await q(`SELECT status, input_fingerprint, output_fingerprint FROM workload_run`);
    expect(row).toEqual({ status: 'SUCCEEDED', input_fingerprint: result.inputFingerprint, output_fingerprint: result.outputFingerprint });
  });

  /* Every artifact names what it read, and the lineage resolves to real records. */
  it('reconstructs the computation path from the artifact back to the records', async () => {
    const result = await persist();
    const lineage = await q(`SELECT a.artifact_id, count(i.input_id)::int AS inputs
      FROM derived_artifact a JOIN artifact_input i ON i.artifact_id = a.artifact_id
      GROUP BY a.artifact_id ORDER BY a.artifact_id`);
    expect(lineage).toHaveLength(result.artifacts.length);
    for (const artifact of result.artifacts) {
      const row = lineage.find((entry) => entry.artifact_id === artifact.artifactId);
      expect(row?.inputs, artifact.artifactId).toBe(artifact.inputs.length);
    }
    const orphans = await q(`SELECT i.input_id FROM artifact_input i
      LEFT JOIN corpus_record r ON r.record_id = i.source_record_id WHERE r.record_id IS NULL`);
    expect(orphans).toEqual([]);
  });

  /* And re-running the same computation over the same corpus gives the same bytes. */
  it('reproduces the persisted output fingerprint from a fresh run', async () => {
    const persisted = await persist();
    const [row] = await q(`SELECT output_fingerprint FROM workload_run`);
    expect(row.output_fingerprint).toBe(run().outputFingerprint);
    expect(row.output_fingerprint).toBe(persisted.outputFingerprint);
  });

  /*
   * The boundary, on real data. The corpus holds a source observation and a
   * computed result about the same subject, and the serving table will not let
   * the second be handed over as the first.
   */
  it('refuses to serve the computed result as one of the records it read', async () => {
    const result = await persist();
    const artifact = result.artifacts[0];
    await expect(client.exec(`SET search_path TO mine_${scenario};
      INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, artifact_id, artifact_class)
      VALUES ('S1', ${sqlText(T_DONE)}, 'COMPUTATION', 'SOURCE_OBSERVATION', ${sqlText(artifact.artifactId)}, 'COMPUTED_RESULT')`))
      .rejects.toThrow(/served_class_is_the_artifacts_own/);

    /* Served as what it is, it goes in. */
    await client.exec(`SET search_path TO mine_${scenario};
      INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, artifact_id, artifact_class)
      VALUES ('S2', ${sqlText(T_DONE)}, 'COMPUTATION', 'COMPUTED_RESULT', ${sqlText(artifact.artifactId)}, 'COMPUTED_RESULT')`);
    expect(await q(`SELECT served_as FROM served_claim`)).toEqual([{ served_as: 'COMPUTED_RESULT' }]);
  });

  it('leaves every persisted artifact unvalidated, because none has been checked', async () => {
    await persist();
    expect(await q(`SELECT DISTINCT validation FROM derived_artifact`)).toEqual([{ validation: 'NOT_VALIDATED' }]);
    expect(await q(`SELECT validation_id FROM artifact_validation`)).toEqual([]);
  });

  /* The gap loop, persisted, and stopping where it is supposed to. */
  it('records the gap and its proposal, and leaves the proposal proposed', async () => {
    const result = await persist();
    const details = result.artifacts.map((a) => ({ subject: a.subject, detail: a.detail as ConcentrationDetail }));
    const [top] = gapsFrom(details);
    const artifact = result.artifacts.find((a) => a.subject === top.subject)!;
    await client.exec(`SET search_path TO mine_${scenario};
      INSERT INTO gap_detection (gap_id, artifact_id, missing, expected_uncertainty_reduction, detected_at)
        VALUES ('G1', ${sqlText(artifact.artifactId)}, ${sqlText(top.missing)}, ${top.expectedUncertaintyReduction}, ${sqlText(T_DONE)});
      INSERT INTO acquisition_proposal (proposal_id, gap_id, target_source, proposed_at, standing)
        VALUES ('P1', 'G1', 'an independent source for this subject', ${sqlText(T_DONE)}, 'PROPOSED')`);
    expect(await q(`SELECT standing FROM acquisition_proposal`)).toEqual([{ standing: 'PROPOSED' }]);
    expect(await q(`SELECT authorized_by FROM acquisition_proposal`)).toEqual([{ authorized_by: null }]);
  });
});
