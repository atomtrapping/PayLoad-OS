import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOMAINS, PRODUCT_ROOT } from './domains';
import { FLAGSHIP_PRODUCTS, THESIS } from './product';

/**
 * The founder's correction of 2026-09-06: the products are three APIs, and
 * NotationsOS is the internal terminal over the backend that produces them.
 * The earlier framing put NotationsOS above the three as a platform, which read
 * as though the platform were the product. These assertions keep it corrected.
 */
describe('the three APIs are the products; NotationsOS is the terminal', () => {
  it('names three products, each delivered as an API and MCP', () => {
    expect(DOMAINS.map((d) => d.label)).toEqual(['Caravan', 'Tradewind', 'Landshark']);
    for (const d of DOMAINS) expect(d.delivery).toBe('API and MCP');
  });

  it('calls NotationsOS a terminal and never a product', () => {
    expect(PRODUCT_ROOT.terminal).toBe('NotationsOS');
    expect(PRODUCT_ROOT.terminalRole).toMatch(/internal terminal/i);
    expect(PRODUCT_ROOT.terminalRole).toMatch(/not a customer product/i);
    // The old shape must not come back.
    expect((PRODUCT_ROOT as Record<string, unknown>).platform).toBeUndefined();
    expect(JSON.stringify(PRODUCT_ROOT)).not.toMatch(/shared information-production system/i);
  });

  it('states the three as flagship products, with the honest state of each', () => {
    expect(FLAGSHIP_PRODUCTS.statement).toMatch(/Three APIs are the products/);
    expect(FLAGSHIP_PRODUCTS.delivery).toEqual(['HTTP feed', 'MCP tools']);
    // Only Caravan has a corpus here, and it is a demonstration.
    expect(DOMAINS.filter((d) => d.enabled).map((d) => d.id)).toEqual(['CARAVAN']);
    expect(FLAGSHIP_PRODUCTS.here).toMatch(/fixture_only/);
    expect(FLAGSHIP_PRODUCTS.here).toMatch(/Nothing here is a live customer API/i);
    expect(THESIS.platform).toMatch(/flagship products/);
    expect(THESIS.platform).toMatch(/internal terminal/);
  });

  it('keeps the authoritative document in step with the data', () => {
    const doc = readFileSync(new URL('../../docs/ECONOMIC_ARCHITECTURE.md', import.meta.url), 'utf8');
    expect(doc).toMatch(/The three APIs are the flagship products/);
    expect(doc).toMatch(/NotationsOS is the terminal, not a product/);
    expect(doc).not.toMatch(/NotationsOS is the shared production layer/);
  });
});
