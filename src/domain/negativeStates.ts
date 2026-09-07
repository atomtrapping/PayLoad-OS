/**
 * The kinds of "no", kept apart.
 *
 * Every data system has one negative state and calls it null. This one has
 * several, and the distinctions between them are not fastidiousness: each pair
 * below, collapsed, produces a specific fabrication, and the fabrication is
 * always in the same direction — a claim about the world manufactured out of a
 * fact about records.
 *
 * The rules were not designed together. They arrived one at a time, each from
 * its own problem: the port set found that an unknown set is not an empty one;
 * the reference ground found that absence has three readings; the manifold
 * found that void must render void; the vehicle found that a withdrawal is not
 * a contrary finding. Collecting them here is bookkeeping over something that
 * already happened, and the fact that four unrelated modules reached the same
 * shape independently is the argument for treating it as a rule rather than a
 * preference.
 *
 * What a registry buys that scattered prose does not: a reader can be handed
 * the whole vocabulary at once, and a test can check that every rule still has
 * a mechanism behind it rather than only a sentence.
 */

export type NegativeRuleId =
  | 'UNKNOWN_IS_NOT_EMPTY'
  | 'WITHDRAWN_IS_NOT_FALSE'
  | 'REFUSED_IS_NOT_FALSE'
  | 'NOT_ASSESSABLE_IS_NOT_AGREEMENT'
  | 'VOID_IS_NOT_EMPTY'
  | 'UNANSWERABLE_IS_NOT_ABSENT'
  | 'ABSENCE_IS_NOT_A_ZERO';

export interface NegativeRule {
  id: NegativeRuleId;
  rule: string;
  /** The two states an ordinary system collapses into one. */
  distinguishes: [string, string];
  /** What the collapse manufactures. Always a claim about the world out of a fact about records. */
  theFabrication: string;
  /** Module and exported symbol carrying the mechanism, so the rule is checkable rather than asserted. */
  enforcedIn: { module: string; symbol: string };
}

export const NEGATIVE_RULES: readonly NegativeRule[] = [
  {
    id: 'UNKNOWN_IS_NOT_EMPTY',
    rule: 'An unknown set is not an empty set.',
    distinguishes: ['No membership ruling is knowable', 'The set is known to have no members'],
    theFabrication: 'Reporting occupancy zero for a port nobody observed. Zero is a claim about the world; the absence of an observation is a fact about the corpus, and a chart cannot tell them apart once the null has been rendered as a nought.',
    enforcedIn: { module: 'src/domain/portSet.ts', symbol: 'PORT_SET_LOSS' },
  },
  {
    id: 'WITHDRAWN_IS_NOT_FALSE',
    rule: 'A withdrawal removes support. It does not supply a contrary fact.',
    distinguishes: ['The record that said so is gone', 'Something now says otherwise'],
    theFabrication: 'Telling a depositor its cargo was misdescribed when what actually happened is that an inspector withdrew a certificate for a chain-of-custody defect. The corpus’s own withdrawal says in its reason that this is not a finding about the cargo, and a system that reported it as one would have invented the finding.',
    enforcedIn: { module: 'src/domain/collateralVehicle.ts', symbol: 'exposureAfter' },
  },
  {
    id: 'REFUSED_IS_NOT_FALSE',
    rule: 'A refusal is a result about admissibility, not a verdict about the claim.',
    distinguishes: ['Not admissible for this use, tolerance and cutoff', 'Shown to be untrue'],
    theFabrication: 'Reading a refused ruling as a finding against the claimant. The refusal describes what this profile could admit at this cutoff, and a claim can be entirely true and entirely inadmissible at the same instant.',
    enforcedIn: { module: 'src/domain/selectors.ts', symbol: 'STATUS_SEMANTICS' },
  },
  {
    id: 'NOT_ASSESSABLE_IS_NOT_AGREEMENT',
    rule: 'A pair that cannot be tested is untested, not consistent.',
    distinguishes: ['No usable bound was stated, so no comparison is possible', 'The two accounts were compared and did not conflict'],
    theFabrication: 'Counting an untestable pair as corroboration. One channel stating no uncertainty is not compared and none is assumed for it, so a set containing that pair is not shown to close — and overlapping windows, where they can be computed, are only the absence of a contradiction rather than agreement.',
    enforcedIn: { module: 'src/domain/eventClosure.ts', symbol: 'CLOSURE_LOSS' },
  },
  {
    id: 'VOID_IS_NOT_EMPTY',
    rule: 'A region with no admitted record renders void, and void must not read as empty.',
    distinguishes: ['The corpus is ignorant here', 'There is nothing here'],
    theFabrication: 'A smooth surface over a coverage gap. A learned layer that interpolates across ignorance is the most efficient fabrication machine available, because the output is plausible everywhere and attributable nowhere.',
    enforcedIn: { module: 'src/domain/earthComplex.ts', symbol: 'MANIFOLD_TRAPS' },
  },
  {
    id: 'UNANSWERABLE_IS_NOT_ABSENT',
    rule: 'A question this corpus cannot bound is refused as unanswerable, never as an absence of records.',
    distinguishes: ['The clock the question needs is not carried', 'Nothing was found'],
    theFabrication: 'Answering *what the source knew by D* on this system’s knowledge time, which invents a corpus that knew things it did not know. The refusal is decided before the records are consulted, so no later check can quietly answer it.',
    enforcedIn: { module: 'src/domain/corpus.ts', symbol: 'QUESTION_NOT_ANSWERABLE' },
  },
  {
    id: 'ABSENCE_IS_NOT_A_ZERO',
    rule: 'Absence has three readings and none of them is that the thing did not happen.',
    distinguishes: ['The ground does not cover this range, the source recorded nothing in a range it declared complete, or the two are indistinguishable', 'The event did not occur'],
    theFabrication: 'A silence read as a measurement. Absence is a fact about records and the world is not obliged to have been quiet just because the archive was.',
    enforcedIn: { module: 'src/domain/referenceGround.ts', symbol: 'ABSENCE_MEANING' },
  },
];

/**
 * What the industry has instead, said once so the contrast is legible: one
 * negative state, spelled null, doing the work of seven. Every collapse above
 * is available to any system that carries a value and no account of how the
 * value came to be missing.
 */
export const WHY_ONE_IS_NOT_ENOUGH = {
  theirs: 'A single null, which a consumer must interpret and will interpret as zero, false or absent depending on what the surrounding code expects.',
  ours: `${NEGATIVE_RULES.length} distinct negative states, each with a reason, a mechanism and a named fabrication it prevents.`,
  theTest: 'For a depositor, the difference between "your cargo was misdescribed" and "your inspector’s paperwork failed" is the difference between a claim and a phone call. A system with one negative state cannot express which of those happened, whatever its accuracy figure says.',
} as const;
