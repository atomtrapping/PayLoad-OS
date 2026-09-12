/**
 * What a terminal asked for, in the database.
 *
 * `src/domain/terminalPlane.ts` decides every ask and returns a receipt, and
 * until now that was the whole of it: the receipt went back to the caller and
 * nowhere else. A pattern of asking was therefore visible to whoever held the
 * call and invisible to the system, which is exactly backwards for a substrate
 * whose own doctrine says that every caller is a source — an identified party
 * whose requests are recorded and whose declared purposes accumulate a history
 * like any other declarations (`src/domain/servingBoundary.ts`).
 *
 * This is where they accumulate. Three tables and the guards that make them
 * mean something.
 *
 * THE CAPABILITY REGISTRY IS A TABLE, NOT A CHECK
 *
 * `terminal_capability` holds one row per capability the substrate declares,
 * seeded from `src/domain/capabilityRegistry.ts`. It could have been a CHECK
 * over 161 quoted strings; a table is better, because the guards below need to
 * reason about a capability's kind and whether it reaches an estate, and a
 * CHECK cannot. A call naming a capability the registry does not describe has
 * no row to point at, which is the same refusal the plane makes, held a second
 * time by the database for a writer that never heard of the plane.
 *
 * A SESSION IS THE DECLARATION, AND IT CANNOT WIDEN
 *
 * `terminal_session` holds the declaration: the party, its class, one purpose
 * from the corpus's own permitted uses, the corpora it named and the window it
 * stands for. The (class, purpose) pairs are generated from
 * `declarablePurposes`, so a customer terminal declaring internal research is
 * a row the database refuses rather than a rule somebody remembered. The row
 * is written once: a widening is a new session a party is answerable for, and
 * an UPDATE is the escalation-inside-one that the whole design refuses.
 *
 * A CALL IS DATED INSIDE ITS SESSION'S WINDOW
 *
 * `served_call` holds one row per ask, admitted, refused or proposed. The
 * session's window is denormalised onto the call and tied back by composite
 * key, so the CHECK that a call happened while its session stood is about the
 * window that session actually declared. The three outcomes each carry what
 * they must and nothing they must not: a refusal carries its code, a proposal
 * carries its proposal, an admission carries neither.
 *
 * AN OPERATE CANNOT BE RECORDED AS ANSWERED
 *
 * The rule the plane enforces is enforced here too, from the capability's
 * kind: only a READ may be ADMITTED. A row saying an operate was served is a
 * row the database does not accept, whatever produced it. An ADMIT capability
 * is refused to any session that is not the firm's own, by the same means.
 *
 * AND THE PROPOSAL IS THE ONE THE CALL MADE
 *
 * A proposed call points at `operation_proposal` in the execution ledger,
 * which is where a governed act has always started. Two guards keep the two
 * rows honest about each other: the proposal's `operation_kind` is the
 * capability that was asked for, and its `counterparty` is the terminal that
 * asked. A proposal cannot be pointed at by a call for a different act, or by
 * a call from a different party.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not meter or price. The fields a bill line needs are here — a party,
 * a request, a served instant — because they are the fields a rights decision
 * needs, but nothing counts them and no rate exists to count them against.
 *
 * It does not authenticate. `terminal_id` is asserted by whatever opened the
 * session. The ledger records who a caller said it was, which is what makes a
 * false claim answerable later, and is not the same as knowing.
 *
 * This schema alone does not authorize execution. The terminal service uses
 * existing execution-ledger proposals and real corpus/release foreign keys for
 * its bounded job path. Its READ sink uses these tables plus a separate immutable
 * authenticated session binding, not the generic proposal-writing demonstration.
 */
import {
  CAPABILITIES, CAPABILITY_KINDS,
} from '@/domain/capabilityRegistry';
import {
  CALL_OUTCOMES, SERVED_KINDS, TERMINAL_CLASSES, declarablePurposes,
} from '@/domain/terminalVocabulary';
import { PERMITTED_USES } from '@/domain/corpus';
import { quoted, sqlArray, sqlText } from './ddl';

/**
 * The (class, purpose) pairs a session may carry, derived from the same
 * function the plane admits by rather than listed a second time.
 */
export const DECLARABLE_PAIRS: ReadonlyArray<readonly [string, string]> =
  TERMINAL_CLASSES.flatMap((terminalClass) =>
    declarablePurposes(terminalClass).map((purpose) => [terminalClass, purpose] as const));

const DECLARABLE = DECLARABLE_PAIRS.map(([cls, use]) => `('${cls}', '${use}')`).join(', ');

