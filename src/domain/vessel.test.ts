import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { IDENTIFIER_FAMILIES } from './identity';
import { HARDNESS_RULE } from './constraints';
import { CLOSURE_METHOD } from './eventClosure';
import {
  ADVERSARIAL_IDENTITY, CLOSURE_IS_THE_MEASUREMENT, VESSEL_CHANNELS, VESSEL_CONSTRAINTS,
  VESSEL_JOINS, VESSEL_SEQUENCE, VESSEL_STATE, vesselStanding,
} from './vessel';

describe('the vessel is state, not a feed', () => {
  it('names each state component once, and says which the corpus can carry', () => {
    const ids = VESSEL_STATE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Position is the only one the record contract already holds.
    expect(VESSEL_STATE.filter((c) => c.carried).map((c) => c.id)).toEqual(['POSITION']);
    for (const c of VESSEL_STATE) {
      expect(c.why.trim().length).toBeGreaterThan(40);
      expect(c.here.trim().length).toBeGreaterThan(6);
    }
  });

  it('treats the current as estimated state rather than as nuisance', () => {
    const drift = VESSEL_STATE.find((c) => c.id === 'SET_AND_DRIFT')!;
    expect(drift.why).toMatch(/noise attributed to the vessel/);
    expect(drift.why).toMatch(/stops corrupting the speed signal/);
  });
});

describe('channels, and the one that is not an observation', () => {
  it('types dispatch as a prior so it cannot be ingested as a fix', () => {
    const dispatch = VESSEL_CHANNELS.find((c) => c.id === 'DISPATCH')!;
    expect(dispatch.kind).toBe('PRIOR');
    expect(dispatch.fixes).toMatch(/^Nothing/);
    expect(dispatch.failureMode).toMatch(/most common error in this domain/);
    // Everything else is an observation.
    expect(VESSEL_CHANNELS.filter((c) => c.kind === 'OBSERVATION')).toHaveLength(4);
  });

  it('gives every channel the way it fails, because fusion turns on that', () => {
    for (const c of VESSEL_CHANNELS) {
      expect(c.failureMode.trim().length).toBeGreaterThan(60);
      expect(c.here.trim().length).toBeGreaterThan(6);
    }
    // Self-report is the claimant's evidence class, not a disinterested one.
    expect(VESSEL_CHANNELS.find((c) => c.id === 'AIS')!.failureMode).toMatch(/self-report/);
    // Radar detects a hull; naming it is a resolution decision.
    expect(VESSEL_CHANNELS.find((c) => c.id === 'SAR')!.failureMode).toMatch(/resolution decision, not a detection/);
    // An optical gap is explained, not missing.
    expect(VESSEL_CHANNELS.find((c) => c.id === 'OPTICAL')!.failureMode).toMatch(/explained, not missing/);
  });
});

describe('constraints at their declared hardness', () => {
  it('never makes a claim about the world hard', () => {
    expect(VESSEL_CONSTRAINTS.some((c) => c.hardness === 'HARD')).toBe(false);
    expect(HARDNESS_RULE.HARD).toMatch(/Nothing measured and nothing regulatory/);
    for (const c of VESSEL_CONSTRAINTS) expect(c.note.trim().length).toBeGreaterThan(40);
  });

  it('covers physics, law and contract, and keeps a charter term a prior', () => {
    expect(new Set(VESSEL_CONSTRAINTS.map((c) => c.family))).toEqual(new Set(['PHYSICS', 'LAW', 'COMMERCIAL']));
    expect(VESSEL_CONSTRAINTS.find((c) => c.family === 'COMMERCIAL')!.note).toMatch(/never a constraint on the world/);
    // The datum trap reaches this line through charted depth.
    expect(VESSEL_CONSTRAINTS.find((c) => c.statement.includes('under-keel'))!.note).toMatch(/vertical datum/);
  });
});

describe('five joins, five different epistemic operations', () => {
  it('names each with what it yields and the mistake it invites', () => {
    expect(VESSEL_JOINS).toHaveLength(5);
    for (const j of VESSEL_JOINS) {
      expect(j.operation.trim().length).toBeGreaterThan(50);
      expect(j.yields.trim().length).toBeGreaterThan(60);
      expect(j.hazard.trim().length).toBeGreaterThan(60);
    }
  });

  it('constructs a port call rather than asserting one', () => {
    const berth = VESSEL_JOINS.find((j) => j.id === 'BERTH_GEOMETRY')!;
    expect(berth.yields).toMatch(/approach, occupancy, draft change, departure/);
    expect(berth.hazard).toMatch(/constructed event, never a measurement/);
  });

  it('keeps the imagery calibration from becoming circular', () => {
    const satellite = VESSEL_JOINS.find((j) => j.id === 'SATELLITE')!;
    expect(satellite.operation).toMatch(/Two directions at once/);
    expect(satellite.hazard).toMatch(/calibration becomes circular/);
  });

  it('holds the intent-versus-track divergence open instead of resolving it', () => {
    const dispatch = VESSEL_JOINS.find((j) => j.id === 'DISPATCH')!;
    expect(dispatch.hazard).toMatch(/destroys the signal/);
    expect(dispatch.yields).toMatch(/both sides intact/);
  });
});

describe('the closure residual is the measurement', () => {
  it('states what the residual is worth, and defers the mechanism to the module that implements it', () => {
    expect(CLOSURE_IS_THE_MEASUREMENT.isThreeThings).toHaveLength(3);
    expect(CLOSURE_IS_THE_MEASUREMENT.computedBy).toContain(CLOSURE_METHOD);
    expect(CLOSURE_IS_THE_MEASUREMENT.whyItIsTheMoat).toMatch(/aggregators already sell/);
    expect(CLOSURE_IS_THE_MEASUREMENT.state).toBe('ABSENT');
    expect(CLOSURE_IS_THE_MEASUREMENT.here).toMatch(/no event has ever been closed/);
  });

  it('locates the moat in resolved identity rather than in ingestion', () => {
    expect(ADVERSARIAL_IDENTITY.moat).toMatch(/Not ingestion/);
    expect(ADVERSARIAL_IDENTITY.requires).toMatch(/resolution decision object, which is absent/);
  });
});

describe('what exists', () => {
  it('holds nothing, and reads the declared identifiers from the identity family', () => {
    const standing = vesselStanding(CARAVAN_CORPUS);
    expect(standing.vessels).toBe(0);
    expect(standing.channels).toBe(0);
    expect(standing.tracks).toBe(0);
    expect(standing.portCalls).toBe(0);
    const caravan = IDENTIFIER_FAMILIES.find((f) => f.domain === 'CARAVAN')!;
    expect(standing.declaredIdentifiers).toEqual(caravan.identifiers.filter((i) => i.state === 'DECLARED').map((i) => i.id));
    expect(standing.statement).toMatch(/declared ahead of the first position/);
    expect(VESSEL_SEQUENCE[VESSEL_SEQUENCE.length - 1]).toMatch(/Feeds last/);
  });
});
