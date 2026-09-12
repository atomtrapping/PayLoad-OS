/** Additive internal artifact custody. No proposal, authorization or execution history. */
export const PUBLICATION_DDL = `
CREATE TABLE payload_terminal_publication_gate(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton));
INSERT INTO payload_terminal_publication_gate VALUES(true);
CREATE TABLE payload_terminal_publication (
  publication_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES payload_terminal_result(job_id),
  result_digest text NOT NULL CHECK(result_digest ~ '^sha256:[a-f0-9]{64}$'),
  destination text NOT NULL CHECK(length(destination) BETWEEN 1 AND 256),
  byte_digest text NOT NULL CHECK(byte_digest = result_digest),
  byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 1048576),
  object_key text NOT NULL CHECK(object_key = 'sha256/' || substring(byte_digest from 8) || '.json'),
  state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','LEASED','RECONCILE','PUBLISHED','BLOCKED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
  claim_token uuid, lease_until timestamptz,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  failure_code text CHECK(failure_code IN ('PUBLICATION_UNAVAILABLE','PUBLICATION_INTEGRITY_FAILURE','PUBLICATION_PERMISSION_UNAVAILABLE','PUBLICATION_ATTEMPTS_EXHAUSTED')),
  receipt jsonb, receipt_digest text CHECK(receipt_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(job_id,destination),
  CHECK((state='LEASED' AND claim_token IS NOT NULL AND lease_until IS NOT NULL AND attempts>0)
    OR (state<>'LEASED' AND claim_token IS NULL AND lease_until IS NULL)),
  CHECK((state='PUBLISHED' AND receipt IS NOT NULL AND receipt_digest IS NOT NULL)
    OR (state<>'PUBLISHED' AND receipt IS NULL AND receipt_digest IS NULL)),
  CHECK(receipt IS NULL OR (jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=4096
    AND receipt ?& ARRAY['schema','provider','destination','key','contentDigest','byteLength','versionId']
    AND jsonb_typeof(receipt->'schema')='string' AND jsonb_typeof(receipt->'provider')='string'
    AND jsonb_typeof(receipt->'destination')='string' AND jsonb_typeof(receipt->'key')='string'
    AND jsonb_typeof(receipt->'contentDigest')='string' AND jsonb_typeof(receipt->'byteLength')='number'
    AND jsonb_typeof(receipt->'versionId') IN ('string','null') AND receipt->>'provider' IN ('local','exoscale-sos')
    AND ((receipt->>'provider'='local' AND jsonb_typeof(receipt->'versionId')='null')
      OR (receipt->>'provider'='exoscale-sos' AND jsonb_typeof(receipt->'versionId')='string'
        AND length(receipt->>'versionId') BETWEEN 1 AND 1024 AND receipt->>'versionId' NOT IN ('null','undefined')))
    AND receipt->>'schema'='payload.object-custody.v1' AND receipt->>'destination'=destination
    AND receipt->>'key'=object_key AND receipt->>'contentDigest'=byte_digest
    AND receipt->>'byteLength'=byte_length::text))
);
CREATE INDEX terminal_publication_ready ON payload_terminal_publication(destination,state,available_at,publication_id);
CREATE INDEX terminal_publication_expiry ON payload_terminal_publication(lease_until,publication_id) WHERE state='LEASED';
`;

export const PUBLICATION_GUARDS = `
CREATE FUNCTION terminal_publication_guard() RETURNS trigger AS $$ BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'publication_immutable'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'PENDING' OR NEW.attempts<>0 OR NEW.failure_code IS NOT NULL THEN RAISE EXCEPTION 'publication_initial_state'; END IF;
    IF NOT EXISTS(SELECT 1 FROM payload_terminal_result r WHERE r.job_id=NEW.job_id AND r.result_digest=NEW.result_digest)
      THEN RAISE EXCEPTION 'publication_result_binding'; END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(OLD)-ARRAY['state','attempts','claim_token','lease_until','available_at','failure_code','receipt','receipt_digest']) IS DISTINCT FROM
     (to_jsonb(NEW)-ARRAY['state','attempts','claim_token','lease_until','available_at','failure_code','receipt','receipt_digest'])
    THEN RAISE EXCEPTION 'publication_binding_immutable'; END IF;
  IF OLD.state IN ('PUBLISHED','BLOCKED') THEN RAISE EXCEPTION 'publication_immutable'; END IF;
  IF OLD.state IN ('PENDING','RECONCILE') AND NEW.state='LEASED' THEN
    IF NEW.attempts<>OLD.attempts+1 OR OLD.attempts>=10 OR OLD.available_at>clock_timestamp()
      OR NEW.lease_until<=clock_timestamp() OR NEW.lease_until>clock_timestamp()+interval '31 seconds'
      OR NEW.failure_code IS NOT NULL THEN RAISE EXCEPTION 'publication_claim_invalid'; END IF;
  ELSIF OLD.state='LEASED' AND NEW.state IN ('RECONCILE','BLOCKED','PUBLISHED') THEN
    IF NEW.attempts<>OLD.attempts THEN RAISE EXCEPTION 'publication_attempt_binding'; END IF;
    IF NEW.state='PUBLISHED' AND (OLD.lease_until<=clock_timestamp() OR NEW.failure_code IS NOT NULL)
      THEN RAISE EXCEPTION 'publication_ack_expired'; END IF;
  ELSE RAISE EXCEPTION 'publication_transition_invalid'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER terminal_publication_binding BEFORE INSERT OR UPDATE OR DELETE ON payload_terminal_publication
  FOR EACH ROW EXECUTE FUNCTION terminal_publication_guard();
`;
