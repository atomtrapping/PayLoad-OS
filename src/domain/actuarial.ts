/**
 * The one profession whose obligations already are this doctrine.
 *
 * Most customers have to be persuaded that provenance is worth paying for.
 * Actuaries do not: their own standards of practice require them to assess the
 * data they use, to review its sources and to disclose its limitations in
 * writing, and a signing actuary carries personal professional liability for
 * the opinion. Governance is not an upsell there; it is the condition of being
 * able to sign at all.
 *
 * The correspondence is unusually exact, and in two places it is not a
 * correspondence but the same object. A loss development triangle indexed by
 * accident period and reporting period is bitemporality — the gap between them
 * is what the profession calls incurred-but-not-reported, and it is valid time
 * against knowledge time with a century of practice behind it. And credibility
 * theory is the disagreement layer: the formal treatment of how much weight a
 * thin, unreliable source deserves against a thick, reliable one.
 *
 * Two honest limits are recorded with the mapping. This module names standards
 * and concepts in the profession's own vocabulary and does not restate their
 * obligations: what a standard requires of a member is the profession's to
 * state, and a data supplier that paraphrases it is inventing a duty. And the
 * distribution is incumbent-held, so the entry is the adjacent layer rather
 * than the classification schemes nobody displaces.
 *
 * Nothing here sells anything, models a loss, or claims a customer. No actuary,
 * carrier or engagement exists.
 */
import type { Corpus } from './corpus';

/* ── The isomorphism ── */

/** How close the correspondence is. IDENTICAL is used twice and both are earned. */
export type FitDepth = 'IDENTICAL' | 'SAME_PROBLEM' | 'ADJACENT';

export const FIT_DEPTH_LABEL: Record<FitDepth, string> = {
  IDENTICAL: 'The same object under two names',
  SAME_PROBLEM: 'The same problem, solved separately in each tradition',
  ADJACENT: 'Their open problem, and machinery here that bears on it',
};

export interface Correspondence {
  ours: string;
  theirs: string;
  depth: FitDepth;
  /** Why the correspondence holds, said precisely enough to be arguable. */
  why: string;
  /** What exists here, so the mapping is not read as a capability claim. */
  here: string;
}

export const CORRESPONDENCES: readonly Correspondence[] = [
  {
    ours: 'Valid time and knowledge time on every record',
    theirs: 'The loss development triangle: accident period against reporting period, and the incurred-but-not-reported gap between them',
    depth: 'IDENTICAL',
    why: 'The triangle is a bitemporal structure. The development lag is the interval between when something was true and when it became knowable, which is the pair of clocks this corpus carries on every claim rather than on losses alone.',
    here: 'Both clocks are carried, the as-of query clamps knowledge time to the release cutoff, and supersession is a recorded event. Nothing is arranged as a triangle, because nothing has a development history yet.',
  },
  {
    ours: 'The disagreement layer and independence weighting',
    theirs: 'Credibility theory: how much weight a thin, volatile source earns against a thick, stable one',
    depth: 'SAME_PROBLEM',
    why: 'Both are the problem of combining sources of unequal reliability without pretending the combination is more certain than its parts. One tradition reached it through reserving, the other through provenance.',
    here: 'Disagreement is representable and reported; no weight is fitted, because no verdict is retained and no source lineage exists to establish independence.',
  },
  {
    ours: 'Provenance on every record, source registration, declared limitations',
    theirs: 'The data-quality standard of practice, which concerns reviewing data, assessing its suitability and disclosing its limitations',
    depth: 'SAME_PROBLEM',
    why: 'A receipt is the artifact that discipline produces. Where the standard obliges a member to document what the data can and cannot support, a corpus that emits that documentation with the data removes the reconstruction rather than the obligation.',
    here: 'Every record names its source, artifact, digest and evidence class, and every surface states what it does not establish. No engagement has ever consumed one.',
  },
  {
    ours: 'Constraint stacks, calibration, and the frame-validity boundary',
    theirs: 'Model validation and model-risk governance, as the modelling standard and the solvency regimes treat it',
    depth: 'SAME_PROBLEM',
    why: 'Their regime asks whether a model is fit for its purpose and whether its assumptions are documented and reviewed. That is the frame-validity question, and the reference channel is the answer to it that filters cannot give.',
    here: 'The constraint contract and the invariant tiers are declared; nothing is enforced, nothing is scored, and the reference channel is absent.',
  },
  {
    ours: 'As-of reconstruction over a release',
    theirs: 'The reserve rollforward and the valuation-date statement: what was believed at a stated date, as a reportable object',
    depth: 'IDENTICAL',
    why: 'A valuation-date statement is an as-of answer with a legal reader. Reconstructing what was believed at a date is the same operation the release cutoff already performs, and the same one a triangle re-reads every quarter.',
    here: 'The as-of query answers over a release and refuses outside it. No valuation date has ever been asked of it by anyone but a test.',
  },
  {
    ours: 'The measurement economy: what an observation is worth before buying it',
    theirs: 'The data-acquisition decision inside the pricing and reserving cycle',
    depth: 'SAME_PROBLEM',
    why: 'The same question at two cadences: theirs annual and portfolio-wide, this one per measurement. Both are value of information against cost.',
    here: 'Instruments are priced and an optimizer chooses among them over a declared milestone. No portfolio and no cycle exists.',
  },
  {
    ours: 'The port set, the event ledger and meteorological forcing',
    theirs: 'Catastrophe modelling and emerging risk: physical-economy trend detection under a changing climate',
    depth: 'ADJACENT',
    why: 'This is the profession’s hardest current problem rather than its settled machinery, and what it lacks is an event archive with attribution — which is what a membership ledger with both clocks and a forcing field would be.',
    here: 'The grammar is declared and nothing is acquired: no port, no membership, no forcing, no event.',
  },
  {
    ours: 'Human adjudication: computation informs, a person rules',
    theirs: 'The signing actuary, a defined authority who certifies an opinion under personal liability',
    depth: 'IDENTICAL',
    why: 'The authority architecture is the same architecture. A system whose computations never become facts without a human ruling is describing, in engineering terms, a role their profession defines in statute and in licence.',
    here: 'The rulings are fixture-backed. The admission ruling is called — on the statutory harvester path and by the admit CLI — but no candidate from the committed corpus has been put through it and no row it produced is served, so nothing here has ever been certified by anyone.',
  },
];

