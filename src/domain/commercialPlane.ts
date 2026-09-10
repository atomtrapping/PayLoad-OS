/**
 * The commercial plane: selling from the corpus rather than beside it.
 *
 * A conventional AI sales system knows a CRM, an inbox, a company website and
 * whatever generic research it can scrape. It picks prospects because a
 * classification code matched, and it writes to them about a problem it has
 * guessed they have.
 *
 * This one can know something structurally different: which facilities an
 * organization operates, what materials they consume, which suppliers appear
 * upstream, which corridors they depend on, what changed recently, and what
 * alternatives exist. Prospect selection stops being a list-buying exercise and
 * becomes a mining workload — rank accounts by the evidence that they have a
 * problem, not by the evidence that they exist.
 *
 * THE SAME ARROWS, BECAUSE THE FAILURE MODE IS THE SAME
 *
 * observe → infer → opportunity → propose → authorize → execute → observe.
 *
 * There is no second architecture here and there should not be one. An
 * opportunity is a derived artifact, produced by a prescriptive workload,
 * carrying the class it was computed at. An engagement proposal is a proposal
 * in exactly the sense the action layer already means: an agent may draft it
 * and must not send it. Procurement agents, logistics agents, research agents
 * and sales agents are different bounded actors over one evidence-bearing
 * state, not five disconnected products — and the reason to keep them that way
 * is that the substrate is what makes any of them worth deploying.
 *
 * WHERE THIS PLANE IS MOST TEMPTING TO BREAK
 *
 * An outbound message is a serving surface. It is the surface where a hedge
 * costs a reply, so it is the surface where a model inference most wants to be
 * written as a fact. "We identified concentration in your supply network"
 * reads better than "in what our evidence shows of your supply network", and
 * the first sentence is a claim about the customer's operations that the corpus
 * cannot support.
 *
 * So a claim cited in an engagement is a served claim, subject to the same
 * constraint as one served through the feed: presented as the class it was
 * computed at, or not presented. `src/db/commercialLedger.ts` is where that
 * stops being an editorial preference.
 *
 * AND THE OUTCOME COMES BACK THROUGH THE FRONT DOOR
 *
 * What happened after an engagement is evidence about the firm's own
 * commercial state, and it is more valuable than the engagement was: which
 * physical-economic conditions actually correspond to willingness to buy
 * information is not knowable from outside and is not purchasable. It returns
 * through the admission boundary like any other observation. There is no
 * privileged path for the firm's own data.
 *
 * NOTHING IS SOLD
 *
 * No opportunity has been detected, because no corpus has been mined, because
 * nothing has been admitted. `commercialStanding()` derives that rather than
 * printing it.
 */
import type { ClaimClass } from './discoveryLayer';

/* ── The pipeline ── */

export const COMMERCIAL_PIPELINE = [
  'Corpus',
  'Mining',
  'Opportunity detection',
  'Engagement proposal',
  'Authorization',
  'Engagement',
  'Commercial outcome',
  'New evidence',
] as const;

/** The arrows, as the action layer states them, in commercial words. */
export const COMMERCIAL_ARROWS: readonly string[] = [
  'A detected opportunity is not an engagement.',
  'An engagement proposal is not an authorization to send it.',
  'A sent message is not a commercial outcome.',
];

export const SEPARATION_RULE =
  'Knowing something is not deciding something is not doing something.';

/* ── What an opportunity is ── */

/**
 * The fields an opportunity must carry. `trigger` and `evidence` are separate
 * on purpose: the trigger is what the corpus noticed, and the evidence is what
 * it noticed it in. An opportunity that can state the first and not the second
 * is a hunch with a schema.
 */
export interface OpportunityField {
  field: string;
  answers: string;
  required: boolean;
}

