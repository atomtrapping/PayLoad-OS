/**
 * Conditional custody: hold, monitor, adjudicate, release.
 *
 * A deposit is placed against conditions. It is held while the conditions are
 * unmet, and released when an adjudicated fact says they are met. This is the
 * documentary credit — a bill of lading released against payment — with the
 * documents replaced by receipts. It is the oldest trusted-intermediary role in
 * commerce, and it is not an insurance product: there is no pooled capital, no
 * priced risk and no contingent payout. The exposure is not actuarial but
 * notarial. Did the condition fire correctly, on the right evidence, at a
 * stated instant?
 *
 * That distinction decides everything downstream. An underwriter is a party to
 * the outcome; a stakeholder is not, and neutrality is the whole service rather
 * than something spent to obtain the business. So this module is written around
 * what the role must never become — and those are refusals in the type, not
 * cautions in a comment.
 *
 * THE RISK NOBODY WRITES DOWN
 *
 * Release is irreversible and facts are not.
 *
 * A chain settles at machine speed. A correction arrives at world speed. The
 * gap between them is the entire liability of this role, and it is the one
 * quantity a general-purpose oracle cannot even represent, because an oracle
 * publishes a value and has no notion of that value being restated later. This
 * corpus does: a retraction is a first-class object, records carry both clocks,
 * and a superseded record keeps its identity rather than being edited away.
 *
 * So the vehicle can do something an oracle cannot: state its own restatement
 * exposure *before* releasing, and state, after releasing, exactly which facts
 * it relied on that have since been restated — without un-firing anything,
 * because a release that has fired is history and history is not corrected by
 * mutation.
 *
 * Two kinds of restatement, and they are not the same kind of trouble. A
 * CORRECTION replaces a value: the world was as it was, the corpus said it
 * wrong, and the release may or may not still be right depending on the
 * condition. A WITHDRAWAL removes support: the record is gone and nothing takes
 * its place, so the release now stands on nothing — which is not the same as
 * standing on something false. Withdrawn is not false, here as everywhere else
 * in this system, and a vehicle that conflates them would tell a depositor its
 * cargo was misdescribed when what actually happened is that an inspector's
 * certificate was withdrawn for a chain-of-custody defect.
 *
 * Nothing here holds an asset, moves money, or exists as a deployed vehicle.
 * No release has fired. The corpus is a committed demonstration, so every
 * decision this module reaches over it is stamped DEMONSTRATION and can never
 * be BINDING.
 */
import type { Corpus, CorpusRecord, CorpusRelease, Retraction } from './corpus';
import type { ISODateTime } from './types';
import { queryAsOf, recordStatusAt } from './corpus';

export const VEHICLE_METHOD = 'notationsos.conditional-custody.v1';

/* ── The role ── */

export const VEHICLE_ROLE = {
  is: 'The condition evaluator: the party that decides, on receipted evidence and a stated clock, whether a release condition was met.',
  isNot: [
    'Not the custodian. The collateral is held by the chain or by a qualified custodian, never here, because holding client assets is a licensed activity and taking it on would trade the whole position for a fee on float.',
    'Not the underwriter. Nothing here prices a risk or bears a loss. A stakeholder that also has a stake is not a stakeholder.',
    'Not the counterparty. The vehicle is neutral between depositor and beneficiary, and neutrality is the product rather than a cost of doing business.',
    'Not the settlement layer. Whether funds move is the vehicle contract’s business; whether the condition was met is this one’s.',
  ],
  why: 'Every one of those roles is available, profitable and fatal to the same asset: a witness both sides accept. A protocol that owns its own oracle is a protocol nobody should underwrite, and the reasoning does not change when the oracle is us.',
} as const;

export interface Prohibition {
  act: string;
  why: string;
  /** Where the refusal lives, so it is a mechanism rather than a promise. */
  enforcedHere: string;
}

