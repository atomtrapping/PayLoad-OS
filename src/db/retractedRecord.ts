/**
 * What a corpus took back, as the dossier ledger reads it.
 *
 * The corpus's retractions live in `src/domain/corpus.ts` and its Drizzle
 * `retractions` table; this is the per-record view of them the dossier
 * guards need — one row per retraction and record, with the kind (a
 * correction says something else; a withdrawal says nothing) and the
 * instant it was issued, so an assessment can be read as of an instant.
 * The governance seed writes it from the corpus; the dossier ledger's
 * guards read it and refuse a retraction backdated behind an assessment
 * that did not know it. Nothing else describes this table, which is why
 * its DDL ships from here rather than from a test.
 */
export const RETRACTED_RECORD_DDL = `
CREATE TABLE retracted_record (retraction_id text NOT NULL, record_id text NOT NULL, kind text NOT NULL CHECK (kind IN ('CORRECTION', 'WITHDRAWAL')), issued_at timestamptz NOT NULL, PRIMARY KEY (retraction_id, record_id));
`;
