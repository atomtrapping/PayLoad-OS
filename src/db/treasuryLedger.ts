/**
 * The firm's money, in the database.
 *
 * `src/domain/treasury.ts` states the four-term control rule. The point of this
 * file is that the four terms are four different rows in four different tables,
 * so an approval cannot quietly become the only one that matters.
 *
 * WHY THAT ARRANGEMENT AND NOT A FLAG
 *
 * The easy schema puts `approved boolean` on the proposal and checks it before
 * dispatch. It has one term, and the other three are comments. Here:
 *
 *   Eligibility is a row about (asset, jurisdiction, entity), and its state is
 *   CONFIRMED, BLOCKED or UNRESOLVED. An authorization ties to it and requires
 *   CONFIRMED, so an unresolved eligibility is a refusal rather than a gap.
 *
 *   Provider permission is a row about an account, and an authorization ties to
 *   it, so a destination nobody onboarded is not a destination.
 *
 *   Policy compliance ties to the policy VERSION in force, so an approval given
 *   under one policy does not survive its replacement.
 *
 *   Human authorization is a row naming a principal, and AGENT is not a value
 *   the column holds.
 *
 * UNKNOWN ELIGIBILITY IS BLOCKED
 *
 * `ELIGIBILITY_PERMITS` is a one-element list and the CHECK is written against
 * it, so adding a fourth eligibility state cannot accidentally admit it. This
 * is the module's most important line and its cheapest: an unresolved question
 * is not a permission awaiting paperwork.
 *
 * A DENIAL IS PERSISTENT AND UNSPLITTABLE
 *
 * A denied proposal cannot be authorized later — the standing is on the
 * proposal and an authorization ties to a standing that is not DENIED. Nor can
 * it be split: a proposal descending from a denied one carries the ancestry,
 * and a trigger refuses authorizing anything whose line contains a denial. The
 * three routes around a refusal are the three a motivated proposer tries.
 *
 * AN APPROVAL BINDS TO ONE OPERATION AND EXPIRES
 *
 * The authorization carries the asset, the destination and the amount,
 * denormalised from the proposal and tied to it, so a material change is a
 * different proposal rather than a stretched approval. The dispatch carries
 * the authorization's window and is checked against it, so an approval that was
 * valid when granted is not valid when stale.
 *
 * AND APPROVING IS NOT VERIFYING
 *
 * A dispatch records an outcome including an unknown one, and reconciliation is
 * a separate row. Approving a transfer does not verify its completion.
 *
 * NOTHING CAN BE PROPOSED AT ALL
 *
 * A proposal names the account it would move from. No account is approved, so
 * the key has nothing to point at.
 */
import {
  ELIGIBILITY_PERMITS, ELIGIBILITY_STATES, FUND_BUCKETS, MOVEMENT_KINDS, REVERSIBILITY,
  REVIEW_RESPONSES, TREASURY_AUTHORIZING_PRINCIPALS,
} from '@/domain/treasury';
import { OUTCOMES } from '@/domain/executionEnvelope';
import { quoted } from './ddl';

/** The responses that end a proposal, from the module that owns the set. */
export { RESPONSES_THAT_CLOSE } from '@/domain/treasury';

