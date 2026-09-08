# Landshark and Tradewind — internal inquiry desks

Implemented starting slice: operators can open each product, select a release,
inspect accessible records, query both clocks, compare the same question in the
previous release, and reproduce the reading as a URL or JSON. These are internal
preparation/inquiry tools for Notation Systems' information products, not separate
customer SaaS platforms or trading terminals.

## Engage

Run the existing `npm run dev` workflow. Open `/landshark` or `/tradewind` from
the Products page, navigation rail or page search. The fixed product control
also switches between these desks. No new service, database or dependency is
required. Both use the configured `CorpusSource`; a failed store read does not
fall back to another corpus or silently replace database contents with fixtures.

| Desk | Current corpus | Useful first inquiry |
| --- | --- | --- |
| Landshark | `landshark.terminal-parcels` | Parcel `PARCEL-NL-0442`, `area.cadastral`; published area and its stated bounds |
| Tradewind | `tradewind.freight-rates` | Instrument `INST-TW-C5`, `price.settlement`; settlement at its own valid time |

1. **Open release** chooses an exact vintage and resets to a useful observation.
2. **Inspect** seeds the subject, field and valid time from an accessible record.
3. **Run inquiry** applies world time and knowledge time, both explicitly UTC.
   Milliseconds are retained. The knowledge clock is capped at the release cutoff.
4. **Selected reading** shows the returned record's provenance, evidence class,
   source-use schedule and standing, or a typed refusal. Inspecting an old record
   does not force it to be the current answer.
5. **Previous release** evaluates the same subject/field/world time against that
   vintage's own rights and knowledge cutoff. Different record IDs are not by
   themselves proof of correction; an unavailable answer is never a zero delta.
6. **Exact reading link / Inquiry JSON** reproduce the question with explicit
   release, subject, field, both clocks and question semantics. Versioned record
   feeds and manifests are the existing shared delivery interfaces.
7. **Explore spatial records** opens `/earth?release=<exact-release-id>`. The
   existing record picker and projection compiler use that release. The event,
   headline and cross-subject spatial-key layers are explicitly **NOT_EVALUATED**
   for this scope; their legacy helpers are not yet exact-release/gate-safe.

The released-observation table is the accessible inventory **at release cutoff**.
It is not filtered to an earlier inquiry clock; the selected reading is. A
record's current standing in a release does not imply current real-world validity.
Landshark centroids are not parcel boundaries, cadastral area is not buildable
area, and missing positional precision remains missing. Tradewind settlements
and stated exposure are not current quotes, valuations or orders.

## Interfaces and boundaries

- Pages: `/landshark`, `/tradewind`.
- JSON: `GET /api/v1/products/{landshark|tradewind}/inquiry`.
- Query keys: `corpus`, `release`, `record`, `subject`, `predicate`, `validAt`,
  `knownAt`, `question` (`WHAT_WE_HELD` or `WHAT_THE_SOURCE_KNEW`).
- Duplicate/malformed supported parameters refuse with `INVALID_QUERY`.
  Unknown or mismatched explicit selections do not fall back to defaults.
- JSON uses `notations.product-inquiry.v1`, `Cache-Control: no-store`, and safe
  error codes. This is a read model, not an authenticated commercial delivery
  receipt, new source licence, or authorization to redistribute data.
- Both desks share one server-side evaluator and view. Only delivery-gated
  records cross into the UI/JSON, under the existing `COUNTERPARTY_SHARED` seat.
  Raw query candidates and detailed rejected identities are not serialized.
  Unreadable/future history pointers are stripped after status is computed
  against complete history, so a private successor cannot resurrect an old claim.
- Existing Stream links resolve the selected release's owning corpus and redirect
  these domains to their desks. They do not pass either raw corpus to the legacy
  Caravan client explorer. The legacy explorer itself is not rewritten here.
- Earth resets its selections on source snapshot changes. Unverifiable or
  unsupported projection sources return an explicit unavailable state.

## Acceptance examples

| Inquiry | Expected reading |
| --- | --- |
| Landshark, `PARCEL-NL-0442 / area.cadastral`, world `2026-08-20T00:00:00Z` | `LS-0101`, 84,500 m² with stated bounds; same record across the two vintages |
| Landshark, `PARCEL-BR-1207 / entitlement.status`, same world time | Previous vintage: `LS-0112`, under review. Current vintage: `RETRACTED`, not refusal of planning permission |
| Tradewind, default current release | `TW-0202`, 19.05 USD/t at `2026-08-27T17:00:00Z`, not release-cutoff time |
| Tradewind, `POS-TW-1180 / exposure.notional`, world `2026-08-17T00:00:00Z` | Current: `TW-0201`, 1,312,500 USD. Previous: `NOT_DELIVERABLE`; restricted original value/identity omitted |
| Either desk, source-knowledge question | `QUESTION_NOT_ANSWERABLE`; these corpora lack the required source-publication clock |

Unit and component coverage lives beside `productWorkspace`, `ProductDesk`, the
inquiry route, Stream routing, shell navigation and Earth record selection.
Component tests use jsdom/fake globe engines, not a real-browser visual review.

Verification for this implementation: the complete suite passed 5,031 tests with
six existing GAT runtime skips (214 files). Type checking, lint, the production
build and runtime trace checks passed. Local read-only HTTP probes checked eight
desk/routing/Earth/history URLs and both inquiry JSON examples, including the
withheld Tradewind fields. No real-browser visual QA or live-provider acceptance
test was performed.

## Production boundary and next increment

The existing Landshark and Tradewind releases are **synthetic demonstration
corpora**, including their source registrations. Their manifests are computable,
but no underlying parcel/planning or market-source artifact bytes were captured
for these corpora. Database storage of a fixture does not make it live evidence.

This slice does not add parcel/planning or market connectors, production admission
profiles, scheduled refresh, genuine provider licences, package publication,
recipient delivery receipts or trading execution. The shared Production link is
an apparatus entry point, not a claim that these domain pipelines are complete.
Existing raw evidence and sealed releases are unchanged.

The next production increment is one selected source and record family per
product: a permitted acquisition, retained exact bytes, a defined parser and
observation schema, validation/admission through the existing machinery, then
two reproducible package vintages and an evidence-backed correction. Choose
source coverage, permitted uses and customer question before asserting a live
product. Reuse the shared custody/release/delivery machinery rather than inventing
independent Landshark and Tradewind backends.
