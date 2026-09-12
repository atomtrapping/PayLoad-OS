/**
 * The control plane a foreign terminal plugs into.
 *
 * `./servingBoundary.ts` states the argument for a tool surface and ends by
 * measuring what is actually enforced: twelve tools and an unauthenticated
 * feed, no caller identified, no purpose declared, no right evaluated for a
 * party. That is a feed with a schema, not a system another terminal operates.
 * This module is the difference. It does not add a transport; it adds the
 * three things the transport was said to make possible, and makes them
 * conditions of being answered at all.
 *
 * A TERMINAL IS A PARTY, AND A PARTY HAS A CLASS
 *
 * The rights model has always decided against an audience — INTERNAL, CUSTOMER,
 * PUBLIC — so a terminal is not a new kind of thing here: it is a party at one
 * of those audiences. The firm's own console, a customer's terminal and an
 * anonymous public reader are three classes of caller, and the class is
 * declared when the session opens, not inferred per call.
 *
 * A PURPOSE IS DECLARED ONCE, FROM THE ONE VOCABULARY
 *
 * The purposes a terminal may declare are the corpus's own permitted uses.
 * There is no second vocabulary of "API scopes" that would have to be kept in
 * agreement with the first — that mismatch is the failure the discovery
 * ledger's rights columns already refuse. Which uses a class may declare is
 * derived from the audience each use is evaluated at, so a use added to the
 * corpus is declarable by exactly the class its own request names, and nobody
 * has to remember to extend a list.
 *
 * Two uses are declarable by no terminal at all. Model training is refused at
 * the type level rather than rate-limited, because it is not a use of an
 * answer but a copy of the corpus into a form that no longer carries its
 * receipts. Trading is prohibited outright by the rights matrix. Both refusals
 * are stated with their reason rather than expressed as an omission.
 *
 * A SESSION CANNOT WIDEN ITSELF
 *
 * The declared purpose and corpus scope are fixed when the session opens. A
 * terminal that wants more opens a session that says so and is answerable for
 * saying it; it does not escalate inside one. This is the structural form of
 * the rule that an agent may not alter its own limits, and it is why the
 * session is a value with no setters rather than an object with a purpose
 * field.
 *
 * EVERY CALL IS ADMITTED OR REFUSED, AND BOTH ARE RECEIPTS
 *
 * `admitCall` is the whole decision, in one order, over declared inputs. A
 * refusal is an answer with a reason and a remedy, never an error and never
 * silence — the same discipline the feed's refusals already keep. Both
 * outcomes produce a receipt carrying the caller, the purpose, the tool, the
 * instant and the decision, which are also the fields a bill line needs.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not verify that a declaration is true. A terminal that declares
 * counterparty diligence and trains a model on the answer has lied, and the
 * answer to a lie is evidence and a rights action, not a transport control.
 * What changes is that there is now a declaration to be false, recorded
 * against a party, at an instant — which is what makes the second pull
 * answerable. It also does not meter, price, or authenticate the identity a
 * session asserts; the identity is taken as given by whatever opened the
 * session, and binding it to a credential is a separate, later thing.
 */
import { PERMITTED_USES, USE_LABEL, type PermittedUse } from './corpus';
import { MCP_TOOLS } from '@/mcp/tools';

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
 * Every tool, by what it serves. A tool absent from this map is unreachable —
 * `admitCall` refuses it and a test refuses the omission — so a new tool
 * cannot be added to the surface without saying what leaves through it.
 */
export const TOOL_SERVES: Record<string, ServedKind> = {
  list_releases: 'RELEASE_METADATA',
  get_release: 'RELEASE_METADATA',
  get_release_manifest: 'MANIFEST',
  list_records: 'RECORDS',
  query_as_of: 'RECORDS',
  list_retractions: 'RELEASE_METADATA',
  get_ruling: 'RULING',
  get_ruling_manifest: 'MANIFEST',
  get_factoring_receipt: 'RECEIPT',
  verify_factoring_receipt: 'RECEIPT',
  get_dispatch_event: 'RECORDS',
  replay_dispatch_liability: 'RECORDS',
};

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
  | 'EXPIRES_BEFORE_IT_OPENS';

/**
 * Whether a session may be opened as declared. A session that cannot be opened
 * is refused here, once, rather than refusing each of its calls later for the
 * same reason.
 */
export function openable(session: TerminalSession): { open: boolean; refusal: SessionRefusal | null; because: string } {
  if (NEVER_DECLARABLE[session.purpose] !== undefined) {
    return { open: false, refusal: 'PURPOSE_NOT_DECLARABLE_AT_ALL', because: NEVER_DECLARABLE[session.purpose] };
  }
  if (!declarablePurposes(session.terminalClass).includes(session.purpose)) {
    const allowed = declarablePurposes(session.terminalClass);
    return {
      open: false,
      refusal: 'PURPOSE_NOT_DECLARABLE_BY_THIS_CLASS',
      because: `A ${session.terminalClass} terminal calls at the ${CLASS_AUDIENCE[session.terminalClass]} audience, and ${USE_LABEL[session.purpose]} is evaluated at ${USE_AUDIENCE[session.purpose]}. It may declare ${allowed.length ? allowed.map((use) => USE_LABEL[use]).join(', ') : 'nothing'}.`,
    };
  }
  if (session.corpusScope.length === 0) {
    return { open: false, refusal: 'SCOPE_IS_EMPTY', because: 'A session names the corpora it may ask about. An empty scope is none of them, and a session that may ask nothing is not opened rather than opened and refused at every call.' };
  }
  if (Date.parse(session.expiresAt) <= Date.parse(session.openedAt)) {
    return { open: false, refusal: 'EXPIRES_BEFORE_IT_OPENS', because: 'A session expires after it opens. One that does not is a declaration with no window, and a declaration with no window is not a declaration.' };
  }
  return { open: true, refusal: null, because: `${session.terminalId} calls as ${session.terminalClass} for ${USE_LABEL[session.purpose]} over ${session.corpusScope.join(', ')} until ${session.expiresAt}.` };
}

