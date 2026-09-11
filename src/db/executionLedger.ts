/**
 * The action layer, in the database.
 *
 * `src/domain/executionEnvelope.ts` states the arrows. This is where they stop
 * being statements. Each constraint below closes a failure that costs money
 * rather than credibility, and the ones added since the first version close
 * the ones the directive named: a review that was not of the thing released,
 * an approval nobody can take back, a denial routed around, a correction with
 * no lineage to what it corrects.
 *
 * AN AGENT CANNOT MANUFACTURE AUTHORITY
 *
 * A proposal carries the kind of principal that authored it, and an agent is a
 * permitted author. An authorization carries the same, and `AGENT` is not in
 * the set the column accepts. The rule "the agent may propose an operation; it
 * must not manufacture its own authority to perform it" is therefore not a
 * policy a writer applies — it is a value the column will not hold.
 *
 * A PRINCIPAL IS A ROW, NOT A STRING
 *
 * Every authored_by, prepared_by, reviewer, granted_by and revoked_by is tied
 * to the `principal` table by (id, kind). A request body that says
 * `approvedBy: "operator:jo"` has supplied a string; the authorization row can
 * only be written if a registered HUMAN or POLICY of that name reviewed the
 * packet and said APPROVE. That is what "client-supplied approval fields grant
 * nothing" looks like as a foreign key.
 *
 * AN APPROVAL IS OF A DIGEST
 *
 * A decision packet carries the exact action as JSON and its sha256. A review
 * is of that digest, by composite key. An authorization is of that digest, by
 * composite key to the review, and the review it rests on must be APPROVE. A
 * dossier release, an article, a transfer: each is bound to its own bytes, and
 * approval of an earlier draft cannot be stretched over a later one because
 * the later one's digest is not the one in the review row.
 *
 * AN AUTHORIZATION BINDS TO THE STATE IT WAS GRANTED AGAINST, AND CAN BE
 * TAKEN BACK
 *
 * Approval at revision 41 does not carry to revision 42. The dispatch carries
 * the revision it ran at, tied to the authorization's by a composite key, and a
 * CHECK requires them equal. It also expires, and it can be revoked before it
 * expires: a revocation is a row naming the authorization, the principal and
 * the reason, and a trigger refuses any attempt stamped at or after it.
 *
 * A DENIAL IS PERSISTENT AND UNSPLITTABLE
 *
 * A proposal closes once — a partial unique index admits one APPROVE or DENY
 * per proposal, so a second reviewer cannot be found for a different answer.
 * A revised proposal is permitted and names what it revises; a trigger walks
 * that line and refuses authorizing anything descending from a denial. The
 * three routes around a refusal are the three a motivated proposer tries, and
 * all three are rows the database does not accept.
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
 * A CORRECTION NAMES WHAT IT CORRECTS
 *
 * A proposal may name the operation whose outcome it corrects, with a reason,
 * and the two columns come together or not at all. The corrected operation
 * stands; the correction is a new proposal through the same gate, which is
 * what "never un-fire" means once it is a column.
 *
 * AND NOTHING CAN BE AUTHORIZED AGAINST THE REAL CORPUS
 *
 * An authorization requires a corpus release to bind to. The real corpus has
 * none — no connector has been lit and admitted records are zero — so against
 * it the foreign key has nothing to point at. The governance demonstration
 * binds to a committed demonstration release and says so on every row.
 */
import {
  AGENT_MAY, ENVELOPE_CLASSES, OUTCOMES, RESPONSES_THAT_CLOSE, REVIEW_RESPONSES,
} from '@/domain/executionEnvelope';
import { quoted } from './ddl';

/** Who may author a step. An agent proposes; it does not authorize. */
export const PRINCIPAL_KINDS = ['HUMAN', 'AGENT', 'POLICY'] as const;
export type PrincipalKind = typeof PRINCIPAL_KINDS[number];

/** The principals an authorization may name. `AGENT` is deliberately absent. */
export const AUTHORIZING_PRINCIPALS: readonly PrincipalKind[] = ['HUMAN', 'POLICY'];

/** Sanity: the domain says an agent may not authorize, and this list is that statement. */
export const AGENT_CANNOT_AUTHORIZE = !AGENT_MAY.includes('authorize' as never);

/** What a reconciliation may find. Shared with the treasury's, which is the same question. */
export const RECONCILIATION_FINDINGS = ['DID_HAPPEN', 'DID_NOT_HAPPEN', 'STILL_UNKNOWN'] as const;

