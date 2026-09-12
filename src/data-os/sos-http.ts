import { Agent } from 'node:https';
import { Readable, Transform, pipeline } from 'node:stream';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { SosError, type SosConfig } from './sos-config';
import { validateObjectKey } from './immutable-object-store';

const MAX_METADATA_BYTES = 16 * 1024;

/** Bound responses BEFORE SDK deserialization, including XML error/PUT bodies. */
export class BoundedSosHttpHandler extends NodeHttpHandler {
  readonly #endpoint: URL;
  readonly #maxBytes: number;
  readonly #pathPrefix: string;

  constructor(config: Readonly<SosConfig>) {
    super({
      httpsAgent: new Agent({ keepAlive: true, maxSockets: config.maxConcurrency,
        maxTotalSockets: config.maxConcurrency, rejectUnauthorized: true, minVersion: 'TLSv1.2' }),
      connectionTimeout: Math.min(3000, config.timeoutMs),
      requestTimeout: config.timeoutMs, throwOnRequestTimeout: true,
    });
    this.#endpoint = new URL(config.endpoint);
    this.#maxBytes = config.maxBytes;
    this.#pathPrefix = '/' + config.bucket + '/' + (config.prefix ? config.prefix + '/' : '');
  }

  #validPath(path: string): boolean {
    try { validateObjectKey(path); return true; } catch { return false; }
  }

  override async handle(request: Parameters<NodeHttpHandler['handle']>[0], options: Parameters<NodeHttpHandler['handle']>[1] = {}) {
    // No redirect/region correction may send credentials to another endpoint.
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || request.protocol !== 'https:'
      || request.hostname !== this.#endpoint.hostname || (request.port !== undefined && request.port !== 443)
      || !['GET', 'PUT'].includes(request.method) || request.username !== undefined || request.password !== undefined
      || request.fragment !== undefined || !request.path.startsWith(this.#pathPrefix)
      || request.path.length > this.#pathPrefix.length + 1024
      || !this.#validPath(request.path.slice(this.#pathPrefix.length))
      || Object.keys(request.query ?? {}).some((key) => key !== 'versionId' && key !== 'x-id')
      || (request.query?.['x-id'] !== undefined && request.query['x-id'] !== (request.method === 'GET' ? 'GetObject' : 'PutObject'))
      || (request.method === 'PUT' && request.query?.versionId !== undefined)
      || (request.query?.versionId !== undefined && (typeof request.query.versionId !== 'string'
        || !/^[\x21-\x7e]{1,1024}$/.test(request.query.versionId)))
      || (request.method === 'PUT' && (!(request.body instanceof Uint8Array) || request.body.byteLength > this.#maxBytes
        || request.headers['if-none-match'] !== '*' || request.headers['content-length'] !== String(request.body.byteLength)
        || request.headers['content-type'] !== 'application/octet-stream'))
      || (request.method === 'GET' && request.body !== undefined)) throw new SosError('CONFIG_INVALID');
    const result = await super.handle(request, options);
    const { response } = result;
    const source: unknown = response.body;
    if (!(source instanceof Readable)) throw new SosError('INVALID_RESPONSE');
    const fail = (error: SosError): never => { source.destroy(); throw error; };
    // Node also limits parsed HTTP headers; reject oversized transformed metadata
    // before it enters SDK deserialization, independent of runtime defaults.
    const headers = Object.entries(response.headers);
    if (headers.length > 64 || headers.reduce((total, [name, value]) => total + Buffer.byteLength(name) + Buffer.byteLength(value), 0) > MAX_METADATA_BYTES) {
      return fail(new SosError('INVALID_RESPONSE'));
    }
    if (response.statusCode >= 300 && response.statusCode < 400) return fail(new SosError('INVALID_RESPONSE'));
    const max = request.method === 'GET' && response.statusCode === 200 ? this.#maxBytes : MAX_METADATA_BYTES;
    const length = response.headers['content-length'];
    const encoding = response.headers['content-encoding'];
    if ((encoding !== undefined && encoding !== 'identity') || (length !== undefined && (!/^\d{1,12}$/.test(length)
      || !Number.isSafeInteger(Number(length))))) return fail(new SosError('INVALID_RESPONSE'));
    if (length !== undefined && Number(length) > max) return fail(new SosError('BODY_TOO_LARGE'));
    let total = 0;
    const bounded = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        total += chunk.byteLength;
        if (total > max) callback(new SosError('BODY_TOO_LARGE'));
        else callback(null, chunk);
      },
      flush(callback) {
        callback(length !== undefined && total !== Number(length) ? new SosError('INVALID_RESPONSE') : undefined);
      },
    });
    const abort = () => { source.destroy(new SosError('CANCELLED')); bounded.destroy(new SosError('CANCELLED')); };
    // All calls from this adapter use native AbortController; Smithy's public
    // type also permits legacy signals without EventTarget methods.
    const signal = options.abortSignal instanceof AbortSignal ? options.abortSignal : undefined;
    signal?.addEventListener('abort', abort, { once: true });
    // pipeline closes both streams on truncation, overflow, cancellation and premature close.
    pipeline(source, bounded, () => signal?.removeEventListener('abort', abort));
    response.body = bounded;
    if (options.abortSignal?.aborted) abort();
    return result;
  }
}
