/**
 * The desk's two expensive mistakes, against an actual PostgreSQL engine.
 *
 * Raw SQL throughout. There is no store in front of these tables yet, and that
 * is the point of testing them this way: the guarantees have to hold for a
 * writer that has never heard of a store — the backtester somebody writes next
 * month, the import that loads a year of history, the operator fixing a row by
 * hand at the end of a bad day.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { RUN_CONTRACTS } from '@/domain/tradewindDesk';
import { TRADEWIND_DESK_DDL, deskDdlColumns } from './tradewindDesk';

let client: PGlite;
let scenario = 0;

/* A day on the desk. The ingestion delay is the whole subject, so it is explicit. */
const EVENT = '2026-03-02T14:00:00.000Z';
const PUBLISHED = '2026-03-02T14:00:00.400Z';
const INGESTED = '2026-03-02T14:00:02.000Z';
const BEFORE_INGEST = '2026-03-02T14:00:01.000Z';
const AFTER_INGEST = '2026-03-02T14:00:03.000Z';

beforeAll(async () => { client = new PGlite(); await client.waitReady; });
afterAll(async () => { await client?.close(); });

beforeEach(async () => {
  scenario += 1;
  await client.exec(`CREATE SCHEMA desk_${scenario}; SET search_path TO desk_${scenario};${TRADEWIND_DESK_DDL}`);
  await sql(`INSERT INTO market_observation (observation_id, venue, symbol, series, event_time, published_at, ingested_at)
    VALUES ('OBS-1', 'apex', 'ETH-USDC', 'trade', '${EVENT}', '${PUBLISHED}', '${INGESTED}')`);
});

async function sql(statement: string) {
  await client.exec(`SET search_path TO desk_${scenario}; ${statement}`);
}
async function rows(query: string) {
  // `query` takes one statement, so the search path is set on its own.
  await client.query(`SET search_path TO desk_${scenario}`);
  const result = await client.query(query);
  return result.rows as Record<string, unknown>[];
}

const run = (id: string, kind: string) =>
  sql(`INSERT INTO strategy_run (run_id, strategy_id, kind, started_at) VALUES ('${id}', 'strat-1', '${kind}', '${EVENT}')`);

const arming = (id: string, armedAt = EVENT, expiresAt = AFTER_INGEST) =>
  sql(`INSERT INTO arming (arming_id, author, strategy_id, venue, max_order_size, armed_at, expires_at)
    VALUES ('${id}', 'operator:jo', 'strat-1', 'apex', 5, '${armedAt}', '${expiresAt}')`);

describe('a decision cannot read what this system did not hold', () => {
  beforeEach(() => run('RUN-BT', 'BACKTEST'));

  /*
   * The one that matters. A decision a second before the data arrived is the
   * ordinary shape of lookahead — the exchange stamped it earlier, so it looks
   * available, and it was not.
   */
  it('rejects a read whose observation arrived after the decision', async () => {
    await expect(sql(`INSERT INTO run_read (read_id, run_id, decision_at, observation_id, observation_ingested_at)
      VALUES ('R1', 'RUN-BT', '${BEFORE_INGEST}', 'OBS-1', '${INGESTED}')`))
      .rejects.toThrow(/run_read_no_lookahead/);
  });

  it('accepts the same read once the decision is after the arrival', async () => {
    await sql(`INSERT INTO run_read (read_id, run_id, decision_at, observation_id, observation_ingested_at)
      VALUES ('R1', 'RUN-BT', '${AFTER_INGEST}', 'OBS-1', '${INGESTED}')`);
    expect(await rows(`SELECT read_id FROM run_read`)).toHaveLength(1);
  });

  /*
   * And the copy cannot lie. Backdating the denormalised ingestion time is the
   * obvious way around the check, so it is tied to the observation by a
   * composite key: an earlier number is simply not a row that exists.
   */
  it('rejects a read that backdates the arrival to get under the decision', async () => {
    await expect(sql(`INSERT INTO run_read (read_id, run_id, decision_at, observation_id, observation_ingested_at)
      VALUES ('R1', 'RUN-BT', '${BEFORE_INGEST}', 'OBS-1', '${EVENT}')`))
      .rejects.toThrow(/run_read_observation|foreign key/i);
  });

  it('requires an observation to say when it arrived at all', async () => {
    await expect(sql(`INSERT INTO market_observation (observation_id, venue, symbol, series, event_time, published_at)
      VALUES ('OBS-2', 'apex', 'ETH-USDC', 'trade', '${EVENT}', '${PUBLISHED}')`))
      .rejects.toThrow(/ingested_at/);
  });

  /*
   * Skew is retained rather than refused. A venue clock that runs ahead of the
   * exchange is a fact about the venue, and discarding the observation would
   * lose real data to enforce a tidiness nothing needs.
   */
  it('keeps an observation whose venue clock ran ahead of the exchange', async () => {
    await sql(`INSERT INTO market_observation (observation_id, venue, symbol, series, event_time, published_at, ingested_at)
      VALUES ('OBS-SKEW', 'apex', 'ETH-USDC', 'trade', '${PUBLISHED}', '${EVENT}', '${INGESTED}')`);
    expect(await rows(`SELECT observation_id FROM market_observation WHERE observation_id = 'OBS-SKEW'`)).toHaveLength(1);
  });
});