export const NEVER: readonly Prohibition[] = [
  {
    act: 'Hold the collateral.',
    why: 'Custody of client assets is a licensed activity in every jurisdiction that matters. Taking it on buys a fee on float at the price of a licensing wall and a balance-sheet exposure, and it converts a service into a financial institution.',
    enforcedHere: 'No balance, no account and no transfer appears in this module or anywhere in this repository. The vehicle contract holds; this decides.',
  },
  {
    act: 'Warrant the outcome.',
    why: 'A vehicle that warrants the cargo warrants the world. What can honestly be warranted is the adjudication: this condition, this evidence, this instant, this ruling.',
    enforcedHere: 'LIABILITY_BOUNDARY states what is attested and what is not, and every decision carries the evidence it stood on rather than a conclusion about the thing itself.',
  },
  {
    act: 'Un-fire a release.',
    why: 'A release that has fired is history. Correcting it by mutation would make the ledger lie about what was decided, which is the failure this corpus’s whole correction machinery exists to avoid.',
    enforcedHere: 'exposureAfter reports restatements against a decision and never alters it; a decision object has no mutable field.',
  },
  {
    act: 'Release on a record that never crossed the admission gate.',
    why: 'A demonstration record is not corpus state, whatever it says. Money moving on one would be the seeder’s fixtures wearing a ruling’s clothes.',
    enforcedHere: 'Every decision carries a standing, and a decision over a fixture-only corpus is DEMONSTRATION and can never be BINDING.',
  },
  {
    act: 'Infer a source clock to answer a dispute.',
    why: 'A dispute asks what the vehicle held at the release instant. It does not ask what the source knew, and answering the second with the first invents a vehicle that knew things it did not know.',
    enforcedHere: 'DISPUTE_QUESTION fixes the as-of question to WHAT_WE_HELD, which the corpus can bound; the other question is refused by queryAsOf as QUESTION_NOT_ANSWERABLE.',
  },
];

export const LIABILITY_BOUNDARY = {
  attests: 'That on the evidence held at the stated instant, under the stated condition, the adjudication reached this verdict — and that the evidence is exactly what the receipt names.',
  doesNotWarrant: 'That the cargo is fit, that the facility is sound, that the delivery occurred, or that the evidence describes the world correctly. The vehicle mirrors the record, and the record mirrors what a source declared.',
  soADispute: 'A dispute about the cargo is with the source that declared it. A dispute about the release is with the vehicle, and it is answered by reconstruction rather than argument.',
} as const;

/* ── The lifecycle, and the machinery each stage is made of ── */

export type VehicleState = 'DEPOSITED' | 'HELD' | 'CONDITION_MET' | 'RELEASED' | 'RETURNED';

export interface Stage {
  state: VehicleState;
  what: string;
  machinery: string;
  /** What exists in this repository for it today. */
  here: string;
}

export const LIFECYCLE: readonly Stage[] = [
  { state: 'DEPOSITED', what: 'Collateral placed against a named condition, by a named depositor, for a named beneficiary.', machinery: 'A receipted custody record with both clocks: what was deposited, by whom, against which condition.', here: 'The receipt and clock machinery exist. No deposit has been made and no vehicle is deployed.' },
  { state: 'HELD', what: 'The standby state. The condition is monitored and has not fired.', machinery: 'The corpus watching the underlying: the event ledger, the port set, the vessel state.', here: 'The watchers are specified. The corpus carries no live source, so nothing is being watched.' },
  { state: 'CONDITION_MET', what: 'An adjudicated event says the condition is satisfied.', machinery: 'The ruling layer over an admitted record, with the evidence class and both clocks.', here: 'evaluateRelease reaches the verdict. Over this corpus it is stamped DEMONSTRATION, because no record has been admitted.' },
  { state: 'RELEASED', what: 'The vehicle contract executes. Funds move; this module does not move them.', machinery: 'The decision, its receipt, and the attestation the vehicle contract binds in.', here: 'No release has fired.' },
  { state: 'RETURNED', what: 'The condition failed within its window and the collateral goes back.', machinery: 'The same adjudication, reaching WITHHELD at the window’s end.', here: 'Symmetrical with release and equally unexercised.' },
];

