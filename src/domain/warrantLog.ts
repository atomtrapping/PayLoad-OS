/**
 * The checkable transition, which is the same shape everywhere.
 *
 * Dossier production, acquisition, sales, logistics, publishing and treasury
 * all do the same thing in different words: something is observed, a change is
 * proposed, it is checked against an envelope, it is committed or escalated, a
 * warrant is written, and the world is observed again. Six systems with one
 * primitive underneath is a substrate; six systems each with their own is six
 * systems.
 *
 * SIX REFERENCES THAT MUST STAY DISTINCT
 *
 *   Evidence ≠ Operation ≠ Proposal ≠ Authorization ≠ Execution attempt ≠
 *   Verification
 *
 * Each collapse loses something specific and none of them announces itself. The
 * expensive one is the last two: a business operation may have many execution
 * attempts, and those attempts are not many authorized business actions. A
 * system that cannot tell them apart books the freight twice.
 *
 * WHAT A WARRANT ANSWERS
 *
 * What changed, from which state, on what evidence, under which rule, by whose
 * authority, through which execution attempt, and with what verification. Seven
 * questions, and a warrant missing any of them is a log line — useful for
 * reading, useless for answering the question somebody will actually ask, which
 * is why this was permitted.
 *
 * TWO THINGS THAT ONLY MATTER ONCE THE SYSTEM IS DOING REAL WORK
 *
 * Approval goes stale. A proposal permitted when it was evaluated may not be
 * permitted when it is dispatched — the quality hold arrived, the budget was
 * spent by something else, the counterparty's standing changed. So the
 * preconditions are rechecked at dispatch, and shared budgets are RESERVED
 * rather than merely checked, because two concurrent actions that each pass a
 * limit check can together exceed the limit.
 *
 * External execution is not an atomic database update. The intent to dispatch
 * is persisted before anything leaves, operation identities are stable, and an
 * ambiguous response is reconciled before anything is retried. A retry after an
 * unknown outcome is how one booking becomes two.
 *
 * THE EXCEPTION DESK IS PART OF THE PRODUCT
 *
 * Not a fallback for when the real agent system is finished. Missing rights, a
 * contradictory identity, stale evidence, an expired approval, an uncertain
 * external outcome and a model used off its domain each produce an OWNED
 * exception with a reason and a resolution path. A system whose unusual cases
 * have no owner has decided that unusual cases are somebody's spare time.
 *
 * And publishing is consequential too. Correct information disclosed to the
 * wrong recipient is a failure, so a disclosure is an operation like any other.
 *
 * THREE JOBS THAT LOOK LIKE ONE
 *
 * A transition warrant says what changed and under whose authority.
 * Computational lineage says which inputs and implementation produced an
 * output. A proof of execution says a program ran over supplied inputs.
 *
 * The third is the one most often oversold: proving that a supplier-scoring
 * program executed correctly does not prove the supplier will honour its
 * capacity commitment. Verified computation does not imply verified external
 * reality, and a proof system is not a substitute for an observation.
 */
import { OUTCOMES } from './executionEnvelope';

/* ── The six references ── */

export const TRANSITION_REFERENCES = [
  'EVIDENCE', 'OPERATION', 'PROPOSAL', 'AUTHORIZATION', 'EXECUTION_ATTEMPT', 'VERIFICATION',
] as const;
export type TransitionReference = typeof TRANSITION_REFERENCES[number];

export interface ReferenceContract {
  reference: TransitionReference;
  is: string;
  /** What collapsing it into its neighbour costs. */
  collapsing: string;
}

export const REFERENCE_CONTRACTS: readonly ReferenceContract[] = [
  { reference: 'EVIDENCE', is: 'What was observed, retained with its provenance.', collapsing: 'Collapsed into the operation, the reason for an action becomes part of the action and cannot be re-examined without re-examining what was done.' },
  { reference: 'OPERATION', is: 'One commercial commitment. Book this freight, pay this invoice, publish this article.', collapsing: 'Collapsed into the proposal, wanting to do something becomes having decided to.' },
  { reference: 'PROPOSAL', is: 'A request to perform an operation, by a principal who may ask.', collapsing: 'Collapsed into the authorization, asking becomes being allowed.' },
  { reference: 'AUTHORIZATION', is: 'Permission for one operation, bounded and expiring.', collapsing: 'Collapsed into the attempt, permission becomes the act — and an expired permission becomes a completed one.' },
  { reference: 'EXECUTION_ATTEMPT', is: 'One try at dispatching the operation. There may be several.', collapsing: 'Collapsed into the operation, a retry becomes a second commercial commitment and the freight is booked twice.' },
  { reference: 'VERIFICATION', is: 'What was established about the outcome afterwards.', collapsing: 'Collapsed into the attempt, dispatching becomes completing and a receipt becomes a delivery.' },
];

