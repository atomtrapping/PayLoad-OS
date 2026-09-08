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
import { evaluateNode, type ConditionNode, type FactResolver, type NodeVerdict as ReleaseVerdict } from './conditionGrammar';
export * from './conditionGrammar';

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

/**
 * A release condition: an addressable identity, the counterparty's own wording
 * for the whole agreement, and a tree that compiles it.
 *
 * The tree is the thing the corpus evaluates; the agreed text is the thing a
 * dispute reads. Neither is derived from the other, because a term that has to
 * be rewritten in this system's grammar to be usable is a term nobody brings.
 * See conditionGrammar.ts for the node kinds.
 */
export interface ReleaseCondition {
  conditionId: string;
  root: ConditionNode;
  agreedText: string;
}

/**
 * A release verdict is a node verdict at the root, so it is that vocabulary.
 *
 * It was declared here with the same three members as `NodeVerdict`, which is
 * what a condition tree answers with. A release is adjudicated by evaluating
 * its root condition, so the two were always the same set — and a fourth
 * member added to one of them would have been silently accepted by the other
 * right up to the point where the root's verdict became the release's.
 *
 * The alias keeps the word that reads correctly at this scope while there is
 * only one declaration behind it.
 */
export type { NodeVerdict as ReleaseVerdict } from './conditionGrammar';

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

/**
 * Pure: does the condition hold on what the vehicle held at this instant?
 *
 * The as-of answer does the work, so every refusal the corpus already makes —
 * retracted, superseded, outside validity, not deliverable — becomes a reason
 * the release is withheld rather than a silent failure to fire.
 */
export function evaluateRelease(corpus: Corpus, release: CorpusRelease, condition: ReleaseCondition, decidedAtKnowledge: ISODateTime): ReleaseDecision {
  const standing: DecisionStanding = 'DEMONSTRATION';
  // Computed once, at the decision, and carried on it: a later audit reads the
  // risk neighbourhood off the decision rather than reconstructing it — and
  // bounded by the decision's own knowledge time, because an exposure computed
  // over everything the corpus has since learned is hindsight wearing the
  // decision's clothes. A decision made before the corpus had restated anything
  // must say so.
  const exposureAtDecision = restatementExposure(corpus, decidedAtKnowledge);
  const base = { condition, decidedAtKnowledge, standing, releaseId: release.releaseId, exposureAtDecision };

  // Every leg reaches the corpus through the same as-of answer, so a retracted,
  // superseded, out-of-validity or undeliverable record becomes a reason that
  // leg could not be decided rather than a silent failure to fire.
  const resolve: FactResolver = (subjectId, predicate) => {
    const answer = queryAsOf(corpus, release, {
      subjectId, predicate, validAt: decidedAtKnowledge, knownAt: decidedAtKnowledge, question: DISPUTE_QUESTION,
    });
    if (!answer.record) {
      return { fact: null, because: `${subjectId} ${predicate} at ${decidedAtKnowledge}: ${answer.refusal?.code ?? 'no answer'}. ${answer.refusal?.reason ?? ''}`.trim() };
    }
    const link = answer.identityLink ? [answer.identityLink.recordId] : [];
    void link;
    return {
      fact: {
        recordId: answer.record.recordId,
        value: answer.record.value,
        unit: answer.record.unit,
        validFrom: answer.record.validFrom,
      },
      because: '',
    };
  };

  const outcome = evaluateNode(condition.root, resolve);
  return {
    ...base,
    verdict: outcome.verdict,
    reliedOn: outcome.reliedOn,
    because: outcome.verdict === 'NOT_ADJUDICABLE'
      ? `${outcome.because} Nothing is released on an unadjudicable condition, and nothing is returned on one either — the vehicle stays held.`
      : outcome.because,
  };
}


/* ── What happened to the facts after the money moved ── */

/**
 * One retraction, measured against a decision already made.
 *
 * It was called `Restatement`, which collided with two other things: a
 * two-member union of the same name in ./dependencyIndex, since replaced by
 * RetractionKind, and the summary over all of these, which is
 * RestatementExposure below. Three uses of one word in one domain is how a
 * reader stops trusting the words.
 */
