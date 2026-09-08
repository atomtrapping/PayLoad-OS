/**
 * What this connector pins and what it declares, held apart by test.
 *
 * The host is code's and is checked. The document path is the operator's and is
 * recorded as a declaration. The line between them is the whole honesty of this
 * connector, so it is asserted rather than described.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No test in this file may reach a network. DNS is stubbed to refuse, so a URL
// that passes validation fails at resolution instead of leaving the machine.
const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn(async () => { throw new Error('no resolution in tests'); }) }));
vi.mock('node:dns/promises', () => ({ lookup: lookupMock }));
import { JURISDICTION_IDS } from '@/domain/statutoryHarvest';
import { SourceConnectorError } from './errors';
import { fetchEndpointBytes, type SourceBytes } from './http';
import {
  STATUTORY_JURISDICTIONS, STATUTORY_SOURCES, buildStatutoryUrl, observeStatutoryDocument,
  parseStatutoryCaptureRequest, statutoryEndpoint, statutoryQualificationPolicy,
  type StatutoryCaptureRequest,
} from './statutory';
import { STATUTORY_ADAPTER, StatutoryCaptureStore } from './store';

const startAt = '2026-09-07T12:00:00.000Z';
const documentText = [
  'Order No: 2026-TDI-0117',
  'NAIC Number: 12345',
  'Insurer: Synthetic Specimen Mutual',
  'Order Type: Consent Order',
].join('\n');

function request(overrides: Partial<StatutoryCaptureRequest> = {}): StatutoryCaptureRequest {
  return {
    schema: 'payload.statutory-capture-request.v1', requestId: 'tx-order-0117',
    jurisdiction: 'TX_TDI', documentPath: '/company/documents/2026-tdi-0117.txt', ...overrides,
  };
}
function fetched(bytes = Buffer.from(documentText, 'utf8'), mediaType = 'text/plain'): SourceBytes {
  return { bytes, mediaType, etag: null, lastModified: null };
}

let temporary: string;
let root: string;
let at: string;
let fetch: ReturnType<typeof vi.fn<typeof fetchEndpointBytes>>;
let store: StatutoryCaptureStore;

beforeEach(() => {
  temporary = mkdtempSync(join(tmpdir(), 'statutory-capture-'));
  root = join(temporary, 'evidence');
  at = startAt;
  fetch = vi.fn(async () => fetched());
  store = new StatutoryCaptureStore(root, { fetch, now: () => at });
});
afterEach(() => rmSync(temporary, { recursive: true, force: true }));

describe('the jurisdictions stay in step with the grammar that reads them', () => {
  it('declares a source for exactly the jurisdictions the harvest rail can parse', () => {
    expect([...STATUTORY_JURISDICTIONS].sort()).toEqual([...JURISDICTION_IDS].sort());
    expect(Object.keys(STATUTORY_SOURCES).sort()).toEqual([...JURISDICTION_IDS].sort());
  });
});

describe('the host is pinned by this code', () => {
  it('addresses each regulator on its own primary domain and nowhere else', () => {
    expect(buildStatutoryUrl(request()).href).toBe('https://www.tdi.texas.gov/company/documents/2026-tdi-0117.txt');
    expect(buildStatutoryUrl(request({ jurisdiction: 'FL_OIR' })).hostname).toBe('www.floir.com');
    expect(buildStatutoryUrl(request({ jurisdiction: 'CA_CDI' })).hostname).toBe('www.insurance.ca.gov');
  });

  it('refuses every URL the endpoint does not name, whatever the request asked for', async () => {
    const endpoint = statutoryEndpoint(request());
    for (const href of [
      'https://tdi.texas.gov/company/x.txt',
      'https://www.tdi.texas.gov.evil.example/company/x.txt',
      'http://www.tdi.texas.gov/company/x.txt',
      'https://www.tdi.texas.gov/company/x.txt?q=1',
      'https://user:pass@www.tdi.texas.gov/company/x.txt',
      'https://www.tdi.texas.gov:8443/company/x.txt',
      'https://www.tdi.texas.gov/company/',
      'https://www.tdi.texas.gov/company/x.txt#part',
    ]) {
      await expect(fetchEndpointBytes(new URL(href), endpoint)).rejects.toMatchObject({ code: 'SOURCE_URL_DISALLOWED' });
    }
    expect(lookupMock).not.toHaveBeenCalled();
  });

  /**
   * A dot segment never reaches the transport as one: the URL parser resolves
   * it first, so `/company/../secret.txt` arrives as `/secret.txt` — still on
   * the pinned host, still one document, and not an escape. The refusal that
   * matters is upstream, where the operator's declaration is read.
   */
  it('refuses a dot segment where it is written, not after the parser has resolved it away', () => {
    expect(new URL('https://www.tdi.texas.gov/company/../secret.txt').pathname).toBe('/secret.txt');
    expect(() => parseStatutoryCaptureRequest(request({ documentPath: '/company/../secret.txt' }))).toThrow(SourceConnectorError);
  });
});

