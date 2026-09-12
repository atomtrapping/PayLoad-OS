import { GetObjectCommand, PutObjectCommand, S3Client, type GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { BoundedSosHttpHandler } from './sos-http';
import { SosError, sosConfig, type SosConfig, type SosEnvironment } from './sos-config';
import { destinationIdentity, digestFromObjectKey, objectDigest, validateObjectKey, validateObjectReceipt,
  type ImmutableObjectStore, type ObjectCustodyReceipt } from './immutable-object-store';

export { SosError } from './sos-config';
export type { ImmutableObjectStore, ObjectCustodyReceipt } from './immutable-object-store';

/** Pure configuration identity: credentials never enter persisted destinations. */
export function sosDestination(config: Pick<SosConfig, 'endpoint' | 'region' | 'bucket' | 'prefix'>): string {
  return destinationIdentity({ adapter: 'payload.exoscale-sos.v1', endpoint: config.endpoint,
    region: config.region, bucket: config.bucket, prefix: config.prefix });
}
function version(value: unknown): string {
  if (typeof value !== 'string' || value === 'null' || value === 'undefined' || !/^[\x21-\x7e]{1,1024}$/.test(value)) throw new SosError('VERSION_REQUIRED');
  return value;
}
function status(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
}

/**
 * Explicit, bounded named-object custody. One conditional PUT and one verifying
 * GET share a deadline. No retries, multipart, deletion, ACL or credential chain.
 * Provider versioning/conditional-write support still requires qualification.
 */
export class SosImmutableObjectStore implements ImmutableObjectStore {
  readonly #config: Readonly<SosConfig>;
  readonly #client: S3Client;
  readonly destination: string;
  #active = 0;
  #closed = false;

  constructor(input: SosEnvironment | Readonly<SosConfig> = process.env) {
    // A web/control process may pass validated configuration to a worker without
    // constructing a client. Revalidate that shape before accepting a destination.
    const selected = input as Readonly<SosConfig>;
    const config = typeof selected.maxBytes === 'number' ? sosConfig({
      PAYLOAD_OBJECT_STORE: 'sos', PAYLOAD_SOS_ENDPOINT: selected.endpoint,
      PAYLOAD_SOS_REGION: selected.region, PAYLOAD_SOS_BUCKET: selected.bucket, PAYLOAD_SOS_PREFIX: selected.prefix,
      PAYLOAD_SOS_ACCESS_KEY_ID: selected.accessKeyId, PAYLOAD_SOS_SECRET_ACCESS_KEY: selected.secretAccessKey,
      PAYLOAD_SOS_MAX_BYTES: String(selected.maxBytes), PAYLOAD_SOS_TIMEOUT_MS: String(selected.timeoutMs),
      PAYLOAD_SOS_MAX_CONCURRENCY: String(selected.maxConcurrency),
    }) : sosConfig(input as SosEnvironment);
    if (!config) throw new SosError('NOT_CONFIGURED');
    this.#config = config;
    this.destination = sosDestination(config);
    this.#client = new S3Client({
      endpoint: config.endpoint, region: config.region, forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      maxAttempts: 1, followRegionRedirects: false,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new BoundedSosHttpHandler(config),
    });
  }
  close(): void {
    if (this.#active) throw new SosError('BUSY');
    this.#closed = true;
    this.#client.destroy();
  }
  limits() { return { maxBytes: this.#config.maxBytes, timeoutMs: this.#config.timeoutMs,
    maxConcurrency: this.#config.maxConcurrency, active: this.#active, scope: 'adapter-instance' as const }; }

  #key(key: string): string {
    try { validateObjectKey(key); digestFromObjectKey(key); } catch { throw new SosError('INPUT_INVALID'); }
    const qualified = this.#config.prefix ? this.#config.prefix + '/' + key : key;
    if (qualified.length > 1024) throw new SosError('INPUT_INVALID');
    return qualified;
  }
  async #operation<T>(external: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#closed) throw new SosError('CLOSED');
    if (!(external instanceof AbortSignal)) throw new SosError('INPUT_INVALID');
    if (external.aborted) throw new SosError('CANCELLED');
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new SosError('CONFIG_INVALID');
    if (this.#active >= this.#config.maxConcurrency) throw new SosError('BUSY');
    this.#active++;
    const controller = new AbortController();
    let rejectAbort: (error: SosError) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const cancel = () => { rejectAbort(new SosError('CANCELLED')); controller.abort(); };
    const timer = setTimeout(() => { rejectAbort(new SosError('TIMEOUT')); controller.abort(); }, this.#config.timeoutMs);
    external.addEventListener('abort', cancel, { once: true });
    // A timed-out caller cannot release the admission slot before actual cleanup.
    const execution = work(controller.signal).finally(() => { this.#active--; });
    try { return await Promise.race([execution, aborted]); }
    catch (error) { throw error instanceof SosError ? error : new SosError('UNAVAILABLE'); }
    finally { clearTimeout(timer); external.removeEventListener('abort', cancel); controller.abort(); }
  }
  async #read(key: string, maxBytes: number, signal: AbortSignal,
    expected?: Readonly<ObjectCustodyReceipt>): Promise<{ bytes: Uint8Array; receipt: ObjectCustodyReceipt } | null> {
    let result: GetObjectCommandOutput;
    try {
      result = await this.#client.send(new GetObjectCommand({ Bucket: this.#config.bucket, Key: this.#key(key),
        ...(expected ? { VersionId: version(expected.versionId) } : {}) }), { abortSignal: signal });
    } catch (error) {
      if (status(error) === 404 && (error as Error).name === 'NoSuchKey' && !expected) return null;
      throw error;
    }
    const body = result.Body;
    if (!(body instanceof Readable)) throw new SosError('INVALID_RESPONSE');
    try {
      const actualVersion = version(result.VersionId);
      if (expected && actualVersion !== expected.versionId) throw new SosError('INTEGRITY_FAILED');
      if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength! < 0) throw new SosError('INVALID_RESPONSE');
      if (result.ContentLength! > maxBytes) throw new SosError('BODY_TOO_LARGE');
      const bytes = Buffer.alloc(result.ContentLength!);
      let size = 0;
      for await (const chunk of body) {
        if (signal.aborted) throw new SosError('CANCELLED');
        if (!(chunk instanceof Uint8Array) || size + chunk.byteLength > bytes.length) throw new SosError('INVALID_RESPONSE');
        bytes.set(chunk, size); size += chunk.byteLength;
      }
      if (size !== result.ContentLength) throw new SosError('INVALID_RESPONSE');
      const digest = objectDigest(bytes);
      const keyDigest = digestFromObjectKey(key);
      if ((expected && (digest !== expected.contentDigest || size !== expected.byteLength))
        || (keyDigest && digest !== keyDigest)) throw new SosError('INTEGRITY_FAILED');
      return { bytes, receipt: { schema: 'payload.object-custody.v1', provider: 'exoscale-sos',
        destination: this.destination, key, versionId: actualVersion, contentDigest: digest, byteLength: size } };
    } finally { body.destroy(); }
  }
  async ensure(key: string, bytes: Uint8Array, signal: AbortSignal): Promise<ObjectCustodyReceipt> {
    this.#key(key);
    if (!(bytes instanceof Uint8Array)) throw new SosError('INPUT_INVALID');
    if (bytes.byteLength > this.#config.maxBytes) throw new SosError('BODY_TOO_LARGE');
    return this.#operation(signal, async (boundedSignal) => {
      // Admission precedes allocation; copying still precedes the first await.
      const content = Buffer.from(bytes);
      const contentDigest = objectDigest(content);
      const keyDigest = digestFromObjectKey(key);
      if (keyDigest && keyDigest !== contentDigest) throw new SosError('INPUT_INVALID');
      let createdVersion: string | undefined;
      try {
        const result = await this.#client.send(new PutObjectCommand({ Bucket: this.#config.bucket, Key: this.#key(key),
          Body: content, ContentLength: content.length, ContentType: 'application/octet-stream', IfNoneMatch: '*',
        }), { abortSignal: boundedSignal });
        if (boundedSignal.aborted) throw new SosError('WRITE_UNCONFIRMED');
        // A successful write without version metadata is still an unknown write.
        try { createdVersion = version(result.VersionId); }
        catch { throw new SosError('WRITE_UNCONFIRMED'); }
      } catch (error) {
        if (error instanceof SosError && error.code === 'WRITE_UNCONFIRMED') throw error;
        if (boundedSignal.aborted) throw new SosError('WRITE_UNCONFIRMED');
        const code = status(error);
        if (code === 401 || code === 403 || (code !== undefined && code < 500 && code !== 409 && code !== 412)) {
          throw new SosError('UNAVAILABLE');
        }
        // An existing/ambiguous write permits one GET, never an unconditional PUT.
      }
      const expected: ObjectCustodyReceipt | undefined = createdVersion === undefined ? undefined : {
        schema: 'payload.object-custody.v1', provider: 'exoscale-sos', destination: this.destination,
        key, contentDigest, byteLength: content.length, versionId: createdVersion,
      };
      let found;
      try { found = await this.#read(key, this.#config.maxBytes, boundedSignal, expected); }
      catch (error) {
        if (error instanceof SosError && error.code === 'INTEGRITY_FAILED') throw error;
        throw new SosError('WRITE_UNCONFIRMED');
      }
      if (!found) throw new SosError('WRITE_UNCONFIRMED');
      if (found.receipt.contentDigest !== contentDigest || found.receipt.byteLength !== content.length) throw new SosError('INTEGRITY_FAILED');
      return found.receipt;
    }).catch((error: unknown) => {
      if (error instanceof SosError && ['TIMEOUT', 'CANCELLED'].includes(error.code)) throw new SosError('WRITE_UNCONFIRMED');
      throw error;
    });
  }
  async get(key: string, maxBytes: number, signal: AbortSignal): Promise<Uint8Array | null> {
    this.#key(key);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > this.#config.maxBytes) throw new SosError('INPUT_INVALID');
    return this.#operation(signal, async (boundedSignal) => (await this.#read(key, maxBytes, boundedSignal))?.bytes ?? null);
  }
  async readReceipt(receipt: Readonly<ObjectCustodyReceipt>, signal: AbortSignal): Promise<Uint8Array> {
    try { validateObjectReceipt(receipt, this.destination); }
    catch { throw new SosError('INPUT_INVALID'); }
    if (receipt.provider !== 'exoscale-sos') throw new SosError('INPUT_INVALID');
    const expected = { ...receipt, versionId: version(receipt.versionId) };
    this.#key(expected.key);
    if (expected.byteLength > this.#config.maxBytes) throw new SosError('BODY_TOO_LARGE');
    return this.#operation(signal, async (boundedSignal) => {
      const found = await this.#read(expected.key, this.#config.maxBytes, boundedSignal, expected);
      if (!found) throw new SosError('INTEGRITY_FAILED');
      return found.bytes;
    });
  }
}
