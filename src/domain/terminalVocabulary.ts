/** Shared terminal vocabulary. This module imports no transport or datastore. */
import { PERMITTED_USES, type PermittedUse } from './corpus';

/* ── The parties ── */

/**
 * A caller's class, which is the rights model's audience seen from outside.
 * The names are the audiences themselves so the two cannot drift.
 */
export const TERMINAL_CLASSES = ['FIRM_INTERNAL', 'CUSTOMER', 'PUBLIC'] as const;
export type TerminalClass = (typeof TERMINAL_CLASSES)[number];

/** The audience each class calls at. */
export const CLASS_AUDIENCE: Record<TerminalClass, 'INTERNAL' | 'CUSTOMER' | 'PUBLIC'> = {
  FIRM_INTERNAL: 'INTERNAL',
  CUSTOMER: 'CUSTOMER',
  PUBLIC: 'PUBLIC',
};

/**
 * The uses no terminal may declare, whatever its class, and why. Stated rather
 * than omitted: a purpose that is refused for a reason is a different thing
 * from a purpose nobody thought of.
 */
export const NEVER_DECLARABLE: Record<string, string> = {
  model_training: 'Training is not a use of an answer. It is a copy of the corpus into a form that no longer carries its receipts, so it is refused at the type level rather than rate-limited.',
  trading: 'The rights matrix prohibits trading on this corpus outright. No terminal declares it and no session carries it.',
};

/* ── What a tool serves ── */

/**
 * The kind of thing a tool hands back. A purpose admits kinds, not tool names,
 * so a tool added to the surface is admitted by what it serves rather than by
 * being added to a permission list somewhere else.
 */
export const SERVED_KINDS = ['RELEASE_METADATA', 'RECORDS', 'AGGREGATE', 'MANIFEST', 'RULING', 'RECEIPT', 'ESTATE'] as const;
export type ServedKind = (typeof SERVED_KINDS)[number];

/**
 * What each declarable purpose admits, and the shape it admits it in.
 *
 * `./servingBoundary.ts` names the shaping rule — research gets aggregates and
 * their refusals rather than the rows behind them, counterparty diligence gets
 * entity-level rows — and this is that rule as a decision the boundary makes.
 * An estate kind appears in no purpose's list, which is how the two-part rule
 * is enforced rather than described.
 */
export interface PurposeAdmission {
  use: PermittedUse;
  admits: readonly ServedKind[];
  shape: string;
}

export const PURPOSE_ADMITS: readonly PurposeAdmission[] = [
  {
    use: 'customer_delivery',
    admits: ['RELEASE_METADATA', 'RECORDS', 'MANIFEST', 'RULING', 'RECEIPT'],
    shape: 'Entity-level records with their evidence classes and both clocks, under the customer projection.',
  },
  {
    use: 'redistribution',
    admits: ['RELEASE_METADATA', 'MANIFEST', 'RULING'],
    shape: 'What the public projection already carries: rulings and release metadata, never the records behind them.',
  },
  {
    use: 'aggregation',
    admits: ['RELEASE_METADATA', 'AGGREGATE', 'MANIFEST'],
    shape: 'Aggregates and their refusals, not the rows behind them.',
  },
  {
    use: 'internal_research',
    admits: ['RELEASE_METADATA', 'RECORDS', 'AGGREGATE', 'MANIFEST', 'RULING', 'RECEIPT'],
    shape: 'The corpus as the firm holds it. Still not the estates.',
  },
  {
    use: 'acquisition',
    admits: ['RELEASE_METADATA', 'MANIFEST'],
    shape: 'What a production rail needs to know a release exists and what it commits to.',
  },
  {
    use: 'normalization',
    admits: ['RELEASE_METADATA', 'RECORDS', 'MANIFEST'],
    shape: 'The records a normalization reads, and the release they belong to.',
  },
  {
    use: 'proprietary_strategy',
    admits: ['RELEASE_METADATA', 'RECORDS', 'AGGREGATE', 'MANIFEST', 'RULING', 'RECEIPT'],
    shape: 'The corpus as the firm holds it, for the firm’s own account.',
  },
];

