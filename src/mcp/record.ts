/**
 * Where a served call goes after the plane has decided it.
 *
 * `./serve.ts` decides and answers; `src/db/terminalLedger.ts` holds what
 * happened. This is the seam between them, and it is a seam rather than a
 * direct call for one reason: the governed surface runs in places that have no
 * database. The stdio server on an operator's machine has none. A unit test
 * exercising a refusal has none. A surface that could only answer when a
 * database was reachable would be a surface that stops answering when the
 * recorder is down, which is the wrong failure — the plane's decision does not
 * depend on being written down, and making it depend on that would trade a
 * correct refusal for an outage.
 *
 * So recording is a sink the surface may be given. Without one, the receipts
 * are returned and nothing is written, and `servingStanding()` says so rather
 * than implying otherwise. With one, every ask lands in the ledger.
 *
 * WHAT A FAILED WRITE MEANS
 *
 * A sink that throws does not fail the call. The caller asked a question, the
 * plane answered it correctly, and the answer is not made wrong by the
 * recorder being unavailable. But a silent loss is worse than a noisy one, so
 * a sink that throws is counted and its error kept: `unrecorded` on the
 * response says how many asks this surface could not write down, which is the
 * honest thing to hand an operator who is deciding whether the record is
 * complete.
 */
import type { ProposedOperation, ServedCallReceipt, TerminalSession } from '@/domain/terminalPlane';

/**
 * A place served calls are written. Both methods may throw; the surface counts
 * the failure rather than passing it to the caller.
 */
export interface ServedCallSink {
  /** Record the declaration, once, before any of its calls. */
  openSession(session: TerminalSession): Promise<void>;
  /**
   * Record one ask. `proposal` is present exactly when the plane turned the
   * ask into one, and the sink is responsible for writing that proposal into
   * the governance kernel before the call that points at it.
   */
  recordCall(receipt: ServedCallReceipt, session: TerminalSession, proposal?: ProposedOperation): Promise<void>;
}

/**
 * What a surface could not write down.
 *
 * Kept rather than thrown, and reported rather than swallowed: an operator
 * reading a record needs to know whether it is complete, and a count of zero
 * is a different statement from no count at all.
 */
export interface RecordingFailure {
  what: 'SESSION' | 'CALL';
  at: string;
  because: string;
}

/**
 * A sink that keeps the calls in memory.
 *
 * For a surface that wants the receipts back as a list rather than as rows —
 * a test, a demonstration, an operator console with no database behind it. It
 * is not a ledger and does not pretend to be one: nothing here is guarded, and
 * the process forgets all of it.
 */
export class InMemoryCallSink implements ServedCallSink {
  readonly sessions: TerminalSession[] = [];
  readonly calls: Array<{ receipt: ServedCallReceipt; proposal?: ProposedOperation }> = [];

  async openSession(session: TerminalSession): Promise<void> {
    if (!this.sessions.some((held) => held.sessionId === session.sessionId)) this.sessions.push(session);
  }

  async recordCall(receipt: ServedCallReceipt, _session: TerminalSession, proposal?: ProposedOperation): Promise<void> {
    this.calls.push({ receipt, proposal });
  }
}
