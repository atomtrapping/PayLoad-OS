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
 * THE TERMINAL WAS CALLED PAYLOAD OS UNTIL 2026-09-08
 *
 * The brand renamed; the identifiers did not, and must not. `payload.*` schema
 * names sit inside sealed receipts that were digested under them, `.payload/`
 * is the operator's evidence root on disk, `PAYLOAD_*` are the collection
 * flags an operator has already set, and `payload-os-demo` is the authority
 * segment in every canonical URI the demonstration corpus carries — renaming
 * that alone would change every canonical identity and every digest over them.
 *
 * A name in a sealed receipt is not a brand, it is a fact about what was
 * written, and NOTHING MUTATES applies to it exactly as it applies to a
 * record. So the rename is brand text only, and a later pass that "finishes
 * the job" by renaming the identifiers would break replay of every capture
 * this system has performed.
 *
 * The three APIs are the flagship products. NotationsOS is the instrument the
 * firm runs them from; this repository is that terminal. All three lines now
 * carry a demonstration corpus and are served by the same corpus-generic feed
 * and MCP tools — which is what `enabled` means here and all it means. None of
 * them carries live data: every corpus in this repository is fixture_only and
 * says so in every response.
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
  { id: 'CARAVAN', label: 'Caravan', scope: 'Logistics, freight, cargo, and network exposure: dependencies, routes, and fulfillment risks', enabled: true, delivery: 'API and MCP', note: 'Three releases, seven lots, two retractions and an admission profile. The deepest of the three: the only line with cases, rulings and captured artifact bytes behind its records. Not a live customer API.' },
  { id: 'TRADEWIND', label: 'Tradewind', scope: 'Counterparties, materials, pricing, and commercial exposure: capabilities and comparisons', enabled: true, delivery: 'API and MCP', note: 'Two releases: settlement prices, one position and the route’s designated discharge point, with one correction. No case, no profile, and no artifact bytes were captured, so its records name their sources without a content digest. Not a live customer API.' },
  { id: 'LANDSHARK', label: 'Landshark', scope: 'Facilities, industrial sites, physical constraints, and observational evidence', enabled: true, delivery: 'API and MCP', note: 'Two releases: cadastral area, zoning, entitlement standing and published centroids for three parcels, with one withdrawal. One centroid states no precision and is deliberately unkeyable. No case, no profile, no captured bytes. Not a live customer API.' },
];
