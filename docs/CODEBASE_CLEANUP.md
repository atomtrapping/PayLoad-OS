# Codebase consolidation — 2026-09-08

Scope: the implementation based on `286436a` on `codex/payload-os-foundation`. This is a maintenance pass, not a change to the boutique-data mandate or a merge of the later frontend geometry branch.

## Removed

- Unused `firebase`, `firebase-admin` and `lucide-react` dependencies. npm pruned **205 package entries**; no retained version, integrity or resolved source changed. No new dependency was added.
- Unreferenced Firebase/Gemini applet scaffolding and the obsolete `bun.lock`. `package-lock.json` is the authoritative JavaScript lock; the native Cargo lock remains unchanged.
- The obsolete Cesium bundler alias. Earth still loads its pinned, same-origin engine assets and workers; Cesium itself remains required.
- An unused data-os wildcard barrel and a future-only connector declaration that duplicated the responsibility of actual acquisition contracts.
- Unreferenced domain constants/type-only placeholders, an unused permission wrapper, unused parameters, an unused status component and unused raised-surface CSS. Active research implementations and their tests remain.

Tracked deletions are recoverable through Git history. No operator evidence, retained package, untracked `artifacts/` or `docs/obsidian/` content was deleted.

## Tighter interfaces

| Boundary | Consolidation | Preserved contract |
| --- | --- | --- |
| Acquisition, Carrier parsing and recorded observations | Four duplicate-key scanners now share `data-os/json-keys.ts` | Caller-specific UTF-8/BOM policy, size bounds, errors and serialized bytes |
| Boutique operator input | Imports the bounded request-file reader directly, not the source CLI and command stores | Existing source CLI re-exports, request limits and sanitized errors |
| Source capture/normalization/build readback | One route-local helper for identifiers, configured root and safe failures | Separate response schemas, loopback gate, status codes and explicit non-claims |
| Case database adapter | Nonempty listing uses two reads, formerly `1 + 2N` | Per-case ruling history and current revision, missing results, fixture fallback |
| Corpus database adapter | Nonempty listing uses four reads, formerly `1 + 4N` | Per-corpus grouping and admission-aware hydration; invalid admissions still fail |
| HUD panels | Reuse the existing section-rule component | Identical markup and empty/null/zero behavior |

Batching removes redundant reads; it does not introduce pagination, transactional snapshots or a new row-order guarantee. Those remain separate requirements for a larger live catalog.

## Regression guards

- TypeScript now rejects unused locals and parameters. This is not a proof that every exported symbol is reachable.
- Architecture checks parse TypeScript rather than matching only single-quoted alias imports. Relative imports, re-exports, dynamic imports and type-only edges are distinguished.
- Source libraries and other CLIs may not import command entrypoints to obtain shared utilities. Entry scripts remain the command callers.
- Embedded-PostgreSQL tests check query counts, grouping, individual/batch equivalence, empty catalogs and invalid admission failures.
- Parser tests exercise escaped/nested duplicate keys, independent key scopes, deep nesting and replay-specific decoding boundaries.
- Ordinary notation-kernel browser checks write screenshots to isolated test output, not tracked documentation; existing published screenshots remain unchanged.

Null, omitted, zero, unknown, refused and unobserved remain distinct. Frozen fixture membership and historical package codecs were not unified or rewritten. The two retained FMCSA packages were reopened in separate CLI processes with their original digests; all 32 files in the source-qualification history were unchanged across inspection. No provider was contacted and no permission renewed.

## Verification

- Typecheck (including unused-code flags), lint, production build and deployment trace checks: passed.
- Full JavaScript/TypeScript suite: **4,947 passed**, 6 optional pinned-GAT checks skipped, across 207 test files. Report: ignored `.stamp/cleanup-unit-results.json`.
- Locked Rust kernel: **29 passed**. Python coordination/source-loader checks: **16 passed** using the bundled Python runtime.
- Desktop/mobile smoke, harvester and real Cesium Earth Twin: **85 passed**, one desktop-inapplicable mobile-layout check skipped.
- Enabled local production API/browser/spatial path: **4 passed**, one optional GAT execution check skipped.
- Real Rust-kernel desktop/mobile workspace: **10 passed**; no tracked screenshots changed.
- npm offline clean-install dry run and diff whitespace checks: passed. Independent read-only diff review found no actionable regressions.

No external GAT execution, deployed PostgreSQL service, provider call, customer delivery or performance SLA is claimed. Existing non-failing React test `act` and Next standalone-launch warnings remain; this cleanup does not disguise them as new failures or fix them by weakening assertions.
