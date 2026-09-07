import { describe, expect, it } from 'vitest';
import { VOCABULARY, VOCABULARY_FORM, VOCABULARY_LOSS, VOCABULARY_RULES, canonicalFor, displayTerm } from './vocabulary';

const GAT = 'gat.finite-decision-plan.v1';
const PAYLOAD = 'payload.clearance-voi-experiment.v1';

describe('one vocabulary home, verb-first', () => {
  it('names one canonical word per meaning, and every canonical is verb-first', () => {
    expect(VOCABULARY_FORM).toBe('VERB_FIRST');
    const canonicals = VOCABULARY.map((t) => t.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
    // Verb-first: the first segment is an imperative, never a past participle.
    for (const canonical of canonicals) {
      expect(canonical).toMatch(/^[A-Z]+_/);
      expect(canonical.split('_')[0]).not.toMatch(/ED$/);
    }
    // One meaning per term, stated once, so two producers cannot mean two
    // things by one word.
    for (const term of VOCABULARY) expect(term.means.length).toBeGreaterThan(30);
    expect(new Set(VOCABULARY.map((t) => t.means)).size).toBe(VOCABULARY.length);
  });

  it('maps both dialects of the same decision onto one word', () => {
    expect(canonicalFor(GAT, 'RECOMMEND_MEASUREMENT')?.canonical).toBe('RECOMMEND_MEASUREMENT');
    expect(canonicalFor(PAYLOAD, 'MEASUREMENT_RECOMMENDED')?.canonical).toBe('RECOMMEND_MEASUREMENT');
    expect(canonicalFor(GAT, 'FIT')?.canonical).toBe('ACCEPT_FIT');
    expect(canonicalFor(PAYLOAD, 'ACCEPT_FIT')?.canonical).toBe('ACCEPT_FIT');
    expect(canonicalFor(GAT, 'REJECT')?.canonical).toBe('REJECT_FIT');
    // No alias is claimed by two different canonicals.
    const seen = new Map<string, string>();
    for (const term of VOCABULARY) {
      for (const alias of term.aliases) {
        const key = `${alias.producer} ${alias.term}`;
        expect(seen.has(key), `${key} is claimed twice`).toBe(false);
        seen.set(key, term.canonical);
      }
    }
  });

  it('refuses an unmapped term rather than guessing one', () => {
    // A surface that inferred a canonical word from a spelling would be
    // deciding what a producer meant.
    expect(canonicalFor(GAT, 'SOMETHING_NEW')).toBeNull();
    expect(canonicalFor('some.third.producer.v1', 'FIT')).toBeNull();
    expect(displayTerm(GAT, 'SOMETHING_NEW')).toEqual({ printed: 'SOMETHING_NEW', canonical: null, showsBoth: false });
    expect(VOCABULARY_LOSS.join(' ')).toMatch(/unknown, never guessed/);
  });

  it('prints the producer word and shows the canonical only where they differ', () => {
    // Vocabulary verbatim and normalize-at-the-boundary govern different
    // fields: the canonical decides the accent, the producer word is read.
    const same = displayTerm(GAT, 'RECOMMEND_MEASUREMENT');
    expect(same).toEqual({ printed: 'RECOMMEND_MEASUREMENT', canonical: 'RECOMMEND_MEASUREMENT', showsBoth: false });
    const differs = displayTerm(PAYLOAD, 'MEASUREMENT_RECOMMENDED');
    expect(differs).toEqual({ printed: 'MEASUREMENT_RECOMMENDED', canonical: 'RECOMMEND_MEASUREMENT', showsBoth: true });
    expect(VOCABULARY_RULES.printWhat).toMatch(/verbatim/);
    expect(VOCABULARY_RULES.normalizeWhere).toMatch(/adapter boundary/);
    expect(VOCABULARY_LOSS.join(' ')).toMatch(/never replaces the producer word on the page/);
  });

  it('keeps the distinctions the dialects would otherwise blur', () => {
    // Recommending none and withholding a recommendation are different, and
    // the registry keeps them as different terms rather than one null.
    expect(canonicalFor(PAYLOAD, 'NO_MEASUREMENT')?.canonical).toBe('RECOMMEND_NO_MEASUREMENT');
    expect(canonicalFor(PAYLOAD, 'UNRESOLVED_REQUIREMENTS')?.canonical).toBe('WITHHOLD_RECOMMENDATION');
    expect(canonicalFor(PAYLOAD, 'NO_MEASUREMENT')?.canonical).not.toBe(canonicalFor(PAYLOAD, 'UNRESOLVED_REQUIREMENTS')?.canonical);
    // And naming them as one term does not make a producer change.
    expect(VOCABULARY_LOSS.join(' ')).toMatch(/does not make either producer change/);
    expect(VOCABULARY_RULES.whyNow).toMatch(/pairwise/);
  });
});
