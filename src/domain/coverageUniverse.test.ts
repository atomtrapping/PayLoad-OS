import { describe, expect, it } from 'vitest';
import {
  COMMERCIALIZATION_NOTES, CORRIDOR_RULES, CORRIDOR_UNIT, COVERAGE_LEVELS, COVERAGE_REGIONS,
  EXPANSION_SEQUENCE, GEOGRAPHIC_DIMENSIONS, GEOGRAPHIC_MANDATE, MANDATE_STANDING, PROMOTION_RULE,
  REGIONAL_MODULE_CONTENTS, REGION_STANDING, SECOND_MARKET_TEST, SEPARATION_PROHIBITIONS,
  SEPARATION_RULE, SHARED_SUBSTRATE, STRATEGIC_DISTINCTION, coverageLevelById, coverageStanding,
  regionById, type Corridor,
} from './coverageUniverse';

describe('the mandate is a specialization, not a replacement', () => {
  it('names the regions it covers and says what kind of statement it is', () => {
    expect(GEOGRAPHIC_MANDATE).toContain('Asia, Africa, Latin America, the Pacific and Eastern Europe');
    expect(GEOGRAPHIC_MANDATE).toContain('cross-border commercial decisions');
    expect(MANDATE_STANDING).toContain('not a replacement');
  });

  it('keeps discovery, operational coverage and decisions as three different things', () => {
    expect(STRATEGIC_DISTINCTION).toEqual([
      'broad geographic discovery', 'selective, deep operational coverage', 'customer-specific decisions',
    ]);
  });
});

describe('six regions with different roles, not six promises of equal depth', () => {
  it('declares six, each with a bounded initial scope and its own product emphasis', () => {
    expect(COVERAGE_REGIONS).toHaveLength(6);
    expect(new Set(COVERAGE_REGIONS.map((region) => region.id)).size).toBe(6);
    for (const region of COVERAGE_REGIONS) {
      expect(region.initialScope, region.id).not.toHaveLength(0);
      expect(region.productEmphasis.length, region.id).toBeGreaterThan(2);
    }
    // The regions do not run the same product, so their emphases are not the same list.
    const emphases = COVERAGE_REGIONS.map((region) => [...region.productEmphasis].sort().join('|'));
    expect(new Set(emphases).size).toBe(6);
  });

  /*
   * Every region names public evidence that already exists, and what that
   * evidence does not establish. The pair is the point: the opportunity is the
   * gap between available information and a dependable decision, which cannot
   * be stated by naming either half alone.
   */
  it('names a foundation and its limit for every region', () => {
    for (const region of COVERAGE_REGIONS) {
      expect(region.foundation, region.id).not.toHaveLength(0);
      expect(region.foundationLimit, region.id).not.toHaveLength(0);
      expect(region.foundation, region.id).not.toBe(region.foundationLimit);
    }
  });

  it('keeps the distinctions the regional labels would erase', () => {
    expect(regionById('pacific')?.distinction).toContain('Pacific Island economies are distinguished from the broader Pacific Rim');
    expect(regionById('eastern-europe')?.distinction).toContain('is not one jurisdiction');
    expect(REGION_STANDING).toBe('PROPOSED_PORTFOLIO_NOT_A_VERIFIED_RANKING');
    // @ts-expect-error a region the mandate does not name
    expect(regionById('antarctica')).toBeNull();
  });
});

describe('the three geographic dimensions stay apart', () => {
  it('separates who pays, where evidence is acquired, and what the network must represent', () => {
    expect(GEOGRAPHIC_DIMENSIONS).toHaveLength(3);
    expect(GEOGRAPHIC_DIMENSIONS.map((entry) => entry.dimension)).toEqual([
      'Customer location', 'Asset and counterparty location', 'Trade and dependency network',
    ]);
    expect(new Set(GEOGRAPHIC_DIMENSIONS.map((entry) => entry.determines)).size).toBe(3);
  });

  it('sells to Western buyers without building a Western-destination data model', () => {
    const notes = COMMERCIALIZATION_NOTES.join(' ');
    expect(notes).toContain('without designing every transaction as a supply from elsewhere to the West');
    expect(notes).toContain('must not require a conceptual redesign');
    expect(notes).toContain('North American and Western European data stays in the corpus');
    expect(notes).toContain('does not truncate the network');
  });
});

describe('the unit of coverage is a corridor', () => {
  it('requires all five parts, so a corridor is not a country dossier', () => {
    expect(CORRIDOR_UNIT).toEqual([
      'product or process', 'supplier facilities', 'transport dependencies',
      'destination requirements', 'buyer commitments',
    ]);
  });

  it('states why a country is not the unit, and what a shared dependency does to an alternative', () => {
    const rules = CORRIDOR_RULES.join(' ');
    expect(rules).toContain('“Cover Vietnam” does not tell an acquisition system which documents matter');
    expect(rules).toContain('stays one connected inquiry');
    expect(rules).toContain('are not independent alternatives if they share an upstream processor');
    expect(rules).toContain('dependency chain is often the better expansion path');
  });
});

