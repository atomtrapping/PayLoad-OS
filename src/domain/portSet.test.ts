import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { CLOSURE_LOSS } from './eventClosure';
import {
  COMPOSITIONAL_HIERARCHY, MEMBERSHIP_IS_A_RULING, MEMBERSHIP_MEANING, PORT_SET_SEQUENCE,
  SETS_ARE_PROJECTIONS, SET_JOINS, SET_OBJECTS, SET_PRODUCTS, portSetStanding,
} from './portSet';

describe('membership is adjudicated, not observed', () => {
  it('gives every membership class a meaning that says what it is not', () => {
    const classes = Object.keys(MEMBERSHIP_MEANING);
    expect(classes).toHaveLength(6);
    for (const meaning of Object.values(MEMBERSHIP_MEANING)) expect(meaning.trim().length).toBeGreaterThan(50);
    // The two most-confused calls carry their confusion explicitly.
    expect(MEMBERSHIP_MEANING.IN_APPROACH).toMatch(/not yet an arrival/);
    expect(MEMBERSHIP_MEANING.OUT).toMatch(/Departure is a ruling too/);
  });

  it('supersedes a membership call rather than overwriting it', () => {
    expect(MEMBERSHIP_IS_A_RULING.claim).toMatch(/ambiguous/);
    expect(MEMBERSHIP_IS_A_RULING.supersession).toMatch(/correction on the set/);
    expect(MEMBERSHIP_IS_A_RULING.state).toBe('ABSENT');
  });

  it('stamps both clocks, which is what makes a set series backtestable', () => {
    expect(MEMBERSHIP_IS_A_RULING.bothClocks).toMatch(/differ by hours/);
    expect(MEMBERSHIP_IS_A_RULING.backtestable).toMatch(/stamped its own knowledge time/);
  });
});

describe('the set objects are series, and they are projections', () => {
  it('gives each what it prices and how an estimator reads it', () => {
    expect(SET_OBJECTS).toHaveLength(6);
    for (const o of SET_OBJECTS) {
      expect(o.prices.trim().length).toBeGreaterThan(40);
      expect(o.asAState.trim().length).toBeGreaterThan(40);
    }
    expect(SET_OBJECTS.find((o) => o.id === 'BERTH_OCCUPANCY')!.prices).toMatch(/rather than nameplate/);
    expect(SET_OBJECTS.find((o) => o.id === 'QUEUE_DEPTH')!.asAState).toMatch(/innovation spectrum/);
    expect(SET_OBJECTS.find((o) => o.id === 'FLOW_BALANCE')!.asAState).toMatch(/stiff-soft/);
  });

  it('derives the aggregates so a correction moves them', () => {
    expect(SETS_ARE_PROJECTIONS.rule).toMatch(/not stored state/);
    expect(SETS_ARE_PROJECTIONS.because).toMatch(/no longer follows from anything/);
  });
});

describe('joins are set intersections in time, each with its own hazard', () => {
  it('renders a coverage gap as coverage rather than as a finding', () => {
    const imagery = SET_JOINS.find((j) => j.id === 'IMAGERY')!;
    expect(imagery.yields).toMatch(/off-transponder economy/);
    expect(imagery.hazard).toMatch(/render void as void/);
  });

  it('refuses to read coincidence in time as attribution', () => {
    const documents = SET_JOINS.find((j) => j.id === 'DOCUMENTS')!;
    expect(documents.yields).toMatch(/cross-line join/);
    expect(documents.hazard).toMatch(/manufactures causes/);
    const pair = SET_JOINS.find((j) => j.id === 'PORT_PAIR')!;
    expect(pair.hazard).toMatch(/resolution again/);
  });
});

describe('the construction lifts, and the archive is the asset', () => {
  it('names one grammar for four scales', () => {
    expect(COMPOSITIONAL_HIERARCHY.levels.map((l) => l.level)).toEqual(['Port', 'Corridor', 'Lane', 'Network']);
    expect(COMPOSITIONAL_HIERARCHY.why).toMatch(/rather than a bespoke model per scale/);
  });

  it('locates the differentiator in governance and the asset in time', () => {
    expect(SET_PRODUCTS.differentiator).toMatch(/inputs are commodities/);
    expect(SET_PRODUCTS.notThis).toMatch(/established vendors already sell/);
    expect(SET_PRODUCTS.archiveGated).toMatch(/only time can buy/);
    // The dependence rule is the implemented one, not a restatement.
    expect(SET_PRODUCTS.dependence).toBe(CLOSURE_LOSS);
  });

  it('puts the grammar before the feeds, and says why', () => {
    expect(PORT_SET_SEQUENCE[0]).toMatch(/membership event grammar first/);
    expect(PORT_SET_SEQUENCE[PORT_SET_SEQUENCE.length - 1]).toMatch(/rather than as a dot/);
  });
});

describe('what exists', () => {
  it('holds no port and no ruling, over a population that is not zero', () => {
    const standing = portSetStanding(CARAVAN_CORPUS);
    expect(standing.ports).toBe(0);
    expect(standing.membershipRulings).toBe(0);
    expect(standing.setSeries).toBe(0);
    expect(standing.statement).toMatch(/a place a set would be defined over, and not yet a set/);
  });
});
