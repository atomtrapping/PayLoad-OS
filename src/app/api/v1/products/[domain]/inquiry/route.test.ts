import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import * as adapter from '@/adapter/productWorkspace';
import { GET } from './route';

const request = (domain: string, query = '') => GET(new NextRequest(`http://localhost/api/v1/products/${domain}/inquiry?${query}`), { params: Promise.resolve({ domain }) });

describe('product inquiry JSON', () => {
  it.each(['landshark', 'tradewind'])('opens the same gated %s model as the desk', async (domain) => {
    const response = await request(domain);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.schema).toBe('notations.product-inquiry.v1');
    expect(body.fixtureOnly).toBe(true);
    expect(body.domain).toBe(domain.toUpperCase());
    expect(body.reading.answer).not.toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/TW-0102|TW-0103|1250000|EV-BOOK-HL-1180|candidates|considered/);
  });
  it.each(['release=a&release=b', 'validAt=2026-02-30T00%3A00%3A00Z', 'release=REL-TW-2026.09.01'])('returns a typed failure for %s', async (query) => {
    const response = await request('landshark', query);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).error).toMatch(/INVALID_QUERY|CORPUS_NOT_AVAILABLE/);
  });
  it('refuses an unknown product', async () => {
    const response = await request('other');
    expect(response.status).toBe(404);
    // The code is the contract; the body now also carries the feed's
    // attestation envelope, like every other route under /api/v1.
    const body = await response.json();
    expect(body.error).toBe('UNKNOWN_PRODUCT');
    expect(body.data_class).toBe('synthetic');
  });
  it('does not disclose backend errors or substitute a fixture on read failure', async () => {
    const spy = vi.spyOn(adapter, 'loadProductWorkspace').mockRejectedValueOnce(new Error('PRIVATE_CONNECTION_DETAIL'));
    const response = await request('landshark');
    expect(response.status).toBe(503);
    // The property this test protects is non-disclosure, so it is asserted
    // directly rather than by pinning the whole body: the private detail must
    // appear nowhere in what the caller receives.
    const body = await response.json();
    expect(body.error).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_CONNECTION_DETAIL');
    expect(body.data_class).toBe('synthetic');
    spy.mockRestore();
  });
});
