---
title: "Domain products (Caravan, Tradewind, Landshark)"
status: "THE THREE FLAGSHIP PRODUCTS · ALL THREE CARRY A CORPUS"
group: "Firm, domain products and customers"
tags:
  - architecture-map
  - layer/firm
---

# Domain products (Caravan, Tradewind, Landshark)

**State:** `THE THREE FLAGSHIP PRODUCTS · ALL THREE CARRY A CORPUS`  
**Group:** Firm, domain products and customers  
**Map:** [[NotationsOS Architecture]]

> The three flagship products, each an API delivered as an HTTP feed and MCP tools over one provenance-bearing corpus. All three now carry a committed demonstration corpus served by one corpus-generic feed: Caravan (logistics, freight, cargo, supply-chain movement) is the deepest, with cases, rulings and captured artifact bytes; Tradewind (markets, pricing, risk) and Landshark (parcels, zoning, entitlements) carry records, releases, rights and one retraction each, with no captured bytes. NotationsOS is not among them: it is the internal terminal over the backend.

## What it is

- Caravan is the deepest line: the `caravan.specialty-cargo` demonstration corpus (three releases, nineteen records, two retractions, seven sources), the cases and rulings, the captured artifact bytes and the Carrier candidate contract.
- Tradewind carries `tradewind.freight-rates`: two releases, six records, one correction (`RET-TW-0001`), dry-bulk route settlements and a counterparty book position, with a supersession between the two releases.
- Landshark carries `landshark.terminal-parcels`: two releases, seven records, one withdrawal (`RET-LS-0001`), cadastral areas, zoning designations and entitlement standing.
- All three are `enabled` in `DOMAINS`, and each note ends "Not a live customer API." Being servable and being sold are different states and the copy keeps them apart.
- Founder correction, 2026-09-06: NotationsOS is the internal terminal that operates, monitors and navigates the backend. It is not a platform sold above the three, and it is not a fourth API.

## Where it lives

- `src/domain/domains.ts`, `src/domain/corpus.ts` — `CORPUS_PURPOSE` and `sourceUseRequests(domain)`
- `src/fixtures/caravan/` — release, profile, cases
- `src/fixtures/tradewind/release.ts`, `src/fixtures/landshark/release.ts`
- `src/fixtures/index.ts` — `FIXTURE_CORPORA`, the one list that makes a line servable
- Top bar domain-product control in `src/components/shell/AppShell.tsx`

## Boundaries

- NotationsOS is not a product and is not sold. It was called Payload OS until 2026-09-08; the brand renamed and the identifiers deliberately did not (`payload.*` schemas, `.payload/`, `PAYLOAD_*`, `payload-os-demo` in canonical URIs), because a name inside a sealed receipt is a fact about what was written.
- Cross-domain connections require explicit evidence-bearing mappings, never matching labels. The keys run across all three lines now and still resolve nothing: see [[Identity core and cross-line join]].
- Every corpus in `FIXTURE_CORPORA` is `fixture_only` and says so in every response. "Operational" means a line is served by the corpus-generic surfaces, not that it carries live data.
- Records on the two new lines carry no content digest, because no bytes were captured for them and a digest over bytes that were never seen would be a fabricated commitment.
- The rights vocabulary is per line: a Tradewind source is asked for permission to use its data in `TRADEWIND_CORPUS`, never in Caravan's. No fixture was given a Caravan purpose to make it deliver.

## Connects to

- → [[Customers and distribution channels]] — distribution
- ← [[Notation Systems and NotationsOS]] — one platform, three domains

## Open questions

- [ ] What is the first Tradewind or Landshark source whose rights are actually clear, and can be captured rather than declared?
- [ ] Which corpus objects are shared across the three products, and which are domain-specific?

## Notes

_Brainstorm here._
