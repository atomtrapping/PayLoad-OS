/**
 * The action layer: what may be proposed, what may be authorized, and what a
 * receipt is evidence of.
 *
 * Every other module in this repository describes the world. This one is about
 * changing it, and the change cannot be un-changed, so the vocabulary is
 * narrower and the boundaries are pinned rather than described.
 *
 * THREE OBJECTS, NEVER COLLAPSED
 *
 * `X` the physical or institutional state — what is actually true of the world.
 * `H` the recorded history — what was observed, proposed, authorized, attempted
 * and received, append-only. `S` the accepted operational representation — what
 * this system currently treats as the case.
 *
 * A database recording delivery is not delivery. `S` is a claim about `X`
 * maintained from `H`, and it never silently becomes `X`: a row saying a
 * shipment departed is a record that something said so, and the shipment is on
 * the water or it is not.
 *
 * THE ARROWS
 *
 * observe → propose → evaluate → authorize → execute → verify → reconcile, and
 * each arrow is a real boundary: a proposal is not an authorization, an
 * authorization is not dispatch, and dispatch is not completion. Most costly
 * automation failures are one of those three arrows quietly skipped.
 *
 * WHERE THE AGENT SITS
 *
 * An agent may observe, propose, verify and reconcile. It may not authorize,
 * execute or commit. The rule stated once: *the agent may propose an operation;
 * it must not manufacture its own authority to perform it.* This is not a
 * limitation on how good the model is. Reasoning is the cheap part and the
 * maintained state is the scarce one, so the agent is a replaceable participant
 * and the boundary is what makes it safe to replace.
 *
 * The identity discipline follows from it: the operation, the attempt to
 * execute it, and the verification of it are three identities, not one. Agents
 * retry fluently, and fluency plus side effects is exactly how a retry becomes
 * a second commercial commitment.
 *
 * WHAT THIS IS BLOCKED ON, STATED HERE RATHER THAN DISCOVERED LATER
 *
 * An envelope binds to a corpus release and a state revision. There are no
 * releases: admitted records are zero and no connector has been lit. So the
 * envelope, the authorization and the receipt are contracts with nothing yet to
 * bind to, and `envelopeStanding()` says so rather than reporting a readiness
 * the corpus does not have. Phase one — historical reconstruction — needs
 * admitted history to reconstruct. The whole action layer bottoms out at the
 * same missing first fact everything else here does.
 */

export interface StateObject {
  symbol: 'X' | 'H' | 'S';
  name: string;
  meaning: string;
  /** The confusion that collapsing it into another would produce. */
  forbids: string;
}

export const STATE_OBJECTS: readonly StateObject[] = [
  { symbol: 'X', name: 'Physical or institutional state', meaning: 'What is actually true of the world, independent of any record of it.',
    forbids: 'A database recording delivery is not delivery.' },
  { symbol: 'H', name: 'Recorded history', meaning: 'What was observed, proposed, authorized, attempted and received. Append-only; a correction is a new event.',
    forbids: 'History is not a summary. Nothing in it is edited to agree with what is now believed.' },
  { symbol: 'S', name: 'Accepted operational representation', meaning: 'What this system currently treats as the case, maintained from H and revised as H grows.',
    forbids: 'S never silently becomes X. It is a claim about the world, carrying the revision it was computed at.' },
];

/** The lifecycle, in order. Each step is a different act with a different author. */
export const LIFECYCLE = ['observe', 'propose', 'evaluate', 'authorize', 'execute', 'verify', 'reconcile'] as const;
export type LifecycleStep = typeof LIFECYCLE[number];

/** The three arrows that are boundaries rather than transitions. */
export const LIFECYCLE_ARROWS = [
  'A proposal is not an authorization.',
  'An authorization is not dispatch.',
  'A dispatch is not completion.',
] as const;

/** What an agent may do, and what it may never do. */
export const AGENT_MAY: readonly LifecycleStep[] = ['observe', 'propose', 'verify', 'reconcile'];
export const AGENT_MAY_NEVER: readonly LifecycleStep[] = ['authorize', 'execute'];