/** The purposes with an admission entry, which is the set a session may name. */
export const DECLARABLE_PURPOSES: readonly PermittedUse[] = PURPOSE_ADMITS.map((entry) => entry.use);

/**
 * Which purposes a class may declare, derived from the audience each use is
 * evaluated at rather than listed per class.
 *
 * The derivation is the point: `sourceUseRequests` already says that
 * `customer_delivery` is an EXPORT to CUSTOMER and `redistribution` a PUBLISH
 * to PUBLIC, so a customer terminal gets exactly the first and a public one
 * exactly the second, without a second table to keep in agreement. The
 * audiences are taken from that function's shape, restated here as data so
 * this module stays pure of a domain import cycle; a test holds the two equal.
 */
export const USE_AUDIENCE: Record<PermittedUse, 'INTERNAL' | 'CUSTOMER' | 'PUBLIC'> = {
  acquisition: 'INTERNAL',
  normalization: 'INTERNAL',
  customer_delivery: 'CUSTOMER',
  aggregation: 'INTERNAL',
  model_training: 'INTERNAL',
  internal_research: 'INTERNAL',
  redistribution: 'PUBLIC',
  proprietary_strategy: 'INTERNAL',
  trading: 'INTERNAL',
};

/** The purposes a class may declare: its own audience's, minus the two nobody may. */
export function declarablePurposes(terminalClass: TerminalClass): readonly PermittedUse[] {
  return PERMITTED_USES.filter((use) =>
    USE_AUDIENCE[use] === CLASS_AUDIENCE[terminalClass]
    && DECLARABLE_PURPOSES.includes(use)
    && NEVER_DECLARABLE[use] === undefined);
}

/* ── The session ── */

/**
 * A terminal's session: who is calling, at what class, for what, over which
 * corpora, from when. Every field is declared at the open and none is
 * writable afterwards, which is why a widening is a new session rather than a
 * mutation of this one.
 */
export interface TerminalSession {
  sessionId: string;
  terminalId: string;
  terminalClass: TerminalClass;
  /** One purpose, from the corpus's own permitted uses. */
  purpose: PermittedUse;
  /** The corpora this session may ask about. Empty means none, never all. */
  corpusScope: readonly string[];
  openedAt: string;
  /** When the declaration stops standing. A session is not open forever. */
  expiresAt: string;
}

export type SessionRefusal =
  | 'PURPOSE_NOT_DECLARABLE_AT_ALL'
  | 'PURPOSE_NOT_DECLARABLE_BY_THIS_CLASS'
  | 'SCOPE_IS_EMPTY'
  | 'INVALID_SESSION_TIME'
  | 'EXPIRES_BEFORE_IT_OPENS';

export type CallRefusal =
  | SessionRefusal
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_OPEN'
  | 'INVALID_CALL_TIME'
  | 'TOOL_UNKNOWN'
  | 'CAPABILITY_UNKNOWN'
  | 'ESTATE_NEVER_SERVED'
  | 'PURPOSE_DOES_NOT_ADMIT_THIS'
  | 'ADMISSION_IS_THE_FIRMS_OWN_ACT'
  | 'CORPUS_OUTSIDE_SCOPE'
  | 'CORPUS_UNRESOLVED'
  | 'PROJECTION_OUTSIDE_AUTHORITY';

/**
 * What the plane did with the ask.
 *
 * `PROPOSAL_REQUIRED` is not a refusal wearing a softer word. The terminal
 * asked for something that changes the world, the plane recorded the ask as a
 * governed proposal, and what happens next is a human decision. Reporting that
 * as REFUSED would tell the caller to go away; reporting it as ADMITTED would
 * say something ran. Neither is true, so it is its own outcome.
 */
export const CALL_OUTCOMES = ['ADMITTED', 'PROPOSAL_REQUIRED', 'REFUSED'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
