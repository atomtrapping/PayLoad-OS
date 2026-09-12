import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { isIPv4 } from 'node:net';
import { SourceConnectorError } from './errors';

export const SOURCE_HTTP_TIMEOUT_MS = 10_000;
export const SOURCE_HTTP_MAX_BYTES = 256 * 1024;
const SOURCE_HTTP_MAX_HEADER_BYTES = 8192;
const QUERY_LIMITS = { '$select': 1024, '$where': 1024, '$order': 256, '$limit': 2 } as const;

/**
 * One transport, several declared destinations.
 *
 * The guard below — the URL shape, the public-address check, the pinned
 * connection, the redirect refusal, the byte ceiling — is the only place in
 * this codebase that opens a socket to somebody else's machine. A second
 * connector must not bring a second copy of it: a bug fixed in one copy and not
 * the other is precisely the hole this shape exists to close. So the guard
 * takes a declared endpoint and the endpoints are data.
 *
 * What an endpoint may declare is deliberately narrow. It names one hostname,
 * exactly; a pathname the guard checks against a pattern; whether a query is
 * permitted at all and under which grammar; the media types it will accept; and
 * its own byte ceiling. It cannot declare a protocol, a port, a credential, a
 * redirect policy or a retry — those are the transport's and stay fixed.
 */
export type QueryGrammar =
  /** Socrata's four bounded parameters, all four required, `$limit` at most 25. */
  | 'SOCRATA_BOUNDED'
  /** FederalRegister.gov: one bounded publication-date window, newest first. */
  | 'FEDERAL_REGISTER_BOUNDED'
  /** No query string at all. A document is addressed by path or it is not addressed. */
  | 'NONE';

export interface SourceEndpoint {
  readonly id: string;
  /** Exact. Never a suffix match: `evil-data.transportation.gov` is not this host. */
  readonly hostname: string;
  /**
   * The permitted path. A literal pattern where this code owns the dataset; a
   * shape where the operator declares the document and the code owns the host.
   */
  readonly pathname: RegExp;
  readonly query: QueryGrammar;
  readonly accept: string;
  /** Checked against the response's own Content-Type, parameters and all. */
  readonly mediaType: RegExp;
  readonly maxBytes: number;
  /** Why this destination is permitted, carried for the reader of a receipt. */
  readonly because: string;
}

/** The dataset this code owns: one path, one query grammar, at most 25 rows. */
export const FMCSA_CENSUS_ENDPOINT: SourceEndpoint = Object.freeze({
  id: 'fmcsa-company-census',
  hostname: 'data.transportation.gov',
  pathname: /^\/resource\/az4n-8mr2\.json$/,
  query: 'SOCRATA_BOUNDED',
  accept: 'application/json',
  mediaType: /^application\/json(?:\s*;\s*charset=utf-8)?$/i,
  maxBytes: SOURCE_HTTP_MAX_BYTES,
  because: 'The public FMCSA Company Census dataset, addressed by the exact resource path this connector was written against.',
});

export interface SourceBytes {
  bytes: Buffer;
  mediaType: string;
  lastModified: string | null;
  etag: string | null;
}

function fault(code: string, message: string, status = 502) {
  return new SourceConnectorError(code, message, status);
}

