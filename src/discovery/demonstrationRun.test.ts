/**
 * The run that actually happened, and what it is allowed to conclude.
 *
 * Two halves. The first checks the run as a computation: one identity across
 * three executions, the same bytes twice, a rights floor that is an
 * intersection rather than a declaration, and an input set that stops at what
 * the corpus still asserts. The second writes all three runs into a real
 * PostgreSQL engine through the ledger's own DDL, because a result that the
 * boundary constraints would refuse is not a result.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { FIXTURE_CORPORA } from '@/fixtures';
import { currentRelease, standingRecords } from '@/domain/corpus';
import { discoveryStanding } from '@/domain/discoveryLayer';
import { DISCOVERY_LEDGER_DDL, DISCOVERY_LEDGER_GUARDS } from '@/db/discoveryLedger';
import { demonstrationMining, DEMONSTRATION_PARAMETERS } from './demonstrationRun';
import { evidenceConcentrationWorkload } from './evidenceConcentration';
import { specFingerprint } from './engine';
import { sqlArray, sqlText } from '@/db/ddl';

const mining = demonstrationMining();

describe('one computation, three executions', () => {
  it('runs the same spec over all three lines and succeeds on each', () => {
    expect(mining.runs.map((run) => run.domain)).toEqual(['CARAVAN', 'TRADEWIND', 'LANDSHARK']);
    expect(mining.counts.succeeded).toBe(mining.counts.runs);
    for (const run of mining.runs) expect(run.result.failureIdentity, run.domain).toBeNull();
  });

  /*
   * The workload contract, visible. One spec fingerprint across three runs
   * because the identity is the computation; three input fingerprints because
   * the corpora differ. Collapse either and a re-run becomes a second result
   * or a different input becomes a different computation.
   */
  it('gives every run the same computation identity and a different input identity', () => {
    for (const run of mining.runs) {
      expect(run.result.specFingerprint, run.domain).toBe(mining.spec.specFingerprint);
    }
    const inputs = mining.runs.map((run) => run.result.inputFingerprint);
    expect(new Set(inputs).size).toBe(inputs.length);
    expect(mining.spec.specFingerprint).toBe(specFingerprint(evidenceConcentrationWorkload({ ...DEMONSTRATION_PARAMETERS })));
  });

  /*
   * No wall clock anywhere. A run stamped with the machine's time would give a
   * different page on every request and an input fingerprint that moved
   * without any input moving, so this is the guard against one creeping in.
   */
  it('produces byte-identical output on a second call', () => {
    expect(JSON.stringify(demonstrationMining())).toBe(JSON.stringify(mining));
  });

  it('marks itself demonstration material at the top rather than in a footnote', () => {
    expect(mining.fixture_only).toBe(true);
    expect(mining.basis).toContain('no statement at all about the world');
  });
});

describe('a computation does not read what the corpus took back', () => {
  /*
   * The boundary this run exists to hold. Five records across the three lines
   * have been withdrawn or corrected; a run over `corpus.records` would read
   * all five, and would count each correction twice while it was at it.
   */
  it('drops every retracted record and says which ones and under which retraction', () => {
    expect(mining.counts.recordsTakenBack).toBe(5);
    const kinds = mining.runs.flatMap((run) => run.takenBack.map((entry) => entry.kind));
    expect(kinds).toContain('WITHDRAWAL');
    expect(kinds).toContain('CORRECTION');
    for (const run of mining.runs) {
      for (const entry of run.takenBack) expect(entry.retractionId, entry.recordId).not.toBe('');
    }
  });

  it('reads exactly the records that still stand at the time it ran', () => {
    for (const run of mining.runs) {
      const corpus = FIXTURE_CORPORA.find((entry) => entry.domain === run.domain)!;
      expect(run.read, run.domain).toBe(standingRecords(corpus, run.knownAt).length);
      expect(run.read + run.takenBack.length, run.domain).toBe(corpus.records.length);
    }
  });

  it('names no retracted record anywhere in a lineage', () => {
    const takenBack = new Set(mining.runs.flatMap((run) => run.takenBack.map((entry) => entry.recordId)));
    expect(takenBack.size).toBe(5);
    for (const artifact of mining.artifacts) {
      for (const input of artifact.inputs) {
        expect(takenBack.has(input.recordId), `${artifact.artifactId} read ${input.recordId}`).toBe(false);
      }
    }
  });
});

