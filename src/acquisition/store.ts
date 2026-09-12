import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest } from '../data-os/evidence-capture';
import { LocalEvidenceIntake, type LocalIntakeManifest } from '../data-os/local-intake';
import { publishImmutableFile, readImmutableFile } from '../data-os/local-files';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from '../data-os/local-record';
import { evaluateSourceUse } from '../data-os/source-policy';
import { parseISOInstant } from '../data-os/validation';
import { SourceConnectorError } from './errors';
import { buildCensusUrl, parseCensusBytes, parseSourceCaptureRequest, type CensusObservations, type SourceCaptureRequest } from './fmcsa';
import { fetchEndpointBytes, FMCSA_CENSUS_ENDPOINT, type SourceBytes, type SourceEndpoint } from './http';
import {
  buildFederalRegisterUrl, federalRegisterQualificationPolicy, FEDERAL_REGISTER_ENDPOINT,
  FEDERAL_REGISTER_SOURCE_ID, parseFederalRegisterBytes, parseFederalRegisterCaptureRequest,
  type FederalRegisterCaptureRequest, type FederalRegisterFeedObservation,
} from './federalRegister';
import {
  buildStatutoryUrl, observeStatutoryDocument, parseStatutoryCaptureRequest, statutoryEndpoint,
  statutoryQualificationPolicy, STATUTORY_SOURCES,
  type StatutoryCaptureRequest, type StatutoryDocumentObservation,
} from './statutory';

const MAX_RECORD = 64 * 1024;
const PURPOSE = 'source-qualification';
function qualificationBasis() {
  return { reviewedOn: '2026-09-05', authority: 'OPERATOR_DECLARATION',
    scope: 'INTERNAL_PUBLIC_SOURCE_QUALIFICATION', providerLicense: 'UNRESOLVED',
    retentionBasis: 'OPERATOR_LOCAL_EVIDENCE_HISTORY', independentRightsVerification: false,
    references: ['https://www.fmcsa.dot.gov/registration/fmcsa-data-dissemination-program',
      'https://catalog.data.gov/dataset/company-census-file', 'https://dev.socrata.com/docs/app-tokens.html'] } as const;
}
const FAILURE_CODES = ['FETCH_FAILED', 'RATE_LIMITED', 'LOCAL_BUDGET_EXHAUSTED', 'INVALID_SOURCE_RESPONSE'] as const;
type FailureCode = typeof FAILURE_CODES[number];

/** Operator-declared qualification only. This is not a provider-issued license. */
export function censusQualificationPolicy(): SourceRegistration {
  return {
    registrationId: 'fmcsa-company-census:qualification:2026-09-05',
    sourceId: 'fmcsa-company-census', displayName: 'FMCSA Company Census — internal qualification',
    sourceClass: 'public-government-company-census', licenseId: 'operator-qualification:provider-license-unresolved',
    policyVersion: '2026-09-05.v1', effectiveFrom: '2026-09-05T00:00:00.000Z',
    effectiveUntil: '2026-10-05T00:00:00.000Z', permittedPurposes: [PURPOSE],
    allowedOperations: ['INGEST', 'DERIVE'], allowedAudiences: ['INTERNAL'], retention: { mode: 'INDEFINITE' },
  };
}

/**
 * What a source brings to this store, and nothing more.
 *
 * The store below is the part worth having exactly once: create-only intent,
 * reserved byte budget, source-original bytes into the evidence rail before any
 * parsing, a sealed receipt, and an inspection that recomputes every digest
 * from disk rather than trusting what was written. A second connector that
 * copied it would be a second place for that discipline to rot, so the store
 * takes an adapter and the sources are data.
 *
 * An adapter may declare how its request is parsed, where it points, what
 * registration authorises it, and how its bytes are read. It may not declare
 * that a failure is retried, that a budget slot is reclaimed, that a digest is
 * accepted unverified, or that bytes reach the rail after parsing rather than
 * before. Those are the store's and they are not parameters.
 */
