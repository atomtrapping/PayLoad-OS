/**
 * The action layer, in the database.
 *
 * `src/domain/executionEnvelope.ts` states the arrows. This is where they stop
 * being statements. Four of them are expressible as constraints, and each one
 * closes a failure that costs money rather than credibility.
 *
 * AN AGENT CANNOT MANUFACTURE AUTHORITY
 *
 * A proposal carries the kind of principal that authored it, and an agent is a
 * permitted author. An authorization carries the same, and `AGENT` is not in
 * the set the column accepts. The rule "the agent may propose an operation; it
 * must not manufacture its own authority to perform it" is therefore not a
 * policy a writer applies — it is a value the column will not hold.
 *
 * AN AUTHORIZATION BINDS TO THE STATE IT WAS GRANTED AGAINST
 *
 * Approval at revision 41 does not carry to revision 42. The dispatch carries
 * the revision it ran at, tied to the authorization's by a composite key, and a
 * CHECK requires them equal. The quality hold that arrived in between is
 * exactly the case this exists for: the old approval does not silently apply,
 * and the boundary revalidates or refuses.
 *
 * A RETRY IS NOT A SECOND COMMITMENT
 *
 * The operation and the attempt are two tables. An operation carries an
 * idempotency key unique across the ledger; attempts hang beneath it. An agent
 * retrying fluently produces attempts, never operations, and the count of
 * commitments is the count of operations however many times dispatch was tried.
 *
 * AN UNKNOWN OUTCOME IS TERMINAL
 *
 * `OUTCOME_UNKNOWN` is a recorded result, not an absence, and a further attempt
 * after one is refused unless a reconciliation has been recorded first. That is
 * the constraint form of "never assume nothing happened and retry".
 *
 * AND NOTHING CAN BE AUTHORIZED AT ALL
 *
 * An authorization requires a corpus release to bind to. There are none — no
 * connector has been lit and admitted records are zero — so the foreign key has
 * nothing to point at and no row can be written. The block is structural rather
 * than a flag someone remembered to check.
 */
import { AGENT_MAY, ENVELOPE_CLASSES, OUTCOMES } from '@/domain/executionEnvelope';

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/** Who may author a step. An agent proposes; it does not authorize. */
export const PRINCIPAL_KINDS = ['HUMAN', 'AGENT', 'POLICY'] as const;
export type PrincipalKind = typeof PRINCIPAL_KINDS[number];

/** The principals an authorization may name. `AGENT` is deliberately absent. */
export const AUTHORIZING_PRINCIPALS: readonly PrincipalKind[] = ['HUMAN', 'POLICY'];

/** Sanity: the domain says an agent may not authorize, and this list is that statement. */
export const AGENT_CANNOT_AUTHORIZE = !AGENT_MAY.includes('authorize' as never);

