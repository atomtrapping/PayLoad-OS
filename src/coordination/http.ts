import { NextResponse } from 'next/server';
import { CoordinationError } from './ledger';
import { readBoundedBody } from '@/http/boundedBody';
import { AccessError } from '../access/config';
import { authenticateConfiguredRequest } from '../access/request';

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
  { what: 'That a request whose forwarding headers describe this service arrived directly.', because: 'A proxy that strips or rewrites its own forwarding headers is indistinguishable here from no proxy at all — and Next writes those headers itself on every direct request, so their presence is not evidence either. The refusal is sound where it fires; its silence proves nothing.' },
  { what: 'Who the caller is.', because: 'Loopback is a location, not an identity. Participant selection on the board is still sandbox identity, unauthenticated.' },
  { what: 'That the process is bound to a loopback interface.', because: 'Next binds 0.0.0.0 by default. Binding is the operator\'s decision and is not visible from inside a handler.' },
] as const;

/** Loopback as an address rather than as a name: what a direct arrival's peer is. */
const isLoopbackAddress = (value: string) => /^(127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3})$/.test(value.trim());

/** The port a `host` header names, or the default for http, which is the only scheme these rails serve. */
function portOf(host: string | null): string {
  if (host === null) return '';
  const afterAuthority = host.replace(/^\[[^\]]*\]/, '');
  const match = /:(\d+)$/.exec(afterAuthority);
  return match ? match[1] : '80';
}

/**
 * Headers a relay writes, and what — if anything — a direct arrival can carry
 * in each.
 *
 * PRESENCE IS NOT EVIDENCE OF A PROXY, AND USED TO BE TREATED AS THOUGH IT WERE
 *
 * This list once refused any request carrying any of these headers at all. That
 * was correct reasoning about proxies and wrong about this server: Next writes
 * `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto` and
 * `x-forwarded-port` onto every request it hands a route handler, synthesised
 * from the socket when the client did not send them. So every local rail —
 * the notation kernel, the coordination board, the production inspector —
 * refused every request, including the browser's own, on a machine with no
 * proxy anywhere near it. Measured on this server: a bare loopback
 * `curl http://127.0.0.1:3115/api/state-kernel` arrives at the handler
 * carrying all four.
 *
 * What a direct arrival looks like is still specific, so the values are
 * checked instead of the presence: the forwarded host is this host, the port
 * is this port, the scheme is http, and the peer is a loopback address. A
 * reverse proxy's are none of those — it forwards the public host, usually
 * https, and the real client's address — so the deployment this guard exists
 * to refuse is still refused.
 *
 * What that does not establish is in `LOOPBACK_GUARD_LOSS` below, and the
 * important line is unchanged: a caller who writes consistent loopback values
 * into all four headers is not distinguished from a direct arrival. It never
 * was. Nothing a handler can read proves how a request reached the socket; the
 * control that keeps these rails local is the operator's, and it is that they
 * are off by default and bound to loopback.
 */
const RELAY_HEADERS: ReadonlyArray<readonly [string, (value: string, host: string | null) => boolean]> = [
  // Next never writes these. A request carrying one passed through something.
  ['forwarded', () => false],
  ['x-forwarded-for', (value) => isLoopbackAddress(value)],
  ['x-forwarded-host', (value, host) => host !== null && value.trim().toLowerCase() === host.trim().toLowerCase()],
  ['x-forwarded-proto', (value) => value.trim().toLowerCase() === 'http'],
  ['x-forwarded-port', (value, host) => value.trim() === portOf(host)],
  ['x-real-ip', () => false],
  ['x-cluster-client-ip', () => false],
  ['via', () => false],
];

/** Applies to every local coordination route. Participant selection is still sandbox identity. */
export function requireLocalRequest(request: Request) {
  try {
    if (authenticateConfiguredRequest(request)) return;
  } catch (error) {
    if (error instanceof AccessError) throw new CoordinationError(error.code, error.message, error.status);
    throw new CoordinationError('ACCESS_CONFIGURATION_INVALID', 'Internal access is unavailable for this request.', 503);
  }
  const host = request.headers.get('host');
  const relayed = RELAY_HEADERS
    .filter(([name, direct]) => { const value = request.headers.get(name); return value !== null && !direct(value, host); })
    .map(([name]) => name);
  if (relayed.length > 0) {
    throw new CoordinationError('RELAYED_REQUEST',
      `This request carries ${relayed.join(', ')} naming somewhere other than this loopback service, so it reached the process through a proxy rather than directly. The local rails are reachable from the machine they run on and from nowhere else.`, 403);
  }
  const url = new URL(request.url);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  if (!loopback.includes(url.hostname)) throw new CoordinationError('LOCAL_ONLY', 'The local coordination sandbox must run on loopback.', 403);
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
  const bytes = await readBoundedBody(request.body, 16 * 1024, () => {
    throw new CoordinationError('BODY_TOO_LARGE', 'Commands are limited to 16 KiB.', 413);
  });
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
  catch { throw new CoordinationError('INVALID_JSON', 'The command body must be valid JSON.'); }
}
