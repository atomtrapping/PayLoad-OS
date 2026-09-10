/**
 * The commercial plane, in the database.
 *
 * There is no second architecture here. An opportunity hangs off a derived
 * artifact, an engagement hangs off an opportunity, and an authorization looks
 * exactly like the one in `src/db/executionLedger.ts` because it is the same
 * kind of thing. What is new is only where the boundaries fall.
 *
 * AN OPPORTUNITY IS A FITTED CLAIM, NOT A FACT
 *
 * It carries the class of the artifact it came from, tied by a composite key,
 * and a CHECK restricts that to the fitted classes. "This account has a problem
 * we can solve" is a hypothesis about an organization's situation and
 * intentions; a count is not one, and the column will not let a count pretend
 * to be one.
 *
 * A CLAIM IN A MESSAGE IS A SERVED CLAIM
 *
 * The constraint that matters most on this plane, because this is the surface
 * where dropping the class buys a reply. `engagement_claim` carries what the
 * message presents the claim as, beside the class the artifact actually has,
 * tied to it — and a CHECK requires them equal. A model inference cannot be
 * written into an outbound message as an observation. The recipient is a reader
 * like any other, and they are the reader most likely to act on it.
 *
 * AN AGENT MAY DRAFT AND MAY NOT SEND
 *
 * `authorized_by_kind` accepts HUMAN and POLICY. AGENT is not a value it holds.
 * Drafting fluently is exactly how an unauthorized message goes out, so the
 * send is gated on a row an agent cannot write.
 *
 * AND A SENT ENGAGEMENT IS NOT AN OUTCOME
 *
 * The outcome is a separate row recorded later, NO_RESPONSE included, because
 * an engagement with no outcome row has not been observed rather than having
 * failed. The two are different facts and the schema keeps them different.
 *
 * NOTHING CAN BE SENT AT ALL
 *
 * An opportunity requires a derived artifact to rest on. There are none — no
 * corpus has been mined because nothing has been admitted — so the foreign key
 * has nothing to point at and no opportunity can be written. The block is
 * structural, and it is the same missing first fact as everywhere else here.
 */
import { CLASS_CONTRACTS } from '@/domain/discoveryLayer';
import {
  ENGAGEMENT_CHANNELS, ENGAGEMENT_OUTCOMES, ENGAGEMENT_STANDINGS, OPPORTUNITY_CLASSES,
} from '@/domain/commercialPlane';

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/** The execution ledger's list, not a second one, and for the same reason. */
import { AUTHORIZING_PRINCIPALS } from './executionLedger';
export { AUTHORIZING_PRINCIPALS };

/** Every class a claim could be presented as, so the mismatch is expressible. */
const PRESENTABLE = CLASS_CONTRACTS.map((entry) => entry.class);

