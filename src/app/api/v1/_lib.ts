import { NextResponse } from 'next/server';

export const SYSTEM_DATA_CLASS = 'synthetic' as const;
export const SYSTEM_CORPUS_RELEASE = 'osiris-insurability@2026.09.30.1-synthetic' as const;
export const SYSTEM_PARAMETER_SET_VERSION = 'PARAM-2026-Q3-V1' as const;
export const SYSTEM_VERIFICATION_RUNG = 3 as const;
export const SYSTEM_VERIFICATION_RUNG_NAME = 'Substance begins (Hash -> Artifact -> Retained Bytes Traced)' as const;

export const STANDARD_ATTESTATION_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Payload-Data-Class': SYSTEM_DATA_CLASS,
  'X-Payload-Corpus-Release': SYSTEM_CORPUS_RELEASE,
  'X-Payload-Parameter-Set': SYSTEM_PARAMETER_SET_VERSION,
  'X-Payload-Verification-Rung': '3-substance-trace',
  'X-Payload-Fixture-Only': 'true',
  'X-Payload-Feed': 'payload-os.feed.v0-demo',
};

/**
 * Fixture feed responses. Deterministic, uncached, JSON.
 * Self-attests data_class, corpus_release, and verification rung in both headers
 * and payload envelope so clients cannot mistake synthetic fixtures for live/admitted data.
 */
export function json(body: unknown, status = 200, customHeaders: Record<string, string> = {}) {
  let payload = body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    payload = {
      data_class: SYSTEM_DATA_CLASS,
      corpus_release: SYSTEM_CORPUS_RELEASE,
      parameter_set_version: SYSTEM_PARAMETER_SET_VERSION,
      verification_rung: SYSTEM_VERIFICATION_RUNG,
      ...body,
    };
  }

  return NextResponse.json(payload, {
    status,
    headers: {
      ...STANDARD_ATTESTATION_HEADERS,
      ...customHeaders,
    },
  });
}

export function refusal(status: number, error: string, detail: string, remedy: string) {
  return json({ fixture_only: true, error, detail, remedy }, status);
}


/**
 * A body this process has not finished reading has already cost it the memory.
 *
 * Every POST under /api/v1 used to call `req.json()` or `req.text()`, which
 * buffer whatever the caller sends before any handler code runs. None of these
 * routes has a use for a body larger than a small JSON document, so the cap is
 * the document size rather than a guess at what a client might need, and the
 * stream is cancelled at the byte that crosses it rather than after the
 * allocation.
 */
export const MAX_FEED_BODY_BYTES = 256 * 1024;

export class FeedBodyError extends Error {
  constructor(public code: string, message: string, public remedy: string, public status = 400) { super(message); }
}

/** Turns a body refusal into the same envelope every other refusal on this feed uses. */
export function bodyRefusal(error: FeedBodyError) {
  return refusal(error.status, error.code, error.message, error.remedy);
}

/**
 * Reads a request body to at most `maxBytes` and parses it as UTF-8 JSON.
 * An empty body is `undefined` rather than a parse failure: four of these
 * routes accept no body at all and fall back to a fixture.
 */
export async function readBoundedJson(request: Request, maxBytes = MAX_FEED_BODY_BYTES): Promise<unknown> {
  if (!request.body) return undefined;
  const declared = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new FeedBodyError('BODY_TOO_LARGE', `The request body declares ${declared} bytes and this feed reads at most ${maxBytes}.`, `Send at most ${maxBytes} bytes of JSON.`, 413);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => { /* A broken caller stream must not replace the size refusal. */ });
        throw new FeedBodyError('BODY_TOO_LARGE', `The request body exceeds the ${maxBytes} bytes this feed reads.`, `Send at most ${maxBytes} bytes of JSON.`, 413);
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  // The decode is inside the refusal, not beside it: a fatal TextDecoder throws
  // a raw TypeError, and a route that catches only FeedBodyError would have
  // reported malformed bytes as an internal failure.
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    if (text.trim().length === 0) return undefined;
    return JSON.parse(text);
  } catch { throw new FeedBodyError('INVALID_JSON', 'The request body must be valid UTF-8 JSON.', 'Send a JSON object.'); }
}