export const EXECUTION_LEDGER_DDL = `
CREATE TABLE operation_proposal (
  proposal_id text PRIMARY KEY,
  operation_kind text NOT NULL CHECK (length(btrim(operation_kind)) > 0),
  counterparty text NOT NULL,
  -- An agent may author this. That is the point of the table.
  authored_by_kind text NOT NULL CHECK (authored_by_kind IN (${quoted(PRINCIPAL_KINDS)})),
  authored_by text NOT NULL CHECK (length(btrim(authored_by)) > 0),
  proposed_at timestamptz NOT NULL,
  -- What it says it would change, declared before anything changes.
  declared_side_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT proposal_side_effects_is_array CHECK (jsonb_typeof(declared_side_effects) = 'array')
);

CREATE TABLE execution_authorization (
  authorization_id text PRIMARY KEY,
  proposal_id text NOT NULL REFERENCES operation_proposal (proposal_id),
  envelope_class text NOT NULL CHECK (envelope_class IN (${quoted(ENVELOPE_CLASSES)})),
  -- An agent cannot be here. The value will not go in the column.
  granted_by_kind text NOT NULL CHECK (granted_by_kind IN (${quoted(AUTHORIZING_PRINCIPALS)})),
  granted_by text NOT NULL CHECK (length(btrim(granted_by)) > 0),
  -- What it binds to. The release is a foreign key on purpose: no release, no
  -- authority, and the block is structural rather than remembered.
  corpus_release_id text NOT NULL REFERENCES releases (release_id),
  state_revision bigint NOT NULL,
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  granted_at timestamptz NOT NULL,
  -- An authority without an end is not a bounded authority.
  expires_at timestamptz NOT NULL,
  max_spend numeric,
  CONSTRAINT authorization_expires_after_grant CHECK (expires_at > granted_at),
  CONSTRAINT authorization_spend_positive CHECK (max_spend IS NULL OR max_spend > 0),
  -- Only a narrow action carries side effects, so only it may be authorized.
  CONSTRAINT authorization_only_for_action CHECK (envelope_class = 'NARROW_ACTION'),
  UNIQUE (authorization_id, state_revision, granted_at, expires_at)
);

-- One commercial commitment. The idempotency key is what makes it one.
CREATE TABLE execution_operation (
  operation_id text PRIMARY KEY,
  authorization_id text NOT NULL REFERENCES execution_authorization (authorization_id),
  idempotency_key text NOT NULL UNIQUE,
  opened_at timestamptz NOT NULL
);

-- One try at dispatching that commitment. Many of these to one of those.
CREATE TABLE execution_attempt (
  attempt_id text PRIMARY KEY,
  operation_id text NOT NULL REFERENCES execution_operation (operation_id),
  authorization_id text NOT NULL,
  -- Denormalised from the authorization and tied to it, so the checks below are
  -- about the authority actually granted.
  authorization_state_revision bigint NOT NULL,
  authorization_granted_at timestamptz NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  -- The revision the dispatch actually ran at.
  ran_at_state_revision bigint NOT NULL,
  attempted_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (${quoted(OUTCOMES)})),
  venue_receipt text,

  CONSTRAINT attempt_authorization FOREIGN KEY (authorization_id, authorization_state_revision, authorization_granted_at, authorization_expires_at)
    REFERENCES execution_authorization (authorization_id, state_revision, granted_at, expires_at),
  -- Approval at revision 41 does not carry to revision 42.
  CONSTRAINT attempt_runs_at_authorized_revision CHECK (ran_at_state_revision = authorization_state_revision),
  -- And it was attempted while the authority was in force.
  CONSTRAINT attempt_within_authorization CHECK (attempted_at >= authorization_granted_at AND attempted_at < authorization_expires_at),
  -- A receipt is the counterparty's, so only a confirmed attempt has one.
  CONSTRAINT attempt_receipt_only_when_confirmed CHECK (outcome = 'CONFIRMED' OR venue_receipt IS NULL),
  CONSTRAINT attempt_once UNIQUE (operation_id, attempted_at)
);

-- What was done about an attempt whose outcome was not known.
CREATE TABLE attempt_reconciliation (
  reconciliation_id text PRIMARY KEY,
  attempt_id text NOT NULL UNIQUE REFERENCES execution_attempt (attempt_id),
  reconciled_at timestamptz NOT NULL,
  found text NOT NULL CHECK (found IN ('DID_HAPPEN', 'DID_NOT_HAPPEN', 'STILL_UNKNOWN')),
  basis text NOT NULL CHECK (length(btrim(basis)) > 0)
);

CREATE INDEX attempt_by_operation ON execution_attempt (operation_id, attempted_at);
CREATE INDEX authorization_by_proposal ON execution_authorization (proposal_id);
`;

/**
 * The guard that cannot be a CHECK.
 *
 * "No further attempt after an unknown outcome until it has been reconciled"
 * spans rows, so it is a trigger rather than a constraint. It is here rather
 * than in application code for the same reason everything else here is: the
 * writer that skips it is the one that causes the incident.
 */
export const EXECUTION_LEDGER_GUARDS = `
CREATE FUNCTION refuse_attempt_after_unknown() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM execution_attempt prior
    LEFT JOIN attempt_reconciliation fixed ON fixed.attempt_id = prior.attempt_id
    WHERE prior.operation_id = NEW.operation_id
      AND prior.outcome = 'OUTCOME_UNKNOWN'
      AND (fixed.reconciliation_id IS NULL OR fixed.found = 'STILL_UNKNOWN')
  ) THEN
    RAISE EXCEPTION 'attempt_after_unresolved_unknown_outcome';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_attempt_after_unknown
  BEFORE INSERT ON execution_attempt
  FOR EACH ROW EXECUTE FUNCTION refuse_attempt_after_unknown();
`;

/** Every column the DDL creates, by table, for the drift check. */
export function ledgerDdlColumns(ddl = EXECUTION_LEDGER_DDL): Record<string, string[]> {
  const tables: Record<string, string[]> = {};
  for (const match of ddl.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const [, table, body] = match;
    tables[table] = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('--') && !/^(CONSTRAINT|UNIQUE|CHECK|FOREIGN KEY|PRIMARY KEY)\b/.test(line))
      .map((line) => line.split(/\s+/)[0])
      .filter((name) => /^[a-z_]+$/.test(name));
  }
  return tables;
}
