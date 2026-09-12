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
import { USE_LABEL, type PermittedUse } from './corpus';
import { capabilityOfTool, type Capability } from './capabilityRegistry';
import {
  CLASS_AUDIENCE, NEVER_DECLARABLE, PURPOSE_ADMITS, USE_AUDIENCE, declarablePurposes,
  type CallOutcome, type CallRefusal, type ServedKind, type SessionRefusal, type TerminalClass, type TerminalSession,
} from './terminalVocabulary';
import { MCP_TOOLS } from '@/mcp/tools';

/*
 * The vocabulary lives in `./terminalVocabulary.ts` so the ledger can hold a
 * call without importing a transport. It is re-exported here, because a reader
 * who comes to the plane first should meet the whole thing in one place.
 */
export * from './terminalVocabulary';

/* ── What a tool serves ── */

/**
 * What a tool serves, read from the capability it reaches rather than from a
 * table beside it.
 *
 * This used to be its own map of tool name to served kind, which is a second
 * place the same fact lives and therefore a place it can differ. A tool is one
 * way into a capability; the capability says what it hands back, and a tool
 * that reaches nothing described in `./capabilityRegistry.ts` is unreachable
 * rather than open.
 */
export function toolServes(toolName: string): ServedKind | undefined {
  const capability = capabilityOfTool(toolName);
  return capability?.kind === 'READ' ? capability.serves : undefined;
}

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

export const OPERATE_WAITS_ON: readonly string[] = [
  'A decision packet naming the exact action by digest, with the case against it (decision_packet).',
  'A review of that digest by a registered HUMAN or POLICY principal; an agent cannot be the reviewer (proposal_review).',
  'An execution authorization of the reviewed digest, granted by a HUMAN or POLICY principal, bounded by an expiry (execution_authorization).',
];

/**
 * And the fact that makes all of the above moot today, stated rather than
 * discovered by a caller who waits.
 *
 * `execution_authorization.corpus_release_id` is a NOT NULL foreign key into
 * `releases`. No release has been admitted, so the row cannot be written and
 * no authorization can be granted at all. Every operate ask is therefore
 * recordable and unauthorizable, and the plane says so at the moment of asking.
 */
export const NO_AUTHORITY_CAN_BE_GRANTED_YET =
  'No execution authorization can be granted at all today: the row names a corpus release by foreign key and no release has been admitted. The proposal stands, and nothing can act on it until the corpus has a release.';

/**
 * The proposal an operate ask becomes. The plane fills this from the session
 * and the capability; a caller supplies none of it, which is why a terminal
 * cannot understate what it asked for.
 */
export interface ProposedOperation {
  /** `operation_proposal.operation_kind`: the capability, by id. */
  operationKind: string;
  /** `operation_proposal.counterparty`: the terminal that asked. */
  counterparty: string;
  /** `operation_proposal.declared_side_effects`: what the capability says it would change. */
  declaredSideEffects: readonly string[];
  /** The purpose the session declared, which the reviewer weighs against the act. */
  underPurpose: PermittedUse;
  waitsOn: readonly string[];
  blockedBy: string;
}

export interface CallAdmission {
  outcome: CallOutcome;
  /** True only for an answered read. An operate that became a proposal is not admitted. */
  admitted: boolean;
  refusal: CallRefusal | null;
  because: string;
  /** What the caller should do next. Present on every refusal and every proposal. */
  remedy: string;
  /** The shape the purpose admits the answer in. Null unless a read was admitted. */
  shape: string | null;
  served: ServedKind | null;
  /** Present only when the outcome is PROPOSAL_REQUIRED. */
  proposal: ProposedOperation | null;
}

const refuse = (refusal: CallRefusal, because: string, remedy: string): CallAdmission =>
  ({ outcome: 'REFUSED', admitted: false, refusal, because, remedy, shape: null, served: null, proposal: null });

/**
 * The whole decision, in one order, over declared inputs.
 *
 * Order is the argument, as it is in the coverage assessment. The session's
 * own standing comes first, because a session that could not be opened
 * answers nothing. The window next. Then the estates, unconditionally, so no
 * refusal reads as though some purpose might reach them. Then the corpus
 * against the declared scope, which binds every kind of ask and not only
 * reads. Only then does the kind decide: a read is measured against the
 * purpose, an operate becomes a proposal, an admission is refused to anyone
 * but the firm.
 *
 * The corpus check moved ahead of the kind deliberately. A terminal asking to
 * re-assess a corpus it never named should be told that, rather than handed a
 * proposal for an act it had no standing to ask about.
 */
