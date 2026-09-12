import type { SourceRegistration } from '../data-os/contracts';
import { parseReplayJson } from '../observation/json';
import { SourceConnectorError } from './errors';
import type { SourceEndpoint } from './http';

export const FEDERAL_REGISTER_MAX_BYTES = 256 * 1024;
export const FEDERAL_REGISTER_MAX_RESULTS = 100;
export const FEDERAL_REGISTER_SOURCE_ID = 'us-federal-register-api';

export const FEDERAL_REGISTER_ENDPOINT: SourceEndpoint = Object.freeze({
  id: FEDERAL_REGISTER_SOURCE_ID,
  hostname: 'www.federalregister.gov',
  pathname: /^\/api\/v1\/documents\.json$/,
  query: 'FEDERAL_REGISTER_BOUNDED',
  accept: 'application/json',
  mediaType: /^application\/json(?:\s*;\s*charset=utf-8)?$/i,
  maxBytes: FEDERAL_REGISTER_MAX_BYTES,
  because: 'The keyless FederalRegister.gov document API operated by the Office of the Federal Register. Its results are an informational government mirror; the linked official edition remains a separate verification step.',
});

export interface FederalRegisterCaptureRequest {
  schema: 'payload.federal-register-capture-request.v1';
  requestId: string;
  publishedFrom: string;
  publishedThrough: string;
  perPage: number;
}

export type FederalRegisterInstrumentKind = 'RULE' | 'PROPOSED_RULE' | 'NOTICE' | 'PRESIDENTIAL_DOCUMENT';

export interface FederalRegisterDocumentObservation {
  documentNumber: string;
  instrumentKind: FederalRegisterInstrumentKind;
  title: string;
  abstract: string | null;
  action: string | null;
  publicationDate: string;
  effectiveOn: string | null;
  commentsCloseOn: string | null;
  agencies: readonly string[];
  htmlUrl: string;
  sourcePdfUrl: string | null;
  sourceItemId: string;
  sourceAuthority: 'OFFICIAL_GOVERNMENT_MIRROR';
  legalEffect: 'NOT_ESTABLISHED_BY_THIS_SOURCE';
}

export interface FederalRegisterFeedObservation {
  schema: 'payload.federal-register-feed-observation.v1';
  sourceId: typeof FEDERAL_REGISTER_SOURCE_ID;
  request: FederalRegisterCaptureRequest;
  reportedCount: number;
  returnedCount: number;
  truncated: boolean;
  documents: readonly FederalRegisterDocumentObservation[];
  canonicalAdmission: false;
  sourceTruthClaimed: false;
  independentlyVerified: false;
  legalEffectEstablished: false;
  because: string;
}

function invalid(message = 'Provide an exact Federal Register capture request with one bounded publication-date window.'): never {
  throw new SourceConnectorError('INVALID_FEDERAL_REGISTER_REQUEST', message, 400);
}

function plain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}

export function parseFederalRegisterCaptureRequest(value: unknown): FederalRegisterCaptureRequest {
  const fields = ['schema', 'requestId', 'publishedFrom', 'publishedThrough', 'perPage'];
  if (!plain(value) || Reflect.ownKeys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) invalid();
  const from = date(value.publishedFrom);
  const through = date(value.publishedThrough);
  if (value.schema !== 'payload.federal-register-capture-request.v1'
    || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.requestId)
    || from === null || through === null || through < from
    || Date.parse(`${through}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`) > 31 * 86_400_000
    || !Number.isSafeInteger(value.perPage) || (value.perPage as number) < 1 || (value.perPage as number) > FEDERAL_REGISTER_MAX_RESULTS) invalid();
  return {
    schema: 'payload.federal-register-capture-request.v1',
    requestId: value.requestId,
    publishedFrom: from,
    publishedThrough: through,
    perPage: value.perPage as number,
  };
}

export function buildFederalRegisterUrl(value: FederalRegisterCaptureRequest): URL {
  const request = parseFederalRegisterCaptureRequest(value);
  const url = new URL('https://www.federalregister.gov/api/v1/documents.json');
  url.searchParams.set('conditions[publication_date][gte]', request.publishedFrom);
  url.searchParams.set('conditions[publication_date][lte]', request.publishedThrough);
  url.searchParams.set('order', 'newest');
  url.searchParams.set('per_page', String(request.perPage));
  return url;
}

/** Operator qualification only. The API is public and keyless; republication rights remain an operator decision. */
export function federalRegisterQualificationPolicy(): SourceRegistration {
  return {
    registrationId: 'us-federal-register-api:qualification:2026-09-12',
    sourceId: FEDERAL_REGISTER_SOURCE_ID,
    displayName: 'FederalRegister.gov document API — internal qualification',
    sourceClass: 'public-government-regulatory-index',
    licenseId: 'operator-qualification:public-domain-and-republication-review-open',
    policyVersion: '2026-09-12.v1',
    effectiveFrom: '2026-09-12T00:00:00.000Z',
    effectiveUntil: '2026-10-12T00:00:00.000Z',
    permittedPurposes: ['source-qualification'],
    allowedOperations: ['INGEST', 'DERIVE'],
    allowedAudiences: ['INTERNAL'],
    retention: { mode: 'INDEFINITE' },
  };
}

