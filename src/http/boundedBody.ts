/**
 * Read a request body up to a limit, and refuse past it.
 *
 * Four transports had each written this loop: the projection preview route, the
 * feed's `_lib`, the coordination board and the state kernel. The loop was
 * identical in all four and the refusal was not, which is correct — each has
 * its own error type and its own limit, and a shared reader that imposed one
 * would be worse than the duplication.
 *
 * WHAT THE FOURTH COPY MISSED
 *
 * Three of the four wrapped `reader.cancel()`, and each carried a comment
 * saying why: "Cancellation is best effort; the measured limit remains
 * decisive", "A broken caller stream must not replace the size refusal",
 * "Cancellation failure must not change the size refusal". The coordination
 * board's copy awaited it bare. A caller whose stream rejects on cancel — the
 * same broken caller that is most likely to be sending too much — would get
 * that rejection instead of BODY_TOO_LARGE, and the refusal it earned would be
 * replaced by an error about the plumbing.
 *
 * Three copies learned that and the fourth did not, because a lesson applied
 * to a copy is applied to one copy. Here it is applied once.
 *
 * THE LIMIT IS MEASURED, NOT DECLARED
 *
 * Bytes are counted as they arrive. A `content-length` header is a claim by
 * the caller and callers that send too much are exactly the ones whose claims
 * are worth least; a transport may check the header first as a cheap early
 * refusal, but the decisive number is this one.
 *
 * AND IT RETURNS BYTES, NOT TEXT
 *
 * Because the decode is not shared. Three of the four transports decode with
 * `fatal: true`, so invalid UTF-8 is refused rather than turned into
 * replacement characters, and one of them carries a comment about where that
 * throw has to be caught. Decoding here would have quietly given all four the
 * lenient behaviour of the one that had it. Reading to a limit is the common
 * part; what the bytes mean is the transport's.
 */

export const DEFAULT_BODY_TIMEOUT_MS = 10_000;
export type BodyReadFailure = 'BODY_READ_TIMEOUT' | 'BODY_READ_ABORTED';
export class BodyReadError extends Error {
  constructor(readonly code: BodyReadFailure) {
    super(code);
    this.name = 'BodyReadError';
  }
}
export interface BodyReadOptions {
  /** One total deadline; incoming chunks do not extend it. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * `refuse` keeps each transport's own size error and status. Timeouts and aborts
 * have stable, sanitized errors; neither includes caller-controlled reasons.
 */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  refuse: () => never,
  options: BodyReadOptions = {},
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('BODY_READ_LIMIT_INVALID');
  const timeoutMs = options.timeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2_147_483_647) throw new RangeError('BODY_READ_TIMEOUT_INVALID');
  const reader = body.getReader();
  // One growing buffer bounds bookkeeping as well as payload bytes. Empty or
  // one-byte chunks cannot accumulate an unbounded array of retained objects.
  let bytes = new Uint8Array(0);
  let length = 0;
  let stopped = false;
  let cancelled = false;
  const cancelReader = () => {
    if (cancelled) return;
    cancelled = true;
    // Cancellation is caller-controlled; never await it or replace the error.
    try { void reader.cancel().catch(() => {}); } catch { /* Best effort. */ }
  };
  const deadline = performance.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BodyReadError('BODY_READ_TIMEOUT')), timeoutMs);
    onAbort = () => reject(new BodyReadError('BODY_READ_ABORTED'));
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });
  });
  const checkDeadline = () => {
    if (options.signal?.aborted) throw new BodyReadError('BODY_READ_ABORTED');
    if (performance.now() >= deadline) throw new BodyReadError('BODY_READ_TIMEOUT');
  };
  const consume = async () => {
    let reads = 0;
    while (!stopped) {
      checkDeadline();
      const chunk = await reader.read();
      if (stopped) return;
      checkDeadline();
      if (chunk.done) return;
      const nextLength = length + chunk.value.byteLength;
      if (nextLength > maxBytes) {
        cancelReader();
        refuse();
      }
      if (nextLength > bytes.length) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(nextLength, bytes.length * 2, 4096)));
        grown.set(bytes.subarray(0, length));
        bytes = grown;
      }
      bytes.set(chunk.value, length);
      length = nextLength;
      // Eager empty/tiny chunks otherwise monopolize microtasks, preventing
      // external aborts and the total-deadline timer from running.
      if (++reads % 128 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };
  try {
    await Promise.race([consume(), interrupted]);
  } catch (error) {
    stopped = true;
    // Cancellation is caller-controlled. Neither rejection nor a promise that
    // never settles may replace the original refusal or extend its deadline.
    cancelReader();
    throw error;
  } finally {
    stopped = true;
    clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  return bytes.slice(0, length);
}
