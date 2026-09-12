import type { TerminalDatabase } from '../terminal/database';

export const COORDINATION_SCHEMA_VERSION = 1;
export const COORDINATION_DDL = `
CREATE TABLE payload_coordination_control(singleton boolean PRIMARY KEY CHECK(singleton),schema_version integer NOT NULL);
INSERT INTO payload_coordination_control VALUES(true,1);
CREATE TABLE payload_coordination_board(
  board_id text PRIMARY KEY,corpus_id text NOT NULL REFERENCES corpora(corpus_id),
  purpose text NOT NULL CHECK(purpose='internal_research'),
  next_sequence integer NOT NULL DEFAULT 1 CHECK(next_sequence BETWEEN 1 AND 5001),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE payload_coordination_member(
  board_id text NOT NULL REFERENCES payload_coordination_board(board_id),
  principal_id text NOT NULL REFERENCES principal(principal_id),participant_id text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('HUMAN','AGENT','POLICY')),display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(board_id,principal_id),UNIQUE(board_id,participant_id),
  FOREIGN KEY(principal_id,kind) REFERENCES principal(principal_id,kind)
);
CREATE TABLE payload_coordination_participant(
  board_id text NOT NULL,participant_id text NOT NULL,definition jsonb NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY(board_id,participant_id),
  FOREIGN KEY(board_id,participant_id) REFERENCES payload_coordination_member(board_id,participant_id),
  CHECK(jsonb_typeof(definition)='object' AND octet_length(definition::text)<=8192)
);
CREATE TABLE payload_coordination_message(
  message_id text PRIMARY KEY,board_id text NOT NULL REFERENCES payload_coordination_board(board_id),
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 5000),
  author_id text NOT NULL,recipient_id text,request_id text NOT NULL,draft jsonb NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),created_at timestamptz NOT NULL,
  UNIQUE(board_id,sequence),UNIQUE(board_id,author_id,request_id),UNIQUE(board_id,message_id),
  FOREIGN KEY(board_id,author_id) REFERENCES payload_coordination_participant(board_id,participant_id),
  FOREIGN KEY(board_id,recipient_id) REFERENCES payload_coordination_participant(board_id,participant_id),
  CHECK(jsonb_typeof(draft)='object' AND octet_length(draft::text)<=32768)
);
CREATE INDEX coordination_inbox ON payload_coordination_message(board_id,recipient_id,sequence);
CREATE TABLE payload_coordination_ack(
  board_id text NOT NULL,message_id text NOT NULL,participant_id text NOT NULL,
  created_at timestamptz NOT NULL,digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY(board_id,message_id,participant_id),
  FOREIGN KEY(board_id,message_id) REFERENCES payload_coordination_message(board_id,message_id),
  FOREIGN KEY(board_id,participant_id) REFERENCES payload_coordination_participant(board_id,participant_id)
);
CREATE TABLE payload_coordination_configuration_event(
  event_id text PRIMARY KEY,board_id text NOT NULL REFERENCES payload_coordination_board(board_id),
  kind text NOT NULL CHECK(kind IN ('BOARD_CREATED','MEMBER_GRANTED','MEMBER_REVOKED')),
  principal_id text REFERENCES principal(principal_id),
  actor text NOT NULL,reason text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$')
);
CREATE FUNCTION coordination_immutable() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION 'coordination_immutable';
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION coordination_board_binding() RETURNS trigger AS $$ BEGIN
  IF (to_jsonb(OLD)-'next_sequence') IS DISTINCT FROM (to_jsonb(NEW)-'next_sequence')
    OR NEW.next_sequence<>OLD.next_sequence+1 THEN RAISE EXCEPTION 'coordination_board_binding'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE FUNCTION coordination_member_binding() RETURNS trigger AS $$ BEGIN
  IF (to_jsonb(OLD)-'enabled') IS DISTINCT FROM (to_jsonb(NEW)-'enabled')
    THEN RAISE EXCEPTION 'coordination_member_binding'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER coordination_control_immutable BEFORE UPDATE OR DELETE ON payload_coordination_control FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
CREATE TRIGGER coordination_board_binding BEFORE UPDATE ON payload_coordination_board FOR EACH ROW EXECUTE FUNCTION coordination_board_binding();
CREATE TRIGGER coordination_board_no_delete BEFORE DELETE ON payload_coordination_board FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
CREATE TRIGGER coordination_member_binding BEFORE UPDATE ON payload_coordination_member FOR EACH ROW EXECUTE FUNCTION coordination_member_binding();
CREATE TRIGGER coordination_member_no_delete BEFORE DELETE ON payload_coordination_member FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
CREATE TRIGGER coordination_participant_immutable BEFORE UPDATE OR DELETE ON payload_coordination_participant FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
CREATE TRIGGER coordination_message_immutable BEFORE UPDATE OR DELETE ON payload_coordination_message FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
CREATE TRIGGER coordination_ack_immutable BEFORE UPDATE OR DELETE ON payload_coordination_ack FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
CREATE TRIGGER coordination_configuration_immutable BEFORE UPDATE OR DELETE ON payload_coordination_configuration_event FOR EACH ROW EXECUTE FUNCTION coordination_immutable();
`;

/** Explicit operator migration; never called by a request or worker. */
export async function installCoordinationSchema(db: TerminalDatabase): Promise<void> {
  await db.transaction(async sql => {
    const prior = (await sql.query<{ corpus: string | null; principal: string | null; control: string | null; jobs: string | null; results: string | null }>(
      "SELECT to_regclass('public.corpora')::text corpus,to_regclass('public.principal')::text principal,to_regclass('public.payload_terminal_control')::text control,to_regclass('public.payload_terminal_job')::text jobs,to_regclass('public.payload_terminal_result')::text results")).rows[0];
    if (!prior?.corpus || !prior.principal || !prior.control || !prior.jobs || !prior.results) throw new Error('COORDINATION_TERMINAL_SCHEMA_REQUIRED');
    await sql.query('LOCK TABLE payload_terminal_control IN SHARE ROW EXCLUSIVE MODE');
    const terminal = (await sql.query<{ schema_version: number }>('SELECT schema_version FROM payload_terminal_control WHERE singleton=true')).rows[0];
    if (terminal?.schema_version !== 3) throw new Error('COORDINATION_TERMINAL_SCHEMA_REQUIRED');
    const exists = (await sql.query<{ installed: string | null }>(
      "SELECT to_regclass('public.payload_coordination_control')::text installed")).rows[0]?.installed;
    if (!exists) await sql.query(COORDINATION_DDL);
    const version = (await sql.query<{ schema_version: number }>('SELECT schema_version FROM payload_coordination_control WHERE singleton=true')).rows[0];
    if (version?.schema_version !== COORDINATION_SCHEMA_VERSION) throw new Error('COORDINATION_SCHEMA_VERSION_UNSUPPORTED');
    for (const name of ['board','member','participant','message','ack','configuration_event']) {
      const row = (await sql.query<{ present: string | null }>('SELECT to_regclass($1)::text present', ['public.payload_coordination_' + name])).rows[0];
      if (!row?.present) throw new Error('COORDINATION_SCHEMA_INCOMPLETE');
    }
  });
}