const TYPES: Record<string, FederalRegisterInstrumentKind> = {
  RULE: 'RULE', Rule: 'RULE',
  PRORULE: 'PROPOSED_RULE', 'Proposed Rule': 'PROPOSED_RULE',
  NOTICE: 'NOTICE', Notice: 'NOTICE',
  PRESDOCU: 'PRESIDENTIAL_DOCUMENT', 'Presidential Document': 'PRESIDENTIAL_DOCUMENT',
};

function sourceUrl(value: unknown, kind: 'HTML' | 'PDF', documentNumber: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) return null;
  if (kind === 'HTML') {
    if (url.hostname !== 'www.federalregister.gov' || !url.pathname.includes(documentNumber)) return null;
  } else if (!['www.govinfo.gov', 'public-inspection.federalregister.gov', 'www.federalregister.gov'].includes(url.hostname)) return null;
  return url.href;
}

function optionalText(value: unknown, maximum: number): string | null {
  return value === null || value === undefined ? null : text(value, maximum);
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return date(value) ?? undefined;
}

function agencies(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 32) return null;
  const names: string[] = [];
  for (const agency of value) {
    if (!plain(agency)) return null;
    const name = text(agency.name, 256) ?? text(agency.raw_name, 256);
    if (!name) return null;
    if (!names.includes(name)) names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

function parseDocument(value: unknown, request: FederalRegisterCaptureRequest): FederalRegisterDocumentObservation {
  if (!plain(value)) throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  const documentNumber = text(value.document_number, 32);
  const instrumentKind = typeof value.type === 'string' ? TYPES[value.type] : undefined;
  const title = text(value.title, 1_000);
  const publicationDate = date(value.publication_date);
  const agencyNames = agencies(value.agencies);
  if (!documentNumber || !/^[0-9]{2,4}-[0-9]{1,8}$/.test(documentNumber) || !instrumentKind || !title || !publicationDate
    || publicationDate < request.publishedFrom || publicationDate > request.publishedThrough || agencyNames === null) {
    throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  }
  const htmlUrl = sourceUrl(value.html_url, 'HTML', documentNumber);
  const pdfUrl = value.pdf_url === null || value.pdf_url === undefined ? null : sourceUrl(value.pdf_url, 'PDF', documentNumber);
  const effectiveOn = optionalDate(value.effective_on);
  const commentsCloseOn = optionalDate(value.comments_close_on);
  const abstract = optionalText(value.abstract, 4_000);
  const action = optionalText(value.action, 2_000);
  if (!htmlUrl || pdfUrl === undefined || effectiveOn === undefined || commentsCloseOn === undefined
    || (value.abstract !== null && value.abstract !== undefined && abstract === null)
    || (value.action !== null && value.action !== undefined && action === null)) throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  return {
    documentNumber,
    instrumentKind,
    title,
    abstract,
    action,
    publicationDate,
    effectiveOn,
    commentsCloseOn,
    agencies: agencyNames,
    htmlUrl,
    sourcePdfUrl: pdfUrl,
    sourceItemId: documentNumber,
    sourceAuthority: 'OFFICIAL_GOVERNMENT_MIRROR',
    legalEffect: 'NOT_ESTABLISHED_BY_THIS_SOURCE',
  };
}

/** Parse the exact retained API bytes into source observations. No row crosses the admission gate here. */
export function parseFederalRegisterBytes(bytes: Buffer, value: FederalRegisterCaptureRequest): FederalRegisterFeedObservation {
  const request = parseFederalRegisterCaptureRequest(value);
  let parsed: unknown;
  try { parsed = parseReplayJson(bytes, FEDERAL_REGISTER_MAX_BYTES); } catch { throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH'); }
  if (!plain(parsed) || !Number.isSafeInteger(parsed.count) || (parsed.count as number) < 0) {
    throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  }
  // FederalRegister.gov omits `results` when a bounded query returns count 0.
  const results = parsed.results === undefined && parsed.count === 0 ? [] : parsed.results;
  if (!Array.isArray(results) || results.length > request.perPage || results.length > FEDERAL_REGISTER_MAX_RESULTS) {
    throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  }
  const documents = results.map((entry) => parseDocument(entry, request));
  if (new Set(documents.map((entry) => entry.documentNumber)).size !== documents.length || (parsed.count as number) < documents.length) {
    throw new Error('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  }
  documents.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate) || a.documentNumber.localeCompare(b.documentNumber));
  return {
    schema: 'payload.federal-register-feed-observation.v1',
    sourceId: FEDERAL_REGISTER_SOURCE_ID,
    request,
    reportedCount: parsed.count as number,
    returnedCount: documents.length,
    truncated: (parsed.count as number) > documents.length,
    documents,
    canonicalAdmission: false,
    sourceTruthClaimed: false,
    independentlyVerified: false,
    legalEffectEstablished: false,
    because: `${documents.length} FederalRegister.gov index ${documents.length === 1 ? 'entry' : 'entries'} parsed from retained bytes. The API establishes what its government-operated mirror reported; it is not the official legal edition, so legal effect remains a verification question and no corpus state changed.`,
  };
}
