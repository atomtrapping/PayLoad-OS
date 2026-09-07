import { describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '@/mcp/tools';
import {
  REACH_NOT_INFRASTRUCTURE, REASONER_MAY, REASONER_MAY_NOT, REASONING_RULES,
  THE_PAIRING, WITNESS_NOT_AUTHORITY, reasoningStanding,
} from './reasoningWitness';

describe('the pairing, and what each side lacks', () => {
  it('states the complementarity rather than assuming it', () => {
    expect(THE_PAIRING.reasonerLacks).toMatch(/no way to refuse/);
    expect(THE_PAIRING.corpusLacks).toMatch(/what they amount to/);
    expect(THE_PAIRING.posture).toMatch(/a different product and a slower one/);
  });
});

describe('three rules, and none of them enforced', () => {
  it('names each rule with the failure it prevents and how it would be enforced', () => {
    expect(REASONING_RULES).toHaveLength(3);
    for (const r of REASONING_RULES) {
      expect(r.rule.trim().length).toBeGreaterThan(60);
      expect(r.prevents.trim().length).toBeGreaterThan(60);
      expect(r.enforcement.trim().length).toBeGreaterThan(40);
    }
  });

  it('keeps the tier-crossing rule concrete, because it is the one that is missed', () => {
    const crossing = REASONING_RULES.find((r) => r.id === 'TIER_CROSSING_IS_A_CLAIM')!;
    expect(crossing.prevents).toMatch(/The waterline is crossed in a sentence/);
    expect(crossing.enforcement).toMatch(/a refusal stays a refusal/);
  });

  it('types a reasoning output as a candidate, the same as any other extraction', () => {
    const outputs = REASONING_RULES.find((r) => r.id === 'OUTPUTS_ARE_CANDIDATES')!;
    expect(outputs.prevents).toMatch(/extraction interface already says a model is an adapter/);
    expect(outputs.enforcement).toMatch(/a field that exists and is never populated enforces nothing/);
  });

  it('reports zero rules enforced, stated on each rule rather than read out of its prose', () => {
    for (const r of REASONING_RULES) expect(r.enforced).toBe(false);
    const standing = reasoningStanding();
    expect(standing.rulesTotal).toBe(REASONING_RULES.length);
    expect(standing.rulesEnforced).toBe(0);
    expect(standing.statement).toMatch(/read-only, which is not the same as the rules being held/);
  });
});

describe('a witness with no authority', () => {
  it('lists what a reasoner may do and what it may not, with admission on the far side', () => {
    expect(REASONER_MAY.length).toBeGreaterThan(3);
    expect(REASONER_MAY_NOT[0]).toMatch(/Admit anything/);
    expect(REASONER_MAY_NOT.join(' ')).toMatch(/a fluent argument for a merge is still not a merge/);
    // A refusal narrated as an absence is the dishonest answer.
    expect(REASONER_MAY_NOT.join(' ')).toMatch(/only one of them is honest/);
  });

  it('puts it behind the wall that already holds the solver and the audit', () => {
    expect(WITNESS_NOT_AUTHORITY.because).toMatch(/must never be one/);
    expect(WITNESS_NOT_AUTHORITY.sameWall).toMatch(/One wall, a third occupant/);
  });
});

describe('reach is not the product', () => {
  it('describes the surface as read-only, and counts it from the tools themselves', () => {
    const standing = reasoningStanding();
    expect(standing.tools).toBe(MCP_TOOLS.length);
    expect(standing.tools).toBeGreaterThan(0);
    expect(standing.writingTools).toBe(0);
    expect(standing.candidatesFromReasoners).toBe(0);
    expect(REACH_NOT_INFRASTRUCTURE.claim).toMatch(/not building agent infrastructure/);
    expect(REACH_NOT_INFRASTRUCTURE.why).toMatch(/Testimony is the asset/);
    expect(REACH_NOT_INFRASTRUCTURE.here).toMatch(/None writes/);
  });
});