export const EXECUTION_LEDGER_DDL = `
-- Who may appear in an authored_by, reviewer, granted_by or revoked_by column.
-- A name that is not registered here is not a principal, whatever a request
-- body says it is.
CREATE TABLE principal (
  principal_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (${quoted(PRINCIPAL_KINDS)})),
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  registered_at timestamptz NOT NULL,
  UNIQUE (principal_id, kind)
);

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
  -- A revision of an earlier proposal carries a new identity and names it.
  revises_proposal_id text REFERENCES operation_proposal (proposal_id),
  revision_reason text,
  -- A correction names the operation whose outcome it corrects. The key is
  -- added below, once the operation table exists to point at.
  corrects_operation_id text,
  correction_reason text,
  CONSTRAINT proposal_side_effects_is_array CHECK (jsonb_typeof(declared_side_effects) = 'array'),
  CONSTRAINT proposal_author FOREIGN KEY (authored_by, authored_by_kind) REFERENCES principal (principal_id, kind),
  CONSTRAINT proposal_revision_says_what_changed CHECK ((revises_proposal_id IS NULL) = (revision_reason IS NULL)),
  CONSTRAINT proposal_correction_says_why CHECK ((corrects_operation_id IS NULL) = (correction_reason IS NULL))
);

-- What the reviewer is given: the exact action, by digest, and the case
-- against it. One per proposal. An agent may prepare it; that is its job.
CREATE TABLE decision_packet (
  packet_id text PRIMARY KEY,
  proposal_id text NOT NULL UNIQUE REFERENCES operation_proposal (proposal_id),
  action_kind text NOT NULL CHECK (length(btrim(action_kind)) > 0),
  -- The artifact or operation itself, and its digest. The digest is what a
  -- review is of and what an authorization binds to.
  action jsonb NOT NULL,
  action_digest text NOT NULL CHECK (action_digest ~ '^sha256:[a-f0-9]{64}$'),
  -- The comparison with doing nothing, and what is unfavourable, in the
  -- preparer's own words. Required: a packet that argues only for its own
  -- proposal is a recommendation wearing a review's clothes.
  doing_nothing text NOT NULL CHECK (length(btrim(doing_nothing)) > 0),
  against text NOT NULL CHECK (length(btrim(against)) > 0),
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  prepared_by_kind text NOT NULL CHECK (prepared_by_kind IN (${quoted(PRINCIPAL_KINDS)})),
  prepared_by text NOT NULL,
  prepared_at timestamptz NOT NULL,
  CONSTRAINT packet_preparer FOREIGN KEY (prepared_by, prepared_by_kind) REFERENCES principal (principal_id, kind),
  CONSTRAINT packet_sections_is_array CHECK (jsonb_typeof(sections) = 'array'),
  UNIQUE (proposal_id, action_digest)
);

-- What a reviewer said, about a digest. Four responses and no default, and the
-- reviewer is a registered person or policy: a name that is not in the
-- principal table is not a reviewer, whoever typed it.
CREATE TABLE proposal_review (
  review_id text PRIMARY KEY,
  proposal_id text NOT NULL,
  reviewed_action_digest text NOT NULL,
  response text NOT NULL CHECK (response IN (${quoted(REVIEW_RESPONSES)})),
  reviewer_kind text NOT NULL CHECK (reviewer_kind IN (${quoted(AUTHORIZING_PRINCIPALS)})),
  reviewer text NOT NULL CHECK (length(btrim(reviewer)) > 0),
  reasoning text NOT NULL CHECK (length(btrim(reasoning)) > 0),
  reviewed_at timestamptz NOT NULL,
  CONSTRAINT review_is_of_the_packet FOREIGN KEY (proposal_id, reviewed_action_digest)
    REFERENCES decision_packet (proposal_id, action_digest),
  CONSTRAINT review_reviewer FOREIGN KEY (reviewer, reviewer_kind) REFERENCES principal (principal_id, kind),
  UNIQUE (proposal_id, reviewed_action_digest, response)
);
-- A proposal closes once. A second closing response would be a second
-- decision, and finding a second reviewer is exactly the route the denial rule
-- refuses.
CREATE UNIQUE INDEX review_closes_once ON proposal_review (proposal_id)
  WHERE response IN (${quoted(RESPONSES_THAT_CLOSE)});

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
  -- What it is an authorization OF: the digest that was reviewed, and the
  -- response that reviewed it. A different digest is a different action, and a
  -- review that was not an approval authorizes nothing.
  action_digest text NOT NULL,
  review_response text NOT NULL,

  CONSTRAINT authorization_grantor FOREIGN KEY (granted_by, granted_by_kind) REFERENCES principal (principal_id, kind),
  CONSTRAINT authorization_is_of_the_reviewed_action FOREIGN KEY (proposal_id, action_digest, review_response)
    REFERENCES proposal_review (proposal_id, reviewed_action_digest, response),
  CONSTRAINT authorization_rests_on_an_approval CHECK (review_response = 'APPROVE'),
  CONSTRAINT authorization_expires_after_grant CHECK (expires_at > granted_at),
  CONSTRAINT authorization_spend_positive CHECK (max_spend IS NULL OR max_spend > 0),
  -- Only a narrow action carries side effects, so only it may be authorized.
  CONSTRAINT authorization_only_for_action CHECK (envelope_class = 'NARROW_ACTION'),
  UNIQUE (authorization_id, state_revision, granted_at, expires_at),
  UNIQUE (authorization_id, granted_at, expires_at),
  UNIQUE (authorization_id, action_digest)
);

-- Authority taken back before it expired. One per authorization, and a
-- revocation is not undone by a later row.
CREATE TABLE authorization_revocation (
  revocation_id text PRIMARY KEY,
  authorization_id text NOT NULL UNIQUE,
  -- Denormalised from the authorization and tied, so the window check below is
  -- about the authority actually granted.
  authorization_granted_at timestamptz NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  revoked_by_kind text NOT NULL CHECK (revoked_by_kind IN (${quoted(AUTHORIZING_PRINCIPALS)})),
  revoked_by text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  revoked_at timestamptz NOT NULL,
  CONSTRAINT revocation_authorization FOREIGN KEY (authorization_id, authorization_granted_at, authorization_expires_at)
    REFERENCES execution_authorization (authorization_id, granted_at, expires_at),
  CONSTRAINT revocation_revoker FOREIGN KEY (revoked_by, revoked_by_kind) REFERENCES principal (principal_id, kind),
  -- Revoking authority that has already expired is a decision about nothing.
  CONSTRAINT revocation_within_the_window CHECK (
    revoked_at >= authorization_granted_at AND revoked_at < authorization_expires_at
  )
);

-- One commercial commitment. The idempotency key is what makes it one.
CREATE TABLE execution_operation (
  operation_id text PRIMARY KEY,
  authorization_id text NOT NULL REFERENCES execution_authorization (authorization_id),
  idempotency_key text NOT NULL UNIQUE,
  opened_at timestamptz NOT NULL
);

ALTER TABLE operation_proposal ADD CONSTRAINT proposal_corrects_a_real_operation
  FOREIGN KEY (corrects_operation_id) REFERENCES execution_operation (operation_id);

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
  found text NOT NULL CHECK (found IN (${quoted(RECONCILIATION_FINDINGS)})),
  basis text NOT NULL CHECK (length(btrim(basis)) > 0)
);

CREATE INDEX attempt_by_operation ON execution_attempt (operation_id, attempted_at);
CREATE INDEX authorization_by_proposal ON execution_authorization (proposal_id);
CREATE INDEX review_by_proposal ON proposal_review (proposal_id, reviewed_at);
`;