describe('rights are inherited, never widened', () => {
  /*
   * Computed rather than declared, and computed per claim rather than per run:
   * a claim that never touched the restricted record is not restricted by it.
   */
  it('gives every artifact exactly the intersection of what it actually read', () => {
    expect(mining.artifacts.length).toBeGreaterThan(0);
    for (const artifact of mining.artifacts) {
      expect(artifact.inputs.length, artifact.artifactId).toBeGreaterThan(0);
      for (const input of artifact.inputs) {
        for (const right of artifact.rights) {
          expect(input.rights, `${artifact.artifactId} claims ${right}`).toContain(right);
        }
      }
      const shared = artifact.inputs
        .map((input) => new Set(input.rights))
        .reduce((carry, next) => new Set([...carry].filter((right) => next.has(right))));
      expect([...artifact.rights].sort(), artifact.artifactId).toEqual([...shared].sort());
    }
  });

  /* And the floor across all of it is narrower than any single artifact's. */
  it('computes a floor across the whole result that no artifact is below', () => {
    expect(mining.rightsFloor.length).toBeGreaterThan(0);
    for (const artifact of mining.artifacts) {
      for (const right of mining.rightsFloor) expect(artifact.rights, artifact.artifactId).toContain(right);
    }
  });
});

describe('what a run is allowed to conclude', () => {
  it('produces computed results and nothing that could be mistaken for evidence', () => {
    for (const artifact of mining.artifacts) expect(artifact.claimClass, artifact.artifactId).toBe('COMPUTED_RESULT');
    expect(mining.spec.producesClass).toBe('COMPUTED_RESULT');
    expect(mining.spec.miningKind).toBe('DESCRIPTIVE');
  });

  /* A deterministic count has no confidence, and the engine refuses to give it one. */
  it('carries no confidence and no model on an arithmetic result', () => {
    for (const artifact of mining.artifacts) {
      expect(artifact.confidence, artifact.artifactId).toBeNull();
      expect(artifact.modelId, artifact.artifactId).toBeNull();
      expect(artifact.horizonEndsAt, artifact.artifactId).toBeNull();
    }
  });

  /*
   * Both zeros counted rather than written. Removing the validation field from
   * the engine, or serving one of these, moves them.
   */
  it('validates nothing and serves nothing, and says why for each', () => {
    expect(mining.counts.artifacts).toBeGreaterThan(0);
    expect(mining.counts.validated).toBe(0);
    for (const artifact of mining.artifacts) expect(artifact.validation, artifact.artifactId).toBe('NOT_VALIDATED');
    expect(mining.counts.served).toBe(0);
    expect(mining.notValidatedBecause).toContain('none of the three');
    expect(mining.notServedBecause).toContain('stops at the artifact');
  });

  /*
   * And the demonstration does not move the standing over admitted evidence,
   * which is the number a reader would take as a claim about the world. Eleven
   * artifacts over the demonstration corpus; zero derivations over anything
   * admitted, because nothing has been admitted.
   */
  it('leaves the standing over admitted evidence at zero', () => {
    expect(mining.counts.admittedDerivations).toBe(0);
    expect(mining.counts.admittedDerivations).toBe(discoveryStanding().derivations);
    expect(discoveryStanding().coverage).toBe('CONTRACT_ONLY_NOTHING_DERIVED');
  });
});

describe('a gap produces a proposal and nothing else', () => {
  it('ranks the gaps by what an independent source would actually reduce', () => {
    expect(mining.gaps.length).toBeGreaterThan(0);
    for (const gap of mining.gaps) expect(gap.expectedUncertaintyReduction, gap.gapId).toBeGreaterThan(0);
    const reductions = mining.gaps.map((gap) => gap.expectedUncertaintyReduction);
    expect([...reductions].sort((a, b) => b - a)).toEqual(reductions);
    /* A single-sourced subject is where an independent source is worth most. */
    const top = mining.artifacts.find((artifact) => artifact.artifactId === mining.gaps[0].artifactId)!;
    expect((top.detail as { singleSourced: boolean }).singleSourced).toBe(true);
  });

  it('gives every gap one proposal, standing at proposed, authorized by nobody', () => {
    expect(mining.counts.proposals).toBe(mining.counts.gaps);
    const gapIds = new Set(mining.gaps.map((gap) => gap.gapId));
    for (const proposal of mining.proposals) {
      expect(gapIds.has(proposal.gapId), proposal.proposalId).toBe(true);
      expect(proposal.standing).toBe('PROPOSED');
      expect(proposal.authorizedByKind).toBeNull();
      expect(proposal.authorizedBy).toBeNull();
    }
  });

  /*
   * The rule, checked rather than stated. This layer has no endpoint, no
   * connector and no credential, so a proposal describes what to seek and
   * cannot carry somewhere to call — and a future edit that put one there
   * fails here rather than at a firewall.
   */
  it('names what to seek and never somewhere to call', () => {
    for (const proposal of mining.proposals) {
      expect(proposal.targetSource).toContain('independent registered source');
      expect(proposal.targetSource, proposal.proposalId).not.toMatch(/:\/\/|www\.|\.(com|org|net|io|gov)\b/i);
      expect(Object.keys(proposal).sort()).toEqual([
        'authorizedBy', 'authorizedByKind', 'gapId', 'proposalId', 'proposedAt', 'standing', 'subject', 'targetSource',
      ]);
    }
    expect(mining.proposalRule).toContain('never somewhere to call');
  });
});

