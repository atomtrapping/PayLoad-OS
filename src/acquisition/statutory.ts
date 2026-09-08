/**
 * The statutory filing connector: a declared regulator document, fetched once.
 *
 * The harvest rail (`src/domain/statutoryHarvest.ts`) has read bytes since the
 * day it was written, and every one of those bytes has been handed to it by a
 * person. That is the last mile, and this module is it: a path from a live
 * regulator to the evidence intake rail that a scheduler can walk without a
 * human pasting anything.
 *
 * WHAT THIS CODE OWNS, AND WHAT THE OPERATOR OWNS
 *
 * This code owns the host. `www.floir.com`, `www.insurance.ca.gov` and
 * `www.tdi.texas.gov` are the regulators' own primary domains, they are pinned
 * here, and no request may leave for anywhere else — the transport checks the
 * hostname exactly, resolves it to a public address, and pins the connection to
 * the address it checked.
 *
 * The operator owns the document. This module does not ship a document path,
 * because it has never fetched one and inventing a path that looks plausible
 * would be the fabricating version of this file: a URL that reads like a real
 * bulletin, cited in a receipt, standing in for a check nobody performed. So
 * the path is declared in the capture request, validated for shape, and
 * recorded in the intent as what it is — an operator declaration. The first run
 * against a live regulator is the operator's, and it is also the test.
 *
 * That split is PROVENANCE-IS-DECLARED-NEVER-INFERRED at the transport layer.
 * The code asserts what it can check (this host, this shape, these bytes, this
 * digest) and declares what it cannot (that the document at this path is the
 * order the operator believes it to be).
 *
 * WHY A DOCUMENT AND NOT A DATASET
 *
 * The harvest rail reads a header block out of text under labels declared per
 * jurisdiction. It does not read JSON rows, and it does not read PDFs, and it
 * says so. A connector that fetched a dataset would have to invent a mapping
 * from somebody's column names to this rail's fields, which is the discovery
 * `extractFiling` already refuses. So this connector fetches the document the
 * grammar was written for, and where the grammar reads nothing the extraction
 * reports ABSENT and MALFORMED per field. That is a legible outcome and not a
 * failure to hide: it says the document is real and this grammar cannot yet
 * read it, which is the next piece of work stated from evidence.
 */
import type { SourceRegistration } from '../data-os/contracts';
import type { JurisdictionId } from '@/domain/statutoryHarvest';
import { SourceConnectorError } from './errors';
import { type SourceEndpoint } from './http';

/** The jurisdictions the harvest rail declares a grammar for. Held in step by a test. */
/**
 * One vocabulary, and it is the domain's. This module used to declare its own
 * union with the same three members under a different name; see JurisdictionId
 * for why that was a hole rather than a duplication.
 */
export type { JurisdictionId } from '@/domain/statutoryHarvest';

export const STATUTORY_JURISDICTIONS: readonly JurisdictionId[] = Object.freeze(['FL_OIR', 'CA_CDI', 'TX_TDI']);

/** Documents are text. A response this rail cannot hand to the grammar is refused, not stored hopefully. */
const DOCUMENT_MEDIA_TYPE = /^text\/(?:plain|html)(?:\s*;\s*charset=utf-8)?$/i;
export const STATUTORY_MAX_BYTES = 256 * 1024;

interface JurisdictionSource {
  readonly jurisdiction: JurisdictionId;
  readonly sourceId: string;
  readonly regulator: string;
  readonly endpoint: SourceEndpoint;
}

/**
 * A path on the regulator's host and nothing else: no scheme, no authority, no
 * query, no fragment, no dot segments, no percent-encoding, and never a
 * trailing slash — a directory is not a document.
 */
const DOCUMENT_PATH = /^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/;

function endpoint(id: string, hostname: string, regulator: string): SourceEndpoint {
  return Object.freeze({
    id, hostname,
    pathname: DOCUMENT_PATH,
    query: 'NONE' as const,
    accept: 'text/plain, text/html',
    mediaType: DOCUMENT_MEDIA_TYPE,
    maxBytes: STATUTORY_MAX_BYTES,
    because: `${regulator}'s own primary domain. The host is pinned by this code; the document path is the operator's declaration and is recorded as one.`,
  });
}

export const STATUTORY_SOURCES: Readonly<Record<JurisdictionId, JurisdictionSource>> = Object.freeze({
  FL_OIR: {
    jurisdiction: 'FL_OIR', sourceId: 'fl-oir-statutory-filing',
    regulator: 'Florida Office of Insurance Regulation',
    endpoint: endpoint('fl-oir-statutory-filing', 'www.floir.com', 'Florida Office of Insurance Regulation'),
  },
  CA_CDI: {
    jurisdiction: 'CA_CDI', sourceId: 'ca-cdi-statutory-filing',
    regulator: 'California Department of Insurance',
    endpoint: endpoint('ca-cdi-statutory-filing', 'www.insurance.ca.gov', 'California Department of Insurance'),
  },
  TX_TDI: {
    jurisdiction: 'TX_TDI', sourceId: 'tx-tdi-statutory-filing',
    regulator: 'Texas Department of Insurance',
    endpoint: endpoint('tx-tdi-statutory-filing', 'www.tdi.texas.gov', 'Texas Department of Insurance'),
  },
});