/* ── A release condition ── */

export type ConditionTest = 'AT_LEAST' | 'AT_MOST' | 'EQUALS' | 'EXISTS';

export interface ReleaseCondition {
  conditionId: string;
  /** The subject the condition is about: a lot, a vessel, a facility. */
  subjectId: string;
  predicate: string;
  test: ConditionTest;
  /** Absent for EXISTS, which asks only whether the corpus can answer at all. */
  value?: number | string;
  /** Prose the counterparties agreed to, kept verbatim so a dispute reads what was signed. */
  agreedText: string;
}

export type ReleaseVerdict = 'GRANTED' | 'WITHHELD' | 'NOT_ADJUDICABLE';

/**
 * BINDING would mean money may move on this. DEMONSTRATION means the record
 * behind it never crossed the admission gate, so the decision shows the
 * machinery and settles nothing.
 */
export type DecisionStanding = 'BINDING' | 'DEMONSTRATION';

export interface ReleaseDecision {
  condition: ReleaseCondition;
  /** The instant the vehicle decided, and the only clock a dispute may ask about. */
  decidedAtKnowledge: ISODateTime;
  verdict: ReleaseVerdict;
  standing: DecisionStanding;
  /** Every record the verdict stood on, by id. A dispute begins here. */
  reliedOn: string[];
  releaseId: string;
  /**
   * The corpus's restatement exposure at the instant this was decided, so a
   * later audit reads the decision's risk neighbourhood off the decision
   * rather than reconstructing what it was. A decision made over a corpus
   * that had never restated anything and one made over a corpus with a
   * five-day observed lag are different decisions, and only the record says
   * which this was. Carried, never priced: `ratePriceable` travels with it
   * and is false, so nobody multiplies a fixture-scale denominator by an
   * exposure and calls the product a risk.
   */
  exposureAtDecision: RestatementExposure;
  because: string;
}

/**
 * The dispute asks one question and the corpus can bound it. The other as-of
 * question — what the source had published by then — is refused rather than
 * answered on this corpus's clock, and that refusal is correct for a dispute:
 * a vehicle can only ever be accountable for what it held.
 */
export const DISPUTE_QUESTION = 'WHAT_WE_HELD' as const;

function compare(test: ConditionTest, actual: number | string, expected: number | string | undefined): boolean {
  if (test === 'EXISTS') return true;
  if (expected === undefined) return false;
  if (test === 'EQUALS') return String(actual) === String(expected);
  const left = Number(actual), right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return test === 'AT_LEAST' ? left >= right : left <= right;
}

const TEST_PROSE: Record<ConditionTest, string> = {
  AT_LEAST: 'at least', AT_MOST: 'at most', EQUALS: 'exactly', EXISTS: 'answerable at all',
};

/**
 * Pure: does the condition hold on what the vehicle held at this instant?
 *
 * The as-of answer does the work, so every refusal the corpus already makes —
 * retracted, superseded, outside validity, not deliverable — becomes a reason
 * the release is withheld rather than a silent failure to fire.
 */