export interface CaptureAdapter<Request, Observations> {
  /** Versioned adapter identity, recorded in the intent and checked on readback. */
  readonly adapter: string;
  /** Namespaces the byte budget and the on-disk history; two sources never share a slot. */
  readonly sourceId: string;
  /** Where this adapter's history lives. Distinct roots, so two sources cannot collide on an ID. */
  readonly captureRoot: readonly string[];
  parseRequest(value: unknown): Request;
  requestId(request: Request): string;
  buildUrl(request: Request): URL;
  endpointFor(request: Request): SourceEndpoint;
  registration(request: Request): SourceRegistration;
  qualificationBasis(request: Request): object;
  /** Throws to quarantine: bytes retained, observations refused, nothing invented. */
  observe(bytes: Buffer, request: Request, mediaType: string): Observations;
  /** Media types this adapter will accept on a stored receipt, checked again on readback. */
  acceptsMediaType(value: string): boolean;
}

export const CENSUS_ADAPTER: CaptureAdapter<SourceCaptureRequest, CensusObservations> = Object.freeze<CaptureAdapter<SourceCaptureRequest, CensusObservations>>({
  adapter: 'fmcsa-company-census.v1',
  sourceId: 'fmcsa-company-census',
  captureRoot: ['source-captures'],
  parseRequest: parseSourceCaptureRequest,
  requestId: (request) => request.requestId,
  buildUrl: buildCensusUrl,
  endpointFor: () => FMCSA_CENSUS_ENDPOINT,
  registration: censusQualificationPolicy,
  qualificationBasis,
  observe: (bytes, request) => parseCensusBytes(bytes, request),
  acceptsMediaType: (value) => value === 'application/json',
});

/**
 * The statutory basis differs from the census one in the fact that matters: the
 * document path is the operator's declaration and this code has never visited
 * it. That is recorded here rather than left for a reader to assume.
 */
function statutoryBasis(request: StatutoryCaptureRequest) {
  const source = STATUTORY_SOURCES[request.jurisdiction];
  return {
    reviewedOn: '2026-09-07', authority: 'OPERATOR_DECLARATION',
    scope: 'INTERNAL_PUBLIC_SOURCE_QUALIFICATION', providerLicense: 'UNRESOLVED',
    retentionBasis: 'OPERATOR_LOCAL_EVIDENCE_HISTORY', independentRightsVerification: false,
    hostPinnedBy: 'CODE', documentPathDeclaredBy: 'OPERATOR',
    regulator: source.regulator,
    references: [`https://${source.endpoint.hostname}/`],
  } as const;
}

export const STATUTORY_ADAPTER: CaptureAdapter<StatutoryCaptureRequest, StatutoryDocumentObservation> = Object.freeze<CaptureAdapter<StatutoryCaptureRequest, StatutoryDocumentObservation>>({
  adapter: 'statutory-filing-document.v1',
  sourceId: 'statutory-filing',
  captureRoot: ['statutory-captures'],
  parseRequest: parseStatutoryCaptureRequest,
  requestId: (request) => request.requestId,
  buildUrl: buildStatutoryUrl,
  endpointFor: statutoryEndpoint,
  registration: (request) => statutoryQualificationPolicy(request.jurisdiction),
  qualificationBasis: statutoryBasis,
  observe: (bytes, request, mediaType) => observeStatutoryDocument(request, bytes, mediaType),
  acceptsMediaType: (value) => value === 'text/plain' || value === 'text/html',
});

function federalRegisterBasis() {
  return {
    reviewedOn: '2026-09-12', authority: 'OPERATOR_DECLARATION',
    scope: 'INTERNAL_PUBLIC_SOURCE_QUALIFICATION', providerLicense: 'PUBLIC_KEYLESS_API_REPUBLICATION_REVIEW_OPEN',
    retentionBasis: 'OPERATOR_LOCAL_EVIDENCE_HISTORY', independentRightsVerification: false,
    hostPinnedBy: 'CODE', queryWindowDeclaredBy: 'OPERATOR',
    legalStatus: 'INFORMATIONAL_MIRROR_NOT_OFFICIAL_LEGAL_EDITION',
    references: ['https://www.federalregister.gov/developers/documentation/api/v1', 'https://www.federalregister.gov/reader-aids/government-policy-and-ofr-procedures/about-this-site'],
  } as const;
}