export const AGENT_RULE =
  'The agent may propose an operation. It must not manufacture its own authority to perform it.';

export const AGENT_IS_REPLACEABLE =
  'Reasoning commoditizes and grounding compounds. The agent is a replaceable participant; the maintained evidence-backed state is the scarce thing, and the boundary is what makes the agent safe to replace.';

/**
 * Three identities, kept apart.
 *
 * An operation is the thing being committed to. An attempt is one try at
 * dispatching it. A verification is one check of what came back. Merging the
 * first two is how a retry becomes a second booking.
 */
export const IDENTITIES = [
  { identity: 'operation', answers: 'What commercial commitment is this?', collapsing: 'Merged with the attempt, a retry becomes a second commitment.' },
  { identity: 'execution attempt', answers: 'Which try at dispatching that commitment is this?', collapsing: 'Merged with the operation, a duplicate dispatch is indistinguishable from a duplicate order.' },
  { identity: 'verification', answers: 'Which check of the outcome is this?', collapsing: 'Merged with the attempt, re-checking looks like re-doing.' },
] as const;

/**
 * Envelope classes.
 *
 * Three different capabilities, not three confidence levels of the same one.
 * A read-only envelope cannot be upgraded by trusting the model more.
 */
export const ENVELOPE_CLASSES = ['READ_ONLY', 'PROPOSAL', 'NARROW_ACTION'] as const;
export type EnvelopeClass = typeof ENVELOPE_CLASSES[number];

export interface EnvelopeContract {
  class: EnvelopeClass;
  permits: string;
  sideEffects: boolean;
  requiresAuthorization: boolean;
}

export const ENVELOPE_CONTRACTS: readonly EnvelopeContract[] = [
  { class: 'READ_ONLY', permits: 'Querying admitted state and returning an answer.', sideEffects: false, requiresAuthorization: false },
  { class: 'PROPOSAL', permits: 'Assembling a candidate operation for someone else to evaluate.', sideEffects: false, requiresAuthorization: false },
  { class: 'NARROW_ACTION', permits: 'Dispatching one declared operation to one named counterparty, under a pinned policy.', sideEffects: true, requiresAuthorization: true },
];

/**
 * What an envelope binds.
 *
 * The release and revision are the point: an authorization is granted against a
 * state, and a state that has moved is a different state. Approval at revision
 * 41 does not carry to revision 42 — a quality hold that arrived in between is
 * exactly the case the binding exists for.
 */
export const ENVELOPE_BINDINGS = [
  'corpusReleaseId — the admitted evidence the decision was made on',
  'stateRevision — the accepted representation it was computed at',
  'policyVersion — the rules evaluated, pinned, not "current"',
  'expiresAt — an authority without an end is not a bounded authority',
  'resourceLimits — what it may spend, at most',
  'declaredSideEffects — what it says it will change, before it changes it',
] as const;

export const REVALIDATION_RULE =
  'An authorization binds to the state revision it was granted against. When the revision moves, the authorization does not silently carry: the consequential boundary revalidates or refuses.';

/**
 * How a dispatch can end.
 *
 * The third one is the one systems get wrong. An ambiguous timeout is not a
 * failure and not a success; assuming nothing happened and retrying is how one
 * commitment becomes two.
 */
export const OUTCOMES = ['CONFIRMED', 'REJECTED', 'OUTCOME_UNKNOWN'] as const;
export type Outcome = typeof OUTCOMES[number];

export const UNKNOWN_OUTCOME_RULE =
  'An ambiguous timeout resolves to OUTCOME_UNKNOWN, which is a terminal state requiring reconciliation against the counterparty. It is never treated as "nothing happened", and it never triggers an automatic retry.';

/* ── The review ── */

/**
 * What a reviewer may say about a proposal. Four responses and no default.
 *
 * These lived in the treasury module first, because the treasury was the first
 * place a person was asked to decide. They are the action layer's: a dossier
 * release, an editorial publication and a movement of money are each a
 * proposal put to a reviewer, and one vocabulary is what lets one ledger hold
 * all three decisions.
 */