describe('what a run may produce', () => {
  /*
   * A backtest that records an executed fill is a track record that never
   * happened. The permitted pairs come from the run contracts, so this is the
   * same statement the domain makes, enforced.
   */
  it('refuses an executed order from a backtest', async () => {
    await run('RUN-BT', 'BACKTEST');
    await arming('ARM-1');
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at)
      VALUES ('O1', 'RUN-BT', 'BACKTEST', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-1', '${EVENT}', '${AFTER_INGEST}')`))
      .rejects.toThrow(/desk_order_standing_matches_run/);
  });

  it('refuses a paper order that claims to be simulated, and every other mismatch', async () => {
    await run('RUN-PAPER', 'PAPER');
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at)
      VALUES ('O1', 'RUN-PAPER', 'PAPER', 'apex', 'ETH-USDC', 'BUY', 1, 'SIMULATED', '${INGESTED}')`))
      .rejects.toThrow(/desk_order_standing_matches_run/);
  });

  it('accepts each run producing exactly what its contract says it produces', async () => {
    for (const contract of RUN_CONTRACTS) {
      await run(`RUN-${contract.kind}`, contract.kind);
      const armed = contract.produces === 'EXECUTED';
      if (armed) await arming(`ARM-${contract.kind}`);
      await sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at${armed ? ', arming_id, arming_armed_at, arming_expires_at' : ''})
        VALUES ('O-${contract.kind}', 'RUN-${contract.kind}', '${contract.kind}', 'apex', 'ETH-USDC', 'BUY', 1, '${contract.produces}', '${INGESTED}'${armed ? `, 'ARM-${contract.kind}', '${EVENT}', '${AFTER_INGEST}'` : ''})`);
    }
    expect(await rows(`SELECT order_id FROM desk_order`)).toHaveLength(RUN_CONTRACTS.length);
  });

  it('refuses an order against a run that does not exist', async () => {
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at)
      VALUES ('O1', 'RUN-GHOST', 'BACKTEST', 'apex', 'ETH-USDC', 'BUY', 1, 'SIMULATED', '${INGESTED}')`))
      .rejects.toThrow(/desk_order_run|foreign key/i);
  });
});

describe('an executed order cannot exist without an arming in force', () => {
  beforeEach(() => run('RUN-LIVE', 'LIVE'));

  it('refuses an executed order naming no arming', async () => {
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}')`))
      .rejects.toThrow(/desk_order_executed_is_armed/);
  });

  it('refuses an executed order naming an arming that does not exist', async () => {
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-GHOST', '${EVENT}', '${AFTER_INGEST}')`))
      .rejects.toThrow(/desk_order_arming|foreign key/i);
  });

  /* The window is the point. An arming that has run out is not an arming. */
  it('refuses an order placed after its arming expired', async () => {
    await arming('ARM-1', EVENT, BEFORE_INGEST);
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-1', '${EVENT}', '${BEFORE_INGEST}')`))
      .rejects.toThrow(/desk_order_placed_while_armed/);
  });

  it('refuses an order placed before its arming began', async () => {
    await arming('ARM-1', AFTER_INGEST, '2026-03-02T15:00:00.000Z');
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-1', '${AFTER_INGEST}', '2026-03-02T15:00:00.000Z')`))
      .rejects.toThrow(/desk_order_placed_while_armed/);
  });

  it('refuses an order that widens the window it was granted', async () => {
    await arming('ARM-1', EVENT, BEFORE_INGEST);
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-1', '${EVENT}', '2026-03-02T23:00:00.000Z')`))
      .rejects.toThrow(/desk_order_arming|foreign key/i);
  });

  it('accepts an order inside the window, and records the venue’s receipt', async () => {
    await arming('ARM-1');
    await sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at, venue_order_ref)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-1', '${EVENT}', '${AFTER_INGEST}', 'apex:8891')`);
    expect(await rows(`SELECT venue_order_ref FROM desk_order`)).toEqual([{ venue_order_ref: 'apex:8891' }]);
  });

  it('refuses a venue receipt on anything that was not executed', async () => {
    await run('RUN-BT2', 'BACKTEST');
    await expect(sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, venue_order_ref)
      VALUES ('O2', 'RUN-BT2', 'BACKTEST', 'apex', 'ETH-USDC', 'BUY', 1, 'SIMULATED', '${INGESTED}', 'apex:8891')`))
      .rejects.toThrow(/desk_order_reference_only_when_executed/);
  });
});

describe('an arming is a bounded act', () => {
  it('refuses one with no author, no size or no window', async () => {
    await expect(sql(`INSERT INTO arming (arming_id, author, strategy_id, venue, max_order_size, armed_at, expires_at)
      VALUES ('A', '   ', 's', 'apex', 1, '${EVENT}', '${AFTER_INGEST}')`)).rejects.toThrow();
    await expect(sql(`INSERT INTO arming (arming_id, author, strategy_id, venue, max_order_size, armed_at, expires_at)
      VALUES ('A', 'operator:jo', 's', 'apex', 0, '${EVENT}', '${AFTER_INGEST}')`)).rejects.toThrow(/max_order_size/);
    await expect(sql(`INSERT INTO arming (arming_id, author, strategy_id, venue, max_order_size, armed_at, expires_at)
      VALUES ('A', 'operator:jo', 's', 'apex', 1, '${AFTER_INGEST}', '${EVENT}')`)).rejects.toThrow(/arming_expires_after_arming/);
  });

  /*
   * Disarming does not reach back. An order already at the venue stays on the
   * record, and the desk never implies it was recalled.
   */
  it('keeps an order that was placed before the arming was revoked', async () => {
    await run('RUN-LIVE', 'LIVE');
    await arming('ARM-1');
    await sql(`INSERT INTO desk_order (order_id, run_id, run_kind, venue, symbol, side, size, standing, placed_at, arming_id, arming_armed_at, arming_expires_at)
      VALUES ('O1', 'RUN-LIVE', 'LIVE', 'apex', 'ETH-USDC', 'BUY', 1, 'EXECUTED', '${INGESTED}', 'ARM-1', '${EVENT}', '${AFTER_INGEST}')`);
    await sql(`UPDATE arming SET revoked_at = '${AFTER_INGEST}' WHERE arming_id = 'ARM-1'`);
    expect(await rows(`SELECT order_id FROM desk_order`)).toHaveLength(1);
  });
});

describe('the desk starts disarmed and empty', () => {
  it('holds no arming, no run and no order until something writes one', async () => {
    expect(await rows(`SELECT arming_id FROM arming`)).toEqual([]);
    expect(await rows(`SELECT run_id FROM strategy_run`)).toEqual([]);
    expect(await rows(`SELECT order_id FROM desk_order`)).toEqual([]);
  });

  it('derives its permitted pairs from the run contracts rather than listing them again', () => {
    for (const contract of RUN_CONTRACTS) {
      expect(TRADEWIND_DESK_DDL).toContain(`('${contract.kind}', '${contract.produces}')`);
    }
    // And no other pairing is permitted anywhere in the statement.
    expect(TRADEWIND_DESK_DDL).not.toContain("('BACKTEST', 'EXECUTED')");
    expect(deskDdlColumns()['desk_order']).toContain('arming_id');
    expect(deskDdlColumns()['market_observation']).toContain('ingested_at');
  });
});
