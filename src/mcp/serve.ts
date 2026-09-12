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
 * A call that names a corpus is checked against the session's scope directly.
 * A call that names a release has its corpus resolved from the source first —
 * a lookup the boundary makes about its own inventory, not an answer served to
 * the caller — and is checked the same way. A call that names neither, which
 * today is the rulings, the factoring receipts and the dispatch events, is not
 * scope-checked, because those identifiers do not carry a corpus and inventing
 * a mapping from their prefixes would be a guess enforcing a policy. Those
 * tools are still admitted or refused by purpose; they are simply not narrowed
 * by scope, and that is the honest state of it.
 */
import { z } from 'zod';
import { admitCall, admitCapability, servedCallReceipt, type CallAdmission, type ProposedOperation, type ServedCallReceipt, type TerminalSession } from '@/domain/terminalPlane';
import { TOOL_CAPABILITY, capabilityById } from '@/domain/capabilityRegistry';
import { projectionFor } from '@/domain/terminalVocabulary';
import { getCorpusSource } from '@/adapter/corpusSource';
import type { RecordingFailure, ServedCallSink } from './record';
import { MCP_TOOLS, runMcpTool } from './tools';

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
  /**
   * Present only when a sink was given and could not write the ask down. The
   * answer stands — a correct refusal is not made wrong by the recorder being
   * unavailable — and this says the record is incomplete rather than leaving
   * an operator to assume it is not.
   */
  unrecorded?: RecordingFailure;
}

/**
 * Every corpus a call names.
 *
 * This returned one, and preferred the caller's `corpus` argument to the
 * corpus of the release it also named. That was an authorization bypass in a
 * single extra key: a session scoped to one corpus could pass its own
 * `corpus` beside another corpus's `releaseId`, be scope-checked against the
 * first and served the second. A tool that does not declare a `corpus`
 * parameter was no defence, because the check read the raw arguments rather
 * than the parsed ones, so the extra key rode straight through.
 *
 * A call is about every corpus it names, and all of them are checked. The
 * release's own corpus is resolved from the source and is authoritative for
 * the receipt; a `corpus` argument is an additional claim to be checked, never
 * a substitute for the release's.
 */
export async function corporaOfCall(args: unknown): Promise<readonly string[]> {
  const shape = z.object({ corpus: z.string().optional(), releaseId: z.string().optional() }).safeParse(args ?? {});
  if (!shape.success) return [];
  const named: string[] = [];
  if (shape.data.releaseId !== undefined) {
    const hit = await getCorpusSource().getRelease(shape.data.releaseId);
    if (hit !== undefined) named.push(hit.corpus.corpusId);
  }
  if (shape.data.corpus !== undefined && !named.includes(shape.data.corpus)) named.push(shape.data.corpus);
  return named;
}

/** The one a receipt records: the release's corpus where there is one. */
export async function corpusOfCall(args: unknown): Promise<string | undefined> {
  return (await corporaOfCall(args))[0];
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
  sink?: ServedCallSink,
): Promise<ServedCall> {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === toolName);
  if (tool !== undefined) z.object(tool.shape).parse(args ?? {});

  const bounded = boundProjection(session, toolName, args);
  const named = tool === undefined ? [] : await corporaOfCall(bounded);
  const admission = admitCall(session, toolName, at, named);
  const receipt = servedCallReceipt(session, toolName, at, admission, named[0]);
  const served = await outcomeOf(receipt, admission, () => runMcpTool(toolName, bounded));
  return record(served, session, sink);
}

/**
 * The arguments as they will be served, with the projection the class may
 * receive rather than the one the caller asked for.
 *
 * Forced rather than refused: a public terminal asking for the counterparty
 * view of a ruling is asking for something it may not have, and the useful
 * answer is the public view rather than an error. What it may never get is the
 * wider one, and it no longer can, because the argument the tool reads is this
 * one and not the caller's.
 */
function boundProjection(session: TerminalSession, toolName: string, args: unknown): unknown {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === toolName);
  if (tool === undefined || !('projection' in tool.shape)) return args;
  const asked = args !== null && typeof args === 'object' ? (args as { projection?: unknown }).projection : undefined;
  /*
   * Set whether or not the caller supplied one. Reading the argument only when
   * it was present left the wider default in place for a caller who simply
   * omitted it, which is the same bypass reached by asking for less.
   */
  return {
    ...(args !== null && typeof args === 'object' ? args : {}),
    projection: projectionFor(session.terminalClass, typeof asked === 'string' ? asked : undefined),
  };
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
  sink?: ServedCallSink,
): Promise<ServedCall> {
  const capability = capabilityById(capabilityId);
  const reachedBy = Object.keys(TOOL_CAPABILITY).find((name) => TOOL_CAPABILITY[name] === capabilityId);
  const bounded = reachedBy === undefined ? args : boundProjection(session, reachedBy, args);
  const named = capability === undefined ? [] : await corporaOfCall(bounded);
  const corpus = named[0];
  const admission = admitCapability(session, capability, at, named);
  const toolName = reachedBy;
  const receipt = { ...servedCallReceipt(session, toolName ?? capabilityId, at, admission, corpus), capability: capability?.id ?? null };
  if (admission.outcome === 'ADMITTED' && toolName === undefined) {
    return record({
      receipt,
      admission,
      unreachable: {
        because: `${capabilityId} is admitted for this session and no transport reaches it.`,
        reachableToday: capability?.reachableToday ?? 'not reachable',
      },
    }, session, sink);
  }
  if (toolName !== undefined && admission.outcome === 'ADMITTED') {
    z.object(MCP_TOOLS.find((candidate) => candidate.name === toolName)!.shape).parse(bounded ?? {});
  }
  const served = await outcomeOf(receipt, admission, toolName === undefined ? undefined : () => runMcpTool(toolName, bounded));
  return record(served, session, sink);
}

/**
 * Write the ask down, if there is anywhere to write it.
 *
 * The session is opened first and once, because a call points at a
 * declaration and a declaration cannot arrive after the call that rests on it.
 * A throw from either is caught: the answer above is already correct, and a
 * recorder that is down should cost a note on the response rather than the
 * response itself.
 */
async function record(served: ServedCall, session: TerminalSession, sink?: ServedCallSink): Promise<ServedCall> {
  if (sink === undefined) return served;
  try {
    await sink.openSession(session);
  } catch (error) {
    return { ...served, unrecorded: { what: 'SESSION', at: served.receipt.servedAt, because: reasonOf(error) } };
  }
  try {
    await sink.recordCall(served.receipt, session, served.proposal);
  } catch (error) {
    return { ...served, unrecorded: { what: 'CALL', at: served.receipt.servedAt, because: reasonOf(error) } };
  }
  return served;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