export const TERMINAL_LEDGER_DDL = `
-- Every capability the substrate declares, seeded from the registry. A call
-- naming one that is not here has nothing to point at.
CREATE TABLE terminal_capability (
  capability_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (${quoted(CAPABILITY_KINDS)})),
  -- What a read hands back; null for anything that is not a read, because a
  -- served kind is a fact about an answer and an operate has none.
  serves text CHECK (serves IS NULL OR serves IN (${quoted(SERVED_KINDS)})),
  touches_estates boolean NOT NULL,
  CONSTRAINT capability_read_serves_something CHECK ((kind = 'READ') = (serves IS NOT NULL)),
  -- No capability serves an estate to anybody. The two-part rule, in a column.
  CONSTRAINT capability_serves_no_estate CHECK (serves IS DISTINCT FROM 'ESTATE'),
  UNIQUE (capability_id, kind),
  UNIQUE (capability_id, touches_estates)
);

-- What a terminal declared when it plugged in.
CREATE TABLE terminal_session (
  session_id text PRIMARY KEY,
  -- Asserted by whatever opened the session, not authenticated. Recording what
  -- a caller said it was is what makes a false claim answerable later.
  terminal_id text NOT NULL CHECK (length(btrim(terminal_id)) > 0),
  terminal_class text NOT NULL CHECK (terminal_class IN (${quoted(TERMINAL_CLASSES)})),
  -- One purpose, from the corpus's own permitted uses. Never a second
  -- vocabulary of scopes that would have to be kept in agreement with this one.
  purpose text NOT NULL CHECK (purpose IN (${quoted(PERMITTED_USES)})),
  -- The corpora it named. Empty is none, never all.
  corpus_scope text[] NOT NULL,
  opened_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,

  -- Generated from declarablePurposes, so a class declaring a purpose it does
  -- not call at is refused by the database and not only by the plane.
  CONSTRAINT session_purpose_is_declarable_by_its_class CHECK ((terminal_class, purpose) IN (${DECLARABLE})),
  CONSTRAINT session_names_a_corpus CHECK (cardinality(corpus_scope) > 0),
  CONSTRAINT session_expires_after_it_opens CHECK (expires_at > opened_at),
  -- For the composite key that ties a call to the window it was made in.
  UNIQUE (session_id, opened_at, expires_at),
  UNIQUE (session_id, terminal_id),
  UNIQUE (session_id, terminal_class)
);

-- One ask. Admitted, refused, or turned into a proposal.
CREATE TABLE served_call (
  call_id text PRIMARY KEY,
  session_id text NOT NULL,
  -- Denormalised from the session and tied to it, so the window check below is
  -- about the window that session actually declared.
  session_opened_at timestamptz NOT NULL,
  session_expires_at timestamptz NOT NULL,
  -- And its class, for the admission rule further down.
  session_class text NOT NULL,

  capability_id text NOT NULL,
  -- Denormalised from the capability and tied to it, so the kind rules are
  -- about the capability the registry actually describes.
  capability_kind text NOT NULL,

  corpus text,
  served_at timestamptz NOT NULL,
  decision text NOT NULL CHECK (decision IN (${quoted(CALL_OUTCOMES)})),
  refusal text,
  proposal_id text,
  because text NOT NULL CHECK (length(btrim(because)) > 0),

  CONSTRAINT call_session FOREIGN KEY (session_id, session_opened_at, session_expires_at)
    REFERENCES terminal_session (session_id, opened_at, expires_at),
  CONSTRAINT call_session_class FOREIGN KEY (session_id, session_class)
    REFERENCES terminal_session (session_id, terminal_class),
  CONSTRAINT call_capability FOREIGN KEY (capability_id, capability_kind)
    REFERENCES terminal_capability (capability_id, kind),
  CONSTRAINT call_proposal FOREIGN KEY (proposal_id) REFERENCES operation_proposal (proposal_id),

  -- A call happened while its session stood. Not before it opened, not after
  -- it expired: a declaration is not extended by calling after it.
  CONSTRAINT call_within_the_session_window CHECK (
    served_at >= session_opened_at AND served_at <= session_expires_at
  ),

  -- Each outcome carries what it must and nothing it must not.
  CONSTRAINT call_refusal_has_a_code CHECK ((decision = 'REFUSED') = (refusal IS NOT NULL)),
  CONSTRAINT call_proposal_when_proposed CHECK ((decision = 'PROPOSAL_REQUIRED') = (proposal_id IS NOT NULL)),

  -- An operate is never answered. Only a read may be recorded as served.
  CONSTRAINT call_only_a_read_is_admitted CHECK (decision <> 'ADMITTED' OR capability_kind = 'READ'),
  -- And an admission into the corpus is never asked for by anyone but the firm.
  CONSTRAINT call_admission_is_the_firms_own_act CHECK (
    capability_kind <> 'ADMIT' OR decision = 'REFUSED' OR session_class = 'FIRM_INTERNAL'
  ),

  UNIQUE (call_id, decision)
);

CREATE INDEX call_by_session ON served_call (session_id, served_at);
CREATE INDEX call_by_terminal_capability ON served_call (capability_id, served_at);
CREATE INDEX session_by_terminal ON terminal_session (terminal_id, opened_at);
`;

/**
 * The guards that cannot be CHECKs, because they span rows.
 *
 * Both are about the proposal an operate ask became: it has to be a proposal
 * for the act that was asked for, by the party that asked. Deferred, because a
 * call and the proposal it points at are written together.
 */
