# Repository consolidation verification — 2026-09-12

This records local integration checks, not a release certificate or provider
qualification. The original O checkout was not modified. Its later reasoning
edits remain separate from the frozen import documented in
[the reasoning workflow](REASONING_WORKFLOW.md).

## Reconciled boundaries

- Preserved authenticated terminal scope/projection refusals, exact reviews,
  durable PostgreSQL jobs/receipts and current object-publication history.
- Added the remote terminal-ledger SQL guard tests; kept the durable read sink
  instead of the competing process-memory recorder/proposal writer.
- Adapted internal shell access to coexist with terminal Bearer authentication.
  Basic credentials cannot become an agent, reviewer or execution grant.
- Added explicit web/worker/publisher packaging without startup migrations or
  source collection. Python research runtimes remain separate.
- Imported optional operator reasoning/commercial tools from a consistent source
  snapshot, with hosted processing disabled and no terminal execution authority.
- Added request-scoped replay verification reuse and explicit corpus indexes.
- Ported the regulatory-manager handoff and review-only board worker; corrected
  PDF-link quarantine, result-readback-before-ACK and agency-name bound consistency.
- Documented the existing agent stable and noticeboard without claiming its
  caller-selected local identities provide production agent authentication.

## Focused evidence

These overlapping checks are not additive to a subsequent full suite:

| Check | Observed result |
| --- | --- |
| Replay/runtime/corpus/index/site-atlas port | 112 tests passed across six files |
| Optional commercial/reasoning tooling | 229 tests passed across nine files, including actual child-process interruption and competing dispatch |
| Imported terminal SQL ledger guards | 30 tests passed |
| Native Rust kernel | 29 tests passed |
| Build-only/offline operator entrypoints | Terminal service and preflight compile; commercial help, reasoning preview and context-search preview succeed; zero provider requests |
| One-sample 63-version replay benchmark | Fresh read: 63 Rust launches / 3624.4 ms; save: 64 launches / 3581.4 ms; previous versions unchanged |

The prior integration expected 192 launches for that save. The sample verifies
launch reduction, not a statistically established speedup; no comparable old-code
timing run was measured in this consolidation. Fresh reads do not trust unchecked
cached state. Scope-local reuse includes executable identity and verified digests.

## Combined verification

The first combined run found a non-canonical commercial-agent hash and an
unrelated `.test.mjs` source included in production output traces. One real-Rust
history-capacity test also exceeded its 60-second deadline while the full suite
and production build ran concurrently. The hash now uses shared canonical JSON;
new tests verify key-order invariance and input-change sensitivity. The production
trace exclusion now covers every test-source extension already refused by the
unchanged audit, with a regression using Next's own matcher.

The unchanged history test passed alone in 19.350 seconds, and its complete
33-test file passed. The corrected full suite then ran without a competing build,
under UTC with `--maxWorkers=2 --minWorkers=1`: **309 files passed; 7,062 tests
passed and 6 skipped**, in 612.88 seconds. No test timeout or replay assertion was
weakened. The Python noticeboard client separately passed all 11 tests.
All six skips are operator-bootstrapped real GAT-engine checks; they do not
establish qualification of that external scientific runtime. Final root
typecheck and lint passed. Final packaging checks passed: nine deployment tests
and five build-trace tests, with scoped lint repeated after the smoke repair.

The fresh production build passed all **102 app output-trace audits**. Its first
access smoke exposed stale `/operations` and `/api/runtime` assumptions inherited
from O. The smoke now checks the actual `/control` page and `/api/production`
availability response; a CRLF-compatible source-inventory regression guards those
positive targets. No runtime metrics route was added or qualified. Both final
smoke modes passed **52 HTTP assertions each**, checking Basic/Bearer separation,
origin/forwarding refusals, no-store responses and forged reviewer refusal. The
second mode uses container URL metadata with a forced loopback listener. Owned
children exited, temporary state was cleaned up, and outbound connections were
refused throughout.

The coordination browser suite passed **17 checks**, with one desktop skip of a
mobile-only case, against the production build in Edge Chromium. It covered the
stable, scoped fixture inbox, local handoff/reply/ACK interactions, desktop/mobile
layout and accessibility. Its write scenarios use an isolated browser-backed
ledger; they are not evidence of authenticated production board persistence.
The whole browser suite was not rerun in this consolidation; the separate real
terminal-browser/process qualification below covers the new shared backend path.

Delivery remains on `codex/terminal-control-contract`. The default branch was not
advanced, no force push was used, and the active O checkout was left untouched.

The terminal/object/Iceberg process qualification completed successfully after
restoring `tools/` and `deploy/` to this partial checkout's sparse patterns. It
used five backend processes, an abrupt kill after a committed mining claim, an
abrupt kill after object creation before acknowledgement, and a real bounded
mining subprocess. JavaScript, native same-origin fetch, the standalone CLI and
the built-in workbench in Edge Chromium exercised the shared interface. Recovery
preserved the earlier object bytes and Iceberg snapshot, read back from a fresh
process, acknowledged in SQL, and retained the original result after correction.
The final ledger contained two proposals, reviews, jobs and results, with three
receipts, attempts and reconciliations. This was **fixture-only**, using local
object storage, PGlite and a local SQLite Iceberg catalog—not managed PostgreSQL
or Exoscale SOS.

## Not qualified by this work

No Linux container build/run, Exoscale provisioning, live database connection,
managed backup restoration, real-data lake publication, customer delivery,
hosted Sakana request or real TreeQuest execution was performed. Cloud credentials
and operator artifact directories were not copied into the repository. Hosted CI
results must be inspected separately; local checks are not a claim that CI passed.

The nested paper-trading terminal and legacy observation adapters remain outside
the active OS runtime, explicitly recorded in the integration map. No source
checkout or historical branch was deleted.