export const REVIEW_RESPONSES = ['APPROVE', 'DENY', 'REQUEST_REVISION', 'DEFER'] as const;
export type ReviewResponse = typeof REVIEW_RESPONSES[number];

/** The two that end the proposal, and the two that do not. */
export const RESPONSES_THAT_CLOSE: readonly ReviewResponse[] = ['APPROVE', 'DENY'];

export const NO_DEFAULT_RULE =
  'There is no default assumption that a proposal eventually becomes a transaction. Silence leaves it pending and expiry ends it unapproved; neither is consent.';

/**
 * Denial is an outcome, not a delay.
 *
 * The three routes around a refusal are named because all three are things a
 * motivated proposer will try, and all three produce the same wrong result: a
 * decision that was made once being unmade without anyone reversing it.
 */
export const DENIAL_IS_PERSISTENT =
  'A denied proposal cannot be retried, split into smaller transactions, or routed to another approver to obtain a different answer. A revised proposal carries a new identity, a visible explanation of what changed, and a fresh authorization.';

export const DENIAL_ROUTES_REFUSED: readonly string[] = [
  'retrying the same proposal',
  'splitting it into smaller transactions',
  'routing it to a different approver',
];

/**
 * What an approval is of. Not a topic, not an intention, not an earlier draft:
 * the digest of the exact artifact or operation the reviewer was shown. A
 * changed byte is a different digest, so it is a different action, so it needs
 * its own review — and the authorization row cannot be written any other way.
 */
export const APPROVAL_IS_OF_A_DIGEST =
  'Human approval authorizes the exact artifact or operation, by content digest. Approval of an earlier draft, a general intention or an agent’s judgement authorizes nothing, and a request body claiming to carry an approval carries a claim.';

export const REVOCATION_RULE =
  'Authority granted may be taken back before it expires, by a person or a policy, with a reason. A dispatch after the revocation instant is refused whatever the authorization row still says, because the revocation is a row too.';

/** The standing prohibitions, unchanged from the vehicle and restated for transactions. */
export const PROHIBITIONS = [
  { rule: 'Never hold', means: 'No custody of funds or goods. Facilitation is not possession.' },
  { rule: 'Never warrant', means: 'A proposal is not a guarantee of outcome, and an assessment is not an indemnity.' },
  { rule: 'Never un-fire', means: 'An executed operation and its receipt stand. Corrections are new events, never edits.' },
  { rule: 'Never commit on unadmitted state', means: 'An envelope binds to a release. No release, no authority.' },
] as const;

/**
 * The verification contract.
 *
 * A proof says a named claim held over a stated coverage. It never says
 * `verified: true`, because the interesting failure is not a false claim but a
 * true one about the wrong set: proving every *submitted* reading was below a
 * threshold proves nothing about the readings that were not submitted.
 */
export interface VerificationClaim {
  claim: string;
  coverage: string;
  /** What this claim does not establish, carried with it. */
  outOfScope: string;
}

export const VERIFICATION_CONTRACT = {
  neverEmit: 'verified: true',
  emits: 'A named claim, the coverage actually achieved, and what remains out of scope.',
  coverageHole: 'A statement true of the submitted set says nothing about what was omitted from it. Coverage is part of the claim, not a footnote to it.',
  privacySeparations: [
    'Privacy from the verifier is not privacy from the proving infrastructure.',
    'A public output can disclose a sensitive value even when the witness stayed private.',
  ],
  firstGuest: 'A small deterministic operation — an eligibility test, an allocation constraint, a release predicate. Certify a useful boundary rather than decorating the whole system.',
} as const;

/**
 * Pricing, corrected.
 *
 * Exposure times avoidability times consequence screens for where value might
 * be; it does not price anything. The customer's value is their alternative
 * operating cost plus their expected loss, less what this costs them.
 */
