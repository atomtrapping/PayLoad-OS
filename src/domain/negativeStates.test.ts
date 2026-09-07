import { describe, expect, it } from 'vitest';
import { NEGATIVE_RULES, WHY_ONE_IS_NOT_ENOUGH } from './negativeStates';

describe('the kinds of no, kept apart', () => {
  it('names each rule once, with the pair it separates and the fabrication the collapse produces', () => {
    expect(new Set(NEGATIVE_RULES.map((r) => r.id)).size).toBe(NEGATIVE_RULES.length);
    for (const rule of NEGATIVE_RULES) {
      expect(rule.distinguishes).toHaveLength(2);
      expect(rule.distinguishes[0]).not.toBe(rule.distinguishes[1]);
      expect(rule.theFabrication.length).toBeGreaterThan(60);
      expect(rule.rule.endsWith('.')).toBe(true);
    }
  });

  it('backs every rule with a mechanism that is still there, rather than only a sentence', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    for (const rule of NEGATIVE_RULES) {
      expect(existsSync(rule.enforcedIn.module), `${rule.id} names a module that is not there`).toBe(true);
      const source = readFileSync(rule.enforcedIn.module, 'utf8');
      expect(source.includes(rule.enforcedIn.symbol), `${rule.id} names ${rule.enforcedIn.symbol}, which ${rule.enforcedIn.module} does not carry`).toBe(true);
    }
  });

  it('carries the two rules that arrived from opposite ends of the system', () => {
    const unknown = NEGATIVE_RULES.find((r) => r.id === 'UNKNOWN_IS_NOT_EMPTY')!;
    const withdrawn = NEGATIVE_RULES.find((r) => r.id === 'WITHDRAWN_IS_NOT_FALSE')!;
    expect(unknown.rule).toBe('An unknown set is not an empty set.');
    expect(withdrawn.rule).toContain('does not supply a contrary fact');
    // The vehicle's rule is enforced by a function, not a paragraph.
    expect(withdrawn.enforcedIn.symbol).toBe('exposureAfter');
  });

  it('states the contrast with a single null, and counts itself rather than asserting a number', () => {
    expect(WHY_ONE_IS_NOT_ENOUGH.ours).toContain(String(NEGATIVE_RULES.length));
    expect(WHY_ONE_IS_NOT_ENOUGH.theTest).toContain('phone call');
  });

  it('names a fabrication that is always a claim about the world from a fact about records', () => {
    // Each rule's second distinguished state is the world-claim; the first is the record-fact.
    for (const rule of NEGATIVE_RULES) expect(rule.distinguishes[1].length).toBeGreaterThan(10);
    expect(NEGATIVE_RULES.length).toBeGreaterThanOrEqual(7);
  });
});
