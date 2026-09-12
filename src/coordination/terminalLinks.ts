import { z } from 'zod';
import { assertAuthenticated, type AuthenticatedTerminal } from '@/terminal/auth';
import { commitment, digest, id, refuse, TerminalError, TERMINAL_PROTOCOL } from '@/terminal/contracts';
import type { TerminalService } from '@/terminal/service';
import { terminalLink } from './contracts';

export interface TerminalLink { jobId: string; actionDigest: string; resultDigest?: string }
export interface BoardLinkScope { corpusId: string; purpose: AuthenticatedTerminal['purpose'] }
export type TerminalLinkReader = Pick<TerminalService, 'getJob' | 'result'>;

const state = z.enum(['PROPOSED', 'DENIED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
const summary = z.object({
  jobId: id, actionDigest: digest, corpusId: id, releaseId: id, state,
  correctsJobId: id.nullable(), corrections: z.array(z.object({ jobId: id, state }).strict()).max(100),
  fixture_only: z.boolean(),
}).strict();
const receipt = z.object({
  protocol: z.literal(TERMINAL_PROTOCOL), jobId: id, resultDigest: digest, snapshotDigest: digest,
  actionDigest: digest, principalId: id, terminalId: id, retrievedAt: z.iso.datetime({ offset: true }),
  permittedUse: z.string().max(128), fixture_only: z.boolean(),
}).strict();
export interface ValidatedTerminalLink extends z.infer<typeof summary> {
  purpose: AuthenticatedTerminal['purpose']; resultDigest?: string; receiptDigest?: string;
}

/** Resolve for this reader on every use. A board membership never grants job or result access.
 * The terminal service owns authorization, current source permission and durable delivery receipts;
 * this adapter retains no state and exposes neither result bytes nor the raw receipt. */
export async function validateTerminalLink(terminal: TerminalLinkReader, who: AuthenticatedTerminal,
  board: BoardLinkScope, input: TerminalLink): Promise<ValidatedTerminalLink> {
  assertAuthenticated(who);
  const parsed = terminalLink.safeParse(input);
  if (!parsed.success) refuse('TERMINAL_LINK_INVALID');
  if (!id.safeParse(board.corpusId).success || board.purpose !== who.purpose || !who.corpusScope.includes(board.corpusId)) {
    refuse('RESOURCE_NOT_AVAILABLE', 404);
  }
  const link = parsed.data;
  try {
    // getJob already binds its retained purpose to this authenticated purpose.
    // Preserve its owner-or-reviewer ACL instead of creating a second authorization query.
    const job = await terminal.getJob(who, link.jobId);
    assertAuthenticated(who);
    if (job.corpusId !== board.corpusId) refuse('RESOURCE_NOT_AVAILABLE', 404);
    if (job.jobId !== link.jobId || job.actionDigest !== link.actionDigest) refuse('TERMINAL_LINK_INVALID');
    const projected = summary.safeParse({
      jobId: job.jobId, actionDigest: job.actionDigest, corpusId: job.corpusId, releaseId: job.releaseId,
      state: job.state, correctsJobId: job.correctsJobId, corrections: job.corrections, fixture_only: job.fixture_only,
    });
    if (!projected.success) refuse('TERMINAL_LINK_INVALID');
    const view: ValidatedTerminalLink = { ...projected.data, purpose: who.purpose };
    if (link.resultDigest !== undefined) {
      const delivery = await terminal.result(who, link.jobId);
      assertAuthenticated(who);
      const bound = receipt.safeParse(delivery.receipt);
      if (job.state !== 'SUCCEEDED' || delivery.resultDigest !== link.resultDigest || !bound.success
        || !digest.safeParse(delivery.receiptDigest).success || commitment(bound.data) !== delivery.receiptDigest
        || bound.data.jobId !== job.jobId || bound.data.actionDigest !== job.actionDigest
        || bound.data.resultDigest !== link.resultDigest || bound.data.snapshotDigest !== job.snapshotDigest
        || bound.data.principalId !== who.principalId || bound.data.terminalId !== who.terminalId
        || bound.data.permittedUse !== who.purpose || bound.data.fixture_only !== job.fixture_only) refuse('TERMINAL_LINK_INVALID');
      view.resultDigest = delivery.resultDigest;
      view.receiptDigest = delivery.receiptDigest;
    }
    return view;
  } catch (error) {
    if (error instanceof TerminalError) throw error;
    return refuse('TERMINAL_LINK_UNAVAILABLE', 503);
  }
}
