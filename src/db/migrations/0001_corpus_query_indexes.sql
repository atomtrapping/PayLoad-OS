-- Additive migration for the existing corpus schema. No source bytes or rows
-- are rewritten. Apply only after provisioning/validating that base schema.
-- This intentionally acquires normal index-build locks: schedule a maintenance
-- window for large populated tables. Do not run automatically at application boot.
BEGIN;
CREATE INDEX IF NOT EXISTS releases_corpus_known_idx ON releases (corpus_id, known_at);
CREATE INDEX IF NOT EXISTS records_corpus_known_idx ON records (corpus_id, known_at, record_id);
CREATE INDEX IF NOT EXISTS records_subject_history_idx ON records (corpus_id, subject_id, predicate, known_at, record_id);
CREATE INDEX IF NOT EXISTS retractions_corpus_issued_idx ON retractions (corpus_id, issued_at);
COMMIT;
