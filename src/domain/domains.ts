import type { Domain } from './types';

/**
 * The product architecture:
 *
 *   Notation Systems
 *   ├─ Caravan   — API and MCP — logistics, freight, cargo, supply-chain movement
 *   ├─ Tradewind — API and MCP — markets, instruments, pricing, risk
 *   └─ Landshark — API and MCP — parcels, zoning, entitlements, development state
 *
 *   NotationsOS — the internal terminal that operates, monitors and navigates
 *                the backend those three are produced from. Not sold.
 *
 * The three APIs are the flagship products. NotationsOS is the instrument the
 * firm runs them from; this repository is that terminal. Caravan is the only
 * product with a corpus and a feed here; Tradewind and Landshark are declared
 * and empty.
 */
export const PRODUCT_ROOT = {
  company: 'Notation Systems',
  terminal: 'NotationsOS',
  terminalRole: 'Internal terminal: operates, monitors and navigates the backend. Not a customer product.',
  productsRole: 'Three APIs, delivered as HTTP feeds and MCP tools, are the flagship products.',
} as const;

export const DOMAINS: ReadonlyArray<{
  id: Domain; label: string; scope: string; enabled: boolean;
  /** How the product is delivered. All three are APIs and MCP tools. */
  delivery: 'API and MCP';
  note?: string;
}> = [
  { id: 'CARAVAN', label: 'Caravan', scope: 'Logistics, freight, cargo, supply-chain movement', enabled: true, delivery: 'API and MCP', note: 'The only product with a corpus here: a demonstration corpus served by the fixture feed under /api/v1 and the MCP tools. Not a live customer API.' },
  { id: 'TRADEWIND', label: 'Tradewind', scope: 'Markets, instruments, pricing, risk', enabled: false, delivery: 'API and MCP', note: 'Declared. No corpus, no feed, no profile in this repository.' },
  { id: 'LANDSHARK', label: 'Landshark', scope: 'Parcels, zoning, entitlements, development state', enabled: false, delivery: 'API and MCP', note: 'Declared. No corpus, no feed, no profile in this repository.' },
];