function validateUrl(input: URL, endpoint: SourceEndpoint): URL {
  if (!(input instanceof URL)) throw fault('SOURCE_URL_DISALLOWED', 'The source URL is not permitted.', 400);
  // Snapshot the URL before any asynchronous work; caller mutation must not change the target.
  const url = new URL(input.href);
  if (url.href.length > 4096 || url.protocol !== 'https:' || url.hostname !== endpoint.hostname
    || !endpoint.pathname.test(url.pathname) || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw fault('SOURCE_URL_DISALLOWED', 'The source URL is not permitted.', 400);
  }
  if (endpoint.query === 'NONE') {
    // A path and nothing else. A document endpoint that accepted parameters
    // would be an open proxy wearing a regulator's hostname.
    if (url.search !== '') throw fault('SOURCE_URL_DISALLOWED', 'The source query is not permitted.', 400);
    return url;
  }
  if (endpoint.query === 'FEDERAL_REGISTER_BOUNDED') {
    const expected = ['conditions[publication_date][gte]', 'conditions[publication_date][lte]', 'order', 'per_page'];
    const entries = [...url.searchParams];
    if (entries.length !== expected.length || new Set(entries.map(([key]) => key)).size !== expected.length
      || expected.some((key) => !url.searchParams.has(key)) || entries.some(([key]) => !expected.includes(key))) {
      throw fault('SOURCE_URL_DISALLOWED', 'The source query is not permitted.', 400);
    }
    const perPage = url.searchParams.get('per_page')!;
    const from = url.searchParams.get('conditions[publication_date][gte]')!;
    const through = url.searchParams.get('conditions[publication_date][lte]')!;
    const date = /^\d{4}-\d{2}-\d{2}$/;
    const fromTime = Date.parse(`${from}T00:00:00.000Z`);
    const throughTime = Date.parse(`${through}T00:00:00.000Z`);
    if (url.searchParams.get('order') !== 'newest' || !/^[1-9]\d{0,2}$/.test(perPage) || Number(perPage) > 100
      || !date.test(from) || !date.test(through) || !Number.isFinite(fromTime) || !Number.isFinite(throughTime)
      || new Date(fromTime).toISOString().slice(0, 10) !== from || new Date(throughTime).toISOString().slice(0, 10) !== through
      || throughTime < fromTime || throughTime - fromTime > 31 * 86_400_000) {
      throw fault('SOURCE_URL_DISALLOWED', 'The source query is not permitted.', 400);
    }
    return url;
  }
  const entries = [...url.searchParams];
  if (entries.length !== 4 || new Set(entries.map(([key]) => key)).size !== 4
    || entries.some(([key, value]) => !Object.hasOwn(QUERY_LIMITS, key)
      || !value.trim() || /[^\x20-\x7e]/.test(value)
      || value.length > QUERY_LIMITS[key as keyof typeof QUERY_LIMITS])) {
    throw fault('SOURCE_URL_DISALLOWED', 'The source query is not permitted.', 400);
  }
  const limit = url.searchParams.get('$limit')!;
  if (!/^[1-9]\d?$/.test(limit) || Number(limit) > 25) {
    throw fault('SOURCE_URL_DISALLOWED', 'The source query limit is not permitted.', 400);
  }
  return url;
}

function isPublicV4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [a, b, c] = address.split('.').map(Number);
  // Conservatively exclude special-purpose networks, including globally reachable special ranges.
  // IPv6 is deliberately unsupported by this first transport, not silently allowed or retried.
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168
      || (b === 88 && c === 99) || (b === 31 && c === 196)
      || (b === 52 && c === 193) || (b === 175 && c === 48)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

function safeEtag(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && !/[^\x20-\x7e]/.test(value) ? value : null;
}

function safeLastModified(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string'
    || !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toUTCString() === value ? value : null;
}

/** One bounded, authenticated-TLS request to the code-owned FMCSA endpoint; never retries. */
export function fetchSourceBytes(input: URL): Promise<SourceBytes> {
  return fetchEndpointBytes(input, FMCSA_CENSUS_ENDPOINT);
}