export interface RestatementEvent {
  retractionId: string;
  kind: Retraction['kind'];
  issuedAt: ISODateTime;
  affected: string[];
  /** Seconds between the decision and the restatement becoming knowable. The exposure window, measured. */
  lagSeconds: number;
  reason: string;
}

/**
 * What a release stands on now, as a closed vocabulary a consumer may route on.
 *
 * `reversed` and `unsupported` are separate booleans because they are separate
 * facts, but a downstream consumer handed two booleans will reach for one
 * branch and collapse them — which is how WITHDRAWN IS NOT FALSE gets violated
 * by a caller rather than by this module. So the terminal state is named here,
 * once, and the names cannot be flattened without saying so out loud.
 *
 * The distinction has a settlement consequence and not only a semantic one. A
 * reversal says the condition would now be decided the other way, which is a
 * finding. A withdrawal says the support is gone and nothing replaced it, which
 * is not a finding and must not be routed as one: the honest response is to
 * hold and seek a fresh ruling, not to move money as though something contrary
 * had been established.
 */
export type PostReleaseState =
  /** Nothing the decision relied on has been restated. */
  | 'STANDS'
  /** A correction replaced a value and the condition now reads the other way. */
  | 'REVERSED_ON_CORRECTION'
  /** Support was withdrawn with nothing put in its place. Not a contrary finding. */
  | 'UNSUPPORTED_BY_WITHDRAWAL'
  /** Facts were restated and the verdict did not move. */
  | 'RESTATED_WITHOUT_REVERSAL';

export const POST_RELEASE_MEANING: Record<PostReleaseState, { meaning: string; andSo: string }> = {
  STANDS: {
    meaning: 'Nothing the decision relied on has been restated as of the instant asked about.',
    andSo: 'That is the absence of a known correction, not a guarantee against a future one.',
  },
  REVERSED_ON_CORRECTION: {
    meaning: 'A correction replaced a value the decision stood on, and the same condition now reads the other way.',
    andSo: 'A finding. The decision was right on what was held and is wrong on what is held, and a consumer may act on that.',
  },
  UNSUPPORTED_BY_WITHDRAWAL: {
    meaning: 'A record the decision stood on was withdrawn with nothing put in its place.',
    andSo: 'Not a finding, and never to be routed as one. Nothing contrary has been established; what has happened is that the support is gone. A consumer that moves money on this is asserting a fact the corpus did not supply.',
  },
  RESTATED_WITHOUT_REVERSAL: {
    meaning: 'Facts the decision relied on were restated and the verdict did not move.',
    andSo: 'The correction moved a value without crossing the condition, which is luck about a threshold rather than a property of the process.',
  },
};

export interface ReleaseExposure {
  decision: ReleaseDecision;
  restatements: RestatementEvent[];
  /** The terminal state, named so a consumer cannot collapse a withdrawal into a reversal. */
  state: PostReleaseState;
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
  const restatements: RestatementEvent[] = corpus.retractions
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
  // Order matters: a withdrawal is checked before a reversal, because a
  // decision whose support was withdrawn has no contrary finding to report even
  // when the recomputed verdict differs — the recomputation is over a corpus
  // that has lost the record, not over one that contradicts it.
  const state: PostReleaseState = unsupported
    ? 'UNSUPPORTED_BY_WITHDRAWAL'
    : restatements.length === 0
      ? 'STANDS'
      : reversed
        ? 'REVERSED_ON_CORRECTION'
        : 'RESTATED_WITHOUT_REVERSAL';
  return { decision, restatements, state, verdictNow: now.verdict, reversed, unsupported, because };
}

/* ── Pricing the window, and refusing to ── */

/**
 * What it would take for the observed window to become a rate.
 *
 * Declared here rather than decided in the function, so that priceability is a
 * gate with named preconditions and not a permanent `false` someone eventually
 * deletes. When the corpus reaches these, ratePriceable flips on its own and the
 * discipline that was in place beforehand is the discipline that governs the
 * number afterwards.
 */