export const OPPORTUNITY_FIELDS: readonly OpportunityField[] = [
  { field: 'account', answers: 'Which organization, by canonical identity rather than by name.', required: true },
  { field: 'trigger', answers: 'What the corpus noticed. A condition, not a category.', required: true },
  { field: 'evidence', answers: 'The derived artifacts and records the trigger rests on.', required: true },
  { field: 'needHypothesis', answers: 'What is being supposed about the account, stated as a supposition.', required: true },
  { field: 'productFit', answers: 'Which information product would reduce their decision loss, and how.', required: true },
  { field: 'estimatedValue', answers: 'What it might be worth to them, with the estimate marked as one.', required: false },
  { field: 'confidence', answers: 'How uncertain the hypothesis is. An opportunity is a fitted claim and carries one.', required: true },
];

/**
 * An opportunity is a derived artifact of a fitted class. Never a computed
 * result: "this account has a problem we can help with" is a hypothesis about
 * an organization's intentions, and arithmetic does not produce those.
 */
export const OPPORTUNITY_CLASSES: readonly ClaimClass[] = ['MODEL_INFERENCE', 'RECOMMENDATION'];

export const OPPORTUNITY_RULE =
  'An opportunity is a fitted claim about an account, not a fact about it. It is a MODEL_INFERENCE or a RECOMMENDATION, it carries a confidence, and it names the artifacts it rests on.';

/* ── What an engagement proposal is ── */

export interface ProposalField {
  field: string;
  answers: string;
  required: boolean;
}

export const ENGAGEMENT_FIELDS: readonly ProposalField[] = [
  { field: 'opportunity', answers: 'Which opportunity it acts on. A proposal with no opportunity behind it is a cold email.', required: true },
  { field: 'contact', answers: 'Who, and on what basis the firm holds their details.', required: true },
  { field: 'channel', answers: 'How. Each channel carries its own permissions and its own law.', required: true },
  { field: 'message', answers: 'What would actually be said, in full, before anyone authorizes saying it.', required: true },
  { field: 'supportingClaims', answers: 'Every claim in the message that is about the recipient, with the class it was computed at.', required: true },
  { field: 'authorizationStatus', answers: 'DRAFTED, AUTHORIZED or REFUSED. Never absent, because absent reads as ready.', required: true },
];

export const ENGAGEMENT_CHANNELS = ['EMAIL', 'CALL', 'MEETING', 'LETTER'] as const;
export type EngagementChannel = typeof ENGAGEMENT_CHANNELS[number];

export const ENGAGEMENT_STANDINGS = ['DRAFTED', 'AUTHORIZED', 'REFUSED', 'SENT'] as const;
export type EngagementStanding = typeof ENGAGEMENT_STANDINGS[number];

/** What the sales agent may do, and where it stops. The action layer's list. */
export const SALES_AGENT_MAY = ['observe', 'infer', 'detect', 'draft'] as const;
export const SALES_AGENT_MAY_NEVER = ['authorize', 'send'] as const;

export const SALES_AGENT_RULE =
  'A sales agent may observe, infer, detect an opportunity and draft an engagement. It may not authorize one and it may not send one. Drafting fluently is exactly how an unauthorized message goes out.';

/**
 * The constraint that matters most on this plane.
 *
 * A claim in an outbound message is a served claim. The recipient is a reader
 * like any other, and the surface where hedging costs a reply is the surface
 * where the class most wants to be dropped.
 */
export const MESSAGE_IS_A_SERVING_SURFACE =
  'A claim about the recipient made in an outbound message is served at the class it was computed at, or it is not made. An inference presented as an observation is the same failure in a sales email as in a feed payload, and it is more expensive because the recipient acts on it.';

/* ── What comes back ── */

/**
 * The observable states of an engagement. Ordered, because the ordering is what
 * makes them a funnel rather than a set of labels — and NO_RESPONSE is a
 * recorded state rather than an absence, for the same reason an unknown
 * dispatch outcome is.
 */