export const FEDERAL_REGISTER_ADAPTER: CaptureAdapter<FederalRegisterCaptureRequest, FederalRegisterFeedObservation> = Object.freeze<CaptureAdapter<FederalRegisterCaptureRequest, FederalRegisterFeedObservation>>({
  adapter: 'federal-register-document-feed.v1',
  sourceId: FEDERAL_REGISTER_SOURCE_ID,
  captureRoot: ['federal-register-captures'],
  parseRequest: parseFederalRegisterCaptureRequest,
  requestId: (request) => request.requestId,
  buildUrl: buildFederalRegisterUrl,
  endpointFor: () => FEDERAL_REGISTER_ENDPOINT,
  registration: federalRegisterQualificationPolicy,
  qualificationBasis: federalRegisterBasis,
  observe: (bytes, request) => parseFederalRegisterBytes(bytes, request),
  acceptsMediaType: (value) => value === 'application/json',
});

interface Intent<Request> {
  schema: 'payload.source-capture-intent.v1';
  request: Request;
  requestDigest: string;
  adapter: string;
  queryUrl: string;
  startedAt: string;
  nonce: string;
  sourceRegistration: SourceRegistration;
  qualificationBasis: object;
  digest: string;
}

interface Receipt {
  schema: 'payload.source-capture-receipt.v1';
  intentDigest: string;
  state: 'CAPTURED' | 'QUARANTINED' | 'FAILED';
  failureCode: FailureCode | null;
  finishedAt: string;
  acquisition: { id: string; digest: string } | null;
  response: Omit<SourceBytes, 'bytes'> | null;
  observationsDigest: string | null;
  digest: string;
}

export interface CaptureInspection<Request, Observations> {
  schema: 'payload.source-capture-inspection.v1';
  state: Receipt['state'] | 'INCOMPLETE';
  intent: Intent<Request>;
  receipt: Receipt | null;
  acquisition: { id: string; digest: string; contentDigest: string; byteLength: number; capturedAt: string } | null;
  observations: Observations | null;
  integrity: 'RECOMPUTED_LOCAL';
  canonicalAdmission: false;
  sourceTruthClaimed: false;
  customerDistributionPermitted: false;
  independentVerification: false;
}

/** The census binding, so every existing caller keeps the type it already reads. */
export type SourceCaptureInspection = CaptureInspection<SourceCaptureRequest, CensusObservations>;
export type StatutoryCaptureInspection = CaptureInspection<StatutoryCaptureRequest, StatutoryDocumentObservation>;
export type FederalRegisterCaptureInspection = CaptureInspection<FederalRegisterCaptureRequest, FederalRegisterFeedObservation>;

function error(code: string, message: string, status = 409): SourceConnectorError {
  return new SourceConnectorError(code, message, status);
}

function instant(value: unknown): string {
  parseISOInstant(value, 'source clock');
  if (new Date(value as string).toISOString() !== value) throw new Error('Use a canonical UTC source clock.');
  return value as string;
}

function same(a: unknown, b: unknown): boolean { return localJson(a) === localJson(b); }
function seal<T extends object>(value: T): T & { digest: string } { return { ...value, digest: localRecordDigest(value) }; }
function verifyDigest(value: { digest: string }): void {
  const { digest, ...payload } = value;
  if (localRecordDigest(payload) !== digest) throw new Error('Stored source metadata does not recompute.');
}
/** The same closed identifier shape every adapter's request parser enforces, applied on historical reads too. */
const CAPTURE_ID = /^[A-Za-z0-9_-]{1,80}$/;
function locations(root: readonly string[], id: string, name: string): string[] {
  if (!CAPTURE_ID.test(id)) throw new Error('A capture identifier outside the closed shape cannot address history.');
  return [...root, byteDigest(Buffer.from(id)).slice(7), name];
}
function acquisitionId(id: string): string { return `source-capture:${id}`; }
function manifestFor(id: string, registration: SourceRegistration, capturedAt: string, mediaType: string): LocalIntakeManifest {
  return { schema: 'payload.local-intake-request.v1', acquisitionId: acquisitionId(id),
    evidenceId: `source-response:${id}`, sourceRegistration: registration,
    purpose: PURPOSE, mediaType, capturedAt };
}
function checkPolicy(id: string, registration: SourceRegistration, at: string): void {
  for (const operation of ['INGEST', 'DERIVE'] as const) {
    const decision = evaluateSourceUse(registration, {
      requestId: `${id}:${operation}`, registrationId: registration.registrationId,
      purpose: PURPOSE, operation, audience: 'INTERNAL', requestedAt: at,
    });
    if (decision.state !== 'ALLOWED') throw error('SOURCE_POLICY_DENIED', 'The internal source qualification policy is not active.');
  }
}

