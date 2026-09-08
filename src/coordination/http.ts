import { NextResponse } from 'next/server';
import { CoordinationError } from './ledger';

export function coordinationJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Payload-Fixture-Only': 'true', 'X-Payload-Coordination': 'sandbox-v1' } });
}

export function coordinationError(error: unknown) {
  if (error instanceof CoordinationError) return coordinationJson({ fixture_only: true, error: error.code, detail: error.message }, error.status);
  return coordinationJson({ fixture_only: true, error: 'LOCAL_STORE_UNAVAILABLE', detail: 'The local coordination store is unavailable. No successful write is confirmed; retry the same request id after recovery.' }, 503);
}

/**
 * WHAT A REQUEST CAN AND CANNOT SAY ABOUT WHERE IT CAME FROM.
 *
 * This guard used to read `request.url` and the `Host` header and compare them.
 * Next derives `request.url` from `Host`, so that comparison was one
 * caller-supplied string checked against itself: anybody who sends
 * `Host: 127.0.0.1:3000` passed it, from any network. The application's own
 * /api/v1/status route reports the serving topology as `nginx -> next dev`,
 * and a reverse proxy rewrites `Host` to the upstream address — so in the
 * deployment this repository documents, every remote request would have
 * satisfied a check whose entire purpose was to establish that the request was
 * not remote.
 *
 * A `Host` header is a claim the caller makes. It is not a reading of the
 * socket, and no header is. What headers can do is the other direction: a
 * forwarding header is positive evidence that the request was relayed, and a
 * relayed request did not arrive on loopback. That refusal is sound in the
 * direction it is used, so it is the check that carries the guarantee here and
 * the `Host` comparison is demoted to what it actually is — a cheap filter on
 * obvious mismatches, not a boundary.
 *
 * The rails behind this guard are also gated on an operator flag
 * (PAYLOAD_COORDINATION_LOCAL, PAYLOAD_STATE_KERNEL_LOCAL,
 * PAYLOAD_PRODUCTION_LOCAL), all off by default. That gate, not this function,
 * is what keeps a public deployment from writing.
 */
export const LOCAL_GUARD_LOSS = [
  { what: 'The peer address of the TCP connection.', because: 'The App Router hands a handler a Request and no socket. Every field this function reads is text the caller wrote.' },
  { what: 'That a request with no forwarding header arrived directly.', because: 'A proxy that strips its own forwarding headers is indistinguishable here from no proxy at all. The refusal below is sound; its absence proves nothing.' },
  { what: 'Who the caller is.', because: 'Loopback is a location, not an identity. Participant selection on the board is still sandbox identity, unauthenticated.' },
  { what: 'That the process is bound to a loopback interface.', because: 'Next binds 0.0.0.0 by default. Binding is the operator\'s decision and is not visible from inside a handler.' },
] as const;

/**
 * Headers that are set by something between the client and this process.
 * Presence of any one of them means the request was relayed, which is the one
 * thing about its origin a header can establish rather than merely assert.
 */
const RELAY_HEADERS = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'x-cluster-client-ip', 'via'] as const;

/** Applies to every local coordination route. Participant selection is still sandbox identity. */
export function requireLocalRequest(request: Request) {
  const relayed = RELAY_HEADERS.filter((name) => request.headers.get(name) !== null);
  if (relayed.length > 0) {
    throw new CoordinationError('RELAYED_REQUEST',
      `This request carries ${relayed.join(', ')}, so it reached the process through a proxy rather than over loopback. The local rails are reachable from the machine they run on and from nowhere else.`, 403);
  }
  const url = new URL(request.url);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  if (!loopback.includes(url.hostname)) throw new CoordinationError('LOCAL_ONLY', 'The local coordination sandbox must run on loopback.', 403);
  const host = request.headers.get('host');
  // Next normalizes request.url to localhost even when the client used 127.0.0.1.
  let clientUrl: URL;
  try { clientUrl = new URL(`${url.protocol}//${host ?? url.host}`); }
  catch { throw new CoordinationError('LOCAL_ONLY', 'The request host must name the loopback service.', 403); }
  if (!loopback.includes(clientUrl.hostname) || clientUrl.port !== url.port || clientUrl.username || clientUrl.password || clientUrl.pathname !== '/' || clientUrl.search || clientUrl.hash) {
    throw new CoordinationError('LOCAL_ONLY', 'The request host must name the loopback service.', 403);
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== clientUrl.origin) throw new CoordinationError('ORIGIN_MISMATCH', 'Use the board from the same local origin.', 403);
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) throw new CoordinationError('ORIGIN_MISMATCH', 'Cross-origin board access is unavailable.', 403);
}

export async function readCoordinationCommand(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new CoordinationError('INVALID_CONTENT_TYPE', 'Send application/json.', 415);
  if (!request.body) throw new CoordinationError('INVALID_JSON', 'A command body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 16 * 1024) { await reader.cancel(); throw new CoordinationError('BODY_TOO_LARGE', 'Commands are limited to 16 KiB.', 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new CoordinationError('INVALID_JSON', 'The command body must be valid JSON.'); }
}
