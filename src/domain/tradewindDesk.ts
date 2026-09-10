/**
 * The Tradewind desk: market observations, strategies, and the boundary
 * between describing a market and acting in one.
 *
 * Three things are wanted here — a scripting surface for testing strategies, a
 * venue that executes them, and mined market data to test them against. All
 * three stand on the same substrate, and it is the part where a mistake is
 * expensive rather than embarrassing, so it is the part built first.
 *
 * THE TWO THINGS THIS FILE EXISTS TO PREVENT
 *
 * A backtest that reads what it could not have known. Every other corpus in
 * this system already carries the rule — "a newly acquired record describing an
 * earlier event does not move the time this system knew it" — and a market is
 * where breaking it stops being a doctrinal error and starts being a number
 * that is wrong in your favour. A strategy deciding at time T may read an
 * observation only if this system held it at T. Not if the exchange stamped it
 * before T: if *this system* had it. The two differ by the ingestion delay, and
 * the difference is the whole of lookahead bias.
 *
 * An order that reaches a venue without someone having armed it. Everything
 * else in this repository describes the world. Execution changes it, and it
 * cannot be un-changed. So arming is a record with an author, a scope and an
 * expiry, and a live order that cannot name one is not an order.
 *
 * WHAT A RUN MAY CLAIM
 *
 * A backtest produces simulated fills. A paper run produces paper fills against
 * live prices. Only a live run produces executed fills. These are three
 * different kinds of evidence about a strategy and the desk never totals them
 * together: a backtest is not a track record, and a strategy that "would have"
 * returned something did not return it.
 *
 * NOTHING HERE IS CONNECTED. The venues below are acquisition candidates on the
 * same four gates as every other source in the programme, plus a fifth that
 * only execution venues carry, and all of them are untested.
 */
import { GATES, type GateId, type GateState } from './industrialCorpus';

/** The clocks a market observation carries. Collapsing any two of them is a bug with a P&L. */
export const MARKET_CLOCKS = [
  { clock: 'eventTime', meaning: 'When the venue says it happened.' },
  { clock: 'publishedAt', meaning: 'When the venue made it available.' },
  { clock: 'ingestedAt', meaning: 'When this system held it. The only clock a decision may read against.' },
] as const;
export type MarketClock = typeof MARKET_CLOCKS[number]['clock'];

/**
 * The rule that makes a backtest mean something.
 *
 * Stated here, enforced in the schema, and checked by the desk before a run is
 * allowed to claim a result.
 */
export const LOOKAHEAD_RULE =
  'A decision at time T may read an observation only if this system held it at T. An exchange timestamp earlier than T is not sufficient: the ingestion delay is real, and reading across it is lookahead.';

export const LOOKAHEAD_LOSS = [
  'Event time earlier than the decision does not mean the data was available at the decision.',
  'A revision that arrived later describes the same event and is a different observation, held from when it arrived.',
  'A backtest that cannot say which observations it read cannot be checked, and is a claim rather than a result.',
] as const;

/** What kind of run produced a result, and what that result is allowed to be called. */
export const RUN_KINDS = ['BACKTEST', 'PAPER', 'LIVE'] as const;
export type RunKind = typeof RUN_KINDS[number];

/** What a fill actually is. The desk never totals across these. */
export const FILL_STANDINGS = ['SIMULATED', 'PAPER', 'EXECUTED'] as const;
export type FillStanding = typeof FILL_STANDINGS[number];

export interface RunContract {
  kind: RunKind;
  produces: FillStanding;
  /** Prices the run decides against. */
  reads: string;
  /** What a result from this run is evidence of. */
  evidenceOf: string;
  /** The claim this run does not support, stated where someone would otherwise make it. */
  doesNotSupport: string;
  /** Whether reaching a venue with an order is possible at all in this kind. */
  canReachVenue: boolean;
}

export const RUN_CONTRACTS: readonly RunContract[] = [
  {
    kind: 'BACKTEST', produces: 'SIMULATED', reads: 'Historical observations, filtered to what this system held at each decision time.',
    evidenceOf: 'How the rules would have behaved over the observations retained, under the declared fill and cost assumptions.',
    doesNotSupport: 'A backtest is not a track record. Nothing was traded and no counterparty was on the other side.',
    canReachVenue: false,
  },
  {
    kind: 'PAPER', produces: 'PAPER', reads: 'Live observations, as they arrive.',
    evidenceOf: 'That the strategy runs against live data at live latency, and what it would have ordered.',
    doesNotSupport: 'A paper fill assumes it was filled. Nothing queued, nothing moved the book, and nothing was rejected.',
    canReachVenue: false,
  },
  {
    kind: 'LIVE', produces: 'EXECUTED', reads: 'Live observations, as they arrive.',
    evidenceOf: 'What was ordered, what filled, at what price, and what it cost.',
    doesNotSupport: 'A live result is evidence about this period and this size. It is not a forecast, and it does not transfer to a larger one.',
    canReachVenue: true,
  },
];

