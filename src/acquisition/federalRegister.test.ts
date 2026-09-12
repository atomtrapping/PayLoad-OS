import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceConnectorError } from './errors';
import {
  buildFederalRegisterUrl, FEDERAL_REGISTER_ENDPOINT, federalRegisterQualificationPolicy,
  parseFederalRegisterBytes, parseFederalRegisterCaptureRequest,
  type FederalRegisterCaptureRequest,
} from './federalRegister';
import { fetchEndpointBytes, type SourceBytes } from './http';
import { FEDERAL_REGISTER_ADAPTER, FederalRegisterCaptureStore } from './store';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => { throw new Error('OFFLINE_NETWORK_DISABLED'); }) }));
vi.mock('node:https', () => ({ request: vi.fn(() => { throw new Error('OFFLINE_NETWORK_DISABLED'); }) }));

function request(overrides: Partial<FederalRegisterCaptureRequest> = {}): FederalRegisterCaptureRequest {
  return {
    schema: 'payload.federal-register-capture-request.v1',
    requestId: 'fr-2026-09-10',
    publishedFrom: '2026-09-10',
    publishedThrough: '2026-09-11',
    perPage: 25,
    ...overrides,
  };
}

function response() {
  return {
    count: 2,
    total_pages: 1,
    results: [
      {
        document_number: '2026-19301', type: 'Rule', title: 'Synthetic critical minerals reporting rule',
        abstract: 'The agency publishes a final reporting rule.', action: 'Final rule.', publication_date: '2026-09-11',
        effective_on: '2026-10-15', comments_close_on: null,
        agencies: [{ name: 'Department of Commerce', slug: 'commerce-department' }],
        html_url: 'https://www.federalregister.gov/documents/2026/09/11/2026-19301/synthetic-critical-minerals-reporting-rule',
        pdf_url: 'https://public-inspection.federalregister.gov/2026-19301.pdf',
      },
      {
        document_number: '2026-19270', type: 'Proposed Rule', title: 'Synthetic port infrastructure proposal',
        abstract: null, action: 'Proposed rule.', publication_date: '2026-09-10', effective_on: null,
        comments_close_on: '2026-11-10', agencies: [{ raw_name: 'Department of Transportation' }],
        html_url: 'https://www.federalregister.gov/documents/2026/09/10/2026-19270/synthetic-port-infrastructure-proposal',
        pdf_url: null,
      },
    ],
  };
}

const bytes = () => Buffer.from(JSON.stringify(response()), 'utf8');
const fetched = (): SourceBytes => ({ bytes: bytes(), mediaType: 'application/json', etag: '"fixture"', lastModified: null });

let temporary: string;
beforeEach(() => { temporary = mkdtempSync(join(tmpdir(), 'federal-register-')); });
afterEach(() => rmSync(temporary, { recursive: true, force: true }));

describe('Federal Register request boundary', () => {
  it('builds one pinned date-window query and lets the operator choose no host or arbitrary parameter', () => {
    const url = buildFederalRegisterUrl(request());
    expect(url.origin).toBe('https://www.federalregister.gov');
    expect(url.pathname).toBe('/api/v1/documents.json');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'conditions[publication_date][gte]': '2026-09-10',
      'conditions[publication_date][lte]': '2026-09-11',
      order: 'newest',
      per_page: '25',
    });
    expect(FEDERAL_REGISTER_ENDPOINT.query).toBe('FEDERAL_REGISTER_BOUNDED');
  });

  it('refuses unknown fields, impossible dates, reversed or long windows, and excessive result counts', () => {
    const invalid = [
      { ...request(), sourceUrl: 'https://evil.example/' },
      request({ publishedFrom: '2026-02-30' }),
      request({ publishedFrom: '2026-09-12', publishedThrough: '2026-09-11' }),
      request({ publishedFrom: '2026-01-01', publishedThrough: '2026-03-01' }),
      request({ perPage: 101 }),
    ];
    for (const value of invalid) expect(() => parseFederalRegisterCaptureRequest(value)).toThrow(SourceConnectorError);
  });

  it('has only an internal qualification policy and no customer or public audience', () => {
    const policy = federalRegisterQualificationPolicy();
    expect(policy.allowedAudiences).toEqual(['INTERNAL']);
    expect(policy.permittedPurposes).toEqual(['source-qualification']);
    expect(policy.licenseId).toContain('review-open');
  });

  it('makes the shared transport reject query widening before DNS or a socket', async () => {
    const url = buildFederalRegisterUrl(request());
    url.searchParams.set('page', '2');
    await expect(fetchEndpointBytes(url, FEDERAL_REGISTER_ENDPOINT)).rejects.toMatchObject({ code: 'SOURCE_URL_DISALLOWED' });
  });
});

