import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { spatialKeyStanding } from './spatialKey';
import {
  SPATIAL_CAPABILITIES, SPATIAL_DERIVATIONS, SPATIAL_DISCIPLINE, SPATIAL_ROLES,
  SPATIAL_ROLE_STATE_LABEL, SPATIAL_SEQUENCE,
} from './spatialDerivation';

describe('the four jobs space does, and the one that was built first', () => {
  it('names each role once and labels every state it uses', () => {
    const ids = SPATIAL_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const role of SPATIAL_ROLES) expect(SPATIAL_ROLE_STATE_LABEL[role.state]).toBeTruthy();
  });

  it('records the finding that the display was built and derives nothing', () => {
    const display = SPATIAL_ROLES.find((r) => r.id === 'DISPLAY')!;
    expect(display.state).toBe('BUILT');
    expect(display.missing).toMatch(/windshield, not the engine/);
  });

  /** A role that is not BUILT must say what is missing, or the state is decoration. */
  it('names the missing half wherever a role is not built', () => {
    for (const role of SPATIAL_ROLES) {
      expect(role.job.trim().length).toBeGreaterThan(30);
      expect(role.here.trim().length).toBeGreaterThan(60);
      if (role.state !== 'BUILT') expect(role.missing?.trim().length ?? 0).toBeGreaterThan(60);
    }
  });

  it('claims for identity only what the key can actually do: refutation, not confirmation', () => {
    const identity = SPATIAL_ROLES.find((r) => r.id === 'IDENTITY')!;
    expect(identity.state).toBe('PARTIAL');
    expect(identity.here).toMatch(/refute/);
    expect(identity.missing).toMatch(/resolution decision object/);
    // And the corpus agrees: nothing is co-located, so nothing is even a candidate.
    expect(spatialKeyStanding(CARAVAN_CORPUS).answers.OVERLAPPING).toBe(0);
  });
});

describe('the derivations, ranked and costed', () => {
  it('ranks them once each, in order, with the cross-line join first', () => {
    const ranks = SPATIAL_DERIVATIONS.map((d) => d.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(SPATIAL_DERIVATIONS[0].id).toBe('FLOW_GEOMETRY');
  });

  it('gives every derivation a reason it belongs here, what it needs, and the mistake it invites', () => {
    for (const d of SPATIAL_DERIVATIONS) {
      expect(d.what.trim().length).toBeGreaterThan(60);
      expect(d.whyHere.trim().length).toBeGreaterThan(60);
      expect(d.needs.length).toBeGreaterThan(0);
      expect(d.hazard.trim().length).toBeGreaterThan(60);
      // "Better data" is never the reason, and a hazard is never a shrug.
      expect(d.whyHere.toLowerCase()).not.toMatch(/better data/);
    }
  });

  it('keeps the separations the hazards exist to protect', () => {
    const by = (id: (typeof SPATIAL_DERIVATIONS)[number]['id']) => SPATIAL_DERIVATIONS.find((d) => d.id === id)!;
    // A chain of predicates carries the loosest tolerance, not the tightest.
    expect(by('FLOW_GEOMETRY').hazard).toMatch(/loosest uncertainty/);
    // A detection is a model's assertion, with a producer.
    expect(by('CHANGE_DETECTION').hazard).toMatch(/interested party/);
    // An aggregate without its refusals reads as coverage that does not exist.
    expect(by('SPATIAL_AGGREGATION').hazard).toMatch(/refusals/);
    // A revised boundary is a correction, and corrections taint downstream.
    expect(by('VERSIONED_BOUNDARIES').hazard).toMatch(/retraction ledger/);
    // A mined pattern about an identified party is where a record becomes an accusation.
    expect(by('MOVEMENT_SIGNATURE').hazard).toMatch(/candidate, never an admitted fact/);
  });
});

describe('capabilities are mapped to components that exist', () => {
  it('names a real module or surface for every capability', () => {
    for (const c of SPATIAL_CAPABILITIES) {
      expect(c.component.trim().length).toBeGreaterThan(0);
      expect(c.note.trim().length).toBeGreaterThan(40);
      expect(SPATIAL_ROLE_STATE_LABEL[c.state]).toBeTruthy();
    }
    // The two capabilities this increment actually built are the only new BUILT rows.
    const built = SPATIAL_CAPABILITIES.filter((c) => c.state === 'BUILT').map((c) => c.component);
    expect(built.filter((c) => c.includes('spatialKey')).length).toBe(2);
  });

  it('never invents a component number the repository does not carry', () => {
    // N11 is the only measurement-economy identifier this repository actually uses.
    const text = SPATIAL_CAPABILITIES.map((c) => `${c.capability} ${c.component} ${c.note}`).join(' ');
    expect(text).not.toMatch(/\bN(0[0-9]|1[0-9])\b/);
  });
});

describe('the discipline and the order', () => {
  it('says plainly that the spatial stack is bought and the discipline is ours', () => {
    expect(SPATIAL_DISCIPLINE.buyTheCommodity).toMatch(/not a spatial database/);
    expect(SPATIAL_DISCIPLINE.uncertaintyCutsBothWays).toMatch(/recorded human judgment/);
    expect(SPATIAL_DISCIPLINE.rightsBiteHardest).toMatch(/rights index/);
    expect(SPATIAL_DISCIPLINE.displayIsNotDerivation).toMatch(/A globe is not an inference/);
  });

  it('sequences the work behind what each step presupposes', () => {
    expect(SPATIAL_SEQUENCE.length).toBeGreaterThan(3);
    expect(SPATIAL_SEQUENCE[0]).toMatch(/cell key first/i);
    expect(SPATIAL_SEQUENCE.join(' ')).toMatch(/Areal geometry/);
    expect(SPATIAL_SEQUENCE.join(' ')).toMatch(/rights are the strictest/);
  });
});
