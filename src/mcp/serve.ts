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
import { admitCall, servedCallReceipt, type CallAdmission, type ServedCallReceipt, type TerminalSession } from '@/domain/terminalPlane';
import { getCorpusSource } from '@/adapter/corpusSource';
import { MCP_TOOLS, runMcpTool } from './tools';

export interface ServedCall {
  receipt: ServedCallReceipt;
  admission: CallAdmission;
  /** The tool's answer, present only when the call was admitted. */
  result?: unknown;
  /** The refusal as a caller reads it, present only when it was not. */
  refusal?: { code: string; because: string; remedy: string };
}

/**
 * The corpus a call is about, where the call says so.
 *
 * `corpus` when the tool takes one; otherwise the corpus of the named release,
 * resolved from the source. Undefined when the call names neither, which the
 * scope check reads as "not narrowed by scope" rather than as "any corpus".
 */
export async function corpusOfCall(args: unknown): Promise<string | undefined> {
  const shape = z.object({ corpus: z.string().optional(), releaseId: z.string().optional() }).safeParse(args ?? {});
  if (!shape.success) return undefined;
  if (shape.data.corpus !== undefined) return shape.data.corpus;
  if (shape.data.releaseId === undefined) return undefined;
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
  if (tool !== undefined) z.object(tool.shape).parse(args ?? {});

  const corpus = tool === undefined ? undefined : await corpusOfCall(args);
  const admission = admitCall(session, toolName, at, corpus);
  const receipt = servedCallReceipt(session, toolName, at, admission, corpus);
  if (!admission.admitted) {
    return { receipt, admission, refusal: { code: admission.refusal ?? 'REFUSED', because: admission.because, remedy: admission.remedy } };
  }
  return { receipt, admission, result: await runMcpTool(toolName, args) };
}
