/**
 * The two as-of questions, kept in a module with no Node dependency so the
 * workspace can ask them in the browser without a second implementation.
 *
 * They are separate functions because they are separate questions, and the
 * separation is the whole bitemporal point rather than an API nicety.
 */
import type { AdmittedRow } from './admission';
import type { ISODateTime } from './types';

/**
 * What the corpus held as of a knowledge instant.
 *
 * Bounded on knowledge time alone, which is the leak-free question: what this
 * system knew by then. It is not a valid-time query and does not answer which
 * orders were in force at a date — a row admitted in March about an order
 * effective in June is knowable in March and in force in June, and conflating
 * the two is the bitemporal mistake this corpus exists to avoid.
 */
export function serveAdmittedAsOf(
  rows: readonly AdmittedRow[],
  asOfKnowledgeTime: ISODateTime,
): AdmittedRow[] {
  return rows.filter((row) => row.knownAt <= asOfKnowledgeTime);
}

/** Rows in force at a world-time instant, among those already knowable. Both bounds, stated separately. */
export function serveInForceAsOf(
  rows: readonly AdmittedRow[],
  asOfKnowledgeTime: ISODateTime,
  atValidTime: ISODateTime,
): AdmittedRow[] {
  return serveAdmittedAsOf(rows, asOfKnowledgeTime).filter(
    (row) => row.validFrom <= atValidTime && (row.validTo === null || row.validTo > atValidTime),
  );
}
