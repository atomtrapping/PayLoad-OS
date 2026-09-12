/**
 * Between ruling and writing.
 *
 * The harvester rules on candidates and returns rows. Nothing writes them, and
 * until now nothing said so: the served payload reported `admitted: 5` with no
 * statement that the canonical count was still zero, which a reader could
 * reasonably take for corpus state. That gap is closed here, and closing it
 * turned up a worse one.
 *
 * THE HOLE THIS FOUND
 *
 * A drafted specimen crosses the gate. It should — the gate rules on what a
 * candidate declares, and the specimen context declares
 * `provenanceClass: 'BACKFILLED'` because that is what a republished
 * regulatory order would be. But `BACKFILLED` is one of the two values
 * `ADMITTED_PROVENANCE` allows, which means a row descending from bytes
 * somebody typed in this repository would land in the records table
 * indistinguishable from a row descending from a real filing.
 *
 * `architecture.test.ts` already holds the seeder and the gate disjoint: the
 * seeder stamps `DEMONSTRATION` and cannot emit the gate's provenance values.
 * The harvester needed the same separation one level up, on the *capture*
 * rather than the row, because a specimen's dishonesty enters at the bytes and
 * not at the ruling.
 *
 * So persistence refuses on `beganAs`. A capture declared `DRAFTED_SPECIMEN`
 * may be extracted, built, ruled on, admitted and served — all of which are
 * true statements about a drafted document — and may never be written to
 * canonical state. That is a refusal by type rather than by convention, and a
 * test holds it.
 *
 * WHAT THIS IS NOT
 *
 * It is not a second writer. `src/db/admitRecords.ts` is the one door and this
 * calls it; `architecture.test.ts` fails if anything else inserts into
 * `records`. This decides *whether* to knock, and the door still decides
 * whether to open.
 */
import type { AdmissionCandidate } from '@/domain/admission';
import type { CorpusRecord } from '@/domain/corpus';
import { databaseConfigured } from '@/db/config';
export { databaseConfigured } from '@/db/config';
import type { HarvestRun } from './statutoryHarvester';

export type PersistenceOutcome =
  /** Rows reached the sanctioned door and it wrote them. */
  | 'WRITTEN'
  /** An identical retained version was verified; no canonical row was inserted. */
  | 'EXISTING'
  /** The caller did not ask. The default, and the state of every served demonstration. */
  | 'NOT_REQUESTED'
  /** Asked for, and refused: these bytes were declared drafted. */
  | 'REFUSED_DRAFTED_SPECIMEN'
  /** Asked for, and impossible: no database is configured in this environment. */
  | 'NO_DATABASE'
  /** Retain the assertion upstream; a missing serving record is not invented. */
  | 'PROJECTION_REQUIRED'
  /** Asked for, and refused: nothing was admitted, so there is nothing to write. */
  | 'NOTHING_ADMITTED';

export interface PersistenceState {
  outcome: PersistenceOutcome;
  written: number;
  /** True only when rows actually landed in canonical state. Never optimistic. */
  canonicalStateMutated: boolean;
  because: string;
}

export interface PersistenceTarget {
  corpusId: string;
  releaseId: string;
  authority: string;
  ruledAt: string;
  /** Supplied by the caller, never inferred from a partial harvested assertion. */
  releaseRecords?: readonly CorpusRecord[];
}

const state = (outcome: PersistenceOutcome, because: string, written = 0): PersistenceState => ({
  outcome, written, canonicalStateMutated: outcome === 'WRITTEN' && written > 0, because,
});

/** The default: nothing was asked for and nothing was written. */
export function notRequested(): PersistenceState {
  return state('NOT_REQUESTED', 'No write was requested, so the canonical record count is unchanged. The rows above were computed for this response and discarded with it; admitting a candidate and writing a row are two acts, and only the first happened here.');
}

/**
 * Decide whether this run may be written, without writing.
 *
 * Separated from the write so the served payload can state the outcome
 * truthfully in an environment that has no database, and so the refusal that
 * matters — a drafted specimen — is reached before any connection is opened.
 */
export function persistenceVerdict(run: HarvestRun): PersistenceState | null {
  const drafted = run.extractions.filter((entry) => entry.beganAs === 'DRAFTED_SPECIMEN');
  if (drafted.length > 0) {
    return state('REFUSED_DRAFTED_SPECIMEN', `${drafted.length} of ${run.extractions.length} captures were declared DRAFTED_SPECIMEN (${drafted.map((entry) => entry.captureId).join(', ')}). A specimen may be extracted, ruled on, admitted and served, because each of those is a true statement about a drafted document. It may not be written: its candidates declare BACKFILLED provenance, which the gate stamps onto a row, and a row descending from bytes typed in this repository would be indistinguishable in the records table from one descending from a real filing.`);
  }
  if (run.receipt.counts.admitted === 0) {
    return state('NOTHING_ADMITTED', 'No candidate was admitted, so there is no row to write. A refusal is a record, but it is not a version.');
  }
  if (!databaseConfigured()) {
    return state('NO_DATABASE', 'No database is configured through DATABASE_URL or SQL_HOST with SQL_USER and SQL_DB_NAME. The candidates are admissible and unwritten, which is a fact about this environment rather than about them.');
  }
  return null;
}

/**
 * Route an admitted run through the one sanctioned door.
 *
 * Imports `admitRecords` lazily so a build with no database never loads the
 * client, and so the refusals above are reachable without one.
 */
export async function persistHarvest(run: HarvestRun, target: PersistenceTarget): Promise<PersistenceState> {
  const refused = persistenceVerdict(run);
  if (refused) return refused;

  const candidates: AdmissionCandidate[] = run.build.members.flatMap((member) => member.candidates);
  if (!target.releaseRecords?.length) {
    return state('PROJECTION_REQUIRED', 'The admitted assertions remain unwritten. Supply complete, evidence-bound release records before canonical insertion; the harvester does not invent presentation, identity, rights, geometry or temporal metadata.');
  }
  const { admitRecords } = await import('@/db/admitRecords');
  // The door rules again on its own account. It is not told the outcome, and
  // it supplies no authority: a caller with none cannot write.
  const result = await admitRecords({
    corpusId: target.corpusId,
    releaseId: target.releaseId,
    authority: target.authority,
    ruledAt: target.ruledAt,
    candidates,
    releaseRecords: target.releaseRecords,
  });
  return state(result.inserted.length > 0 ? 'WRITTEN' : result.existing.length > 0 ? 'EXISTING' : 'NOTHING_ADMITTED', `${result.inserted.length} rows inserted and ${result.existing.length} identical rows verified through src/db/admitRecords.ts. ${result.because}`, result.inserted.length);
}

export const PERSISTENCE_LOSS = [
  'Admitting a candidate and writing a row are two acts. A payload reporting an admission is not reporting canonical state, and this module exists so the difference is said out loud rather than inferred from an absent field.',
  'A drafted specimen may cross the gate and may never be written. Its candidates declare BACKFILLED, which is what a republished order genuinely is, so the refusal has to happen on the capture — where the dishonesty would enter — rather than on the row.',
  'This is not a writer. src/db/admitRecords.ts is the one door and this calls it; a third writer would be a hole, and architecture.test.ts fails on one.',
  'NO_DATABASE is a fact about the environment and not about the candidates. Unwritten is not refused.',
] as const;