export function admitCapability(
  session: TerminalSession,
  capability: Capability | undefined,
  at: string,
  /** Every corpus the call named. All are checked; naming one in scope does not license another. */
  corpora?: string | readonly string[],
): CallAdmission {
  const named = corpora === undefined ? [] : (typeof corpora === 'string' ? [corpora] : corpora);
  const standing = openable(session);
  if (!standing.open) {
    return refuse(standing.refusal as CallRefusal, standing.because, 'Open a session this terminal may hold, and declare a purpose its class calls at.');
  }
  if (Date.parse(at) > Date.parse(session.expiresAt)) {
    return refuse('SESSION_EXPIRED', `The session was declared until ${session.expiresAt} and this call is at ${at}.`, 'Open a new session. A declaration is not extended by calling after it.');
  }
  if (capability === undefined) {
    return refuse('CAPABILITY_UNKNOWN', 'Nothing in the capability registry answers this ask, so there is nothing to admit or refuse it as.', 'Describe the capability in src/domain/capabilityRegistry.ts. What is not described is not reachable.');
  }
  if (capability.touchesEstates && session.terminalClass !== 'FIRM_INTERNAL') {
    return refuse(
      'ESTATE_NEVER_SERVED',
      `${capability.id} reaches an estate: the corpus's own judgement about its sources, not the corpus. The corpus is served under a purpose; the estates are served outside the firm to nobody, on any transport, for any purpose.`,
      'Ask the corpus. The calibration, reliability, disagreement and identity-decision estates do not leave the wall.',
    );
  }
  if (capability.serves === 'ESTATE') {
    return refuse('ESTATE_NEVER_SERVED', 'The corpus is served under a purpose; the estates are served to nobody, on any transport, for any purpose.', 'Ask the corpus. The calibration, reliability, disagreement and identity-decision estates do not leave the wall.');
  }
  const outside = named.filter((corpus) => !session.corpusScope.includes(corpus));
  if (outside.length > 0) {
    return refuse(
      'CORPUS_OUTSIDE_SCOPE',
      `The session named ${session.corpusScope.join(', ')} and this call asks about ${outside.join(', ')}.`,
      'Open a session naming that corpus. A scope is not widened by asking outside it, nor by naming one in scope beside one that is not.',
    );
  }

  if (capability.kind === 'ADMIT') {
    if (session.terminalClass !== 'FIRM_INTERNAL') {
      return refuse(
        'ADMISSION_IS_THE_FIRMS_OWN_ACT',
        `${capability.id} would put material into the corpus. What the corpus stands behind is the firm's own act, and no outside terminal performs it at any purpose.`,
        'Propose the material through the acquisition fabric, which is where evidence enters and where it is refused.',
      );
    }
    return proposalFor(session, capability);
  }
  if (capability.kind === 'OPERATE') return proposalFor(session, capability);

  const admission = PURPOSE_ADMITS.find((entry) => entry.use === session.purpose);
  const served = capability.serves;
  if (served === undefined) {
    return refuse('CAPABILITY_UNKNOWN', `${capability.id} is a read that does not say what it hands back, so no purpose can admit it.`, 'Give the capability a served kind in src/domain/capabilityRegistry.ts.');
  }
  if (admission === undefined || !admission.admits.includes(served)) {
    const admitsFor = admission?.admits.join(', ') ?? 'nothing';
    return refuse(
      'PURPOSE_DOES_NOT_ADMIT_THIS',
      `${capability.id} serves ${served}, and ${USE_LABEL[session.purpose]} admits ${admitsFor}.`,
      `Declare a purpose that admits ${served}, in a session that says so, or ask a capability this purpose admits.`,
    );
  }
  return {
    outcome: 'ADMITTED',
    admitted: true,
    refusal: null,
    because: `${USE_LABEL[session.purpose]} admits ${served}.`,
    remedy: '',
    shape: admission.shape,
    served,
    proposal: null,
  };
}

/**
 * An operate ask, turned into the proposal it has to become.
 *
 * The plane records; it does not decide and it does not run. What comes back
 * tells the terminal exactly what its ask now waits on, including the one
 * thing that cannot happen yet, so a caller is not left inferring silence.
 */
function proposalFor(session: TerminalSession, capability: Capability): CallAdmission {
  return {
    outcome: 'PROPOSAL_REQUIRED',
    admitted: false,
    refusal: null,
    because: `${capability.id} ${capability.kind === 'ADMIT' ? 'would admit material into the corpus' : 'changes what the system holds'}, and a declared purpose does not authorize that. The ask is recorded as a proposal; it has not run.`,
    remedy: 'Nothing further is asked of the terminal. A reviewer decides, and the proposal carries the party, the purpose and the declared side effects they need to decide with.',
    shape: null,
    served: null,
    proposal: {
      operationKind: capability.id,
      counterparty: session.terminalId,
      declaredSideEffects: capability.sideEffects ?? [],
      underPurpose: session.purpose,
      waitsOn: OPERATE_WAITS_ON,
      blockedBy: NO_AUTHORITY_CAN_BE_GRANTED_YET,
    },
  };
}

/**
 * The same decision, reached through a tool name. A tool is one way into a
 * capability, so an unknown tool is refused as a tool and everything after
 * that is about the capability it reaches.
 */
export function admitCall(
  session: TerminalSession,
  toolName: string,
  at: string,
  corpora?: string | readonly string[],
): CallAdmission {
  const standing = openable(session);
  if (standing.open && !MCP_TOOLS.some((tool) => tool.name === toolName)) {
    return refuse('TOOL_UNKNOWN', `No tool ${toolName} on this surface.`, `Tools: ${MCP_TOOLS.map((tool) => tool.name).join(', ')}.`);
  }
  return admitCapability(session, capabilityOfTool(toolName), at, corpora);
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
  /** The outcome, in the plane's own three-way vocabulary. */
  decision: CallOutcome;
  refusal: CallRefusal | null;
  /** The capability the ask reached, where one was found. */
  capability: string | null;
  /** For a proposal, what would change. Empty for a read. */
  declaredSideEffects: readonly string[];
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
    decision: admission.outcome,
    refusal: admission.refusal,
    capability: admission.proposal?.operationKind ?? capabilityOfTool(toolName)?.id ?? null,
    declaredSideEffects: admission.proposal?.declaredSideEffects ?? [],
    because: admission.because,
  };
}

/**
 * The rule, stated once so a reader meets it before the code.
 */
export const PLUG_IN_RULE =
  'A terminal is answered when it is identified, declares a purpose from the corpus’s own permitted uses, and asks for a capability that purpose admits about a corpus its session named. A read is answered under the purpose. An operate is never run on a terminal’s say-so: it becomes a proposal carrying the party, the purpose and the side effects the capability declared, and it waits on a human. An admission into the corpus is the firm’s own act and is refused to every other terminal. Every ask leaves a receipt naming the party, the purpose, the capability and the instant.';
