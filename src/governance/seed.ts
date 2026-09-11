/**
 * What the demonstration rests on, written into the ledgers before any
 * proposal: the principals, the Caravan demonstration corpus and the mining
 * run over it, and the spatial demonstration corpus and the comparison over
 * that. Everything a conclusion or a story will later point at is a row here
 * first, so the pointing is a foreign key rather than a name.
 */
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { demonstrationMining, type DemonstrationRun } from '@/discovery/demonstrationRun';
import { runSpatialComparison, type SpatialComparisonRun } from '@/discovery/spatialComparison';
import { ALL_PRINCIPALS } from './principals';
import { sqlText } from '@/db/ddl';
import type { GovernanceLedger } from './ledger';

export const T_REGISTERED = '2026-09-01T00:00:00.000Z';
export const SPATIAL_CORPUS_ID = 'notation://corpus/spatial-demonstration';
export const SPATIAL_RELEASE_ID = 'REL-SPATIAL-DEMO';

export interface Seeded {
  caravan: {
    corpusId: string; releaseId: string; recordsSeeded: number;
    run: DemonstrationRun;
    artifactIds: readonly string[];
  };
  spatial: SpatialComparisonRun & { releaseId: string };
}

export async function seedDemonstration(ledger: GovernanceLedger): Promise<Seeded> {
  await ledger.principals(ALL_PRINCIPALS, T_REGISTERED);

  const mining = demonstrationMining([CARAVAN_CORPUS]);
  const run = mining.runs[0];
  const caravan = await ledger.seedCorpus(CARAVAN_CORPUS, run.knownAt);
  await ledger.recordWorkload({
    spec: mining.spec as Parameters<GovernanceLedger['recordWorkload']>[0]['spec'],
    run: { runId: run.result.runId, startedAt: run.result.startedAt, completedAt: run.result.completedAt, status: 'SUCCEEDED', inputFingerprint: run.result.inputFingerprint, outputFingerprint: run.result.outputFingerprint! },
    releaseId: caravan.releaseId,
    artifacts: run.result.artifacts,
  });

  const spatial = runSpatialComparison();
  await ledger.write([
    `INSERT INTO corpora VALUES (${sqlText(SPATIAL_CORPUS_ID)}, 'CARAVAN', '{"fixture_only":true,"synthetic":true}'::jsonb)`,
    `INSERT INTO releases VALUES (${sqlText(SPATIAL_RELEASE_ID)}, ${sqlText(SPATIAL_CORPUS_ID)}, 'CURRENT', '${spatial.sourceRecord.knownAt}', '{"fixture_only":true}'::jsonb)`,
    `INSERT INTO corpus_record VALUES (${sqlText(spatial.sourceRecord.recordId)}, ${sqlText(SPATIAL_RELEASE_ID)}, ${sqlText(spatial.sourceRecord.subjectId)}, ${sqlText(spatial.sourceRecord.predicate)}, '${spatial.sourceRecord.knownAt}')`,
  ].join(';\n'));
  await ledger.recordWorkload({ spec: spatial.spec, run: spatial.run, releaseId: SPATIAL_RELEASE_ID, artifacts: [spatial.artifact] });

  return {
    caravan: { corpusId: CARAVAN_CORPUS.corpusId, releaseId: caravan.releaseId, recordsSeeded: caravan.records, run, artifactIds: run.result.artifacts.map((a) => a.artifactId) },
    spatial: { ...spatial, releaseId: SPATIAL_RELEASE_ID },
  };
}
