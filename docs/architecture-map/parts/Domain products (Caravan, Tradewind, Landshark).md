---
title: "Domain products (Caravan, Tradewind, Landshark)"
status: "THE THREE FLAGSHIP PRODUCTS · CARAVAN ONLY HAS A CORPUS"
group: "Firm, domain products and customers"
tags:
  - architecture-map
  - layer/firm
---

# Domain products (Caravan, Tradewind, Landshark)

**State:** `THE THREE FLAGSHIP PRODUCTS · CARAVAN ONLY HAS A CORPUS`  
**Group:** Firm, domain products and customers  
**Map:** [[Payload OS Architecture]]

> The three flagship products, each an API delivered as an HTTP feed and MCP tools over one provenance-bearing corpus. Caravan (logistics, freight, cargo, supply-chain movement) is the only one with a corpus here, and it is a committed demonstration; Tradewind (markets, pricing, risk) and Landshark (parcels, zoning, entitlements) are declared and empty. Payload OS is not among them: it is the internal terminal over the backend.

## What it is

- Caravan carries every fixture: the `caravan.specialty-cargo` demonstration corpus (three releases, nineteen records, two retractions, seven sources) and the Carrier candidate contract.
- Tradewind and Landshark appear in the product control so their absence is stated, not implied.
- Founder correction, 2026-09-06: Payload OS is the internal terminal that operates, monitors and navigates the backend. It is not a platform sold above the three, and it is not a fourth API.

## Where it lives

- `src/domain/domains.ts`
- `src/fixtures/caravan/` — release, profile, cases
- Top bar domain-product control in `src/components/shell/AppShell.tsx`

## Boundaries

- Payload OS is not a product and is not sold. Historical `PayloadOS` naming is an ancestor, not a rename instruction.
- Cross-domain connections require explicit evidence-bearing mappings, never matching labels.

## Connects to

- → [[Customers and distribution channels]] — distribution
- ← [[Notation Systems and Payload OS]] — one platform, three domains

## Open questions

- [ ] What is the first Tradewind or Landshark source whose rights are actually clear?
- [ ] Which corpus objects are shared across the three products, and which are domain-specific?

## Notes

_Brainstorm here._
