import { describe, expect, it } from 'vitest';
import { agreedTextOf, evaluateNode, scalar, subjectsOf, type ConditionNode, type FactResolver, type ResolvedFact } from './conditionGrammar';

/** A stub corpus: the grammar is pure and never touches a release. */
const facts = (rows: Record<string, ResolvedFact>): FactResolver => (subjectId, predicate) => {
  const fact = rows[`${subjectId}|${predicate}`];
  return fact ? { fact, because: '' } : { fact: null, because: `nothing resolves ${subjectId} ${predicate}.` };
};
const at = (recordId: string, validFrom: string, value: string | number = 1): ResolvedFact => ({ recordId, value, validFrom });

describe('the terms a real agreement carries', () => {
  it('computes detention: time accruing past a free window', () => {
    // Arrived 08:00, released 13:30 — five and a half hours, two of them free.
    const resolve = facts({
      'LOAD-1|custody.arrived': at('R-ARR', '2026-08-17T08:00:00Z'),
      'LOAD-1|custody.released': at('R-REL', '2026-08-17T13:30:00Z'),
    });
    const detention: ConditionNode = {
      kind: 'DURATION', subjectId: 'LOAD-1', startPredicate: 'custody.arrived', endPredicate: 'custody.released',
      freeSeconds: 2 * 3600, test: 'AT_MOST', seconds: 2 * 3600,
      agreedText: 'Two hours free time; detention beyond two further hours voids the release.',
    };
    const outcome = evaluateNode(detention, resolve);
    // 5.5 elapsed − 2 free = 3.5 chargeable, which exceeds the 2 allowed.
    expect(outcome.verdict).toBe('WITHHELD');
    expect(outcome.because).toContain('3.50 h chargeable');
    expect(outcome.reliedOn).toEqual(['R-ARR', 'R-REL']);

    // The same term with a wider allowance holds.
    expect(evaluateNode({ ...detention, seconds: 4 * 3600 }, resolve).verdict).toBe('GRANTED');
  });

  it('refuses a duration with one end missing rather than assuming the other', () => {
    const resolve = facts({ 'LOAD-1|custody.arrived': at('R-ARR', '2026-08-17T08:00:00Z') });
    const outcome = evaluateNode({
      kind: 'DURATION', subjectId: 'LOAD-1', startPredicate: 'custody.arrived', endPredicate: 'custody.released',
      freeSeconds: 0, test: 'AT_MOST', seconds: 3600, agreedText: 'Detention capped at one hour.',
    }, resolve);
    expect(outcome.verdict).toBe('NOT_ADJUDICABLE');
    expect(outcome.because).toContain('needs both ends');
  });

  it('will not settle a did-not-occur term by failing to find a record', () => {
    const nothing = facts({});
    const tonu: ConditionNode = {
      kind: 'EVENT', subjectId: 'LOAD-1', predicate: 'exception.damage', expect: 'DID_NOT_OCCUR',
      agreedText: 'Release provided no damage exception was raised.',
    };
    // Absence of a record is a fact about the corpus, not about the world.
    const bare = evaluateNode(tonu, nothing);
    expect(bare.verdict).toBe('NOT_ADJUDICABLE');
    expect(bare.because).toContain('a fact about the corpus and not about the world');
    expect(bare.because).toContain('coverage record');

    // Named coverage that is itself missing does not rescue it.
    const declared = { ...tonu, coveragePredicate: 'inspection.completed' };
    expect(evaluateNode(declared, nothing).verdict).toBe('NOT_ADJUDICABLE');
    expect(evaluateNode(declared, nothing).because).toContain('unwatched silence');

    // With the window declared watched, the non-occurrence is attributed.
    const watched = facts({ 'LOAD-1|inspection.completed': at('R-INSP', '2026-08-17T14:00:00Z') });
    const held = evaluateNode(declared, watched);
    expect(held.verdict).toBe('GRANTED');
    expect(held.reliedOn).toEqual(['R-INSP']);
    expect(held.because).toContain('attributed rather than assumed');

    // And a record of the exception withholds outright.
    const damaged = facts({ 'LOAD-1|exception.damage': at('R-DMG', '2026-08-17T12:00:00Z') });
    expect(evaluateNode(declared, damaged).verdict).toBe('WITHHELD');
  });
});

