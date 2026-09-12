/** Acknowledges a verified derived fixture projection, never an authorization or second job. */
export const LAKE_RECEIPT_DDL = `
CREATE TABLE payload_terminal_lake_receipt (
  publication_id text NOT NULL REFERENCES payload_terminal_publication(publication_id),
  destination text NOT NULL CHECK(destination ~ '^sha256:[a-f0-9]{64}$'),
  receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=131072),
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY(publication_id,destination)
);
`;

export const LAKE_RECEIPT_GUARDS = `
CREATE FUNCTION terminal_lake_receipt_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'terminal_lake_receipt_immutable'; END IF;
  IF NOT COALESCE(NEW.receipt->>'schema'='payload.terminal-lake-receipt.v1'
    AND NEW.receipt->>'table'='terminal.result_publications'
    AND NEW.receipt->>'publication_id'=NEW.publication_id
    AND NEW.receipt->'fixture_only'='true'::jsonb
    AND NEW.receipt->'canonical_admission'='false'::jsonb
    AND NEW.receipt->'source_permissions_verified'='false'::jsonb
    AND NEW.receipt->'artifact_bytes_verified_by_python'='false'::jsonb
    AND jsonb_typeof(NEW.receipt->'snapshot_id')='string'
    AND NEW.receipt->>'snapshot_id' ~ '^[1-9][0-9]{0,18}$'
    AND NEW.receipt->'record_count'='1'::jsonb
    AND NEW.receipt->'manifest'->>'publication_id'=NEW.publication_id
    AND NEW.receipt->'manifest'->>'input_digest'=NEW.receipt->>'input_digest'
    AND NEW.receipt->'manifest'->>'schema'='payload.terminal-lake-publication.v1'
    AND jsonb_typeof(NEW.receipt->'manifest'->'records')='array'
    AND jsonb_array_length(NEW.receipt->'manifest'->'records')=1, false)
    THEN RAISE EXCEPTION 'terminal_lake_receipt_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM payload_terminal_publication p
    WHERE p.publication_id=NEW.publication_id AND p.state='PUBLISHED'
      AND NEW.receipt->'manifest'->'records'->0->>'job_id'=p.job_id
      AND NEW.receipt->'manifest'->'records'->0->>'result_digest'=p.result_digest
      AND NEW.receipt->'manifest'->'records'->0->>'artifact_digest'=p.byte_digest
      AND NEW.receipt->'manifest'->'records'->0->>'object_key'=p.object_key
      AND NEW.receipt->'manifest'->'records'->0->'fixture_only'='true'::jsonb)
    THEN RAISE EXCEPTION 'terminal_lake_publication_binding'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER terminal_lake_receipt_binding BEFORE INSERT OR UPDATE OR DELETE ON payload_terminal_lake_receipt
  FOR EACH ROW EXECUTE FUNCTION terminal_lake_receipt_guard();
`;