export const PRICEABILITY_GATE = {
  minRestatements: 30,
  minRecords: 500,
  requiresNonFixtureCorpus: true,
  why: 'A frequency needs a denominator. Two restatements over twenty-one synthetic records is an anecdote, and a rate computed from it would be multiplied by a real exposure by someone who did not read this sentence. The thresholds are a floor for the sample being worth arithmetic at all, not a claim that the rate is trustworthy at thirty.',
  andEvenThen: 'A rate over a corpus is a rate about that corpus’s sources and their behaviour. It answers what this corpus has restated, not what a new source will restate, and the two are different questions with different denominators.',
} as const;

export interface RestatementExposure {
  recordsCarried: number;
  corrections: number;
  withdrawals: number;
  /** Days between a record becoming knowable and a restatement of it being issued. */
  observedLagDays: number[];
  longestLagDays: number | null;
  /** Derived from PRICEABILITY_GATE against the corpus, never asserted. */
  ratePriceable: boolean;
  /** Which gate conditions are not met. Empty exactly when ratePriceable is true. */
  unmet: string[];
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
export function restatementExposure(corpus: Corpus, knownBy?: ISODateTime): RestatementExposure {
  // Bounded by a knowledge instant when one is given, so a decision can carry
  // the exposure the corpus actually knew about at the time rather than the
  // exposure hindsight supplies.
  const records = knownBy === undefined ? corpus.records : corpus.records.filter((r) => r.knownAt <= knownBy);
  const retractions = knownBy === undefined ? corpus.retractions : corpus.retractions.filter((r) => r.issuedAt <= knownBy);
  const byId = new Map<string, CorpusRecord>(records.map((r) => [r.recordId, r]));
  const lags: number[] = [];
  for (const retraction of retractions) {
    for (const id of retraction.affectedRecordIds) {
      const record = byId.get(id);
      if (!record) continue;
      const lag = (Date.parse(retraction.issuedAt) - Date.parse(record.knownAt)) / 86_400_000;
      if (Number.isFinite(lag) && lag >= 0) lags.push(Number(lag.toFixed(2)));
    }
  }
  lags.sort((a, b) => a - b);
  const corrections = retractions.filter((r) => r.kind === 'CORRECTION').length;
  const withdrawals = retractions.filter((r) => r.kind === 'WITHDRAWAL').length;
  const longest = lags.length ? lags[lags.length - 1] : null;
  const unmet: string[] = [];
  if (corrections + withdrawals < PRICEABILITY_GATE.minRestatements) unmet.push(`fewer than ${PRICEABILITY_GATE.minRestatements} restatements observed (${corrections + withdrawals})`);
  if (records.length < PRICEABILITY_GATE.minRecords) unmet.push(`fewer than ${PRICEABILITY_GATE.minRecords} records carried (${records.length})`);
  if (PRICEABILITY_GATE.requiresNonFixtureCorpus && corpus.fixture_only) unmet.push('the corpus is a committed demonstration, so its restatement behaviour is authored rather than observed');
  return {
    recordsCarried: records.length,
    corrections,
    withdrawals,
    observedLagDays: lags,
    longestLagDays: longest,
    ratePriceable: unmet.length === 0,
    unmet,
    statement: longest === null
      ? 'This corpus carries no restatement of any record, so there is no observed window at all. An unobserved window is not a short one.'
      : `${corrections + withdrawals} restatements over ${corpus.records.length} records, the longest arriving ${longest} days after the record it restates became knowable. That is the observed exposure window and it is not a rate: a handful of events over one synthetic corpus supports an anecdote, not a frequency, and a vehicle that held deposits for ${Math.ceil(longest)} days on this evidence would be pricing a number it does not have. The window becomes estimable when the corpus has run long enough to have a denominator.`,
  };
}

/* ── Where a release could execute, stated as properties rather than as a venue ── */

/**
 * The vehicle targets a property set, not a chain.
 *
 * Venues churn and adapters are cheap, so naming one in the design would be
 * betting the architecture on a vendor. What a release actually requires is
 * four properties; any venue that has them can host one, and the routing table
 * already treats engines this way.
 */
export const VENUE_PROPERTIES = [
  { property: 'Non-custodial hold', why: 'The collateral is held by the chain or a qualified custodian. A venue that requires the evaluator to hold it is asking for the one thing this role must never do.' },
  { property: 'Verifiable release execution', why: 'A third party can check that the release logic ran as written, without being handed the corpus.' },
  { property: 'A binding point for an attestation', why: 'The decision travels with the release rather than beside it, so what executed and what it executed on are one artifact.' },
  { property: 'A settlement leg that is somebody else’s', why: 'Whether funds move is the vehicle contract’s business. Adjudication and settlement stay separate, which is the same separation the corpus keeps between evidence and assertion.' },
] as const;

/**
 * Two kinds of attestor, and only one of them is scarce.
 *
 * An execution attestor proves a program ran: given the program and the inputs,
 * any competent operator can produce the same proof, so the qualification is
 * commodity by construction. A fact attestor claims something about the world,
 * which nobody can re-derive from the inputs, so the qualification is whatever
 * estate stands behind the claim — and specifically whether it can still say
 * something useful once the claim is restated.
 *
 * That second half is the part that is usually missing and is measurable here:
 * exposureAfter and restatementExposure are what standing behind a fact looks
 * like when the fact changes.
 */
export const ATTESTOR_KINDS = [
  {
    kind: 'EXECUTION',
    proves: 'That a program ran on given inputs and produced this output.',
    scarcity: 'Commodity. The proof is reproducible by anyone holding the program and the inputs, which is the property that makes an open attestor set work at all.',
    saysNothingAbout: 'Whether the inputs described the world. A verified computation over an asserted fact is a verified assertion.',
  },
  {
    kind: 'FACT',
    proves: 'That an event happened, on receipted evidence, at a stated instant, under a named adjudication.',
    scarcity: 'Estate-dependent. Nobody can re-derive it from the inputs, so the qualification is the corpus behind it: two clocks, declared provenance, and a correction tape.',
    saysNothingAbout: 'Whether the fact will still read the same next week — but it can say what has been restated, how long that took, and what the decision would be now, which is the difference between standing behind a fact and having published one.',
  },
] as const;

/**
 * Whose trust model governs when the venue has one of its own.
 *
 * A hardware enclave and a proof both let a counterparty verify without
 * inspecting, which makes them easy to treat as interchangeable. They are not:
 * an enclave's assurance terminates in a manufacturer's attestation chain and a
 * proof's terminates in mathematics. Either is fine as a venue feature. Neither
 * may become the reason a fact is believed, because that would move the ground
 * of the claim from the corpus to a vendor.
 */
export const TRUST_ORDER = {
  first: 'The adjudication and its receipt. The fact is believed because of the evidence and the ruling over it.',
  second: 'A proof, where one is wanted, that the declared policy ran. Mathematical, and it says the policy ran rather than that the policy was right.',
  third: 'A venue feature — an enclave, an attestor set, a transport verifier — which is convenience and never ground.',
  theConfusion: 'Transport verification is not content testimony. A verifier that checks a message crossed correctly has verified the message, and nobody in that stack has verified that the condition inside it was adjudicated rather than asserted. Two verification layers are needed and the industry has built the pipe one.',
} as const;

/* ── What is missing before any of this is real ── */

export const VEHICLE_SEQUENCE = [
  'An admitted record. Every decision here is stamped DEMONSTRATION because no candidate has crossed the gate, and money must not move on a demonstration.',
  'A live source for the condition class. A delivery condition needs a delivery observed by something other than the party who wants the money.',
  'Two channels on the event, so the condition is corroborated rather than restated. One channel that also benefits from the release is the adversarial-oracle case with extra steps.',
  'A custody arrangement that is explicitly not ours, written down before the first deposit rather than after the first dispute.',
  'A denominator. The exposure window is currently an anecdote, and the first product should be one whose condition is cheap to be wrong about.',
] as const;
