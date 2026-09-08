/**
 * A body cap is only a cap if it applies before the allocation.
 *
 * Every POST on this feed used to call `req.json()` or `req.text()`. Both
 * buffer the caller's stream to completion before a single line of handler code
 * runs, so the harvester's own 32-document, 512 KiB-per-document limits were
 * being enforced on memory the process had already spent. These tests hold the
 * reader to refusing at the byte that crosses the cap.
 */
import { describe, expect, it, vi } from 'vitest';

import { FeedBodyError, MAX_FEED_BODY_BYTES, bodyRefusal, readBoundedJson } from './_lib';

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/v1/factoring/verify', { method: 'POST', headers, body });
}

/** A stream that keeps producing until it is cancelled, so an unbounded reader never returns. */
function endlessBody(chunkBytes = 64 * 1024, headers: Record<string, string> = {}) {
  const cancel = vi.fn();
  let produced = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      produced += chunkBytes;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x20));
    },
    cancel,
  });
  const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers, body, duplex: 'half' };
  return { request: new Request('http://localhost:3000/api/v1/factoring/verify', init), cancel, produced: () => produced };
}

async function refused(promise: Promise<unknown>): Promise<FeedBodyError> {
  try { await promise; }
  catch (error) { return error as FeedBodyError; }
  throw new Error('the reader accepted a body it should have refused');
}

describe('the reader stops at its cap rather than at the end of the caller’s stream', () => {
  it('refuses an endless body and cancels the stream', async () => {
    const { request, cancel, produced } = endlessBody();
    const error = await refused(readBoundedJson(request));
    expect(error).toBeInstanceOf(FeedBodyError);
    expect(error.code).toBe('BODY_TOO_LARGE');
    expect(error.status).toBe(413);
    // The cap held: the process read a bounded prefix, not the stream.
    expect(produced()).toBeLessThanOrEqual(MAX_FEED_BODY_BYTES + 64 * 1024);
    expect(cancel).toHaveBeenCalled();
  });

  it('refuses on a declared content-length before it reads a byte', async () => {
    const { request } = endlessBody(64 * 1024, { 'content-length': String(MAX_FEED_BODY_BYTES + 1) });
    const error = await refused(readBoundedJson(request));
    expect(error.code).toBe('BODY_TOO_LARGE');
    expect(error.message).toContain(String(MAX_FEED_BODY_BYTES + 1));
    // The reader never took the stream. A caller who declares a body too large
    // is refused on the declaration rather than made to upload it first.
    // (`produced` is not the assertion here: a ReadableStream fills its own
    // queue on construction, so the source runs before any reader exists.)
    expect(request.body?.locked).toBe(false);
    expect(request.bodyUsed).toBe(false);
  });

  it('honours a smaller cap than the default, which is how the harvester states its own limit', async () => {
    expect((await refused(readBoundedJson(post('x'.repeat(200)), 100))).code).toBe('BODY_TOO_LARGE');
    await expect(readBoundedJson(post('"ok"'), 100)).resolves.toBe('ok');
  });
});

describe('what the reader returns for the bodies these routes actually get', () => {
  it('parses a JSON object', async () => {
    await expect(readBoundedJson(post(JSON.stringify({ receiptId: 'RCP-1' })))).resolves.toEqual({ receiptId: 'RCP-1' });
  });

  it('answers undefined for an absent or blank body, because four of these routes accept none', async () => {
    await expect(readBoundedJson(post(null))).resolves.toBeUndefined();
    await expect(readBoundedJson(post(''))).resolves.toBeUndefined();
    await expect(readBoundedJson(post('   \n  '))).resolves.toBeUndefined();
  });

  it('refuses malformed JSON as a request fault, not a size fault', async () => {
    const error = await refused(readBoundedJson(post('{ not json')));
    expect(error.code).toBe('INVALID_JSON');
    expect(error.status).toBe(400);
  });

  it('refuses bytes that are not UTF-8 rather than substituting replacement characters', async () => {
    // A lone continuation byte. A lenient decoder would turn this into U+FFFD
    // and hand the route a string the caller never sent.
    await expect(readBoundedJson(post(new Uint8Array([0x22, 0x80, 0x22])))).rejects.toBeInstanceOf(FeedBodyError);
  });
});

describe('a body refusal reaches the caller in the same envelope as every other refusal', () => {
  it('carries the feed’s attestation headers and its self-describing envelope', async () => {
    const response = bodyRefusal(new FeedBodyError('BODY_TOO_LARGE', 'too large', 'send less', 413));
    expect(response.status).toBe(413);
    expect(response.headers.get('x-payload-fixture-only')).toBe('true');
    const payload = await response.json();
    expect(payload.error).toBe('BODY_TOO_LARGE');
    expect(payload.remedy).toBe('send less');
    expect(payload.data_class).toBe('synthetic');
  });
});