export const COMMERCIAL_LEDGER_DDL = `
-- What the corpus noticed about an account.
CREATE TABLE commercial_opportunity (
  opportunity_id text PRIMARY KEY,
  account text NOT NULL CHECK (length(btrim(account)) > 0),
  -- The artifact it rests on, and the class that artifact carries. No artifact,
  -- no opportunity: the corpus noticed it or nobody did.
  artifact_id text NOT NULL,
  artifact_class text NOT NULL,
  -- A condition, not a category. "Matches NAICS 3241" is not a trigger.
  trigger text NOT NULL CHECK (length(btrim(trigger)) > 0),
  -- Stated as a supposition, because that is what it is.
  need_hypothesis text NOT NULL CHECK (length(btrim(need_hypothesis)) > 0),
  product_fit text NOT NULL CHECK (length(btrim(product_fit)) > 0),
  estimated_value numeric,
  confidence numeric NOT NULL,
  detected_at timestamptz NOT NULL,

  CONSTRAINT opportunity_artifact FOREIGN KEY (artifact_id, artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),
  -- A hypothesis about an organization is a fitted claim. Arithmetic does not
  -- produce one, so a computed result cannot become an opportunity.
  CONSTRAINT opportunity_is_a_fitted_claim CHECK (artifact_class IN (${quoted(OPPORTUNITY_CLASSES)})),
  CONSTRAINT opportunity_confidence_is_uncertain CHECK (confidence > 0 AND confidence < 1),
  CONSTRAINT opportunity_value_is_positive CHECK (estimated_value IS NULL OR estimated_value > 0),
  UNIQUE (opportunity_id, artifact_class)
);

-- What would be said, to whom, and whether anyone has agreed to say it.
CREATE TABLE engagement_proposal (
  proposal_id text PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES commercial_opportunity (opportunity_id),
  contact text NOT NULL CHECK (length(btrim(contact)) > 0),
  -- On what basis the firm holds their details. A contact without one is a
  -- contact the firm cannot explain having.
  contact_basis text NOT NULL CHECK (length(btrim(contact_basis)) > 0),
  channel text NOT NULL CHECK (channel IN (${quoted(ENGAGEMENT_CHANNELS)})),
  -- In full, before anyone authorizes sending it.
  message text NOT NULL CHECK (length(btrim(message)) > 0),
  drafted_by text NOT NULL CHECK (length(btrim(drafted_by)) > 0),
  drafted_at timestamptz NOT NULL,
  standing text NOT NULL CHECK (standing IN (${quoted(ENGAGEMENT_STANDINGS)})),
  -- An agent is not a value this column holds.
  authorized_by_kind text CHECK (authorized_by_kind IN (${quoted(AUTHORIZING_PRINCIPALS)})),
  authorized_by text,
  authorized_at timestamptz,
  refusal_reason text,
  sent_at timestamptz,

  CONSTRAINT engagement_authorized_names_a_principal CHECK (
    (standing IN ('AUTHORIZED', 'SENT')) = (authorized_by_kind IS NOT NULL AND authorized_by IS NOT NULL AND authorized_at IS NOT NULL)
  ),
  CONSTRAINT engagement_refusal_has_a_reason CHECK (
    (standing = 'REFUSED') = (refusal_reason IS NOT NULL AND length(btrim(refusal_reason)) > 0)
  ),
  -- Sending is the only thing that stamps a send, and it happens after the
  -- authorization rather than beside it.
  CONSTRAINT engagement_sent_is_stamped CHECK ((standing = 'SENT') = (sent_at IS NOT NULL)),
  CONSTRAINT engagement_authorized_after_drafting CHECK (authorized_at IS NULL OR authorized_at >= drafted_at),
  CONSTRAINT engagement_sent_after_authorization CHECK (sent_at IS NULL OR sent_at >= authorized_at),
  UNIQUE (proposal_id, standing)
);

-- Every claim in the message that is about the recipient.
CREATE TABLE engagement_claim (
  engagement_claim_id text PRIMARY KEY,
  proposal_id text NOT NULL REFERENCES engagement_proposal (proposal_id),
  -- The sentence, so the class can be checked against something real.
  assertion text NOT NULL CHECK (length(btrim(assertion)) > 0),
  -- What the message presents it as.
  presented_as text NOT NULL CHECK (presented_as IN (${quoted(PRESENTABLE)})),
  -- And where it came from, with its real class, tied to it.
  artifact_id text NOT NULL,
  artifact_class text NOT NULL,

  CONSTRAINT engagement_claim_artifact FOREIGN KEY (artifact_id, artifact_class)
    REFERENCES derived_artifact (artifact_id, claim_class),
  -- The whole of it. A message says what the corpus computed, at the class the
  -- corpus computed it, or it does not say it.
  CONSTRAINT engagement_claim_presented_at_its_class CHECK (presented_as = artifact_class)
);

-- What happened afterwards. A row, including when nothing happened.
CREATE TABLE engagement_outcome (
  outcome_id text PRIMARY KEY,
  proposal_id text NOT NULL UNIQUE,
  proposal_standing text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (${quoted(ENGAGEMENT_OUTCOMES)})),
  observed_at timestamptz NOT NULL,
  -- The admission this observation entered through. The firm's own data has no
  -- privileged path, so this is not nullable.
  admitted_via text NOT NULL CHECK (length(btrim(admitted_via)) > 0),

  CONSTRAINT outcome_proposal FOREIGN KEY (proposal_id, proposal_standing)
    REFERENCES engagement_proposal (proposal_id, standing),
  -- Only a sent engagement has an outcome. A drafted one has no result to
  -- observe, and recording one would be observing something that never left.
  CONSTRAINT outcome_only_for_a_sent_engagement CHECK (proposal_standing = 'SENT')
);

CREATE INDEX opportunity_by_account ON commercial_opportunity (account, detected_at);
CREATE INDEX engagement_by_opportunity ON engagement_proposal (opportunity_id);
CREATE INDEX engagement_claim_by_proposal ON engagement_claim (proposal_id);
`;

/**
 * The guard that cannot be a CHECK.
 *
 * A sent engagement whose claims were never recorded is a message that went out
 * making assertions nobody can trace. It spans rows, so it is a deferred
 * constraint trigger: the send and the claims are written together and the
 * count is taken at commit.
 */
export const COMMERCIAL_LEDGER_GUARDS = `
CREATE FUNCTION refuse_send_without_recorded_claims() RETURNS trigger AS $$
BEGIN
  IF NEW.standing = 'SENT' AND NOT EXISTS (
    SELECT 1 FROM engagement_claim WHERE proposal_id = NEW.proposal_id
  ) THEN
    RAISE EXCEPTION 'engagement_sent_without_recorded_claims';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER engagement_must_record_its_claims
  AFTER INSERT OR UPDATE ON engagement_proposal
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_send_without_recorded_claims();
`;

/** Every column the DDL creates, by table, for the drift check. */
export function commercialDdlColumns(ddl = COMMERCIAL_LEDGER_DDL): Record<string, string[]> {
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