describe('the document path is the operator’s declaration', () => {
  it('accepts a path shape and refuses anything that is not one document on that host', () => {
    expect(parseStatutoryCaptureRequest(request()).documentPath).toBe('/company/documents/2026-tdi-0117.txt');
    for (const documentPath of ['', 'company/x.txt', '/company/', '/company//x.txt', '/company/../x.txt', '/company/x.txt?a=1', '/company/x txt', `/${'a'.repeat(300)}`]) {
      expect(() => parseStatutoryCaptureRequest(request({ documentPath }))).toThrow(SourceConnectorError);
    }
  });

  it('refuses an undeclared jurisdiction and an unknown field, because the command is closed', () => {
    expect(() => parseStatutoryCaptureRequest(request({ jurisdiction: 'NY_DFS' as StatutoryCaptureRequest['jurisdiction'] }))).toThrow(SourceConnectorError);
    expect(() => parseStatutoryCaptureRequest({ ...request(), sourceUrl: 'https://elsewhere.example/x' })).toThrow(SourceConnectorError);
  });

  it('records in the qualification basis that the host is the code’s and the path is the operator’s', () => {
    const basis = STATUTORY_ADAPTER.qualificationBasis(request()) as Record<string, unknown>;
    expect(basis.hostPinnedBy).toBe('CODE');
    expect(basis.documentPathDeclaredBy).toBe('OPERATOR');
    expect(basis.independentRightsVerification).toBe(false);
    expect(basis.providerLicense).toBe('UNRESOLVED');
    const policy = statutoryQualificationPolicy('TX_TDI');
    expect(policy.licenseId).toBe('operator-qualification:provider-license-unresolved');
    expect(policy.allowedAudiences).toEqual(['INTERNAL']);
  });
});

describe('the observation stops where this layer’s knowledge stops', () => {
  it('declares no field, because the grammar that reads them lives in the harvest rail', () => {
    const observed = observeStatutoryDocument(request(), Buffer.from(documentText, 'utf8'), 'text/plain');
    expect(observed.fields).toBeNull();
    expect(observed.decodable).toBe(true);
    expect(observed.byteLength).toBe(Buffer.byteLength(documentText));
    expect(observed.because).toMatch(/No field was read here/);
  });

  it('records undecodable bytes as undecodable and keeps them exactly as received', () => {
    const observed = observeStatutoryDocument(request(), Buffer.from([0xff, 0xfe, 0xfd]), 'text/plain');
    expect(observed.decodable).toBe(false);
    expect(observed.byteLength).toBe(3);
    expect(observed.because).toMatch(/kept exactly as received rather than repaired/);
  });
});

describe('the capture walks the existing evidence rail', () => {
  it('refuses to collect unless the operator set the flag, and says exactly which flag', async () => {
    await expect(store.capture(request(), false)).rejects.toMatchObject({ code: 'SOURCE_COLLECTION_DISABLED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains the original bytes, seals a receipt, and recomputes everything from disk on readback', async () => {
    const captured = await store.capture(request(), true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0].href).toBe('https://www.tdi.texas.gov/company/documents/2026-tdi-0117.txt');
    expect(fetch.mock.calls[0][1].hostname).toBe('www.tdi.texas.gov');
    expect(captured.state).toBe('CAPTURED');
    expect(captured.intent.adapter).toBe('statutory-filing-document.v1');
    expect(captured.acquisition?.byteLength).toBe(Buffer.byteLength(documentText));
    expect(captured.observations?.mediaType).toBe('text/plain');
    // The connector claims nothing about the document beyond having retained it.
    expect(captured.canonicalAdmission).toBe(false);
    expect(captured.sourceTruthClaimed).toBe(false);
    expect(captured.customerDistributionPermitted).toBe(false);

    const reopened = new StatutoryCaptureStore(root, { fetch, now: () => at }).inspect('tx-order-0117');
    expect(reopened?.state).toBe('CAPTURED');
    expect(reopened?.acquisition?.contentDigest).toBe(captured.acquisition?.contentDigest);
    expect(reopened?.integrity).toBe('RECOMPUTED_LOCAL');
  });

  it('replays history without recontacting the regulator, even with collection disabled', async () => {
    await store.capture(request(), true);
    fetch.mockClear();
    const replayed = await store.capture(request(), false);
    expect(replayed.state).toBe('CAPTURED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails without an acquisition when the response is not a media type this rail can hand to a grammar', async () => {
    fetch.mockResolvedValueOnce(fetched(Buffer.from('%PDF-1.7'), 'application/pdf'));
    const result = await store.capture(request(), true);
    expect(result.state).toBe('FAILED');
    expect(result.receipt?.failureCode).toBe('FETCH_FAILED');
    expect(result.acquisition).toBeNull();
  });

  it('records a failed fetch as a run that happened, with no evidence and no invented observation', async () => {
    fetch.mockRejectedValueOnce(new SourceConnectorError('SOURCE_NETWORK_FAILED', 'no'));
    const result = await store.capture(request(), true);
    expect(result.state).toBe('FAILED');
    expect(result.receipt?.failureCode).toBe('FETCH_FAILED');
    expect(result.observations).toBeNull();
  });

  it('refuses to reuse a request ID for a different document', async () => {
    await store.capture(request(), true);
    await expect(store.capture(request({ documentPath: '/company/documents/other.txt' }), true))
      .rejects.toMatchObject({ code: 'SOURCE_REQUEST_CONFLICT' });
  });

  it('keeps its history and its budget in a namespace the census connector does not share', async () => {
    await store.capture(request(), true);
    expect(STATUTORY_ADAPTER.captureRoot).toEqual(['statutory-captures']);
    expect(STATUTORY_ADAPTER.sourceId).toBe('statutory-filing');
    expect(store.inspect('tx-order-0117')?.state).toBe('CAPTURED');
  });
});