/**
 * Operator-only live acquisition. No browser/board entrypoint and no credential inputs.
 * Storage is a trusted local filesystem, not WORM or an authenticated authority.
 */
export class CaptureStore<Request extends object, Observations> {
  readonly root: string;
  private readonly intake: LocalEvidenceIntake;
  constructor(root: string, private readonly adapter: CaptureAdapter<Request, Observations>, private readonly dependencies: {
    fetch?: typeof fetchEndpointBytes; now?: () => string;
  } = {}) {
    this.root = resolve(root);
    this.intake = new LocalEvidenceIntake(this.root);
  }

  private read(id: string, name: string): unknown | undefined {
    const bytes = readImmutableFile(this.root, locations(this.adapter.captureRoot, id, name), MAX_RECORD);
    return bytes === undefined ? undefined : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  private write(id: string, name: string, value: unknown): 'CREATED' | 'EXISTING' {
    return publishImmutableFile(this.root, locations(this.adapter.captureRoot, id, name), encodeLocalRecord(value), MAX_RECORD);
  }
  private now(): string { return instant((this.dependencies.now ?? (() => new Date().toISOString()))()); }

  private readIntent(id: string): Intent<Request> | undefined {
    const value = this.read(id, 'intent.json');
    if (value === undefined) return undefined;
    exactFields(value, ['schema', 'request', 'requestDigest', 'adapter', 'queryUrl', 'startedAt', 'nonce', 'sourceRegistration', 'qualificationBasis', 'digest']);
    const intent = value as unknown as Intent<Request>;
    verifyDigest(intent);
    const request = this.adapter.parseRequest(intent.request);
    if (intent.schema !== 'payload.source-capture-intent.v1' || intent.adapter !== this.adapter.adapter
      || this.adapter.requestId(request) !== id || !same(request, intent.request) || localRecordDigest(request) !== intent.requestDigest
      || this.adapter.buildUrl(request).href !== intent.queryUrl || !same(intent.sourceRegistration, this.adapter.registration(request))
      || !same(intent.qualificationBasis, this.adapter.qualificationBasis(request))
      || typeof intent.nonce !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.nonce)) {
      throw new Error('Stored source intent does not match the supported connector.');
    }
    checkPolicy(id, intent.sourceRegistration, instant(intent.startedAt));
    return intent;
  }

  private reserveBudget(intent: Intent<Request>): boolean {
    // Permanent create-only slots coordinate processes sharing this root. Never clear stale slots.
    // A failed attempt consumes its slot; four requests/day and one/minute, not a provider quota.
    const day = intent.startedAt.slice(0, 10);
    const minute = intent.startedAt.slice(11, 16).replace(':', '-');
    const claim = encodeLocalRecord({ schema: 'payload.source-request-budget.v1', intentDigest: intent.digest });
    const reserve = (file: string) => {
      const path = ['source-budgets', this.adapter.sourceId, day, file];
      if (readImmutableFile(this.root, path, MAX_RECORD) !== undefined) return false;
      try { return publishImmutableFile(this.root, path, claim, MAX_RECORD) === 'CREATED'; }
      catch (failure) {
        const saved = readImmutableFile(this.root, path, MAX_RECORD);
        if (saved !== undefined && !saved.equals(claim)) return false;
        throw failure;
      }
    };
    if (!reserve(`minute-${minute}.json`)) return false;
    for (let slot = 0; slot < 4; slot += 1) if (reserve(`day-${slot}.json`)) return true;
    return false;
  }

