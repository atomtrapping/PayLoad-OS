import { EXECUTION_LEDGER_DDL, EXECUTION_LEDGER_GUARDS } from '@/db/executionLedger';
import { TERMINAL_LEDGER_DDL, TERMINAL_LEDGER_GUARDS, terminalCapabilitySeed } from '@/db/terminalLedger';
import { CAPABILITIES } from '@/domain/capabilityRegistry';
import { canonicalJson } from '@/fixtures/digest';
import type { TerminalDatabase } from './database';
import { PUBLICATION_DDL, PUBLICATION_GUARDS } from './publication';
import { LAKE_RECEIPT_DDL, LAKE_RECEIPT_GUARDS } from './lakeSchema';

export const TERMINAL_SCHEMA_VERSION = 3;

/** Authenticated ownership of a read session; separate from mining delivery receipts. */
export const TERMINAL_READ_IDENTITY_DDL = `
CREATE TABLE payload_terminal_session_identity (
  session_id text PRIMARY KEY REFERENCES terminal_session(session_id),
  principal_id text NOT NULL REFERENCES principal(principal_id),
  identity jsonb NOT NULL CHECK(jsonb_typeof(identity) = 'object')
);
CREATE TRIGGER terminal_session_identity_immutable BEFORE UPDATE OR DELETE ON payload_terminal_session_identity
  FOR EACH ROW EXECUTE FUNCTION terminal_immutable();
`;

export const TERMINAL_JOB_DDL = `
CREATE TABLE payload_terminal_control (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), schema_version integer NOT NULL);
INSERT INTO payload_terminal_control VALUES (true,1);
CREATE TABLE payload_terminal_job (
  job_id text PRIMARY KEY REFERENCES operation_proposal(proposal_id),
  owner_id text NOT NULL REFERENCES principal(principal_id),
  corpus_id text NOT NULL REFERENCES corpora(corpus_id),
  release_id text NOT NULL REFERENCES releases(release_id),
  purpose text NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL,
  snapshot_digest text NOT NULL, method_digest text NOT NULL,
  state text NOT NULL CHECK(state IN ('PROPOSED','DENIED','QUEUED','RUNNING','SUCCEEDED','FAILED')),
  request jsonb NOT NULL, snapshot jsonb NOT NULL, action_digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  authorization_id text REFERENCES execution_authorization(authorization_id),
  claim_token text, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  failure_code text, corrects_job_id text REFERENCES payload_terminal_job(job_id),
  UNIQUE(owner_id,idempotency_key),
  FOREIGN KEY(job_id,action_digest) REFERENCES decision_packet(proposal_id,action_digest)
);
CREATE INDEX terminal_job_queue ON payload_terminal_job(state,created_at,job_id);
CREATE TABLE payload_terminal_result (
  job_id text PRIMARY KEY REFERENCES payload_terminal_job(job_id),
  result_digest text NOT NULL, result jsonb NOT NULL, completed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE payload_terminal_receipt (
  job_id text NOT NULL REFERENCES payload_terminal_result(job_id), terminal_id text NOT NULL,
  principal_id text NOT NULL REFERENCES principal(principal_id), receipt_digest text NOT NULL, receipt jsonb NOT NULL,
  PRIMARY KEY(job_id,terminal_id)
);
CREATE FUNCTION terminal_immutable() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'terminal_immutable'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER terminal_result_immutable BEFORE UPDATE OR DELETE ON payload_terminal_result FOR EACH ROW EXECUTE FUNCTION terminal_immutable();
CREATE TRIGGER terminal_receipt_immutable BEFORE UPDATE OR DELETE ON payload_terminal_receipt FOR EACH ROW EXECUTE FUNCTION terminal_immutable();
CREATE FUNCTION terminal_job_binding_immutable() RETURNS trigger AS $$ BEGIN
  IF (to_jsonb(OLD) - ARRAY['state','authorization_id','claim_token','lease_until','attempts','failure_code']) IS DISTINCT FROM
     (to_jsonb(NEW) - ARRAY['state','authorization_id','claim_token','lease_until','attempts','failure_code'])
  THEN RAISE EXCEPTION 'terminal_job_binding_immutable'; END IF;
  IF OLD.state IN ('SUCCEEDED','FAILED','DENIED') THEN RAISE EXCEPTION 'terminal_job_terminal'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER terminal_job_binding BEFORE UPDATE ON payload_terminal_job FOR EACH ROW EXECUTE FUNCTION terminal_job_binding_immutable();
CREATE TRIGGER terminal_job_no_delete BEFORE DELETE ON payload_terminal_job FOR EACH ROW EXECUTE FUNCTION terminal_immutable();
`;