describe('three coverage levels, and what may be sold from each', () => {
  it('orders them and gives each what it maintains, what it sells and what it does not support', () => {
    expect(COVERAGE_LEVELS.map((level) => level.order)).toEqual([1, 2, 3]);
    expect(COVERAGE_LEVELS.map((level) => level.id)).toEqual(['REFERENCE', 'ASSESSED', 'MONITORED']);
    for (const level of COVERAGE_LEVELS) {
      expect(level.maintains, level.id).not.toHaveLength(0);
      expect(level.mayBeSold, level.id).not.toHaveLength(0);
      expect(level.doesNotSupport, level.id).not.toHaveLength(0);
    }
    expect(coverageLevelById('REFERENCE')?.doesNotSupport).toBe('A point on the map is not a verified facility.');
    expect(coverageLevelById('ASSESSED')?.doesNotSupport).toContain('not a continuously monitored supplier');
  });

  it('promotes on demand rather than maintaining everything at maximum frequency', () => {
    expect(PROMOTION_RULE).toContain('A customer request promotes a bounded subject');
    expect(PROMOTION_RULE).toContain('demonstrated recurring demand justifies monitoring');
  });
});

describe('nothing is covered yet, and the count is derived', () => {
  it('reports six declared regions, no corridor and no subject at any level', () => {
    const standing = coverageStanding();
    expect(standing.regionsDeclared).toBe(6);
    expect(standing.corridorsMaintained).toBe(0);
    expect(standing.reference).toBe(0);
    expect(standing.assessed).toBe(0);
    expect(standing.monitored).toBe(0);
    expect(standing.regionsEntered).toBe(0);
    expect(standing.coverage).toBe('DECLARED_AMBITION_ONLY');
  });

  /*
   * A written-down zero would be true today and would go on being printed
   * after the first corridor was entered. This one moves.
   */
  it('counts corridors at their own level, so the zeros mean something', () => {
    const corridors: Corridor[] = [
      { id: 'C-1', product: 'injection-moulded components', originRegion: 'asia', level: 'ASSESSED' },
      { id: 'C-2', product: 'compounded polymer', originRegion: 'asia', level: 'REFERENCE' },
      { id: 'C-3', product: 'industrial castings', originRegion: 'eastern-europe', level: 'MONITORED' },
    ];
    const standing = coverageStanding(corridors);
    expect(standing.corridorsMaintained).toBe(3);
    expect(standing.reference).toBe(1);
    expect(standing.assessed).toBe(1);
    expect(standing.monitored).toBe(1);
    expect(standing.regionsEntered, 'two corridors from one region enter one region').toBe(2);
  });
});

describe('regional modules, and the rules that keep them from becoming platforms', () => {
  it('puts the regional difference in the evidence and leaves the substrate shared', () => {
    expect(REGIONAL_MODULE_CONTENTS).toContain('original-language terminology');
    expect(REGIONAL_MODULE_CONTENTS).toContain('local verification channels');
    expect(SHARED_SUBSTRATE).toContain('identity');
    expect(SHARED_SUBSTRATE).toContain('provenance');
    expect(SHARED_SUBSTRATE).toContain('warrants');
    // The two lists answer different questions and share nothing.
    const overlap = REGIONAL_MODULE_CONTENTS.filter((entry) => (SHARED_SUBSTRATE as readonly string[]).includes(entry));
    expect(overlap).toEqual([]);
  });

  /*
   * The rule that keeps a coverage gap from becoming a verdict about a
   * supplier. Each prohibition is a specific thing someone would otherwise
   * conclude from an absence or a statistic.
   */
  it('keeps jurisdiction, observed condition and evidentiary uncertainty separate', () => {
    expect(SEPARATION_RULE).toBe('Jurisdiction, observed condition and evidentiary uncertainty must remain separate.');
    expect(SEPARATION_PROHIBITIONS).toHaveLength(3);
    const prohibitions = SEPARATION_PROHIBITIONS.join(' ');
    expect(prohibitions).toContain('Missing information does not become a negative supplier judgment');
    expect(prohibitions).toContain('country-level statistic does not become a facility-level fact');
    expect(prohibitions).toContain('remotely sensed change does not become proof of ownership, capacity or material quality');
  });
});

describe('how the first expansion goes', () => {
  it('starts from a buyer with a live problem and tests comparability second', () => {
    expect(EXPANSION_SEQUENCE.map((step) => step.order)).toEqual([1, 2, 3]);
    expect(EXPANSION_SEQUENCE[0].step).toContain('one buyer and a live purchasing or supplier-review problem');
    expect(EXPANSION_SEQUENCE[1].why).toContain('genuinely comparable decision');
    expect(EXPANSION_SEQUENCE[2].why).toContain('repeat-purchase support');
    for (const step of EXPANSION_SEQUENCE) expect(step.why, step.step).not.toHaveLength(0);
  });

  it('chooses the second market on five tests, none of them the map', () => {
    expect(SECOND_MARKET_TEST).toEqual([
      'customer demand', 'accessible evidence', 'rights to deliver the result',
      'local verification options', 'sustainable maintenance cost',
    ]);
  });
});