export const TREASURY_LEDGER_DDL = `
-- Whether this asset may be held by this entity in this jurisdiction.
CREATE TABLE asset_eligibility (
  eligibility_id text PRIMARY KEY,
  -- A ticker names a family. A balance is a contract on a network.
  asset_network text NOT NULL CHECK (length(btrim(asset_network)) > 0),
  asset_contract text NOT NULL CHECK (length(btrim(asset_contract)) > 0),
  jurisdiction text NOT NULL CHECK (length(btrim(jurisdiction)) > 0),
  entity text NOT NULL CHECK (length(btrim(entity)) > 0),
  state text NOT NULL CHECK (state IN (${quoted(ELIGIBILITY_STATES)})),
  -- Why. A block names the rule and an unresolved names the question.
  basis text NOT NULL CHECK (length(btrim(basis)) > 0),
  determined_at timestamptz NOT NULL,

  CONSTRAINT eligibility_once UNIQUE (asset_network, asset_contract, jurisdiction, entity),
  UNIQUE (eligibility_id, state)
);

-- An account the firm actually holds, at a provider that onboarded it.
CREATE TABLE treasury_account (
  account_id text PRIMARY KEY,
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  -- The legal owner. Money moves between accounts of the same entity.
  legal_entity text NOT NULL CHECK (length(btrim(legal_entity)) > 0),
  bucket text NOT NULL CHECK (bucket IN (${quoted(FUND_BUCKETS)})),
  currency text NOT NULL CHECK (length(currency) = 3),
  onboarded_at timestamptz NOT NULL,
  UNIQUE (account_id, legal_entity),
  UNIQUE (account_id, bucket)
);

-- The policy in force. Changing it is a separate governed decision, so a new
-- version is a new row and an approval binds to the version it was given under.
CREATE TABLE treasury_policy (
  policy_version text PRIMARY KEY,
  reserve_floor_minor bigint NOT NULL CHECK (reserve_floor_minor >= 0),
  adopted_by text NOT NULL CHECK (length(btrim(adopted_by)) > 0),
  adopted_at timestamptz NOT NULL,
  superseded_at timestamptz,
  CONSTRAINT policy_supersession_follows_adoption CHECK (superseded_at IS NULL OR superseded_at > adopted_at)
);

-- What somebody proposes doing.
CREATE TABLE treasury_proposal (
  proposal_id text PRIMARY KEY,
  source_account_id text NOT NULL,
  source_legal_entity text NOT NULL,
  destination_account_id text NOT NULL,
  destination_legal_entity text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  asset_network text NOT NULL,
  asset_contract text NOT NULL,
  purpose text NOT NULL CHECK (length(btrim(purpose)) > 0),
  -- The comparison with doing nothing. Required, because a packet that argues
  -- only for its own proposal is a recommendation wearing a review's clothes.
  doing_nothing text NOT NULL CHECK (length(btrim(doing_nothing)) > 0),
  -- What is unfavourable about it, in the proposer's own words.
  against text NOT NULL CHECK (length(btrim(against)) > 0),
  proposed_by text NOT NULL CHECK (length(btrim(proposed_by)) > 0),
  proposed_at timestamptz NOT NULL,
  -- A revision of an earlier proposal carries a new identity and names it.
  revises_proposal_id text REFERENCES treasury_proposal (proposal_id),
  revision_reason text,

  CONSTRAINT proposal_source FOREIGN KEY (source_account_id, source_legal_entity)
    REFERENCES treasury_account (account_id, legal_entity),
  CONSTRAINT proposal_destination FOREIGN KEY (destination_account_id, destination_legal_entity)
    REFERENCES treasury_account (account_id, legal_entity),
  -- Money moves between accounts of the same legal entity. A counterparty that
  -- is not the firm is not a destination this treasury has.
  CONSTRAINT proposal_stays_within_the_entity CHECK (source_legal_entity = destination_legal_entity),
  CONSTRAINT proposal_moves_somewhere CHECK (source_account_id <> destination_account_id),
  CONSTRAINT proposal_revision_says_what_changed CHECK (
    (revises_proposal_id IS NULL) = (revision_reason IS NULL)
  ),
  UNIQUE (proposal_id, amount_minor, asset_network, asset_contract, destination_account_id)
);

-- What the reviewer said. Four responses, and no default.
CREATE TABLE proposal_review (
  review_id text PRIMARY KEY,
  proposal_id text NOT NULL UNIQUE REFERENCES treasury_proposal (proposal_id),
  response text NOT NULL CHECK (response IN (${quoted(REVIEW_RESPONSES)})),
  reviewer_kind text NOT NULL CHECK (reviewer_kind IN (${quoted(TREASURY_AUTHORIZING_PRINCIPALS)})),
  reviewer text NOT NULL CHECK (length(btrim(reviewer)) > 0),
  reasoning text NOT NULL CHECK (length(btrim(reasoning)) > 0),
  reviewed_at timestamptz NOT NULL,
  UNIQUE (proposal_id, response)
);

-- The authorization. Four ties, one per term of the rule.
CREATE TABLE treasury_authorization (
  authorization_id text PRIMARY KEY,
  proposal_id text NOT NULL,

  -- TERM 1: eligibility, and only the confirmed state permits.
  eligibility_id text NOT NULL,
  eligibility_state text NOT NULL,

  -- TERM 2: the account the provider onboarded, in the bucket it belongs to.
  source_account_id text NOT NULL,
  source_bucket text NOT NULL,

  -- TERM 3: the policy version in force when it was given.
  policy_version text NOT NULL REFERENCES treasury_policy (policy_version),

  -- TERM 4: a person or a policy. AGENT is not a value this column holds.
  granted_by_kind text NOT NULL CHECK (granted_by_kind IN (${quoted(TREASURY_AUTHORIZING_PRINCIPALS)})),
  granted_by text NOT NULL CHECK (length(btrim(granted_by)) > 0),

  -- What it binds to, denormalised from the proposal and tied to it, so a
  -- material change is a different proposal rather than a stretched approval.
  amount_minor bigint NOT NULL,
  asset_network text NOT NULL,
  asset_contract text NOT NULL,
  destination_account_id text NOT NULL,

  -- And the review that granted it, so an approval cannot exist without one.
  review_response text NOT NULL,

  granted_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,

  CONSTRAINT authorization_eligibility FOREIGN KEY (eligibility_id, eligibility_state)
    REFERENCES asset_eligibility (eligibility_id, state),
  -- The most important line here. An unresolved eligibility is a refusal, not
  -- a gap: absence of a prohibition is not a permission.
  CONSTRAINT authorization_needs_confirmed_eligibility CHECK (eligibility_state IN (${quoted(ELIGIBILITY_PERMITS)})),

  CONSTRAINT authorization_account FOREIGN KEY (source_account_id, source_bucket)
    REFERENCES treasury_account (account_id, bucket),

  CONSTRAINT authorization_is_the_proposals_action FOREIGN KEY (proposal_id, amount_minor, asset_network, asset_contract, destination_account_id)
    REFERENCES treasury_proposal (proposal_id, amount_minor, asset_network, asset_contract, destination_account_id),

  CONSTRAINT authorization_review FOREIGN KEY (proposal_id, review_response)
    REFERENCES proposal_review (proposal_id, response),
  -- A denial is persistent. Only an approval authorizes anything.
  CONSTRAINT authorization_rests_on_an_approval CHECK (review_response = 'APPROVE'),

  CONSTRAINT authorization_expires_after_grant CHECK (expires_at > granted_at),
  UNIQUE (authorization_id, granted_at, expires_at)
);

-- One attempt to move the money.
CREATE TABLE treasury_dispatch (
  dispatch_id text PRIMARY KEY,
  authorization_id text NOT NULL,
  -- Denormalised from the authorization and tied, so the window check below is
  -- about the authority actually granted.
  authorization_granted_at timestamptz NOT NULL,
  authorization_expires_at timestamptz NOT NULL,
  dispatched_at timestamptz NOT NULL,
  movement_kind text NOT NULL CHECK (movement_kind IN (${quoted(MOVEMENT_KINDS)})),
  reversibility text NOT NULL CHECK (reversibility IN (${quoted(REVERSIBILITY)})),
  -- A disposition needs a value in the reporting currency; a transfer between
  -- the firm's own accounts does not.
  local_value_minor bigint,
  outcome text NOT NULL CHECK (outcome IN (${quoted(OUTCOMES)})),

  CONSTRAINT dispatch_authorization FOREIGN KEY (authorization_id, authorization_granted_at, authorization_expires_at)
    REFERENCES treasury_authorization (authorization_id, granted_at, expires_at),
  -- Rechecked at dispatch rather than trusting that an approval was recorded
  -- earlier. An approval valid when granted is not valid when stale.
  CONSTRAINT dispatch_within_the_authorization CHECK (
    dispatched_at >= authorization_granted_at AND dispatched_at < authorization_expires_at
  ),
  CONSTRAINT dispatch_disposition_is_valued CHECK (
    (movement_kind = 'DISPOSITION') = (local_value_minor IS NOT NULL)
  )
);

-- What actually happened, recorded separately because approving is not
-- verifying and dispatching is not completing.
CREATE TABLE dispatch_reconciliation (
  reconciliation_id text PRIMARY KEY,
  dispatch_id text NOT NULL UNIQUE REFERENCES treasury_dispatch (dispatch_id),
  found text NOT NULL CHECK (found IN ('DID_HAPPEN', 'DID_NOT_HAPPEN', 'STILL_UNKNOWN')),
  basis text NOT NULL CHECK (length(btrim(basis)) > 0),
  reconciled_at timestamptz NOT NULL
);

CREATE INDEX proposal_by_source ON treasury_proposal (source_account_id, proposed_at);
CREATE INDEX authorization_by_proposal ON treasury_authorization (proposal_id);
CREATE INDEX dispatch_by_authorization ON treasury_dispatch (authorization_id);
`;

/**
 * The guard that cannot be a CHECK.
 *
 * A denial cannot be split into smaller transactions. A revised proposal is
 * permitted — it carries a new identity and says what changed — but a proposal
 * whose ancestry contains a denial cannot be authorized without somebody
 * revisiting that denial. Splitting is exactly the route a motivated proposer
 * takes when the answer was no, and it spans rows, so it is a trigger.
 */
export const TREASURY_LEDGER_GUARDS = `
CREATE FUNCTION refuse_authorization_descending_from_a_denial() RETURNS trigger AS $$
DECLARE
  denied text;
BEGIN
  WITH RECURSIVE line AS (
    SELECT proposal_id, revises_proposal_id FROM treasury_proposal WHERE proposal_id = NEW.proposal_id
    UNION ALL
    SELECT parent.proposal_id, parent.revises_proposal_id
    FROM treasury_proposal parent JOIN line ON line.revises_proposal_id = parent.proposal_id
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

CREATE TRIGGER treasury_authorization_denial_line
  BEFORE INSERT ON treasury_authorization
  FOR EACH ROW EXECUTE FUNCTION refuse_authorization_descending_from_a_denial();
`;

