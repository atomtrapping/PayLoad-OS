import { describe, expect, it } from 'vitest';
import { CARAVAN_CORPUS } from '@/fixtures/caravan/release';
import {
  CONTINUITY_PROBLEMS, CREDIBILITY_LEGS, HISTORICAL_CAVEATS, RESEARCH_LAYER, legacyTradeStanding,
} from './legacyTrade';

describe('why trade records are the strongest historical layer', () => {
  it('gives every leg a contrast and the machinery it lands on', () => {
    expect(CREDIBILITY_LEGS).toHaveLength(5);
    for (const leg of CREDIBILITY_LEGS) {
      expect(leg.claim.trim().length).toBeGreaterThan(60);
      expect(leg.contrast.trim().length).toBeGreaterThan(60);
      expect(leg.landsOn.trim().length).toBeGreaterThan(40);
    }
  });

  it('rests the argument on adversarial audit at creation, not on volume', () => {
    const audit = CREDIBILITY_LEGS.find((l) => l.id === 'ADVERSARIAL_AUDIT')!;
    expect(audit.claim).toMatch(/checked by someone paid to catch it/);
    expect(audit.landsOn).toMatch(/without being this system’s own observation/);
    // Conservation is what makes history adjudicable rather than merely stored.
    const conserves = CREDIBILITY_LEGS.find((l) => l.id === 'CONSERVES')!;
    expect(conserves.contrast).toMatch(/do not conserve/);
    expect(conserves.landsOn).toMatch(/calibration estate, applied backwards/);
  });
});

describe('the caveats, which are structural', () => {
  it('reads silence as a coverage bound and never as a zero', () => {
    const coverage = HISTORICAL_CAVEATS.find((c) => c.id === 'COVERAGE')!;
    expect(coverage.caveat).toMatch(/what the archiving power saw/);
    expect(coverage.rule).toMatch(/never a zero/);
  });

  it('enters the records as claims rather than as ground truth', () => {
    const claims = HISTORICAL_CAVEATS.find((c) => c.id === 'TESTIFIES_TO_CLAIMS')!;
    expect(claims.caveat).toMatch(/did not remove it/);
    expect(claims.rule).toMatch(/below an instrumented observation/);
  });

  it('names extraction as the one cost that falls with time', () => {
    const cost = HISTORICAL_CAVEATS.find((c) => c.id === 'EXTRACTION_COST')!;
    expect(cost.rule).toMatch(/Retain the bytes first and extract repeatedly/);
  });
});

describe('continuity, the research layer, and what exists', () => {
  it('names the three continuity problems with what would resolve each', () => {
    expect(CONTINUITY_PROBLEMS).toHaveLength(3);
    expect(CONTINUITY_PROBLEMS.find((p) => p.problem === 'Units')!.resolvedBy).toMatch(/arithmetic rather than a claim about the world/);
    expect(CONTINUITY_PROBLEMS.find((p) => p.problem === 'Counterparties')!.resolvedBy).toMatch(/does not exist yet/);
  });

  it('keeps the research layer a plus rather than a justification', () => {
    expect(RESEARCH_LAYER.butHonestly).toMatch(/do not have to earn their keep/);
    expect(RESEARCH_LAYER.butHonestly).toMatch(/distort the acquisition order/);
  });

  it('measures the corpus’s own historical depth in weeks', () => {
    const standing = legacyTradeStanding(CARAVAN_CORPUS);
    expect(standing.archivesHeld).toBe(0);
    expect(standing.artifactsRetained).toBe(0);
    expect(standing.recordsExtracted).toBe(0);
    expect(standing.earliestRecordYear).toBeGreaterThan(2000);
    expect(standing.statement).toMatch(/measured in weeks/);
  });
});
