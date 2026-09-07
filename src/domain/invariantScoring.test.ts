import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import { VERIFICATION_TIERS } from './doctrine';
import {
  FILTER_TIERS, FRAME_RISKS, REFERENCE_CHANNEL, VERDICTS_ARE_THE_ESTATE, scoringStanding,
} from './invariantScoring';

describe('four tiers of filter, each honest about what a pass is worth', () => {
  it('names each tier once, with the component that would run it', () => {
    const ids = FILTER_TIERS.map((f) => f.id);
    expect(ids).toEqual(['STRUCTURAL', 'CROSS_SOURCE', 'MODEL', 'RELIABILITY']);
    for (const tier of FILTER_TIERS) {
      expect(tier.runBy.trim().length).toBeGreaterThan(20);
      expect(tier.worth.trim().length).toBeGreaterThan(50);
      expect(tier.here.trim().length).toBeGreaterThan(40);
    }
  });

  it('says what a structural pass is not, and what corroboration is worth without independence', () => {
    const by = (id: (typeof FILTER_TIERS)[number]['id']) => FILTER_TIERS.find((f) => f.id === id)!;
    expect(by('STRUCTURAL').worth).toMatch(/nothing whatever about whether it is true/);
    expect(by('CROSS_SOURCE').worth).toMatch(/to the extent the agreeing sources are independent/);
    // A model invariant is a statement about the model as much as about the observation.
    expect(by('MODEL').worth).toMatch(/about the model as much as/);
    expect(by('RELIABILITY').worth).toMatch(/compounds/);
  });

  it('marks the two tiers that do not exist as absent', () => {
    expect(FILTER_TIERS.find((f) => f.id === 'MODEL')!.state).toBe('ABSENT');
    expect(FILTER_TIERS.find((f) => f.id === 'RELIABILITY')!.state).toBe('ABSENT');
  });
});

describe('recording the verdicts is what makes it an estate', () => {
  it('distinguishes a gate from an estate, and lists what it needs', () => {
    expect(VERDICTS_ARE_THE_ESTATE.difference).toMatch(/A gate rejects bad rows/);
    expect(VERDICTS_ARE_THE_ESTATE.needs.length).toBe(3);
    // The fitted reliability is evidence for a decision, never the decision.
    expect(VERDICTS_ARE_THE_ESTATE.needs.join(' ')).toMatch(/never as an authorization/);
    expect(VERDICTS_ARE_THE_ESTATE.state).toBe('ABSENT');
  });
});

describe('the residual risk is frame validity', () => {
  it('carries three risks, each with the discipline that contains it', () => {
    expect(FRAME_RISKS).toHaveLength(3);
    for (const risk of FRAME_RISKS) {
      expect(risk.failure.trim().length).toBeGreaterThan(100);
      expect(risk.discipline.trim().length).toBeGreaterThan(80);
    }
  });

  it('weights corroboration by independent provenance paths, not by agreeing sources', () => {
    const correlated = FRAME_RISKS.find((r) => r.id === 'CORRELATED_FAILURE')!;
    expect(correlated.failure).toMatch(/syndicat/);
    expect(correlated.discipline).toMatch(/never by the count of agreeing sources/);
  });

  it('treats the invariant set as a versioned belief with its own tape', () => {
    const invariants = FRAME_RISKS.find((r) => r.id === 'INVARIANTS_ARE_BELIEFS')!;
    expect(invariants.discipline).toMatch(/own violation tape/);
    expect(invariants.discipline).toMatch(/which invariant set version produced it/);
  });

  it('states plainly that a self-consistent corpus can be uniformly wrong', () => {
    const frame = FRAME_RISKS.find((r) => r.id === 'CONSISTENCY_IS_NOT_CORRESPONDENCE')!;
    expect(frame.failure).toMatch(/uniformly wrong/);
    expect(frame.discipline).toMatch(/only a reference tells you the frame is the world/);
  });
});

describe('the reference channel, firewalled from the scoring', () => {
  it('refuses to let a reference become an invariant input', () => {
    expect(REFERENCE_CHANNEL.firewall).toMatch(/benchmark that trains the test/);
    expect(REFERENCE_CHANNEL.consequence).toMatch(/cannot be surprised/);
    expect(REFERENCE_CHANNEL.posture).toMatch(/calibrated by an independent channel/);
  });

  it('reads its present state from the verification tiers rather than restating it', () => {
    expect(REFERENCE_CHANNEL.hereTier).toBe(VERIFICATION_TIERS.find((t) => t.tier === 'V3'));
    expect(REFERENCE_CHANNEL.hereTier.reachedHere).toBe(false);
    expect(REFERENCE_CHANNEL.state).toBe('ABSENT');
    expect(REFERENCE_CHANNEL.here).toMatch(/internal recompute/);
  });
});

describe('what exists', () => {
  it('counts the population and the four zeroes', () => {
    const standing = scoringStanding(CARAVAN_CORPUS);
    expect(standing.recordsSubjectToFilters).toBe(CARAVAN_CORPUS.records.length);
    expect(standing.sourcesThatCouldBeRated).toBeGreaterThan(1);
    expect(standing.retainedVerdicts).toBe(0);
    expect(standing.fittedReliabilities).toBe(0);
    expect(standing.declaredInvariantSets).toBe(0);
    expect(standing.independentReferences).toBe(0);
    expect(standing.statement).toMatch(/nothing here has been checked against the world/);
  });
});