  private validateBudget(intent: Intent<Request>): void {
    const base = ['source-budgets', this.adapter.sourceId, intent.startedAt.slice(0, 10)];
    const expected = encodeLocalRecord({ schema: 'payload.source-request-budget.v1', intentDigest: intent.digest });
    const minute = `minute-${intent.startedAt.slice(11, 16).replace(':', '-')}.json`;
    if (!readImmutableFile(this.root, [...base, minute], MAX_RECORD)?.equals(expected)
      || ![0, 1, 2, 3].some((slot) => readImmutableFile(this.root, [...base, `day-${slot}.json`], MAX_RECORD)?.equals(expected))) {
      throw new Error('Stored source request has no matching request budget.');
    }
  }

  private validateBudgetDenial(intent: Intent<Request>): void {
    const base = ['source-budgets', this.adapter.sourceId, intent.startedAt.slice(0, 10)];
    const owner = (name: string): string => {
      const bytes = readImmutableFile(this.root, [...base, name], MAX_RECORD);
      if (!bytes) throw new Error('Missing source budget denial evidence.');
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      exactFields(value, ['schema', 'intentDigest']);
      if (value.schema !== 'payload.source-request-budget.v1' || typeof value.intentDigest !== 'string'
        || !/^sha256:[a-f0-9]{64}$/.test(value.intentDigest)) throw new Error('Invalid budget claim.');
      return value.intentDigest;
    };
    const minute = `minute-${intent.startedAt.slice(11, 16).replace(':', '-')}.json`;
    if (owner(minute) !== intent.digest) return;
    if ([0, 1, 2, 3].some((slot) => owner(`day-${slot}.json`) === intent.digest)) {
      throw new Error('Granted source budget cannot be reported as exhausted.');
    }
  }

  async capture(value: unknown, enabled = process.env.PAYLOAD_SOURCE_COLLECTION === '1'): Promise<CaptureInspection<Request, Observations>> {
    const request = this.adapter.parseRequest(value);
    const id = this.adapter.requestId(request);
    const endpoint = this.adapter.endpointFor(request);
    const registration = this.adapter.registration(request);
    // Historical replay never recontacts the provider, even when collection is disabled or policy expired.
    const existing = this.inspect(id);
    if (existing) {
      if (!same(existing.intent.request, request)) throw error('SOURCE_REQUEST_CONFLICT', 'This request ID already names a different source scope.');
      return existing;
    }
    if (!enabled) throw error('SOURCE_COLLECTION_DISABLED', 'Set PAYLOAD_SOURCE_COLLECTION=1 explicitly to collect a new source response.', 403);
    const intent: Intent<Request> = seal({ schema: 'payload.source-capture-intent.v1', request,
      requestDigest: localRecordDigest(request), adapter: this.adapter.adapter, queryUrl: this.adapter.buildUrl(request).href,
      startedAt: this.now(), nonce: randomUUID(), sourceRegistration: registration, qualificationBasis: this.adapter.qualificationBasis(request) });
    checkPolicy(id, registration, intent.startedAt);
    try {
      if (this.write(id, 'intent.json', intent) !== 'CREATED') return this.inspect(id)!;
    } catch (failure) {
      const winner = this.inspect(id);
      if (winner) {
        if (!same(winner.intent.request, request)) throw error('SOURCE_REQUEST_CONFLICT', 'A concurrent request claimed this ID for another source scope.');
        return winner;
      }
      throw failure;
    }

    let earliestFinish = intent.startedAt;
    const finish = (result: Pick<Receipt, 'state' | 'failureCode' | 'acquisition' | 'response' | 'observationsDigest'>) => {
      const finishedAt = this.now();
      if (finishedAt < earliestFinish) throw new Error('Source clock moved backwards.');
      const receipt: Receipt = seal({ schema: 'payload.source-capture-receipt.v1', intentDigest: intent.digest, ...result, finishedAt });
      this.write(id, 'receipt.json', receipt);
      return this.inspect(id)!;
    };
    if (!this.reserveBudget(intent)) return finish({ state: 'FAILED', failureCode: 'LOCAL_BUDGET_EXHAUSTED', acquisition: null, response: null, observationsDigest: null });
    let fetched: SourceBytes;
    try { fetched = await (this.dependencies.fetch ?? fetchEndpointBytes)(new URL(intent.queryUrl), endpoint); }
    catch (failure) {
      return finish({ state: 'FAILED', failureCode: failure instanceof SourceConnectorError && failure.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FETCH_FAILED',
        acquisition: null, response: null, observationsDigest: null });
    }
    const capturedAt = this.now();
    if (capturedAt < intent.startedAt) throw new Error('Source clock moved backwards.');
    earliestFinish = capturedAt;
    if (!Buffer.isBuffer(fetched.bytes) || fetched.bytes.length === 0 || fetched.bytes.length > endpoint.maxBytes
      || typeof fetched.mediaType !== 'string' || !this.adapter.acceptsMediaType(fetched.mediaType)) {
      return finish({ state: 'FAILED', failureCode: 'FETCH_FAILED', acquisition: null, response: null, observationsDigest: null });
    }
    // Source-original bytes enter the existing evidence rail BEFORE source parsing.
    // Any storage failure leaves the intent/partial evidence intact and INCOMPLETE; never auto-retry.
    const { acquisition } = this.intake.capture(manifestFor(id, registration, capturedAt, fetched.mediaType), fetched.bytes, capturedAt);
    const reference = { id: acquisitionId(id), digest: acquisition.digest };
    const response = { mediaType: fetched.mediaType, lastModified: fetched.lastModified, etag: fetched.etag };
    let observations: Observations;
    try { observations = this.adapter.observe(fetched.bytes, request, fetched.mediaType); }
    catch { return finish({ state: 'QUARANTINED', failureCode: 'INVALID_SOURCE_RESPONSE', acquisition: reference, response, observationsDigest: null }); }
    return finish({ state: 'CAPTURED', failureCode: null, acquisition: reference, response, observationsDigest: localRecordDigest(observations) });
  }