/**
 * The guards that cannot be a CHECK.
 *
 * Each spans rows, so it is a trigger rather than a constraint, and each is
 * here rather than in application code for the same reason everything else
 * here is: the writer that skips it is the one that causes the incident.
 */
export const EXECUTION_LEDGER_GUARDS = `
-- "No further attempt after an unknown outcome until it has been reconciled."
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

-- "A dispatch at or after the revocation instant is refused." The authorization
-- row still says what it said; the revocation row is what changed.
CREATE FUNCTION refuse_attempt_after_revocation() RETURNS trigger AS $$
DECLARE
  taken_back timestamptz;
BEGIN
  SELECT revoked_at INTO taken_back FROM authorization_revocation
  WHERE authorization_id = NEW.authorization_id AND revoked_at <= NEW.attempted_at;
  IF taken_back IS NOT NULL THEN
    RAISE EXCEPTION 'attempt_after_revocation:%', taken_back;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_attempt_after_revocation
  BEFORE INSERT ON execution_attempt
  FOR EACH ROW EXECUTE FUNCTION refuse_attempt_after_revocation();

-- "A denial cannot be split." A revised proposal is permitted and names what
-- it revises; a proposal whose line contains a denial cannot be authorized
-- without somebody revisiting that denial.
CREATE FUNCTION refuse_authorization_descending_from_a_denial() RETURNS trigger AS $$
DECLARE
  denied text;
BEGIN
  WITH RECURSIVE line AS (
    SELECT proposal_id, revises_proposal_id FROM operation_proposal WHERE proposal_id = NEW.proposal_id
    UNION ALL
    SELECT parent.proposal_id, parent.revises_proposal_id
    FROM operation_proposal parent JOIN line ON line.revises_proposal_id = parent.proposal_id
  )
  SELECT line.proposal_id INTO denied
  FROM line JOIN proposal_review ON proposal_review.proposal_id = line.proposal_id
  WHERE proposal_review.response = 'DENY'
  LIMIT 1;
  IF denied IS NOT NULL THEN
    RAISE EXCEPTION 'authorization_descends_from_a_denial:%', denied;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER execution_authorization_denial_line
  BEFORE INSERT ON execution_authorization
  FOR EACH ROW EXECUTE FUNCTION refuse_authorization_descending_from_a_denial();
`;