export const ENGAGEMENT_OUTCOMES = [
  'NO_RESPONSE', 'OPENED', 'RESPONDED', 'MEETING', 'PROPOSAL', 'CUSTOMER', 'DECLINED',
] as const;
export type EngagementOutcome = typeof ENGAGEMENT_OUTCOMES[number];

export const OUTCOME_RULE =
  'NO_RESPONSE is an outcome that was observed, not a row that is missing. An engagement with no recorded outcome has not been observed yet, and the two are different facts.';

/**
 * What the outcomes are worth, and the discipline that keeps them worth it.
 *
 * Which physical-economic conditions correspond to willingness to buy
 * information is not knowable from outside the firm and cannot be bought. It is
 * the compounding asset on this plane — and it compounds only if the outcomes
 * are admitted as evidence rather than written straight into a model.
 */
export const OUTCOME_ADMISSION_RULE =
  'A commercial outcome is an observation about the firm, and it enters through the same admission boundary as every other observation. There is no privileged path for the firm’s own data, and a model fitted on outcomes that bypassed it was fitted on unadmitted state.';

/**
 * The counterfactual the funnel cannot see, stated where the model would be
 * fitted rather than discovered afterwards.
 */
export const MISSING_COUNTERFACTUAL =
  'The outcome of an engagement that happened says nothing about the accounts that were ranked below the cut and never contacted. A model fitted only on contacted accounts learns what the ranking already believed.';

/* ── The stronger version ── */

/**
 * Conventional software asks who to sell the product to. A corpus that can
 * observe recurring industrial constraints can ask the question the other way
 * round: what expensive problems does the evidence show repeatedly occurring,
 * who has them, and what information would reduce their decision loss.
 *
 * It is a sequence rather than an aspiration because each step is a workload
 * with an input and an output, and none of them is a model that has to work
 * before the next one can start.
 */
export const MARKET_DISCOVERY: readonly string[] = [
  'Mine the corpus',
  'Discover a recurring industrial constraint',
  'Identify the organizations it affects',
  'Estimate its economic severity',
  'Cluster the affected accounts',
  'Construct the information product',
  'Commercial validation',
];

export const MARKET_DISCOVERY_RULE =
  'Discovering that a constraint recurs is not discovering that anyone will pay to avoid it. Commercial validation is the last step and it is not optional; the six before it produce a hypothesis about a market, not a market.';

/* ── Standing ── */

export interface Opportunity {
  opportunityId: string;
  account: string;
  class: ClaimClass;
  evidenceArtifactIds: readonly string[];
  standing: EngagementStanding | 'DETECTED';
}

/** None. No corpus has been mined, so nothing has been detected in one. */
export const OPPORTUNITIES: readonly Opportunity[] = [];

export const COMMERCIAL_BLOCKED_ON: readonly string[] = [
  'No derivation exists, so no opportunity has been detected in one.',
  'No account is held as a canonical identity.',
  'No engagement has been drafted, authorized or sent.',
  'No commercial outcome has been observed, so nothing is fitted on any.',
];

export function commercialStanding(opportunities: readonly Opportunity[] = OPPORTUNITIES) {
  const at = (standing: Opportunity['standing']) => opportunities.filter((entry) => entry.standing === standing).length;
  return {
    opportunities: opportunities.length,
    detected: at('DETECTED'),
    drafted: at('DRAFTED'),
    authorized: at('AUTHORIZED'),
    sent: at('SENT'),
    /* An opportunity that cites nothing is a hunch, and worth counting as one. */
    withoutEvidence: opportunities.filter((entry) => entry.evidenceArtifactIds.length === 0).length,
    canEngage: opportunities.some((entry) => entry.standing === 'AUTHORIZED'),
    blockedOn: opportunities.length > 0 ? [] : [...COMMERCIAL_BLOCKED_ON],
    coverage: opportunities.length === 0 ? 'CONTRACT_ONLY_NOTHING_DETECTED' : 'OPPORTUNITIES_PRESENT',
  } as const;
}