export function evaluateRelease(corpus: Corpus, release: CorpusRelease, condition: ReleaseCondition, decidedAtKnowledge: ISODateTime): ReleaseDecision {
  const standing: DecisionStanding = 'DEMONSTRATION';
  // Computed once, at the decision, and carried on it: a later audit reads
  // the risk neighbourhood off the decision rather than reconstructing it.
  const exposureAtDecision = restatementExposure(corpus);
  const base = { condition, decidedAtKnowledge, standing, releaseId: release.releaseId, exposureAtDecision };
  const answer = queryAsOf(corpus, release, {
    subjectId: condition.subjectId,
    predicate: condition.predicate,
    validAt: decidedAtKnowledge,
    knownAt: decidedAtKnowledge,
    question: DISPUTE_QUESTION,
  });
  if (!answer.record) {
    return {
      ...base, verdict: 'NOT_ADJUDICABLE', reliedOn: [],
      because: `The corpus cannot answer the condition at ${decidedAtKnowledge}: ${answer.refusal?.code ?? 'no answer'}. ${answer.refusal?.reason ?? ''} Nothing is released on an unanswerable condition, and nothing is returned on one either — the vehicle stays held.`.trim(),
    };
  }
  const met = compare(condition.test, answer.record.value, condition.value);
  const stated = condition.test === 'EXISTS' ? '' : ` ${TEST_PROSE[condition.test]} ${condition.value}${answer.record.unit ? ` ${answer.record.unit}` : ''}`;
  return {
    ...base,
    verdict: met ? 'GRANTED' : 'WITHHELD',
    reliedOn: [answer.record.recordId, ...(answer.identityLink ? [answer.identityLink.recordId] : [])],
    because: `${answer.record.recordId} states ${answer.record.value}${answer.record.unit ? ` ${answer.record.unit}` : ''} against a condition of${stated || ' existence'}, so the condition ${met ? 'holds' : 'does not hold'} on what was knowable at ${decidedAtKnowledge}. This is a statement about the record, not about the cargo.`,
  };
}

/* ── What happened to the facts after the money moved ── */

export interface Restatement {
  retractionId: string;
  kind: Retraction['kind'];
  issuedAt: ISODateTime;
  affected: string[];
  /** Seconds between the decision and the restatement becoming knowable. The exposure window, measured. */
  lagSeconds: number;
  reason: string;
}

export interface ReleaseExposure {
  decision: ReleaseDecision;
  restatements: Restatement[];
  /** What the same condition evaluates to now, on everything the corpus has since learned. */
  verdictNow: ReleaseVerdict;
  /** The verdict changed. On a GRANTED decision this is the case that costs money. */
  reversed: boolean;
  /** A record the decision stood on was withdrawn with nothing put in its place. */
  unsupported: boolean;
  because: string;
}

/**
 * Pure: which facts the decision relied on have since been restated, and what
 * the condition would say now. This never alters the decision — a release that
 * fired is history — and it never treats a withdrawal as a finding about the
 * world.
 */
export function exposureAfter(corpus: Corpus, release: CorpusRelease, decision: ReleaseDecision, nowKnowledge: ISODateTime): ReleaseExposure {
  const relied = new Set(decision.reliedOn);
  const decidedMs = Date.parse(decision.decidedAtKnowledge);
  const restatements: Restatement[] = corpus.retractions
    .filter((r) => r.affectedRecordIds.some((id) => relied.has(id)))
    .filter((r) => r.issuedAt > decision.decidedAtKnowledge && r.issuedAt <= nowKnowledge)
    .map((r) => ({
      retractionId: r.retractionId, kind: r.kind, issuedAt: r.issuedAt,
      affected: r.affectedRecordIds.filter((id) => relied.has(id)),
      lagSeconds: Math.max(0, (Date.parse(r.issuedAt) - decidedMs) / 1000),
      reason: r.reason,
    }))
    .sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));

  const now = evaluateRelease(corpus, release, decision.condition, nowKnowledge);
  const reversed = restatements.length > 0 && now.verdict !== decision.verdict;
  const unsupported = restatements.some((r) => r.kind === 'WITHDRAWAL')
    && decision.reliedOn.some((id) => {
      const record = corpus.records.find((x) => x.recordId === id);
      return record !== undefined && recordStatusAt(corpus, record, nowKnowledge) === 'RETRACTED';
    });

  let because: string;
  if (restatements.length === 0) {
    because = `Nothing the decision relied on has been restated as of ${nowKnowledge}. That is the absence of a known correction and not a guarantee against a future one.`;
  } else if (unsupported) {
    because = `A record the decision stood on was withdrawn with nothing put in its place, so the release now rests on nothing. That is not a finding that the condition was false — a withdrawal removes support, it does not supply a contrary fact, and the two must not be reported as the same thing.`;
  } else if (reversed) {
    because = `The decision was ${decision.verdict} and the same condition now reads ${now.verdict} on corrected facts, ${restatements.map((r) => `${r.retractionId} after ${Math.round(r.lagSeconds / 86_400)} d`).join(', ')}. The decision was right on what was held and is wrong on what is held, which is precisely the exposure this role carries and cannot eliminate.`;
  } else {
    because = `Facts the decision relied on were restated (${restatements.map((r) => r.retractionId).join(', ')}) and the verdict is unchanged. The correction moved the value without crossing the condition, so the release stands — which is luck about a threshold rather than a property of the process.`;
  }
  return { decision, restatements, verdictNow: now.verdict, reversed, unsupported, because };
}