/** Explicit operator migration, never run by an HTTP request. Requires the real corpus tables.
 * Existing unversioned governance tables refuse rather than being overwritten or guessed compatible. */
export async function installTerminalSchema(db: TerminalDatabase): Promise<void> {
  await db.transaction(async sql => {
    const { rows } = await sql.query<{ corpus: string | null; releases: string | null; installed: string | null; execution: string | null }>(
      "SELECT to_regclass('public.corpora')::text corpus,to_regclass('public.releases')::text releases,to_regclass('public.payload_terminal_control')::text installed,to_regclass('public.principal')::text execution");
    const state = rows[0];
    if (!state.corpus || !state.releases) throw new Error('TERMINAL_CORPUS_SCHEMA_REQUIRED');
    if (state.installed) {
      const check = await sql.query<{ schema_version: number }>('SELECT schema_version FROM payload_terminal_control WHERE singleton=true FOR UPDATE');
      if (![1, 2, TERMINAL_SCHEMA_VERSION].includes(check.rows[0]?.schema_version)) throw new Error('TERMINAL_SCHEMA_VERSION_UNSUPPORTED');
      if (check.rows[0].schema_version === 1) {
        await sql.query(TERMINAL_LEDGER_DDL + TERMINAL_LEDGER_GUARDS + terminalCapabilitySeed() + TERMINAL_READ_IDENTITY_DDL);
        await sql.query('UPDATE payload_terminal_control SET schema_version=2 WHERE singleton=true');
      }
      if (check.rows[0].schema_version < 3) {
        await sql.query(PUBLICATION_DDL + PUBLICATION_GUARDS + LAKE_RECEIPT_DDL + LAKE_RECEIPT_GUARDS);
        await sql.query('UPDATE payload_terminal_control SET schema_version=3 WHERE singleton=true');
      }
    } else {
      if (state.execution) throw new Error('TERMINAL_EXISTING_LEDGER_REQUIRES_MIGRATION');
      await sql.query(EXECUTION_LEDGER_DDL + EXECUTION_LEDGER_GUARDS + TERMINAL_JOB_DDL
        + TERMINAL_LEDGER_DDL + TERMINAL_LEDGER_GUARDS + terminalCapabilitySeed() + TERMINAL_READ_IDENTITY_DDL);
      await sql.query(PUBLICATION_DDL + PUBLICATION_GUARDS + LAKE_RECEIPT_DDL + LAKE_RECEIPT_GUARDS);
      await sql.query('UPDATE payload_terminal_control SET schema_version=3 WHERE singleton=true');
    }
    // An existing installation must still describe the exact registry its
    // callers use. A changed registry requires an explicit schema migration.
    const registry = await sql.query<{ capability_id: string; kind: string; serves: string | null; touches_estates: boolean }>(
      'SELECT capability_id,kind,serves,touches_estates FROM terminal_capability');
    const expected = CAPABILITIES.map(capability => ({ capability_id: capability.id, kind: capability.kind, serves: capability.serves ?? null, touches_estates: capability.touchesEstates }));
    const ordered = (entries: typeof expected) => [...entries].sort((a, b) => a.capability_id < b.capability_id ? -1 : a.capability_id > b.capability_id ? 1 : 0);
    if (canonicalJson(ordered(registry.rows as typeof expected)) !== canonicalJson(ordered(expected))) throw new Error('TERMINAL_CAPABILITY_REGISTRY_MISMATCH');
    const binding = await sql.query<{ present: string | null }>("SELECT to_regclass('public.payload_terminal_session_identity')::text present");
    if (!binding.rows[0]?.present) throw new Error('TERMINAL_READ_SCHEMA_INCOMPLETE');
    const custody = await sql.query<{ objects: string | null; lake: string | null }>("SELECT to_regclass('public.payload_terminal_publication')::text objects,to_regclass('public.payload_terminal_lake_receipt')::text lake");
    if (!custody.rows[0]?.objects || !custody.rows[0]?.lake) throw new Error('TERMINAL_STORAGE_SCHEMA_INCOMPLETE');
  });
}