/** One bounded, authenticated-TLS request to a declared endpoint; never retries. */
export function fetchEndpointBytes(input: URL, endpoint: SourceEndpoint): Promise<SourceBytes> {
  let url: URL;
  try { url = validateUrl(input, endpoint); } catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    let settled = false;
    let outgoing: ClientRequest | undefined;
    let incoming: IncomingMessage | undefined;
    const deadline = setTimeout(() => fail(fault('SOURCE_TIMEOUT', 'The source request exceeded its total deadline.', 504)), SOURCE_HTTP_TIMEOUT_MS);
    function fail(error: SourceConnectorError) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      // Do not propagate URLs, response bodies, cookies, credentials, or network diagnostics.
      reject(error);
      incoming?.destroy();
      outgoing?.destroy();
    }
    lookup(endpoint.hostname, { all: true, family: 4, verbatim: true }).then((answers) => {
      if (settled) return;
      if (answers.length === 0 || answers.length > 32
        || answers.some((answer) => answer.family !== 4 || !isPublicV4(answer.address))) {
        fail(fault('SOURCE_DESTINATION_DISALLOWED', 'The source did not resolve exclusively to permitted public IPv4 addresses.'));
        return;
      }
      const address = answers[0].address;
      const options: RequestOptions & { autoSelectFamily: boolean } = {
        protocol: 'https:', hostname: endpoint.hostname, servername: endpoint.hostname, port: 443,
        path: `${url.pathname}${url.search}`, method: 'GET',
        agent: false, family: 4, autoSelectFamily: false, rejectUnauthorized: true,
        maxHeaderSize: SOURCE_HTTP_MAX_HEADER_BYTES,
        // Pin this connection to the address already checked, retaining the original TLS identity.
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: {
          Accept: endpoint.accept,
          'Accept-Encoding': 'identity',
          'User-Agent': 'PayloadOS/0.1 local-source-qualification',
        },
      };
      try {
        outgoing = request(options, (response) => {
          incoming = response;
          if (settled) { response.destroy(); return; }
          response.on('error', () => fail(fault('SOURCE_NETWORK_FAILED', 'The source response could not be read.')));
          response.on('aborted', () => fail(fault('SOURCE_NETWORK_FAILED', 'The source response ended prematurely.')));
          response.on('close', () => {
            if (!settled) fail(fault('SOURCE_NETWORK_FAILED', 'The source response ended prematurely.'));
          });
          const status = response.statusCode ?? 0;
          if (status >= 300 && status <= 399) {
            fail(fault('SOURCE_REDIRECT_DISALLOWED', 'Source redirects are not permitted.')); return;
          }
          if (status !== 200) {
            fail(status === 429
              ? fault('RATE_LIMITED', 'The source rate limit was reached; no automatic retry was attempted.', 429)
              : fault('SOURCE_HTTP_ERROR', 'The source did not return an accepted HTTP status.'));
            return;
          }
          const structuralHeaders = new Set(['content-type', 'content-length', 'content-encoding']);
          const seen = new Set<string>();
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            const name = response.rawHeaders[index].toLowerCase();
            if (structuralHeaders.has(name) && seen.has(name)) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source response headers were ambiguous.')); return;
            }
            seen.add(name);
          }
          const type = response.headers['content-type'];
          if (typeof type !== 'string' || !endpoint.mediaType.test(type)) {
            fail(fault('SOURCE_MEDIA_TYPE_UNSUPPORTED', 'The source response media type is not one this endpoint accepts.')); return;
          }
          // The type without its parameters, lowercased: what the receipt records.
          const canonicalType = type.split(';')[0].trim().toLowerCase();
          const encoding = response.headers['content-encoding'];
          if (encoding !== undefined && (typeof encoding !== 'string' || encoding.toLowerCase() !== 'identity')) {
            fail(fault('SOURCE_ENCODING_UNSUPPORTED', 'Encoded source responses are not permitted.')); return;
          }
          const lengthHeader = response.headers['content-length'];
          let expectedLength: number | null = null;
          if (lengthHeader !== undefined) {
            if (typeof lengthHeader !== 'string' || !/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader))) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source content length is invalid.')); return;
            }
            expectedLength = Number(lengthHeader);
            if (expectedLength > endpoint.maxBytes) {
              fail(fault('SOURCE_BODY_TOO_LARGE', 'The source response exceeds the byte limit.')); return;
            }
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk)) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source response is not a byte stream.')); return;
            }
            size += chunk.length;
            if (size > endpoint.maxBytes) {
              fail(fault('SOURCE_BODY_TOO_LARGE', 'The source response exceeds the byte limit.')); return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            if (settled) return;
            if (!response.complete || (expectedLength !== null && size !== expectedLength)) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source response length is incomplete.')); return;
            }
            settled = true;
            clearTimeout(deadline);
            resolve({
              bytes: Buffer.concat(chunks, size), mediaType: canonicalType,
              lastModified: safeLastModified(response.headers['last-modified']),
              etag: safeEtag(response.headers.etag),
            });
          });
        });
        outgoing.on('error', () => fail(fault('SOURCE_NETWORK_FAILED', 'The source connection failed.')));
        outgoing.end();
      } catch {
        fail(fault('SOURCE_NETWORK_FAILED', 'The source connection failed.'));
      }
    }, () => fail(fault('SOURCE_DNS_FAILED', 'The source hostname could not be resolved.')));
  });
}