export const SIX_REFERENCES_RULE =
  'Evidence, operation, proposal, authorization, execution attempt and verification are six references, not one workflow row. A business operation may have many execution attempts, and those attempts are not many authorized business actions.';

/* ── The warrant ── */

export const WARRANT_QUESTIONS = [
  'What changed',
  'From which state',
  'On what evidence',
  'Under which rule',
  'By whose authority',
  'Through which execution attempt',
  'With what verification',
] as const;

export const WARRANT_RULE =
  'A warrant answers all seven or it is a log line: useful for reading, useless for answering the question somebody will actually ask, which is why this was permitted.';

/* ── Staleness and reservation ── */

export const DISPATCH_RECHECKS = [
  'the authorization has not expired',
  'the state revision is still the one authorized',
  'the policy version is still in force',
  'the reserved budget is still held',
] as const;

export const STALENESS_RULE =
  'A proposal permitted when it was evaluated may not be permitted when it is dispatched. Preconditions are rechecked at dispatch rather than trusted from the moment of approval.';

/**
 * The subtler half. Two concurrent actions that each pass a limit check can
 * together exceed the limit, so a shared budget is held rather than consulted.
 */
export const RESERVATION_RULE =
  'A shared budget or capacity is RESERVED at authorization, not merely checked. Two concurrent actions that each pass a limit test can together exceed the limit, and a check that does not hold anything cannot prevent that.';

export const RESERVATION_STATES = ['HELD', 'CONSUMED', 'RELEASED'] as const;
export type ReservationState = typeof RESERVATION_STATES[number];

/* ── External execution ── */

export const EXTERNAL_EXECUTION_RULE =
  'External execution is not an atomic database update. The intent to dispatch is persisted before anything leaves, operation identities are stable across retries, and an ambiguous response is reconciled before anything is retried — because a retry after an unknown outcome is how one booking becomes two.';

/** The adapter holds the keys. The planner holds contracts and receipts. */
export const CREDENTIAL_RULE =
  'The execution adapter keeps its own narrowly scoped credentials. The planner receives operation contracts and receipts, never keys — so a planner that is wrong is a planner that proposed something wrong, not one that did something.';

export const DISPATCH_OUTCOMES = OUTCOMES;

/* ── The exception desk ── */

export const EXCEPTION_KINDS = [
  'MISSING_RIGHTS',
  'CONTRADICTORY_IDENTITY',
  'STALE_EVIDENCE',
  'EXPIRED_APPROVAL',
  'UNCERTAIN_EXTERNAL_OUTCOME',
  'OFF_DOMAIN_MODEL_USE',
] as const;
export type ExceptionKind = typeof EXCEPTION_KINDS[number];

export interface ExceptionContract {
  kind: ExceptionKind;
  arises: string;
  /** What resolving it actually requires. Never "retry". */
  resolvedBy: string;
}

export const EXCEPTION_CONTRACTS: readonly ExceptionContract[] = [
  { kind: 'MISSING_RIGHTS', arises: 'The evidence needed is held under a licence that does not permit this use.', resolvedBy: 'Acquiring the right, substituting a source, or narrowing what is delivered.' },
  { kind: 'CONTRADICTORY_IDENTITY', arises: 'Two records that should be one entity, or one record that should be two.', resolvedBy: 'A resolution decision by somebody who can be named, recorded as one.' },
  { kind: 'STALE_EVIDENCE', arises: 'The evidence a conclusion rests on is older than the decision it is being used for.', resolvedBy: 'Re-acquiring, or narrowing the conclusion to what the old evidence supports.' },
  { kind: 'EXPIRED_APPROVAL', arises: 'The authorization lapsed between grant and dispatch.', resolvedBy: 'A fresh review. Never an extension of the old one.' },
  { kind: 'UNCERTAIN_EXTERNAL_OUTCOME', arises: 'The counterparty answered ambiguously, or did not answer.', resolvedBy: 'Reconciliation against the counterparty’s own record before anything is retried.' },
  { kind: 'OFF_DOMAIN_MODEL_USE', arises: 'A model is being applied outside the regime, region or range it was fitted for.', resolvedBy: 'Refusing the estimate, or restating it with the limit attached.' },
];

