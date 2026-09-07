import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import {
  BUILD_NOTES, CONSTRAINT_FAMILIES, CONSTRAINT_IS_AN_OBSERVATION, CONSTRAINT_RECORD_CONTRACT,
  CONSTRAINT_SEQUENCE, ENFORCEMENT_METHODS, HARDNESS_RULE, HARVEST_RULE, INEQUALITIES,
  VIOLATION_TAPE, VOI_INTERACTION, constraintStanding,
} from './constraints';

describe('a constraint is a measurement with provenance', () => {
  it('states the identity that makes it a corpus object rather than solver configuration', () => {
    expect(CONSTRAINT_IS_AN_OBSERVATION.identity).toMatch(/H = C, R = 0 and z = c/);
    expect(CONSTRAINT_IS_AN_OBSERVATION.consequence).toMatch(/beliefs with provenance/);
    // The numerical trap that follows from taking the identity literally.
    expect(CONSTRAINT_IS_AN_OBSERVATION.neverLiterally).toMatch(/singular/);
  });

  it('carries both clocks and belongs in the release manifest', () => {
    expect(CONSTRAINT_RECORD_CONTRACT.bitemporal).toMatch(/as-of rebuild/);
    expect(CONSTRAINT_RECORD_CONTRACT.inTheManifest).toMatch(/different release/);
    expect(CONSTRAINT_RECORD_CONTRACT.state).toBe('ABSENT');
  });
});

describe('enforcement, and the one method that is malpractice', () => {
  it('recommends projection and forbids clipping outright', () => {
    const by = (id: (typeof ENFORCEMENT_METHODS)[number]['id']) => ENFORCEMENT_METHODS.find((m) => m.id === id)!;
    expect(by('PROJECTION').verdict).toBe('RECOMMENDED');
    expect(by('PROJECTION').what).toMatch(/Joseph form/);
    expect(by('CLIPPING').verdict).toBe('FORBIDDEN');
    expect(by('CLIPPING').use).toMatch(/corrupts the posterior silently/);
    // The projection is the well-conditioned limit of the pseudo-measurement.
    expect(by('PSEUDO_MEASUREMENT').what).toMatch(/R → 0 limit/);
  });

  it('gives every method a verdict and a use', () => {
    for (const method of ENFORCEMENT_METHODS) {
      expect(method.what.trim().length).toBeGreaterThan(60);
      expect(method.use.trim().length).toBeGreaterThan(40);
    }
    expect(new Set(ENFORCEMENT_METHODS.map((m) => m.id)).size).toBe(ENFORCEMENT_METHODS.length);
  });
});

describe('certainty is harvested in proportion to declared confidence', () => {
  it('names the failure a wrong hard constraint causes, structurally', () => {
    expect(HARVEST_RULE.why).toMatch(/rank\(C\) for free/);
    expect(HARVEST_RULE.why).toMatch(/innovations stop looking anomalous/);
    expect(HARVEST_RULE.therefore).toMatch(/Definitional identities may be hard/);
    expect(HARVEST_RULE.therefore).toMatch(/stiff-soft/);
    expect(HARVEST_RULE.echoes).toMatch(/process noise/);
  });

  it('reserves HARD for arithmetic and nothing else', () => {
    expect(HARDNESS_RULE.HARD).toMatch(/Nothing measured and nothing regulatory/);
    expect(HARDNESS_RULE.STIFF_SOFT).toMatch(/facilities leak/);
    expect(HARDNESS_RULE.SOFT).toMatch(/one minus the declared confidence/);
    // Every hard constraint in the families is definitional, never a claim about the world.
    for (const family of CONSTRAINT_FAMILIES) {
      for (const c of family.constraints) {
        if (c.hardness === 'HARD') expect(c.note).toMatch(/[Dd]efinitional/);
      }
    }
  });
});

describe('a violated constraint is evidence about the constraint', () => {
  it('gates the residual and routes a repeat offender to adjudication', () => {
    expect(VIOLATION_TAPE.residual).toMatch(/C P Cᵀ/);
    expect(VIOLATION_TAPE.meaning).toMatch(/candidate for supersession/);
    expect(VIOLATION_TAPE.estate).toMatch(/estate, not a log/);
    expect(VIOLATION_TAPE.twoAnalyses).toMatch(/with and without the constraint stack/);
    expect(VIOLATION_TAPE.state).toBe('ABSENT');
  });
});

describe('inequalities, without pretending the posterior stays Gaussian', () => {
  it('says the truth first and offers the options in order of effort', () => {
    expect(INEQUALITIES.truth).toMatch(/truncated Gaussian/);
    expect(INEQUALITIES.truth).toMatch(/must say so/);
    expect(INEQUALITIES.options.length).toBe(3);
    expect(INEQUALITIES.doNotConflate).toMatch(/decision boundary/);
  });
});

describe('the families, and what constraints do to the value of a measurement', () => {
  it('names a family per line and one that crosses them', () => {
    const domains = CONSTRAINT_FAMILIES.map((f) => f.domain);
    expect(domains).toEqual(['CARAVAN', 'LANDSHARK', 'TRADEWIND', 'CROSS_CUTTING']);
    for (const family of CONSTRAINT_FAMILIES) {
      expect(family.constraints.length).toBeGreaterThan(0);
      for (const c of family.constraints) expect(c.note.trim().length).toBeGreaterThan(40);
    }
    // The parcel split is the example that ties an identity operation to a quantity.
    const parcel = CONSTRAINT_FAMILIES.find((f) => f.domain === 'LANDSHARK')!.constraints[0];
    expect(parcel.statement).toMatch(/Parcel-split conservation/);
    expect(parcel.note).toMatch(/anomaly detector/);
  });

  it('prices measurements with the constraint stack active, at the confidence declared', () => {
    expect(VOI_INTERACTION.therefore).toMatch(/systematically underpriced/);
    expect(VOI_INTERACTION.butHonestly).toMatch(/soft constraint prices that automatically/);
  });
});

describe('how it would be built, and what exists', () => {
  it('keeps enforcement a separate receipted stage', () => {
    expect(BUILD_NOTES.receiptedStage).toMatch(/separate stage/);
    expect(BUILD_NOTES.batchForm).toMatch(/elimination order/);
    expect(CONSTRAINT_SEQUENCE[0]).toMatch(/[Ee]quality projection/);
    expect(CONSTRAINT_SEQUENCE.join(' ')).toMatch(/decision layer/);
  });

  it('counts zero declared constraints over a population that is not zero', () => {
    const standing = constraintStanding(CARAVAN_CORPUS);
    expect(standing.declared).toBe(0);
    expect(standing.enforced).toBe(0);
    expect(standing.violations).toBe(0);
    expect(standing.quantitiesWithUnits).toBeGreaterThan(0);
    expect(standing.statement).toMatch(/arithmetic rather than a claim about the world/);
  });
});
