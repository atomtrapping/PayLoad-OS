/**
 * The governed surface: the only way a terminal's call is answered.
 *
 * `./tools.ts` holds the tools and `runMcpTool` dispatches one. That
 * dispatcher answers anybody, which was the right shape while the surface was
 * an unauthenticated feed and is the wrong one now that a terminal plugs in
 * and operates. `serveToolCall` is the surface: it takes a session, admits or
 * refuses the call through `@/domain/terminalPlane`, dispatches only on
 * admission, and returns a receipt either way.
 *
 * A refusal is a successful return carrying a refusal object, exactly as a
 * not-found is on this surface already. Tool errors stay what they were:
 * malformed arguments, and nothing else.
 *
 * WHAT THE SCOPE CHECK REACHES
 *
 * Resource ownership comes from the actual release, ruling, receipt or event.
 * Collection reads are filtered to the session's corpora. The same parsed
 * arguments and owned session snapshot are used from admission to dispatch.
 */
import { z } from 'zod';
import { admitCall, admitCapability, servedCallReceipt, type CallAdmission, type ProposedOperation, type ServedCallReceipt, type TerminalSession } from '@/domain/terminalPlane';
import { TOOL_CAPABILITY, capabilityById } from '@/domain/capabilityRegistry';
import { PERMITTED_USES } from '@/domain/corpus';
import { getCorpusSource } from '@/adapter/corpusSource';
import { MCP_TOOLS, resourceOfTool, type McpReadContext } from './tools';

export interface ServedCall {
  receipt: ServedCallReceipt;
  admission: CallAdmission;
  /** The tool's answer, present only when an admitted read was dispatched. */
  result?: unknown;
  /** The refusal as a caller reads it, present only when the ask was refused. */
  refusal?: { code: string; because: string; remedy: string };
  /** The governed proposal an operate ask became, present only then. */
  proposal?: ProposedOperation;
  /**
   * Present when the ask was admitted and nothing plumbs it: the caller may
   * have this, and no transport reaches it yet. Saying so is more use to an
   * integrator than a refusal that would imply they were not allowed.
   */
  unreachable?: { because: string; reachableToday: string };
}

/**
 * The corpus a call is about, where the call says so.
 *
 * A release always resolves through the source; an accompanying corpus hint
 * cannot override it. Governed tools use their own resource resolver below.
 */
export async function corpusOfCall(args: unknown): Promise<string | undefined> {
  const shape = z.object({ corpus: z.string().optional(), releaseId: z.string().optional() }).safeParse(args ?? {});
  if (!shape.success) return undefined;
  if (shape.data.releaseId === undefined) return shape.data.corpus;
  const hit = await getCorpusSource().getRelease(shape.data.releaseId);
  return hit?.corpus.corpusId;
}

/**
 * Answer a terminal's call, or refuse it.
 *
 * Arguments are validated before admission for a known tool, so a malformed
 * call is a tool error rather than a refusal wearing the wrong reason — a
 * caller who mistyped an instant should be told that, not told its purpose
 * does not admit the tool. An unknown tool is a refusal, not a throw, because
 * "no such tool" is an answer a terminal can act on.
 */
export async function serveToolCall(
  session: TerminalSession,
  toolName: string,
  args: unknown,
  at: string,
): Promise<ServedCall> {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === toolName);
  if (tool !== undefined) return serveKnownTool(session, tool, args, at);
  const heldSession = snapshotSession(session);
  const admission = admitCall(heldSession, toolName, at);
  return outcomeOf(servedCallReceipt(heldSession, toolName, at, admission), admission, undefined);
}

const sessionSchema = z.object({
  sessionId: z.string().min(1), terminalId: z.string().min(1),
  terminalClass: z.enum(['FIRM_INTERNAL', 'CUSTOMER', 'PUBLIC']),
  purpose: z.enum(PERMITTED_USES), corpusScope: z.array(z.string().min(1)),
  openedAt: z.string(), expiresAt: z.string(),
});

/** Copy before the first await: a caller cannot widen a pending declaration. */
function snapshotSession(session: TerminalSession): TerminalSession {
  const parsed = sessionSchema.parse(session);
  return Object.freeze({ ...parsed, corpusScope: Object.freeze(parsed.corpusScope) });
}

function boundaryRefusal(code: 'CORPUS_UNRESOLVED' | 'PROJECTION_OUTSIDE_AUTHORITY', because: string, remedy: string): CallAdmission {
  return { outcome: 'REFUSED', admitted: false, refusal: code, because, remedy, shape: null, served: null, proposal: null };
}