  /** Reopens raw bytes and reexecutes the source parser. No writes, clocks, network or policy renewal. */
  inspect(id: string): CaptureInspection<Request, Observations> | undefined {
    try {
      const intent = this.readIntent(id);
      if (!intent) {
        if (this.read(id, 'receipt.json') !== undefined || this.intake.inspect(`source-capture:${id}`)) throw new Error('Orphaned source history.');
        return undefined;
      }
      const stored = this.read(id, 'receipt.json');
      const endpoint = this.adapter.endpointFor(intent.request);
      const acquisition = this.intake.inspect(acquisitionId(id));
      // The manifest's own media type is fed back in and then checked against the
      // adapter's accepted set, so a stored type outside it fails rather than
      // validating itself. Every other manifest field stays pinned by equality.
      if (acquisition && (!this.adapter.acceptsMediaType(acquisition.request.manifest.mediaType)
        || !same(acquisition.request.manifest, manifestFor(id, intent.sourceRegistration, acquisition.request.manifest.capturedAt, acquisition.request.manifest.mediaType))
        || instant(acquisition.request.manifest.capturedAt) < intent.startedAt || acquisition.request.byteLength > endpoint.maxBytes)) {
        throw new Error('Source evidence does not match the request.');
      }
      if (acquisition) this.validateBudget(intent);
      let receipt: Receipt | null = null;
      let observations: Observations | null = null;
      if (stored !== undefined) {
        exactFields(stored, ['schema', 'intentDigest', 'state', 'failureCode', 'finishedAt', 'acquisition', 'response', 'observationsDigest', 'digest']);
        receipt = stored as unknown as Receipt;
        verifyDigest(receipt);
        if (receipt.schema !== 'payload.source-capture-receipt.v1' || receipt.intentDigest !== intent.digest
          || !['CAPTURED', 'QUARANTINED', 'FAILED'].includes(receipt.state) || instant(receipt.finishedAt) < intent.startedAt
          || (receipt.failureCode !== null && !FAILURE_CODES.includes(receipt.failureCode))) throw new Error('Invalid source receipt.');
        if (receipt.state === 'FAILED') {
          if (!['FETCH_FAILED', 'RATE_LIMITED', 'LOCAL_BUDGET_EXHAUSTED'].includes(receipt.failureCode!)
            || receipt.acquisition !== null || receipt.response !== null || receipt.observationsDigest !== null || acquisition) throw new Error('Invalid failed source receipt.');
          if (receipt.failureCode === 'LOCAL_BUDGET_EXHAUSTED') this.validateBudgetDenial(intent);
          else this.validateBudget(intent);
        } else {
          this.validateBudget(intent);
          if (!acquisition || !same(receipt.acquisition, { id: acquisitionId(id), digest: acquisition.digest })
            || receipt.finishedAt < acquisition.request.manifest.capturedAt) throw new Error('Missing or mismatched source evidence.');
          exactFields(receipt.response, ['mediaType', 'lastModified', 'etag']);
          const headers = receipt.response!;
          if (typeof headers.mediaType !== 'string' || !this.adapter.acceptsMediaType(headers.mediaType)
            || headers.mediaType !== acquisition.request.manifest.mediaType
            || (headers.etag !== null && (typeof headers.etag !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(headers.etag)))
            || (headers.lastModified !== null && (typeof headers.lastModified !== 'string' || !Number.isFinite(Date.parse(headers.lastModified))
              || new Date(headers.lastModified).toUTCString() !== headers.lastModified))) throw new Error('Invalid source response metadata.');
          checkPolicy(id, intent.sourceRegistration, acquisition.request.manifest.capturedAt);
          const bytes = Buffer.from(this.intake.objects.get(acquisition.request.contentDigest)!);
          try { observations = this.adapter.observe(bytes, intent.request, headers.mediaType); } catch { observations = null; }
          if (receipt.state === 'CAPTURED') {
            if (observations === null || receipt.failureCode !== null || localRecordDigest(observations) !== receipt.observationsDigest) throw new Error('Source observations do not recompute.');
          } else if (observations !== null || receipt.failureCode !== 'INVALID_SOURCE_RESPONSE' || receipt.observationsDigest !== null) throw new Error('Source quarantine does not recompute.');
        }
      }
      return { schema: 'payload.source-capture-inspection.v1', state: receipt?.state ?? 'INCOMPLETE', intent, receipt,
        acquisition: acquisition ? { id: acquisitionId(id), digest: acquisition.digest, contentDigest: acquisition.request.contentDigest,
          byteLength: acquisition.request.byteLength, capturedAt: acquisition.request.manifest.capturedAt } : null,
        observations, integrity: 'RECOMPUTED_LOCAL', canonicalAdmission: false, sourceTruthClaimed: false,
        customerDistributionPermitted: false, independentVerification: false };
    } catch {
      throw error('SOURCE_HISTORY_INVALID', 'Stored source history failed local integrity checks; no history was changed.');
    }
  }
}