/* ── What follows commercially, and what does not ── */

export const MANDATE_INVERSION = {
  claim: 'For most buyers, governance is something to be persuaded of. Here it is already required of the buyer, so the offer inverts: not better data with provenance attached, but the documentation a signer would otherwise reconstruct by hand.',
  because: 'A data supplier that arrives with the audit trail removes work from a person who is professionally accountable for producing it. That is a different purchase from a feed, and it is not shopped the same way.',
  restraint: 'This module does not state what any standard obliges a member to do. Naming a standard and its subject is the limit; paraphrasing its requirements would be a supplier inventing a professional duty, which is exactly the overreach the doctrine refuses elsewhere.',
} as const;

export const ENTRY_CAUTIONS = [
  { caution: 'Distribution is incumbent-held', detail: 'The established aggregators hold deep, expensive relationships and the classification schemes the market runs on. Nothing here displaces a classification, and pretending otherwise is the fastest way to be dismissed.', entry: 'The adjacent layer: adjudicated operational state, physical-economy exposure, and event evidence with provenance — the things aggregated coarsely or not at all.' },
  { caution: 'Conservative buyers, and rightly', detail: 'Professional conservatism is the same instinct as the refusals in this system. It is a reason the fit is real, and a reason the cycle is long.', entry: 'One design partner, one backtest, one artifact that reads natively. Not a launch.' },
  { caution: 'The vocabulary bridge is real work', detail: 'Accident period, development lag, credibility, valuation date. A surface that speaks the corpus’s vocabulary at someone who thinks in triangles is asking them to translate, which is the cost the supplier should be absorbing.', entry: 'Their terms verbatim at the boundary, the canonical vocabulary underneath, and one mapping table that is the only place the two meet.' },
] as const;

/**
 * The artefact this mapping is for. Recorded so it is a stated intention with a
 * shape rather than an aspiration, and so its precondition is visible.
 */
export const TRIANGLE_SHAPED_RESULT = {
  intent: 'When a backtest exists, present it as a development shape: lead time expressed as a reduction in reporting lag, read in the grammar a reserving reader already reads.',
  because: 'A result presented in the reader’s own structure is evaluated on its merits. A result presented in the supplier’s structure is evaluated on whether the reader wants to learn the supplier’s structure.',
  precondition: 'A backtest requires an outcome series to test against, which requires admitted records over a period. The admission ruling now exists and has admitted nothing, so this is a shape to build toward and not a claim.',
  state: 'ABSENT' as const,
} as const;

/* ── What exists ── */

export interface ActuarialStanding {
  correspondences: number;
  identicalPairs: number;
  developmentHistories: number;
  valuationDatesAnswered: number;
  engagements: number;
  statement: string;
}

/** Pure: the mapping is complete and everything it maps to is empty. */
export function actuarialStanding(corpus: Corpus): ActuarialStanding {
  const identical = CORRESPONDENCES.filter((c) => c.depth === 'IDENTICAL').length;
  return {
    correspondences: CORRESPONDENCES.length,
    identicalPairs: identical,
    developmentHistories: 0,
    valuationDatesAnswered: 0,
    engagements: 0,
    statement: `${CORRESPONDENCES.length} correspondences, ${identical} of them the same object under two names. The corpus holds ${corpus.records.length} records over ${corpus.releases.length} releases and no development history, has answered no valuation date for anyone, and has no engagement — so this is a mapping of the machinery, not evidence that anyone has used it.`,
  };
}