/* ── The same result, through the boundary constraints ── */

describe('the whole run survives the ledger it would be written to', () => {
  let client: PGlite;
  let scenario = 0;

  beforeAll(async () => { client = new PGlite(); await client.waitReady; });
  afterAll(async () => { await client?.close(); });

  beforeEach(async () => {
    scenario += 1;
    await client.exec(`CREATE SCHEMA demo_${scenario}; SET search_path TO demo_${scenario};
      CREATE TABLE corpora (corpus_id text PRIMARY KEY, domain text NOT NULL, data jsonb NOT NULL);
      CREATE TABLE releases (release_id text PRIMARY KEY, corpus_id text NOT NULL REFERENCES corpora(corpus_id), status text NOT NULL, known_at timestamptz NOT NULL, data jsonb NOT NULL);
      CREATE TABLE corpus_record (record_id text PRIMARY KEY, release_id text NOT NULL, subject_id text NOT NULL, predicate text NOT NULL, known_at timestamptz NOT NULL, UNIQUE (record_id, known_at));
      ${DISCOVERY_LEDGER_DDL}${DISCOVERY_LEDGER_GUARDS}`);
  });

  const q = async (query: string) => {
    await client.query(`SET search_path TO demo_${scenario}`);
    return (await client.query(query)).rows as Record<string, unknown>[];
  };

  const exec = async (statements: readonly string[]) => {
    try {
      await client.exec(`SET search_path TO demo_${scenario}; BEGIN; ${statements.join('; ')}; COMMIT;`);
    } catch (error) {
      /* Or the aborted block poisons every case after this one. */
      await client.exec('ROLLBACK').catch(() => {});
      throw error;
    }
  };

  /** Every row the three runs would write, in one transaction. */
  function statementsFor(over = mining): string[] {
    const statements: string[] = [
      `INSERT INTO workload_spec (workload_id, mining_kind, produces_class, input_selector, method, parameters,
         implementation_id, implementation_version, output_schema, arithmetic, spec_fingerprint)
       VALUES (${sqlText(over.spec.workloadId)}, ${sqlText(over.spec.miningKind)}, ${sqlText(over.spec.producesClass)},
         '{"records":"standing"}'::jsonb, ${sqlText(over.spec.method)}, ${sqlText(JSON.stringify(over.spec.parameters))}::jsonb,
         ${sqlText(over.spec.implementation.id)}, ${sqlText(over.spec.implementation.version)}, ${sqlText(over.spec.outputSchema)},
         ${sqlText(over.spec.arithmetic)}, ${sqlText(over.spec.specFingerprint)})`,
    ];
    for (const run of over.runs) {
      const corpus = FIXTURE_CORPORA.find((entry) => entry.domain === run.domain)!;
      const release = currentRelease(corpus);
      statements.push(
        `INSERT INTO corpora VALUES (${sqlText(corpus.corpusId)}, ${sqlText(corpus.domain)}, '{}'::jsonb)`,
        `INSERT INTO releases VALUES (${sqlText(release.releaseId)}, ${sqlText(corpus.corpusId)}, 'CURRENT', ${sqlText(release.knownAt)}, '{}'::jsonb)`,
        ...standingRecords(corpus, run.knownAt).map((record) =>
          `INSERT INTO corpus_record VALUES (${sqlText(record.recordId)}, ${sqlText(release.releaseId)}, ${sqlText(record.subjectId)}, ${sqlText(record.predicate)}, ${sqlText(record.knownAt)})`),
        `INSERT INTO workload_run (run_id, workload_id, produces_class, corpus_release_id, started_at, completed_at,
           status, input_fingerprint, output_fingerprint)
         VALUES (${sqlText(run.result.runId)}, ${sqlText(over.spec.workloadId)}, ${sqlText(over.spec.producesClass)}, ${sqlText(release.releaseId)},
           ${sqlText(run.result.startedAt)}, ${sqlText(run.result.completedAt)}, 'SUCCEEDED',
           ${sqlText(run.result.inputFingerprint)}, ${sqlText(run.result.outputFingerprint!)})`,
      );
      for (const artifact of run.result.artifacts) {
        statements.push(`INSERT INTO derived_artifact (artifact_id, run_id, run_status, claim_class, subject, claim, computed_at, rights, validation)
          VALUES (${sqlText(artifact.artifactId)}, ${sqlText(run.result.runId)}, 'SUCCEEDED', ${sqlText(artifact.claimClass)},
            ${sqlText(artifact.subject)}, ${sqlText(artifact.claim)}, ${sqlText(artifact.computedAt)}, ${sqlArray(artifact.rights)}, ${sqlText(artifact.validation)})`);
        for (const [index, input] of artifact.inputs.entries()) {
          statements.push(`INSERT INTO artifact_input (input_id, artifact_id, artifact_computed_at, input_kind,
            source_record_id, source_known_at, input_rights)
            VALUES (${sqlText(`${artifact.artifactId}-I${index}`)}, ${sqlText(artifact.artifactId)}, ${sqlText(artifact.computedAt)},
              'SOURCE_RECORD', ${sqlText(input.recordId)}, ${sqlText(input.knownAt)}, ${sqlArray(input.rights)})`);
        }
      }
    }
    for (const gap of over.gaps) {
      statements.push(`INSERT INTO gap_detection (gap_id, artifact_id, missing, expected_uncertainty_reduction, detected_at)
        VALUES (${sqlText(gap.gapId)}, ${sqlText(gap.artifactId)}, ${sqlText(gap.missing)}, ${gap.expectedUncertaintyReduction}, ${sqlText(gap.detectedAt)})`);
    }
    for (const proposal of over.proposals) {
      statements.push(`INSERT INTO acquisition_proposal (proposal_id, gap_id, target_source, proposed_at, standing)
        VALUES (${sqlText(proposal.proposalId)}, ${sqlText(proposal.gapId)}, ${sqlText(proposal.targetSource)}, ${sqlText(proposal.proposedAt)}, ${sqlText(proposal.standing)})`);
    }
    return statements;
  }

  it('writes one spec, three runs, every artifact, every lineage row, every gap and every proposal', async () => {
    await exec(statementsFor());
    expect(await q(`SELECT count(*)::int AS n FROM workload_spec`)).toEqual([{ n: 1 }]);
    expect(await q(`SELECT count(*)::int AS n FROM workload_run`)).toEqual([{ n: mining.counts.runs }]);
    expect(await q(`SELECT count(*)::int AS n FROM derived_artifact`)).toEqual([{ n: mining.counts.artifacts }]);
    expect(await q(`SELECT count(*)::int AS n FROM gap_detection`)).toEqual([{ n: mining.counts.gaps }]);
    expect(await q(`SELECT count(*)::int AS n FROM acquisition_proposal`)).toEqual([{ n: mining.counts.proposals }]);
    /* Nothing validated and nothing served, in the tables as in the object. */
    expect(await q(`SELECT DISTINCT validation FROM derived_artifact`)).toEqual([{ validation: 'NOT_VALIDATED' }]);
    expect(await q(`SELECT claim_id FROM served_claim`)).toEqual([]);
  });

  it('resolves every lineage row to a record that still stands', async () => {
    await exec(statementsFor());
    const orphans = await q(`SELECT i.input_id FROM artifact_input i
      LEFT JOIN corpus_record r ON r.record_id = i.source_record_id WHERE r.record_id IS NULL`);
    expect(orphans).toEqual([]);
    const inputs = mining.artifacts.reduce((total, artifact) => total + artifact.inputs.length, 0);
    expect(await q(`SELECT count(*)::int AS n FROM artifact_input`)).toEqual([{ n: inputs }]);
  });

  /*
   * The mutation the ledger is there for. Widen one artifact's rights past
   * what an input permits and the write is refused — so the intersection the
   * engine computed is not merely the engine's opinion.
   */
  it('refuses an artifact claiming a right one of its inputs does not carry', async () => {
    const artifact = mining.artifacts.find((entry) => !entry.rights.includes('trading'))!;
    const statements = statementsFor().map((statement) =>
      statement.includes(`INSERT INTO derived_artifact`) && statement.includes(sqlText(artifact.artifactId))
        ? statement.replace(sqlArray(artifact.rights), sqlArray([...artifact.rights, 'trading']))
        : statement);
    await expect(exec(statements)).rejects.toThrow(/artifact_rights_wider_than_inputs/);
  });

  /* And the one the whole layer is there for: a computed result is not a record. */
  it('refuses to hand a computed result to a reader as a source observation', async () => {
    await exec(statementsFor());
    const artifact = mining.artifacts[0];
    await expect(client.exec(`SET search_path TO demo_${scenario};
      INSERT INTO served_claim (claim_id, served_at, origin_kind, served_as, artifact_id, artifact_class)
      VALUES ('S1', ${sqlText(artifact.computedAt)}, 'COMPUTATION', 'SOURCE_OBSERVATION', ${sqlText(artifact.artifactId)}, 'COMPUTED_RESULT')`))
      .rejects.toThrow(/served_class_is_the_artifacts_own/);
  });
});