/* ── The call ── */

export type CallRefusal =
  | SessionRefusal
  | 'SESSION_EXPIRED'
  | 'TOOL_UNKNOWN'
  | 'TOOL_UNCLASSIFIED'
  | 'ESTATE_NEVER_SERVED'
  | 'PURPOSE_DOES_NOT_ADMIT_THIS'
  | 'CORPUS_OUTSIDE_SCOPE';

export interface CallAdmission {
  admitted: boolean;
  refusal: CallRefusal | null;
  because: string;
  /** What the caller should do instead. Present on every refusal. */
  remedy: string;
  /** The shape the purpose admits the answer in. Null on a refusal. */
  shape: string | null;
  served: ServedKind | null;
}

const refuse = (refusal: CallRefusal, because: string, remedy: string): CallAdmission =>
  ({ admitted: false, refusal, because, remedy, shape: null, served: null });

/**
 * The whole decision, in one order, over declared inputs.
 *
 * Order is the argument, as it is in the coverage assessment. The session's
 * own standing comes first, because a session that could not be opened
 * answers nothing. The estates come next and unconditionally, because no
 * purpose reaches them and the refusal should not read as though some purpose
 * might. Then the purpose against what the tool serves, then the corpus
 * against the declared scope — a caller who may see records at all is still
 * only asked about the corpora it named.
 */
export function admitCall(
  session: TerminalSession,
  toolName: string,
  at: string,
  corpus?: string,
): CallAdmission {
  const standing = openable(session);
  if (!standing.open) {
    return refuse(standing.refusal as CallRefusal, standing.because, 'Open a session this terminal may hold, and declare a purpose its class calls at.');
  }
  if (Date.parse(at) > Date.parse(session.expiresAt)) {
    return refuse('SESSION_EXPIRED', `The session was declared until ${session.expiresAt} and this call is at ${at}.`, 'Open a new session. A declaration is not extended by calling after it.');
  }
  const known = MCP_TOOLS.some((tool) => tool.name === toolName);
  if (!known) {
    return refuse('TOOL_UNKNOWN', `No tool ${toolName} on this surface.`, `Tools: ${MCP_TOOLS.map((tool) => tool.name).join(', ')}.`);
  }
  const served = TOOL_SERVES[toolName];
  if (served === undefined) {
    return refuse('TOOL_UNCLASSIFIED', `${toolName} does not say what it serves, so no purpose can admit it.`, 'Classify the tool in TOOL_SERVES. A tool that has not said what leaves through it is not served.');
  }
  if (served === 'ESTATE') {
    return refuse('ESTATE_NEVER_SERVED', 'The corpus is served under a purpose; the estates are served to nobody, on any transport, for any purpose.', 'Ask the corpus. The calibration, reliability, disagreement and identity-decision estates do not leave the wall.');
  }
  const admission = PURPOSE_ADMITS.find((entry) => entry.use === session.purpose);
  if (admission === undefined || !admission.admits.includes(served)) {
    const admitsFor = admission?.admits.join(', ') ?? 'nothing';
    return refuse(
      'PURPOSE_DOES_NOT_ADMIT_THIS',
      `${toolName} serves ${served}, and ${USE_LABEL[session.purpose]} admits ${admitsFor}.`,
      `Declare a purpose that admits ${served}, in a session that says so, or ask a tool this purpose admits.`,
    );
  }
  if (corpus !== undefined && !session.corpusScope.includes(corpus)) {
    return refuse(
      'CORPUS_OUTSIDE_SCOPE',
      `The session named ${session.corpusScope.join(', ')} and this call asks about ${corpus}.`,
      'Open a session naming that corpus. A scope is not widened by asking outside it.',
    );
  }
  return { admitted: true, refusal: null, because: `${USE_LABEL[session.purpose]} admits ${served}.`, remedy: '', shape: admission.shape, served };
}

/* ── The receipt ── */

/**
 * What a call leaves behind, admitted or refused. These are the fields a
 * rights decision needs and the fields a bill line needs, which
 * `./servingBoundary.ts` observed are the same fields.
 */
export interface ServedCallReceipt {
  sessionId: string;
  terminalId: string;
  terminalClass: TerminalClass;
  purpose: PermittedUse;
  tool: string;
  corpus: string | null;
  servedAt: string;
  decision: 'ADMITTED' | 'REFUSED';
  refusal: CallRefusal | null;
  because: string;
}

export function servedCallReceipt(
  session: TerminalSession,
  toolName: string,
  at: string,
  admission: CallAdmission,
  corpus?: string,
): ServedCallReceipt {
  return {
    sessionId: session.sessionId,
    terminalId: session.terminalId,
    terminalClass: session.terminalClass,
    purpose: session.purpose,
    tool: toolName,
    corpus: corpus ?? null,
    servedAt: at,
    decision: admission.admitted ? 'ADMITTED' : 'REFUSED',
    refusal: admission.refusal,
    because: admission.because,
  };
}

/**
 * The rule, stated once so a reader meets it before the code.
 */
export const PLUG_IN_RULE =
  'A terminal is answered when it is identified, declares a purpose from the corpus’s own permitted uses, and asks a tool that purpose admits about a corpus its session named. Every other call is refused with its reason and its remedy, and both outcomes leave a receipt naming the party, the purpose and the instant.';