export interface StatutoryCaptureRequest {
  schema: 'payload.statutory-capture-request.v1';
  requestId: string;
  jurisdiction: JurisdictionId;
  /** Operator-declared, on the pinned host. Recorded as a declaration, never as a verified location. */
  documentPath: string;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function invalidRequest(): never {
  throw new SourceConnectorError('INVALID_STATUTORY_REQUEST', 'Provide an exact statutory capture request naming a declared jurisdiction and one document path on that regulator’s host.');
}

/**
 * Closed command. A caller may choose the jurisdiction and the document; it may
 * not choose a host, a scheme, a query, a clock, a contact or an identity.
 */
export function parseStatutoryCaptureRequest(value: unknown): StatutoryCaptureRequest {
  const fields = ['schema', 'requestId', 'jurisdiction', 'documentPath'];
  if (!plainRecord(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field)
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, field)!, 'value'))) invalidRequest();
  if (value.schema !== 'payload.statutory-capture-request.v1'
    || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.requestId)
    || typeof value.jurisdiction !== 'string' || !STATUTORY_JURISDICTIONS.includes(value.jurisdiction as JurisdictionId)
    || typeof value.documentPath !== 'string' || value.documentPath.length > 256
    || !DOCUMENT_PATH.test(value.documentPath) || value.documentPath.split('/').some((part) => part === '.' || part === '..')) invalidRequest();
  return {
    schema: 'payload.statutory-capture-request.v1',
    requestId: value.requestId,
    jurisdiction: value.jurisdiction as JurisdictionId,
    documentPath: value.documentPath,
  };
}

export function statutoryEndpoint(request: StatutoryCaptureRequest): SourceEndpoint {
  return STATUTORY_SOURCES[parseStatutoryCaptureRequest(request).jurisdiction].endpoint;
}

/** The exact URL this capture will request. Built from the pinned host and the declared path. */
export function buildStatutoryUrl(request: StatutoryCaptureRequest): URL {
  const selected = parseStatutoryCaptureRequest(request);
  const source = STATUTORY_SOURCES[selected.jurisdiction];
  return new URL(`https://${source.endpoint.hostname}${selected.documentPath}`);
}

/**
 * Operator-declared qualification, exactly as the census connector's is: an
 * internal reading of a public source's terms, not a provider-issued licence,
 * and it says so in its own identifiers.
 */
export function statutoryQualificationPolicy(jurisdiction: JurisdictionId): SourceRegistration {
  const source = STATUTORY_SOURCES[jurisdiction];
  return {
    registrationId: `${source.sourceId}:qualification:2026-09-07`,
    sourceId: source.sourceId,
    displayName: `${source.regulator} — internal qualification`,
    sourceClass: 'public-government-statutory-filing',
    licenseId: 'operator-qualification:provider-license-unresolved',
    policyVersion: '2026-09-07.v1',
    effectiveFrom: '2026-09-07T00:00:00.000Z',
    effectiveUntil: '2026-10-07T00:00:00.000Z',
    permittedPurposes: ['source-qualification'],
    allowedOperations: ['INGEST', 'DERIVE'],
    allowedAudiences: ['INTERNAL'],
    retention: { mode: 'INDEFINITE' },
  };
}

/**
 * What the connector can say about the bytes without reading them as a filing.
 *
 * Extraction is the harvest rail's and happens over the retained bytes, under a
 * declared grammar, in a layer this one cannot reach. So the observation stops
 * at what a transport honestly knows: the media type the source stated, the
 * length, the digest, and whether the bytes decode as UTF-8 at all.
 */
export interface StatutoryDocumentObservation {
  schema: 'payload.statutory-document-observation.v1';
  jurisdiction: JurisdictionId;
  sourceId: string;
  documentUrl: string;
  mediaType: string;
  byteLength: number;
  /** False when the bytes are not valid UTF-8. They are still retained; nothing is mangled into shape. */
  decodable: boolean;
  /** Deliberately null. This layer declares no fields; the harvest grammar reads them. */
  fields: null;
  because: string;
}

export function observeStatutoryDocument(
  request: StatutoryCaptureRequest,
  bytes: Buffer,
  mediaType: string,
): StatutoryDocumentObservation {
  const selected = parseStatutoryCaptureRequest(request);
  const source = STATUTORY_SOURCES[selected.jurisdiction];
  let decodable = true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { decodable = false; }
  return {
    schema: 'payload.statutory-document-observation.v1',
    jurisdiction: selected.jurisdiction,
    sourceId: source.sourceId,
    documentUrl: buildStatutoryUrl(selected).href,
    mediaType,
    byteLength: bytes.byteLength,
    decodable,
    fields: null,
    because: decodable
      ? `${bytes.byteLength} bytes retained from ${source.regulator} as ${mediaType}. No field was read here: the declared grammar for ${selected.jurisdiction} reads the retained bytes in the harvest rail, and a transport that also parsed would be two authorities on one document.`
      : `${bytes.byteLength} bytes retained from ${source.regulator} as ${mediaType}, and they are not valid UTF-8. They are kept exactly as received rather than repaired, because a capture that quietly fixed its bytes would no longer be evidence of what the source served.`,
  };
}