async function serveKnownTool(
  session: TerminalSession,
  tool: (typeof MCP_TOOLS)[number],
  args: unknown,
  at: string,
): Promise<ServedCall> {
  const parsed: Record<string, unknown> = z.object(tool.shape).strict().parse(args ?? {});
  const heldSession = snapshotSession(session);
  const widerProjection = heldSession.terminalClass === 'PUBLIC' && parsed.projection === 'COUNTERPARTY_SHARED';
  if ('projection' in tool.shape && parsed.projection === undefined) {
    parsed.projection = heldSession.terminalClass === 'PUBLIC' ? 'PUBLIC_RULING' : 'COUNTERPARTY_SHARED';
  }
  const heldArgs = Object.freeze(parsed);
  const run = tool.run as (input: Readonly<Record<string, unknown>>, context: McpReadContext) => Promise<unknown>;
  const resource = await resourceOfTool(tool.name, heldArgs);
  const corpus = resource.kind === 'CORPUS' ? resource.corpus : undefined;
  let admission = admitCall(heldSession, tool.name, at, corpus);
  if (admission.admitted && resource.kind === 'UNRESOLVED') {
    admission = boundaryRefusal('CORPUS_UNRESOLVED', 'The requested object has no resolvable corpus ownership.', 'Bind the object to a release in the authoritative source before serving it.');
  }
  if (admission.admitted && widerProjection) {
    admission = boundaryRefusal('PROJECTION_OUTSIDE_AUTHORITY', 'A public session may read only the public projection.', 'Request PUBLIC_RULING or omit the projection.');
  }
  const receipt = servedCallReceipt(heldSession, tool.name, at, admission, corpus);
  const context = Object.freeze({ corpusScope: heldSession.corpusScope });
  return outcomeOf(receipt, admission, () => resource.kind === 'NOT_FOUND' ? Promise.resolve(resource.result) : run(heldArgs, context));
}

/**
 * Ask the substrate for a capability by name, whether or not a tool reaches it.
 *
 * The tools are the corpus reads. Everything else the substrate does — running
 * a workload, assessing coverage, compiling a dossier — has no tool and will
 * not get one, because those are not reads and are not answered by returning
 * something. This is how a terminal asks for them: it names the capability,
 * the plane decides, and an operate comes back as the proposal it became.
 *
 * A capability that is admitted but that nothing plumbs answers `unreachable`
 * rather than a refusal, because "you may, and it is not wired" and "you may
 * not" are different answers and an integrator needs to tell them apart.
 */
export async function serveCapabilityCall(
  session: TerminalSession,
  capabilityId: string,
  args: unknown,
  at: string,
): Promise<ServedCall> {
  const capability = capabilityById(capabilityId);
  const toolName = Object.keys(TOOL_CAPABILITY).find((name) => TOOL_CAPABILITY[name] === capabilityId);
  const tool = MCP_TOOLS.find((candidate) => candidate.name === toolName);
  if (tool !== undefined) return serveKnownTool(session, tool, args, at);
  const heldSession = snapshotSession(session);
  const parsed = capability === undefined ? undefined : z.object({ corpus: z.string().optional(), releaseId: z.string().optional() }).strict().parse(args ?? {});
  const corpus = parsed === undefined ? undefined : await corpusOfCall(parsed);
  let admission = admitCapability(heldSession, capability, at, corpus);
  if (admission.outcome !== 'REFUSED' && parsed?.releaseId !== undefined && corpus === undefined) {
    admission = boundaryRefusal('CORPUS_UNRESOLVED', 'The named release has no resolvable corpus ownership.', 'Name a release in the authoritative source before asking for this capability.');
  }
  const receipt = { ...servedCallReceipt(heldSession, capabilityId, at, admission, corpus), capability: capability?.id ?? null };
  if (admission.outcome === 'ADMITTED') {
    return {
      receipt,
      admission,
      unreachable: {
        because: `${capabilityId} is admitted for this session and no transport reaches it.`,
        reachableToday: capability?.reachableToday ?? 'not reachable',
      },
    };
  }
  return outcomeOf(receipt, admission, undefined);
}

/** One place the three outcomes become one answer shape. */
async function outcomeOf(
  receipt: ServedCallReceipt,
  admission: CallAdmission,
  dispatch: (() => Promise<unknown>) | undefined,
): Promise<ServedCall> {
  if (admission.outcome === 'PROPOSAL_REQUIRED') {
    return { receipt, admission, proposal: admission.proposal ?? undefined };
  }
  if (admission.outcome === 'REFUSED') {
    return { receipt, admission, refusal: { code: admission.refusal ?? 'REFUSED', because: admission.because, remedy: admission.remedy } };
  }
  return { receipt, admission, result: dispatch === undefined ? undefined : await dispatch() };
}