export const PRICING = {
  screeningHeuristic: 'exposure × avoidability × consequence — a way to find candidates, not a pricing law.',
  customerValue: 'V_B = (alternative operating cost + expected loss avoided) − Notation’s cost to the customer.',
  implications: [
    'Authority is a value channel, not a prerequisite. Read-only products — evidence packets, exposure analyses, discrepancy reports — have standalone value, and selling them first is the honest order.',
    'An expensive asset does not imply an expensive subscription. Price against loss probability, severity and avoidability, not against what the thing being watched is worth.',
    'False interventions belong in the economics. A governor that stops twenty good shipments to prevent one bad one destroys value, so unnecessary holds are a measured outcome and not an acceptable cost of caution.',
  ],
  exposureRule: 'Exposure is not avoided loss. A number describing what is at stake is not a number describing what was saved.',
} as const;

/**
 * Memory, as measured behaviour.
 *
 * Store what was promised, what was observed, on which lane, from which source,
 * with what uncertainty. Not a verdict about a counterparty.
 */
export const MEMORY_RULE = {
  stores: ['promised date', 'observed date', 'lane', 'source', 'uncertainty'],
  neverStores: 'A characterisation of a counterparty. "This supplier lies" is a conclusion, and conclusions are recomputed from observations rather than accumulated as opinion.',
  missingCounterfactual: 'Observing the outcome of the action taken reveals nothing about the outcomes of the alternatives declined. A policy cannot be shown to be improving from its own selected history alone.',
  customerBoundary: 'Customer-controlled state is not Notation inventory. The offer is to keep their knowledge current, never to charge rent for possessing their past.',
} as const;

export interface BuildPhase {
  order: 1 | 2 | 3;
  name: string;
  requires: string;
  produces: string;
  /** Whether this phase can touch the world at all. */
  liveAuthority: boolean;
}

export const ACTION_PHASES: readonly BuildPhase[] = [
  { order: 1, name: 'Historical reconstruction', requires: 'Admitted history to reconstruct.',
    produces: 'State and policy results at historical cutoffs, and the contradictions the reconstruction finds.', liveAuthority: false },
  { order: 2, name: 'Live, reviewer-assisted', requires: 'A live corpus and a reviewer who decides.',
    produces: 'Proposals evaluated against current state, accepted or refused by a person.', liveAuthority: false },
  { order: 3, name: 'Narrow delegated execution', requires: 'Demonstrated behaviour from phase two, and an explicit grant.',
    produces: 'One declared operation dispatched under a pinned policy, with a receipt.', liveAuthority: true },
];

/**
 * What blocks all of it, named rather than left to be discovered.
 *
 * The reviewer's first caution: the product layer is being specified before the
 * corpus it stands on exists. That is fine as design and dishonest as a
 * readiness claim, so the claim is made here in the negative.
 */
export const BLOCKED_ON = [
  'A connector that captures from a real source.',
  'An admission that rules on what it captured.',
  'A release the envelope’s corpusReleaseId can name.',
  'A state revision the authorization can bind to.',
] as const;

export function envelopeStanding(counts: { envelopes?: number; authorizations?: number; dispatches?: number; releases?: number } = {}) {
  const releases = counts.releases ?? 0;
  return {
    envelopeClasses: ENVELOPE_CLASSES.length,
    envelopesIssued: counts.envelopes ?? 0,
    authorizationsGranted: counts.authorizations ?? 0,
    dispatches: counts.dispatches ?? 0,
    releasesAvailableToBindTo: releases,
    /** No release, no authority: the binding is not satisfiable. */
    canAuthorize: releases > 0,
    blockedOn: releases > 0 ? [] : BLOCKED_ON,
    phase: 0,
    coverage: 'CONTRACT_ONLY_NOTHING_DISPATCHED' as const,
  };
}

export function envelopeContract(envelopeClass: EnvelopeClass): EnvelopeContract {
  return ENVELOPE_CONTRACTS.find((contract) => contract.class === envelopeClass)!;
}

/** Whether a step is one an agent may take on its own. */
export function agentMay(step: LifecycleStep): boolean {
  return AGENT_MAY.includes(step);
}
