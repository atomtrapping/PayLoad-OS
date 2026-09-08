import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOMAINS, PRODUCT_ROOT } from './domains';
import { FLAGSHIP_PRODUCTS, THESIS } from './product';

/**
 * The founder's current mandate: licensed data and analytics packages across
 * three product lines, with NotationsOS as the internal preparation terminal.
 * The earlier framing put NotationsOS above the three as a platform, which read
 * as though the platform were the product. These assertions keep it corrected.
 */
describe('three data-product lines with API delivery; NotationsOS is the internal terminal', () => {
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
    expect(FLAGSHIP_PRODUCTS.statement).toMatch(/boutique data and analytics packages the firm licenses/);
    expect(FLAGSHIP_PRODUCTS.delivery).toEqual(['HTTP feed', 'MCP tools']);
    // All three lines carry a demonstration corpus and are served by the same
    // corpus-generic feed. `enabled` means servable here, never live.
    expect(DOMAINS.filter((d) => d.enabled).map((d) => d.id)).toEqual(['CARAVAN', 'TRADEWIND', 'LANDSHARK']);
    for (const d of DOMAINS) expect(d.note).toMatch(/Not a live customer API\./);
    expect(FLAGSHIP_PRODUCTS.here).toMatch(/fixture_only/);
    expect(FLAGSHIP_PRODUCTS.here).toMatch(/Nothing here is a live customer API/i);
    expect(THESIS.platform).toMatch(/data-product lines/);
    expect(THESIS.platform).toMatch(/internal terminal/);
  });

  it('keeps the authoritative document in step with the data', () => {
    const doc = readFileSync(new URL('../../docs/ECONOMIC_ARCHITECTURE.md', import.meta.url), 'utf8');
    expect(doc).toMatch(/boutique data and analytics packages/);
    expect(doc).toMatch(/NotationsOS is the terminal, not a product/);
    expect(doc).not.toMatch(/NotationsOS is the shared production layer/);
  });
});