describe('Federal Register observations', () => {
  it('accepts the live API empty-feed shape, which omits results when count is zero', () => {
    const parsed = parseFederalRegisterBytes(Buffer.from(JSON.stringify({
      description: 'Documents published from 09/12/2026 to 09/12/2026', count: 0,
    })), request({ publishedFrom: '2026-09-12', publishedThrough: '2026-09-12' }));
    expect(parsed).toMatchObject({ reportedCount: 0, returnedCount: 0, truncated: false, documents: [] });
  });

  it('preserves source claims and explicitly withholds legal effect and canonical admission', () => {
    const parsed = parseFederalRegisterBytes(bytes(), request());
    expect(parsed.documents).toHaveLength(2);
    expect(parsed.documents[0]).toMatchObject({
      documentNumber: '2026-19301', instrumentKind: 'RULE', effectiveOn: '2026-10-15',
      sourceAuthority: 'OFFICIAL_GOVERNMENT_MIRROR', legalEffect: 'NOT_ESTABLISHED_BY_THIS_SOURCE',
    });
    expect(parsed.documents[1]).toMatchObject({ instrumentKind: 'PROPOSED_RULE', commentsCloseOn: '2026-11-10' });
    expect(parsed).toMatchObject({ canonicalAdmission: false, sourceTruthClaimed: false, independentlyVerified: false, legalEffectEstablished: false });
  });

  it('rejects duplicate decoded keys, duplicate documents, out-of-window rows and non-government links', () => {
    expect(() => parseFederalRegisterBytes(Buffer.from('{"count":0,"count":1,"results":[]}'), request())).toThrow();
    const duplicate = response(); duplicate.results[1].document_number = duplicate.results[0].document_number;
    expect(() => parseFederalRegisterBytes(Buffer.from(JSON.stringify(duplicate)), request())).toThrow('FEDERAL_REGISTER_SCHEMA_MISMATCH');
    const outside = response(); outside.results[0].publication_date = '2026-09-09';
    expect(() => parseFederalRegisterBytes(Buffer.from(JSON.stringify(outside)), request())).toThrow('FEDERAL_REGISTER_SCHEMA_MISMATCH');
    const foreign = response(); foreign.results[0].html_url = 'https://example.com/2026-19301';
    expect(() => parseFederalRegisterBytes(Buffer.from(JSON.stringify(foreign)), request())).toThrow('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  });
});

describe('Federal Register supplied link integrity', () => {
  it.each(['http://public-inspection.federalregister.gov/2026-19301.pdf', 'https://foreign.invalid/2026-19301.pdf',
    'https://user:password@www.govinfo.gov/2026-19301.pdf', 'not-a-url'])('refuses an invalid non-null PDF link rather than treating it as missing: %s', pdfUrl => {
    const supplied = response(); supplied.results[0].pdf_url = pdfUrl;
    expect(() => parseFederalRegisterBytes(Buffer.from(JSON.stringify(supplied)), request())).toThrow('FEDERAL_REGISTER_SCHEMA_MISMATCH');
  });
});

describe('Federal Register capture', () => {
  it('refuses a new disabled capture but replays exact retained history after policy expiry without collecting', async () => {
    const fetch = vi.fn(async () => fetched());
    const store = new FederalRegisterCaptureStore(temporary, { fetch, now: () => '2026-09-12T12:00:00.000Z' });
    await expect(store.capture(request(), false)).rejects.toMatchObject({ code: 'SOURCE_COLLECTION_DISABLED' });
    expect(fetch).not.toHaveBeenCalled();
    const captured = await store.capture(request(), true);
    const later = new FederalRegisterCaptureStore(temporary, { fetch, now: () => '2026-11-12T12:00:00.000Z' });
    const replayed = await later.capture(request(), false);
    expect(replayed).toEqual(captured);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('uses the common immutable evidence rail and recomputes the parser on inspection', async () => {
    const fetch = vi.fn(async () => fetched());
    const store = new FederalRegisterCaptureStore(temporary, { fetch, now: () => '2026-09-12T12:00:00.000Z' });
    const captured = await store.capture(request(), true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(captured).toMatchObject({ state: 'CAPTURED', integrity: 'RECOMPUTED_LOCAL', canonicalAdmission: false });
    expect(captured.intent.adapter).toBe('federal-register-document-feed.v1');
    expect(captured.observations?.returnedCount).toBe(2);
    expect(captured.acquisition?.contentDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const reopened = new FederalRegisterCaptureStore(temporary, { fetch }).inspect(request().requestId);
    expect(reopened?.observations).toEqual(captured.observations);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retains invalid source bytes and quarantines observations without promoting them', async () => {
    const fetch = vi.fn(async () => ({ ...fetched(), bytes: Buffer.from('{"count":1,"results":[{}]}') }));
    const store = new FederalRegisterCaptureStore(temporary, { fetch, now: () => '2026-09-12T12:00:00.000Z' });
    const captured = await store.capture(request(), true);
    expect(captured).toMatchObject({ state: 'QUARANTINED', observations: null, canonicalAdmission: false });
    expect(captured.acquisition?.byteLength).toBeGreaterThan(0);
  });

  it('declares a separate history and budget namespace', () => {
    expect(FEDERAL_REGISTER_ADAPTER.captureRoot).toEqual(['federal-register-captures']);
    expect(FEDERAL_REGISTER_ADAPTER.sourceId).toBe('us-federal-register-api');
  });
});