/**
 * The census connector, bound. Every existing caller constructs this and reads
 * the same types it always read; the generalization is under it, not at it.
 */
export class SourceCaptureStore extends CaptureStore<SourceCaptureRequest, CensusObservations> {
  constructor(root: string, dependencies: { fetch?: typeof fetchEndpointBytes; now?: () => string } = {}) {
    super(root, CENSUS_ADAPTER, dependencies);
  }
}

/**
 * The statutory filing connector, bound. Same store, same budget discipline,
 * same create-only history — a different regulator, a different document, and
 * an operator-declared path this code has never visited.
 */
export class StatutoryCaptureStore extends CaptureStore<StatutoryCaptureRequest, StatutoryDocumentObservation> {
  constructor(root: string, dependencies: { fetch?: typeof fetchEndpointBytes; now?: () => string } = {}) {
    super(root, STATUTORY_ADAPTER, dependencies);
  }
}

/** The Federal Register change feed, bound to the shared immutable capture and budget discipline. */
export class FederalRegisterCaptureStore extends CaptureStore<FederalRegisterCaptureRequest, FederalRegisterFeedObservation> {
  constructor(root: string, dependencies: { fetch?: typeof fetchEndpointBytes; now?: () => string } = {}) {
    super(root, FEDERAL_REGISTER_ADAPTER, dependencies);
  }
}
