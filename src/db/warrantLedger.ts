/**
 * The warrant log and the exception desk, in the database.
 *
 * `src/db/executionLedger.ts` already holds the proposal, the authorization,
 * the operation, the attempt and the reconciliation. This adds the two things
 * that only matter once the system is doing real work, and the desk that owns
 * what falls outside.
 *
 * A RESERVATION HOLDS; A CHECK DOES NOT
 *
 * The subtle failure: two concurrent actions each pass a limit test and
 * together exceed the limit. Neither writer did anything wrong and the budget
 * is gone. So a budget is a ledger of movements rather than a number somebody
 * consults — each reservation carries the balance before it, tied by composite
 * key to the previous movement's balance after, and the arithmetic is checked.
 * A chain of tied balances cannot interleave: the second concurrent writer
 * finds the balance it read is no longer the latest, and its row does not go
 * in.
 *
 * A WARRANT IS WRITTEN OR THE TRANSITION DID NOT HAPPEN
 *
 * Seven questions, all non-blank, tied to the attempt they describe. A warrant
 * missing one of them is a log line, and a transition with no warrant is a
 * change nobody can account for — which is the state this whole architecture
 * exists to make impossible.
 *
 * AN EXCEPTION IS OWNED
 *
 * Every exception names an owner and a resolution path, and none of the paths
 * is "retry". An unresolved one stays open; a resolved one says what was done.
 * A desk with unowned items is a desk that has decided unusual cases are
 * somebody's spare time.
 *
 * AND NOTHING HAS TRANSITIONED
 *
 * A warrant ties to an execution attempt, and no attempt exists because no
 * authorization can be written — the execution ledger's release key has
 * nothing to point at.
 */
import { quoted } from './ddl';
import {
  EXCEPTION_KINDS, RESERVATION_STATES, WARRANT_QUESTIONS,
} from '@/domain/warrantLog';

/** The seven questions as column names, derived so the two cannot drift. */
export const WARRANT_COLUMNS: readonly string[] = WARRANT_QUESTIONS.map((question) =>
  question.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, ''));

const warrantColumnDdl = WARRANT_COLUMNS
  .map((column) => `  ${column} text NOT NULL CHECK (length(btrim(${column})) > 0),`)
  .join('\n');

export const WARRANT_LEDGER_DDL = `
-- A budget that can actually be exceeded, so it is held rather than consulted.
CREATE TABLE shared_budget (
  budget_id text PRIMARY KEY,
  purpose text NOT NULL CHECK (length(btrim(purpose)) > 0),
  limit_minor bigint NOT NULL CHECK (limit_minor > 0),
  opened_at timestamptz NOT NULL,
  UNIQUE (budget_id, limit_minor)
);

-- One movement against a budget. The chain of tied balances is what makes two
-- concurrent holds impossible rather than merely unlikely.
CREATE TABLE budget_reservation (
  reservation_id text PRIMARY KEY,
  budget_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 0),
  state text NOT NULL CHECK (state IN (${quoted(RESERVATION_STATES)})),
  -- Negative to hold, positive to release. A consumption is a hold that ended.
  delta_minor bigint NOT NULL,
  balance_before_minor bigint NOT NULL CHECK (balance_before_minor >= 0),
  balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
  -- The movement this one follows. Null only at the opening.
  follows_reservation_id text,
  follows_balance_after_minor bigint,
  reserved_at timestamptz NOT NULL,

  CONSTRAINT reservation_budget FOREIGN KEY (budget_id) REFERENCES shared_budget (budget_id),
  -- Tied to the previous movement's closing balance, so a writer that read a
  -- stale balance cannot commit against it.
  CONSTRAINT reservation_follows FOREIGN KEY (follows_reservation_id, follows_balance_after_minor)
    REFERENCES budget_reservation (reservation_id, balance_after_minor),
  CONSTRAINT reservation_opening_columns CHECK (
    (follows_reservation_id IS NULL) = (follows_balance_after_minor IS NULL)
  ),
  CONSTRAINT reservation_line_opens_once CHECK ((follows_reservation_id IS NULL) = (sequence = 0)),
  -- The balance it started from is the one the previous movement left.
  CONSTRAINT reservation_continues_the_balance CHECK (
    follows_balance_after_minor IS NULL OR follows_balance_after_minor = balance_before_minor
  ),
  CONSTRAINT reservation_arithmetic CHECK (balance_after_minor = balance_before_minor + delta_minor),
  CONSTRAINT reservation_hold_is_a_debit CHECK ((state = 'HELD') = (delta_minor < 0)),
  -- One movement may follow any given movement. Two concurrent holds both
  -- naming the same predecessor is exactly the race, and it is refused here.
  CONSTRAINT reservation_one_successor UNIQUE (follows_reservation_id),
  CONSTRAINT reservation_sequence_once UNIQUE (budget_id, sequence),
  UNIQUE (reservation_id, balance_after_minor),
  -- So a dispatch can tie to a hold's size rather than repeat it.
  UNIQUE (reservation_id, delta_minor)
);

-- What changed, and everything a later reader needs to account for it.
CREATE TABLE transition_warrant (
  warrant_id text PRIMARY KEY,
  attempt_id text NOT NULL UNIQUE REFERENCES execution_attempt (attempt_id),
${warrantColumnDdl}
  written_at timestamptz NOT NULL
);

-- What fell outside the envelope, and who owns it.
CREATE TABLE desk_exception (
  exception_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (${quoted(EXCEPTION_KINDS)})),
  -- Named, because an exception with no owner is nobody's.
  owner text NOT NULL CHECK (length(btrim(owner)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  resolution_path text NOT NULL CHECK (length(btrim(resolution_path)) > 0),
  -- None of the paths is a retry. A retry after an unknown outcome is how one
  -- booking becomes two, and it is not a resolution.
  CONSTRAINT exception_is_not_resolved_by_retrying CHECK (
    lower(resolution_path) NOT LIKE '%retry%' AND lower(resolution_path) NOT LIKE '%try again%'
  ),
  raised_at timestamptz NOT NULL,
  resolved_at timestamptz,
  resolution text,
  CONSTRAINT exception_resolution_columns_together CHECK ((resolved_at IS NULL) = (resolution IS NULL)),
  CONSTRAINT exception_resolved_after_raised CHECK (resolved_at IS NULL OR resolved_at >= raised_at)
);

CREATE INDEX reservation_by_budget ON budget_reservation (budget_id, sequence);
CREATE INDEX exception_open ON desk_exception (kind, raised_at) WHERE resolved_at IS NULL;
`;