export const TERMINAL_LEDGER_GUARDS = `
CREATE FUNCTION refuse_call_unlike_its_proposal() RETURNS trigger AS $$
DECLARE
  proposed record;
  asked_by text;
BEGIN
  IF NEW.proposal_id IS NULL THEN RETURN NEW; END IF;
  SELECT operation_kind, counterparty INTO proposed FROM operation_proposal WHERE proposal_id = NEW.proposal_id;
  IF proposed.operation_kind IS NULL THEN RETURN NEW; END IF; -- the foreign key refuses this
  IF proposed.operation_kind <> NEW.capability_id THEN
    RAISE EXCEPTION 'call_proposed_another_act:%:asked %, proposed %', NEW.call_id, NEW.capability_id, proposed.operation_kind;
  END IF;
  SELECT terminal_id INTO asked_by FROM terminal_session WHERE session_id = NEW.session_id;
  IF proposed.counterparty <> asked_by THEN
    RAISE EXCEPTION 'call_proposed_for_another_party:%:asked by %, proposed for %', NEW.call_id, asked_by, proposed.counterparty;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER call_proposal_is_the_one_it_made
  AFTER INSERT ON served_call
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refuse_call_unlike_its_proposal();

-- Written once, all three. Every guard above checked a row as it went in; a
-- rewrite would be a row none of them looked at, and a session that could be
-- edited is a session that can widen itself.
CREATE FUNCTION refuse_rewriting_a_terminal_row() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '%_is_written_once:% of %', TG_ARGV[0], TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_is_written_once BEFORE UPDATE OR DELETE ON terminal_session
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_terminal_row('session');
CREATE TRIGGER call_is_written_once BEFORE UPDATE OR DELETE ON served_call
  FOR EACH ROW EXECUTE FUNCTION refuse_rewriting_a_terminal_row('call');
`;

/**
 * The registry as rows.
 *
 * Seeded rather than migrated: the registry is code, the table is its shape in
 * the database, and a drift test holds the two equal. A capability added to
 * one and not the other is a failing test rather than a call the database
 * accepts and the plane refuses.
 */
export function terminalCapabilitySeed(): string {
  return CAPABILITIES.map((capability) =>
    `INSERT INTO terminal_capability (capability_id, kind, serves, touches_estates) VALUES (${sqlText(capability.id)}, '${capability.kind}', ${capability.serves ? `'${capability.serves}'` : 'NULL'}, ${capability.touchesEstates});`)
    .join('\n');
}

/** One session row, from the declaration the plane holds. */
export function sessionRow(session: {
  sessionId: string; terminalId: string; terminalClass: string; purpose: string;
  corpusScope: readonly string[]; openedAt: string; expiresAt: string;
}): string {
  return `INSERT INTO terminal_session (session_id, terminal_id, terminal_class, purpose, corpus_scope, opened_at, expires_at)
    VALUES (${sqlText(session.sessionId)}, ${sqlText(session.terminalId)}, '${session.terminalClass}', '${session.purpose}',
      ${sqlArray(session.corpusScope)}, '${session.openedAt}', '${session.expiresAt}')`;
}

/**
 * One call row, from the receipt the plane returned.
 *
 * The window and the class are copied from the session because the composite
 * keys tie them back; a caller cannot supply a window its session did not
 * declare, because the foreign key would have nothing to point at.
 */
export function servedCallRow(
  callId: string,
  receipt: {
    sessionId: string; terminalClass: string; capability: string | null;
    corpus: string | null; servedAt: string; decision: string; refusal: string | null; because: string;
  },
  session: { openedAt: string; expiresAt: string },
  capabilityKind: string,
  proposalId?: string,
): string {
  return `INSERT INTO served_call (call_id, session_id, session_opened_at, session_expires_at, session_class,
      capability_id, capability_kind, corpus, served_at, decision, refusal, proposal_id, because)
    VALUES (${sqlText(callId)}, ${sqlText(receipt.sessionId)}, '${session.openedAt}', '${session.expiresAt}', '${receipt.terminalClass}',
      ${sqlText(receipt.capability ?? '')}, '${capabilityKind}', ${receipt.corpus ? sqlText(receipt.corpus) : 'NULL'},
      '${receipt.servedAt}', '${receipt.decision}', ${receipt.refusal ? sqlText(receipt.refusal) : 'NULL'},
      ${proposalId ? sqlText(proposalId) : 'NULL'}, ${sqlText(receipt.because)})`;
}

/** The rule, stated once so a reader meets it before the columns. */
export const RECORDED_ASK_RULE =
  'Every ask a terminal makes is a row: the party it declared itself to be, the purpose it declared, the capability it named, the corpus, the instant, and what the substrate did. A refusal is recorded as fully as an answer, because a pattern of being refused is the pattern worth seeing. An operate is never recorded as answered, and the proposal a call points at is a proposal for that act by that party.';
