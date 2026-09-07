import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { FRAME_RISKS } from './invariantScoring';
import {
  ATTRIBUTED_ABSENCE, CONCEPT_MAPPING, CROSS_FAMILY_CORROBORATION, REANALYSIS_IS_A_WITNESS,
  SENSOR_FAMILIES, SENSOR_SEQUENCE, TRIAD_DERIVATIONS, TWO_CONVERGENCES, VERTICAL_DATUM_TRAP,
  WEATHER_ROLE, sensorStanding,
} from './sensorFamilies';

describe('two convergences, and only one of them is the work', () => {
  it('says the sensor convergence is already free and names what blocks it anyway', () => {
    expect(TWO_CONVERGENCES.sensor.state).toBe('FREE');
    expect(TWO_CONVERGENCES.sensor.what).toMatch(/two observation models over one state/);
    expect(TWO_CONVERGENCES.sensor.blockedBy).toMatch(/No estimator runs/);
  });

  it('names the semantic convergence as the actual missing layer', () => {
    expect(TWO_CONVERGENCES.semantic.state).toBe('THE_WORK');
    expect(TWO_CONVERGENCES.semantic.what).toMatch(/neither emits corpus concepts/);
    expect(TWO_CONVERGENCES.semantic.blockedBy).toMatch(/feature-to-concept mapping/);
  });
});

describe('three families, and one of them is not a sensor', () => {
  it('gives every family its frame fields and its honest state', () => {
    expect(SENSOR_FAMILIES.map((f) => f.id)).toEqual(['SATELLITE', 'LIDAR', 'METEOROLOGY']);
    for (const family of SENSOR_FAMILIES) {
      expect(family.frameFields.length).toBeGreaterThan(3);
      expect(family.nativeVocabulary.trim().length).toBeGreaterThan(40);
      expect(family.here.trim().length).toBeGreaterThan(60);
    }
    // LiDAR is the family whose frame the record contract cannot yet express.
    expect(SENSOR_FAMILIES.find((f) => f.id === 'LIDAR')!.frameFields).toContain('vertical datum');
    expect(SENSOR_FAMILIES.find((f) => f.id === 'LIDAR')!.here).toMatch(/no vertical datum at all/);
  });

  it('models meteorology as forcing and gating rather than as observation', () => {
    const met = SENSOR_FAMILIES.find((f) => f.id === 'METEOROLOGY')!;
    expect(met.role).toBe('FORCES_AND_GATES');
    expect(met.constrains).toMatch(/Nothing directly/);
    expect(WEATHER_ROLE.asymmetry).toMatch(/Structure, motion and cause/);
    // The row people skip: weather decides whether the sensor can observe.
    expect(WEATHER_ROLE.acts.find((a) => a.quantity.startsWith('Cloud'))!.slot).toMatch(/rows of H switch off/);
    expect(WEATHER_ROLE.missedPoint).toMatch(/gates the sensors/);
  });

  it('records an absence with its cause instead of leaving silence', () => {
    expect(ATTRIBUTED_ABSENCE.rule).toMatch(/never an empty result/);
    expect(ATTRIBUTED_ABSENCE.why).toMatch(/at the rate the weather sets/);
  });

  it('treats a reanalysis as a witness with a noise model, and as vintage data', () => {
    expect(REANALYSIS_IS_A_WITNESS.rule).toMatch(/never as ground truth/);
    expect(REANALYSIS_IS_A_WITNESS.vintage).toMatch(/two-clock/);
    expect(REANALYSIS_IS_A_WITNESS.trap).toMatch(/frame problem arrives through the weather door/);
    // Acquiring anything is the operator's decision, not a plan stated here.
    expect(REANALYSIS_IS_A_WITNESS.archiveGated).toMatch(/nothing here acquires anything/);
  });
});

describe('the mapping is where the estate is', () => {
  it('runs four stages in order, each an instance of a discipline that already exists', () => {
    expect(CONCEPT_MAPPING.map((m) => m.order)).toEqual([1, 2, 3, 4]);
    expect(CONCEPT_MAPPING.map((m) => m.stage)).toEqual(['FEATURE', 'CONCEPT_MAPPING', 'RECONCILIATION', 'ADMISSION']);
    for (const stage of CONCEPT_MAPPING) {
      expect(stage.sameAs.trim().length).toBeGreaterThan(30);
      expect(stage.state).toBe('ABSENT');
    }
    // Disagreement between families is encoded, never averaged.
    expect(CONCEPT_MAPPING[2].what).toMatch(/not averaged/);
  });

  it('prices cross-family agreement above syndicated agreement, on independence', () => {
    expect(CROSS_FAMILY_CORROBORATION.claim).toMatch(/more than five syndicated sources/);
    expect(CROSS_FAMILY_CORROBORATION.why).toMatch(/independence behind it/);
    // The same weighting the invariant scoring already demands.
    expect(FRAME_RISKS.find((r) => r.id === 'CORRELATED_FAILURE')!.discipline).toMatch(/independent provenance paths/);
  });
});

describe('what the triad unlocks, and the trap that makes fusion quietly wrong', () => {
  it('gives every derivation what it needs and why it fails without it', () => {
    expect(TRIAD_DERIVATIONS.length).toBe(5);
    for (const d of TRIAD_DERIVATIONS) {
      expect(d.needs.trim().length).toBeGreaterThan(20);
      expect(d.why.trim().length).toBeGreaterThan(50);
    }
    const change = TRIAD_DERIVATIONS.find((d) => d.id === 'CHANGE_VS_WEATHER')!;
    expect(change.what).toMatch(/Weather is the null model/);
    const conservation = TRIAD_DERIVATIONS.find((d) => d.id === 'CONSERVATION_WITH_LEAKS')!;
    expect(conservation.why).toMatch(/conflates measurement error with rain/);
  });

  it('requires a vertical datum wherever an elevation appears, before the first one exists', () => {
    expect(VERTICAL_DATUM_TRAP.trap).toMatch(/tens of metres/);
    expect(VERTICAL_DATUM_TRAP.rule).toMatch(/declared object with evidence/);
    expect(VERTICAL_DATUM_TRAP.here).toMatch(/not yet reachable/);
    expect(SENSOR_SEQUENCE[0]).toMatch(/concept mapping and its frame fields first/);
  });
});

describe('what exists', () => {
  it('counts no source, no mapping and no elevation, and names the contract gap', () => {
    const standing = sensorStanding(CARAVAN_CORPUS);
    expect(standing.registeredSources).toEqual({ SATELLITE: 0, LIDAR: 0, METEOROLOGY: 0 });
    expect(standing.conceptMappings).toBe(0);
    expect(standing.elevationsInCorpus).toBe(0);
    expect(standing.verticalDatumField).toBe('ABSENT');
    expect(standing.statement).toMatch(/costs nothing to add today and a migration to add later/);
  });
});