/**
 * The arming record.
 *
 * A live run reaches a venue only while an arming is in force. It is a row with
 * an author, a scope and an expiry, because the three questions after an
 * incident are who turned it on, what were they turning on, and why was it
 * still on. An arming that never expires answers the third one badly.
 */
export const ARMING_STATES = ['DISARMED', 'ARMED'] as const;
export type ArmingState = typeof ARMING_STATES[number];

export const ARMING_RULES = [
  'A live order requires an arming that is in force at the moment the order is placed.',
  'An arming names an author, a strategy, a venue, a maximum size and an expiry. An arming without a bound is not a bound.',
  'Arming is an act, not a configuration default. Nothing arms itself, and no import, migration or restart may leave the desk armed.',
  'Disarming takes effect for orders not yet placed. It does not unwind what already reached the venue, and the desk never implies that it does.',
] as const;

export type VenueRole = 'MARKET_DATA' | 'SCRIPTING' | 'EXECUTION';

/**
 * A fifth gate, carried only by venues that can execute.
 *
 * The other four ask whether a source can be used. This one asks whether this
 * firm is permitted to trade through it, which is a different question with a
 * different answer and a different authority behind it.
 */
export const EXECUTION_GATE = 'EXECUTION_AUTHORIZATION' as const;
export type VenueGateId = GateId | typeof EXECUTION_GATE;

export interface VenueCandidate {
  id: string;
  name: string;
  roles: readonly VenueRole[];
  provides: string;
  proposedRole: string;
  knownLimits: readonly string[];
  gates: Readonly<Record<VenueGateId, GateState>>;
}

const untested = (execution: boolean): Readonly<Record<VenueGateId, GateState>> => Object.freeze({
  ...Object.fromEntries(GATES.map((gate) => [gate, 'NOT_TESTED' as GateState])) as Record<GateId, GateState>,
  ...(execution ? { [EXECUTION_GATE]: 'NOT_TESTED' as GateState } : {}),
}) as Readonly<Record<VenueGateId, GateState>>;

export const VENUE_CANDIDATES: readonly VenueCandidate[] = [
  {
    id: 'tradingview', name: 'TradingView', roles: ['MARKET_DATA', 'SCRIPTING'],
    provides: 'Charting, a scripting environment and market data under its own terms.',
    proposedRole: 'The surface a strategy is written and read on, and a source of quoted series for testing.',
    knownLimits: [
      'Redistribution of its data is governed separately from access to it, and a chart a person can see is not a series this system may store or serve.',
      'A strategy expressed in its scripting language is not portable to an execution venue by itself.',
    ],
    gates: untested(false),
  },
  {
    id: 'apex-protocol', name: 'ApeX Protocol', roles: ['EXECUTION'],
    provides: 'A venue for perpetual contracts, reached programmatically.',
    proposedRole: 'Where a live run places orders, once there is an authorization to place them.',
    knownLimits: [
      'Executing here is a financial act with counterparty, custody and jurisdictional consequences that no gate in this repository evaluates.',
      'Programmatic access implies key custody, and a key that can trade is a key that can lose money if it leaks.',
      'Perpetual contracts carry funding and liquidation mechanics that a spot backtest does not model.',
    ],
    gates: untested(true),
  },
  {
    id: 'mined-market-data', name: 'Mined market and financial series', roles: ['MARKET_DATA'],
    provides: 'Series and documents gathered from public and licensed venues, indexed for retrieval.',
    proposedRole: 'The observation corpus a backtest reads, with every series carrying its three clocks.',
    knownLimits: [
      'Each venue’s terms decide separately whether a series may be stored, derived from, redistributed or trained on.',
      'A scraped series without its ingestion clock cannot support a backtest, because nothing can say what was known when.',
    ],
    gates: untested(false),
  },
];

/** What the desk currently is, derived rather than stored. */
export function deskStanding(venues: readonly VenueCandidate[] = VENUE_CANDIDATES) {
  const gatesOf = (venue: VenueCandidate) => Object.keys(venue.gates) as VenueGateId[];
  const passed = (venue: VenueCandidate) => gatesOf(venue).every((gate) => venue.gates[gate] === 'PASSED');
  return {
    venues: venues.length,
    connected: venues.filter(passed).length,
    executionVenues: venues.filter((venue) => venue.roles.includes('EXECUTION')).length,
    openGates: venues.reduce((total, venue) => total + gatesOf(venue).filter((gate) => venue.gates[gate] !== 'PASSED').length, 0),
    armed: false,
    liveOrdersPlaced: 0,
    coverage: 'DECLARED_VENUES_ONLY' as const,
  };
}

export function runContract(kind: RunKind): RunContract {
  return RUN_CONTRACTS.find((contract) => contract.kind === kind)!;
}

/**
 * Whether an observation may be read by a decision taken at `decisionAt`.
 *
 * The whole of lookahead prevention, as one comparison, kept here so the desk,
 * the schema and any future backtester answer it the same way.
 */
export function readableAt(observation: { ingestedAt: string }, decisionAt: string): boolean {
  return Date.parse(observation.ingestedAt) <= Date.parse(decisionAt);
}
