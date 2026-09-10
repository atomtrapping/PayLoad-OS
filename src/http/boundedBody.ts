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

/**
 * `refuse` returns `never` — it throws, or the transport's own refusal does.
 * That is what lets each caller keep its own error type and status without this
 * module knowing any of them.
 */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  refuse: () => never,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        // Best effort, and deliberately swallowed: the measured limit is the
        // decision, and a stream that fails to cancel does not overturn it.
        try { await reader.cancel(); } catch { /* see above */ }
        refuse();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { joined.set(chunk, at); at += chunk.byteLength; }
  return joined;
}