export const EXCEPTION_DESK_RULE =
  'The exception desk is part of the product, not a fallback for when the agent system is finished. Every exception is owned, carries a reason and a resolution path, and none of them resolves by retrying.';

/** Publishing is consequential, so a disclosure is an operation like any other. */
export const DISCLOSURE_IS_AN_OPERATION =
  'Publishing a dossier or sending a message is a consequential operation. Correct information disclosed to the wrong recipient is still a failure, and it goes through the same envelope as a payment.';

/* ── Three jobs that look like one ── */

export const ASSURANCE_JOBS = ['TRANSITION_WARRANT', 'COMPUTATIONAL_LINEAGE', 'EXECUTION_PROOF'] as const;
export type AssuranceJob = typeof ASSURANCE_JOBS[number];

export interface AssuranceContract {
  job: AssuranceJob;
  answers: string;
  /** The question it does NOT answer, which is the one it gets credited with. */
  doesNotAnswer: string;
}

export const ASSURANCE_CONTRACTS: readonly AssuranceContract[] = [
  {
    job: 'TRANSITION_WARRANT',
    answers: 'What changed, from which state, on what evidence, under which rule, by whose authority.',
    doesNotAnswer: 'Whether the change was a good idea, or whether the evidence was right.',
  },
  {
    job: 'COMPUTATIONAL_LINEAGE',
    answers: 'Which inputs and which implementation produced this output.',
    doesNotAnswer: 'Whether the computation was the right one to run, which is where the computation card stops too.',
  },
  {
    job: 'EXECUTION_PROOF',
    answers: 'That a specified program ran over supplied inputs and produced this result.',
    doesNotAnswer: 'Whether the inputs describe a real factory, parcel or shipment. Proving a supplier-scoring program executed correctly does not prove the supplier will honour its capacity commitment.',
  },
];

export const VERIFIED_COMPUTATION_IS_NOT_VERIFIED_REALITY =
  'Verified computation does not imply verified external reality. Different claims need different evidence, and one proof system is not a universal substitute for an observation.';

/**
 * An interchange vocabulary is worth adopting for exchange and is not worth
 * adopting instead of the internal contracts, which are more specific than it.
 */
export const INTERCHANGE_RULE =
  'A standard provenance vocabulary supports interoperability by translating the internal contracts outward. It does not replace them: an exchange format is a lossy view of a record, and the record is what a dispute is settled against.';

/* ── Standing ── */

export interface Warrant {
  warrantId: string;
  operationId: string;
  attempts: number;
}

/** None. Nothing has transitioned, because nothing has been authorized. */
export const WARRANTS: readonly Warrant[] = [];

export const WARRANT_BLOCKED_ON: readonly string[] = [
  'No operation has been proposed, because no release exists to authorize one against.',
  'No exception has been raised, because nothing has run.',
  'No budget is reserved, because no budget is declared.',
];

export function warrantStanding(warrants: readonly Warrant[] = WARRANTS) {
  return {
    warrants: warrants.length,
    operations: new Set(warrants.map((entry) => entry.operationId)).size,
    /* Attempts exceed operations as soon as anything is retried, and that is fine. */
    attempts: warrants.reduce((sum, entry) => sum + entry.attempts, 0),
    references: TRANSITION_REFERENCES.length,
    questions: WARRANT_QUESTIONS.length,
    exceptionKinds: EXCEPTION_KINDS.length,
    blockedOn: warrants.length > 0 ? [] : [...WARRANT_BLOCKED_ON],
    coverage: warrants.length === 0 ? 'CONTRACT_ONLY_NOTHING_TRANSITIONED' : 'WARRANTS_PRESENT',
  } as const;
}
