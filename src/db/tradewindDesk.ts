/**
 * The desk, in the database.
 *
 * Two mistakes on a trading desk cost money rather than credibility, and both
 * are expressible as constraints. So they are constraints, and neither depends
 * on a writer remembering them.
 *
 * LOOKAHEAD IS UNSTORABLE
 *
 * `run_read` records which observations a decision read. It carries the
 * observation's ingestion time denormalised beside it, tied to the real one by
 * a composite foreign key onto `(observation_id, ingested_at)` — so the copy
 * cannot be a different number from the original — and then a plain CHECK does
 * the rest: `observation_ingested_at <= decision_at`. A decision cannot record
 * having read something this system did not yet hold. Not "should not": the
 * row will not go in.
 *
 * That is the whole of lookahead prevention, and it is deliberately about the
 * ingestion clock rather than the exchange clock. An exchange timestamp earlier
 * than the decision proves nothing — the data still had to arrive.
 *
 * AN EXECUTED ORDER CANNOT EXIST WITHOUT AN ARMING IN FORCE
 *
 * Same technique, twice more. `desk_order` carries the arming window
 * denormalised, tied by a composite key to the arming that granted it, with a
 * CHECK that the order was placed inside it. And it carries the run's kind, tied
 * to the run, with a CHECK that the standing matches: a BACKTEST run cannot
 * produce an EXECUTED order, because the pair `('BACKTEST', 'EXECUTED')` is not
 * one the constraint permits.
 *
 * WHAT IS NOT CONSTRAINED, AND WHY
 *
 * The ordering between event time, publication time and ingestion time is not
 * checked. Venue and exchange clocks skew, and a schema that rejected a skewed
 * observation would be discarding real data to enforce a tidiness nobody
 * needs. All three are required to be present — an observation that cannot say
 * when this system got it is useless to a backtest — and the skew is retained
 * to be looked at rather than refused.
 */
import { FILL_STANDINGS, RUN_CONTRACTS, RUN_KINDS } from '@/domain/tradewindDesk';

const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * The permitted (run kind, fill standing) pairs, derived from the run contracts
 * rather than listed again. A fourth kind of run changes what a run may produce
 * by existing.
 */
const RUN_PRODUCES = RUN_CONTRACTS.map((contract) => `('${contract.kind}', '${contract.produces}')`).join(', ');

export const TRADEWIND_DESK_DDL = `
CREATE TABLE market_observation (
  observation_id text PRIMARY KEY,
  venue text NOT NULL CHECK (length(btrim(venue)) > 0),
  symbol text NOT NULL CHECK (length(btrim(symbol)) > 0),
  series text NOT NULL CHECK (length(btrim(series)) > 0),
  -- Three clocks, all required. Their ordering is not constrained: venue and
  -- exchange clocks skew, and refusing a skewed observation would discard real
  -- data. The skew is kept to be looked at.
  event_time timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  -- The only clock a decision may read against.
  ingested_at timestamptz NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The composite a read points at, so a read cannot claim a different
  -- ingestion time from the one the observation has.
  UNIQUE (observation_id, ingested_at)
);

CREATE TABLE strategy_run (
  run_id text PRIMARY KEY,
  strategy_id text NOT NULL CHECK (length(btrim(strategy_id)) > 0),
  kind text NOT NULL CHECK (kind IN (${quoted(RUN_KINDS)})),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  notes text,
  CONSTRAINT strategy_run_interval CHECK (finished_at IS NULL OR finished_at >= started_at),
  UNIQUE (run_id, kind)
);

CREATE TABLE arming (
  arming_id text PRIMARY KEY,
  -- Who turned it on. The first question after an incident.
  author text NOT NULL CHECK (length(btrim(author)) > 0),
  strategy_id text NOT NULL,
  venue text NOT NULL,
  -- What they were turning on. An arming without a bound is not a bound.
  max_order_size numeric NOT NULL CHECK (max_order_size > 0),
  armed_at timestamptz NOT NULL,
  -- And why it was still on. An arming that never expires answers this badly.
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT arming_expires_after_arming CHECK (expires_at > armed_at),
  CONSTRAINT arming_revoked_within_window CHECK (revoked_at IS NULL OR (revoked_at >= armed_at AND revoked_at <= expires_at)),
  UNIQUE (arming_id, armed_at, expires_at)
);

CREATE TABLE run_read (
  read_id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES strategy_run (run_id),
  decision_at timestamptz NOT NULL,
  observation_id text NOT NULL,
  -- Denormalised, and tied to the real one so it cannot drift from it.
  observation_ingested_at timestamptz NOT NULL,
  CONSTRAINT run_read_observation FOREIGN KEY (observation_id, observation_ingested_at)
    REFERENCES market_observation (observation_id, ingested_at),
  -- The whole of lookahead prevention.
  CONSTRAINT run_read_no_lookahead CHECK (observation_ingested_at <= decision_at),
  CONSTRAINT run_read_once UNIQUE (run_id, decision_at, observation_id)
);

CREATE TABLE desk_order (
  order_id text PRIMARY KEY,
  run_id text NOT NULL,
  -- Denormalised from the run, tied to it, so the pair check below is about the
  -- run's actual kind.
  run_kind text NOT NULL,
  venue text NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  size numeric NOT NULL CHECK (size > 0),
  limit_price numeric,
  standing text NOT NULL CHECK (standing IN (${quoted(FILL_STANDINGS)})),
  placed_at timestamptz NOT NULL,
  -- Present only on an executed order, and then it must name an arming that was
  -- in force when the order was placed.
  arming_id text,
  arming_armed_at timestamptz,
  arming_expires_at timestamptz,
  venue_order_ref text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT desk_order_run FOREIGN KEY (run_id, run_kind) REFERENCES strategy_run (run_id, kind),
  -- A backtest cannot produce an executed order, because that pair is not here.
  CONSTRAINT desk_order_standing_matches_run CHECK ((run_kind, standing) IN (${RUN_PRODUCES})),

  CONSTRAINT desk_order_arming FOREIGN KEY (arming_id, arming_armed_at, arming_expires_at)
    REFERENCES arming (arming_id, armed_at, expires_at),
  -- An executed order names an arming; anything else names none.
  CONSTRAINT desk_order_executed_is_armed CHECK (
    (standing = 'EXECUTED') = (arming_id IS NOT NULL)
  ),
  CONSTRAINT desk_order_arming_columns_together CHECK (
    (arming_id IS NULL AND arming_armed_at IS NULL AND arming_expires_at IS NULL)
    OR (arming_id IS NOT NULL AND arming_armed_at IS NOT NULL AND arming_expires_at IS NOT NULL)
  ),
  -- And it was placed while that arming was in force.
  CONSTRAINT desk_order_placed_while_armed CHECK (
    arming_id IS NULL OR (placed_at >= arming_armed_at AND placed_at < arming_expires_at)
  ),
  -- A venue reference is the venue's receipt. Only an executed order can have one.
  CONSTRAINT desk_order_reference_only_when_executed CHECK (standing = 'EXECUTED' OR venue_order_ref IS NULL)
);

CREATE INDEX market_observation_series ON market_observation (venue, symbol, series, ingested_at);
CREATE INDEX run_read_by_run ON run_read (run_id, decision_at);
CREATE INDEX desk_order_by_run ON desk_order (run_id);
`;

/** Every column the DDL creates, by table, for the drift test against the query definitions. */
export function deskDdlColumns(ddl = TRADEWIND_DESK_DDL): Record<string, string[]> {
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
