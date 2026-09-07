/**
 * One vocabulary home.
 *
 * The same decision reaches this system in two dialects. GAT's report grammar
 * says RECOMMEND_MEASUREMENT, FIT, REJECT; the NotationsOS clearance producer
 * says MEASUREMENT_RECOMMENDED, ACCEPT_FIT, REJECT_FIT. Both are defensible;
 * carrying both is not, and the cost of carrying both is pairwise -- two
 * producers is one accommodation, three is three.
 *
 * The canonical form is verb-first, because these are actions with a subject
 * and they belong to the same event vocabulary as the ruling state machine.
 * The noun-past-participle forms read as record types, which is a different
 * kind of thing. Either was defensible; both is not, so the loser is recorded
 * here as an alias rather than argued about again.
 *
 * The two rules that keep this from becoming a paraphrase engine:
 *
 * Normalization happens at the adapter boundary, never in a surface. A
 * surface that normalized would be deciding what a producer meant.
 *
 * And vocabulary stays verbatim on the page. The canonical word is what a
 * palette and an accent key on; the producer's own word is what a reader
 * sees. Where they differ the surface shows both, so the mapping is visible
 * rather than hidden in an adapter -- which is why the two rules do not
 * contradict each other: they govern different fields.
 */

export const VOCABULARY_FORM = 'VERB_FIRST' as const;

export const VOCABULARY_RULES = {
  canonicalForm: 'Verb-first. These are actions with a subject, in the same event vocabulary as the ruling state machine; the noun-past-participle forms read as record types, which is a different kind of thing.',
  normalizeWhere: 'At the adapter boundary. A surface that normalized would be deciding what a producer meant, which is an adapter job and not a renderer one.',
  printWhat: 'The producer own word, verbatim. The canonical word is what an accent keys on; where they differ the surface shows both, so the mapping is visible rather than hidden.',
  whyNow: 'Accommodation cost is pairwise. Two producers is one accommodation; three is three. This is the last cheap moment.',
} as const;

export interface VocabularyTerm {
  /** The canonical, verb-first word. */
  canonical: string;
  /** What it means, once, so two producers cannot mean two things by one word. */
  means: string;
  /** Every producer spelling that maps to it, including the canonical one. */
  aliases: readonly { producer: string; term: string }[];
}

const GAT = 'gat.finite-decision-plan.v1';
const PAYLOAD = 'payload.clearance-voi-experiment.v1';

export const VOCABULARY: readonly VocabularyTerm[] = [
  {
    canonical: 'RECOMMEND_MEASUREMENT',
    means: 'A measurement is worth acquiring: its expected reduction in decision loss exceeds its cost.',
    aliases: [{ producer: GAT, term: 'RECOMMEND_MEASUREMENT' }, { producer: PAYLOAD, term: 'MEASUREMENT_RECOMMENDED' }],
  },
  {
    canonical: 'RECOMMEND_NO_MEASUREMENT',
    means: 'Every available measurement costs more than it is worth. Not that the decision is settled.',
    aliases: [{ producer: GAT, term: 'NO_WORTHWHILE_AVAILABLE_MEASUREMENT' }, { producer: PAYLOAD, term: 'NO_MEASUREMENT' }],
  },
  {
    canonical: 'WITHHOLD_RECOMMENDATION',
    means: 'The requirements for ranking measurements were not resolved, so no recommendation is made. Distinct from recommending none.',
    aliases: [{ producer: PAYLOAD, term: 'UNRESOLVED_REQUIREMENTS' }],
  },
  {
    canonical: 'ACCEPT_FIT',
    means: 'The decision rule, applied to the belief, accepts. A decision over a belief, never a statement that the thing fits.',
    aliases: [{ producer: GAT, term: 'FIT' }, { producer: PAYLOAD, term: 'ACCEPT_FIT' }],
  },
  {
    canonical: 'REJECT_FIT',
    means: 'The decision rule, applied to the belief, rejects.',
    aliases: [{ producer: GAT, term: 'REJECT' }, { producer: PAYLOAD, term: 'REJECT_FIT' }],
  },
  {
    canonical: 'PERMIT_ACTION',
    means: 'A declared permission exists for this action. Absence of a permission is never a permission.',
    aliases: [{ producer: GAT, term: 'AVAILABLE_AND_PERMITTED' }, { producer: PAYLOAD, term: 'DECLARED_PERMITTED' }],
  },
  {
    canonical: 'WITHHOLD_VALIDATION',
    means: 'No independent validation has been established. Not that validation failed.',
    aliases: [{ producer: GAT, term: 'NOT_ESTABLISHED' }, { producer: PAYLOAD, term: 'UNRESOLVED_INDEPENDENCE' }],
  },
];

const BY_TERM = new Map<string, VocabularyTerm>();
for (const term of VOCABULARY) for (const alias of term.aliases) BY_TERM.set(`${alias.producer} ${alias.term}`, term);

/**
 * The canonical word for a producer word, or null when this vocabulary has
 * never been told about it. Null is a refusal: an unmapped term is unknown,
 * and a surface that guessed would be deciding what a producer meant.
 */
export function canonicalFor(producer: string, term: string): VocabularyTerm | null {
  return BY_TERM.get(`${producer} ${term}`) ?? null;
}

/** What a surface shows: the producer word, and the canonical one when they differ. */
export function displayTerm(producer: string, term: string): { printed: string; canonical: string | null; showsBoth: boolean } {
  const mapped = canonicalFor(producer, term);
  return { printed: term, canonical: mapped?.canonical ?? null, showsBoth: mapped !== null && mapped.canonical !== term };
}

export const VOCABULARY_LOSS = [
  'An unmapped term is unknown, never guessed. A surface that inferred a canonical word from a spelling would be deciding what a producer meant.',
  'The canonical word never replaces the producer word on the page. It decides the accent; the producer word is what a reader sees, and both appear when they differ.',
  'Naming two spellings as one term says they mean the same thing here. It does not make two producers agree, and it does not make either producer change.',
] as const;
