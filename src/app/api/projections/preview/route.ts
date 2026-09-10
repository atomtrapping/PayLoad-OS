import { NextResponse } from 'next/server';
import { compileProjection } from '@/projection/compile';
import { ProjectionError } from '@/projection/spec';
import { getCorpusSource } from '@/adapter/corpusSource';
import { readBoundedBody } from '@/http/boundedBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 32 * 1024;

function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true' } });
}
function refusal(error: string, status: number) { return json({ fixture_only: true, error }, status); }

class BodyTooLarge extends Error {}

/** Read-only POST because the exact selection is structured; nothing is saved or dispatched. */
export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return refusal('INVALID_CONTENT_TYPE', 415);
  if (!request.body) return refusal('INVALID_JSON', 400);
  /* This route answers with a refusal rather than throwing one, so the shared
     reader's `refuse` throws a sentinel that is caught two lines down. A
     stream that fails for any other reason keeps its INVALID_JSON answer. */
  let bytes: Uint8Array;
  try { bytes = await readBoundedBody(request.body, MAX_BYTES, () => { throw new BodyTooLarge(); }); }
  catch (error) { return refusal(error instanceof BodyTooLarge ? 'BODY_TOO_LARGE' : 'INVALID_JSON', error instanceof BodyTooLarge ? 413 : 400); }
  let input: unknown;
  try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return refusal('INVALID_JSON', 400); }
  try { return json(compileProjection(input, await getCorpusSource().listCorpora())); }
  catch (error) {
    if (error instanceof ProjectionError) {
      const status = error.code === 'SOURCE_INTEGRITY_FAILED' ? 503 :
        error.code === 'SOURCE_VERSION_MISMATCH' ? 409 :
          ['SOURCE_NOT_AVAILABLE', 'SELECTION_NOT_AVAILABLE'].includes(error.code) ? 404 : 400;
      return refusal(error.code, status);
    }
    return refusal('PROJECTION_UNAVAILABLE', 503);
  }
}