/* ── Pricing the window, and refusing to ── */

export interface RestatementExposure {
  recordsCarried: number;
  corrections: number;
  withdrawals: number;
  /** Days between a record becoming knowable and a restatement of it being issued. */
  observedLagDays: number[];
  longestLagDays: number | null;
  /** Whether the sample supports a rate. It does not. */
  ratePriceable: boolean;
  statement: string;
}

/**
 * Pure: what this corpus has actually observed about its own corrections.
 *
 * The vehicle would like to hold a deposit past the window in which a fact is
 * likely to be restated, and that window is an empirical quantity. This
 * computes what has been observed and then declines to turn it into a rate,
 * because two restatements support an anecdote and not a frequency — the same
 * credibility problem an actuary would name immediately, arriving here through
 * the collateral door.
 */
export function restatementExposure(corpus: Corpus): RestatementExposure {
  const byId = new Map<string, CorpusRecord>(corpus.records.map((r) => [r.recordId, r]));
  const lags: number[] = [];
  for (const retraction of corpus.retractions) {
    for (const id of retraction.affectedRecordIds) {
      const record = byId.get(id);
      if (!record) continue;
      const lag = (Date.parse(retraction.issuedAt) - Date.parse(record.knownAt)) / 86_400_000;
      if (Number.isFinite(lag) && lag >= 0) lags.push(Number(lag.toFixed(2)));
    }
  }
  lags.sort((a, b) => a - b);
  const corrections = corpus.retractions.filter((r) => r.kind === 'CORRECTION').length;
  const withdrawals = corpus.retractions.filter((r) => r.kind === 'WITHDRAWAL').length;
  const longest = lags.length ? lags[lags.length - 1] : null;
  return {
    recordsCarried: corpus.records.length,
    corrections,
    withdrawals,
    observedLagDays: lags,
    longestLagDays: longest,
    ratePriceable: false,
    statement: longest === null
      ? 'This corpus carries no restatement of any record, so there is no observed window at all. An unobserved window is not a short one.'
      : `${corrections + withdrawals} restatements over ${corpus.records.length} records, the longest arriving ${longest} days after the record it restates became knowable. That is the observed exposure window and it is not a rate: a handful of events over one synthetic corpus supports an anecdote, not a frequency, and a vehicle that held deposits for ${Math.ceil(longest)} days on this evidence would be pricing a number it does not have. The window becomes estimable when the corpus has run long enough to have a denominator.`,
  };
}

/* ── What is missing before any of this is real ── */

export const VEHICLE_SEQUENCE = [
  'An admitted record. Every decision here is stamped DEMONSTRATION because no candidate has crossed the gate, and money must not move on a demonstration.',
  'A live source for the condition class. A delivery condition needs a delivery observed by something other than the party who wants the money.',
  'Two channels on the event, so the condition is corroborated rather than restated. One channel that also benefits from the release is the adversarial-oracle case with extra steps.',
  'A custody arrangement that is explicitly not ours, written down before the first deposit rather than after the first dispute.',
  'A denominator. The exposure window is currently an anecdote, and the first product should be one whose condition is cheap to be wrong about.',
] as const;