describe('composition is three-valued, and never turns an unknown into a false', () => {
  const met = scalar('S', 'a', 'AT_LEAST', 1, 'a at least 1');
  const unmet = scalar('S', 'b', 'AT_LEAST', 100, 'b at least 100');
  const unknown = scalar('S', 'missing', 'AT_LEAST', 1, 'the absent one');
  const resolve = facts({ 'S|a': at('R-A', '2026-01-01T00:00:00Z', 5), 'S|b': at('R-B', '2026-01-01T00:00:00Z', 5) });

  it('lets a definite failure outrank an unknown in ALL_OF', () => {
    const node: ConditionNode = { kind: 'ALL_OF', of: [unmet, unknown], agreedText: 'both' };
    const outcome = evaluateNode(node, resolve);
    expect(outcome.verdict).toBe('WITHHELD');
    expect(outcome.because).toContain('decisive');
  });

  it('reports an unknown rather than a failure when nothing is decisive', () => {
    const node: ConditionNode = { kind: 'ALL_OF', of: [met, unknown], agreedText: 'both' };
    const outcome = evaluateNode(node, resolve);
    expect(outcome.verdict).toBe('NOT_ADJUDICABLE');
    expect(outcome.because).toContain('an undecided leg is not a failed one');
  });

  it('lets a definite success outrank an unknown in ANY_OF', () => {
    expect(evaluateNode({ kind: 'ANY_OF', of: [met, unknown], agreedText: 'either' }, resolve).verdict).toBe('GRANTED');
    expect(evaluateNode({ kind: 'ANY_OF', of: [unmet, unknown], agreedText: 'either' }, resolve).verdict).toBe('NOT_ADJUDICABLE');
    expect(evaluateNode({ kind: 'ANY_OF', of: [unmet, unmet], agreedText: 'either' }, resolve).verdict).toBe('WITHHELD');
  });

  it('grants a conjunction only when every leg holds, and collects what each stood on', () => {
    const node: ConditionNode = { kind: 'ALL_OF', of: [met, scalar('S', 'b', 'AT_MOST', 10, 'b at most 10')], agreedText: 'both' };
    const outcome = evaluateNode(node, resolve);
    expect(outcome.verdict).toBe('GRANTED');
    expect(outcome.reliedOn.sort()).toEqual(['R-A', 'R-B']);
  });

  it('decides nothing on an empty composite', () => {
    const outcome = evaluateNode({ kind: 'ALL_OF', of: [], agreedText: 'nothing' }, resolve);
    expect(outcome.verdict).toBe('NOT_ADJUDICABLE');
    expect(outcome.because).toContain('empty conjunction is not a truth');
  });
});

describe('the counterparty’s wording survives compilation', () => {
  it('carries agreed text on every leg, including the composites', () => {
    const rate: ConditionNode = {
      kind: 'ALL_OF', agreedText: 'Rate confirmation RC-8821, all terms.',
      of: [
        scalar('LOAD-1', 'quantity.gross', 'AT_MOST', 44000, 'Gross weight not to exceed 44,000 lb.'),
        { kind: 'DURATION', subjectId: 'LOAD-1', startPredicate: 'custody.arrived', endPredicate: 'custody.released', freeSeconds: 7200, test: 'AT_MOST', seconds: 7200, agreedText: '2 hours free, detention at $75/hr thereafter, capped at 2 hours.' },
        { kind: 'EVENT', subjectId: 'LOAD-1', predicate: 'exception.damage', expect: 'DID_NOT_OCCUR', coveragePredicate: 'inspection.completed', agreedText: 'Clean delivery receipt required.' },
      ],
    };
    expect(agreedTextOf(rate)).toHaveLength(4);
    expect(agreedTextOf(rate)[0]).toBe('Rate confirmation RC-8821, all terms.');
    expect(agreedTextOf(rate).some((t) => t.includes('$75/hr'))).toBe(true);
    expect(subjectsOf(rate)).toEqual(['LOAD-1']);
  });
});
