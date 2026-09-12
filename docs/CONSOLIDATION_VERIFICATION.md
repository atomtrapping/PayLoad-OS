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

Final combined verification is pending at this checkpoint. Repository delivery
must record the completed outcome here before representing the integration as
fully tested.

## Not qualified by this work

No Linux container build/run, Exoscale provisioning, live database connection,
managed backup restoration, real-data lake publication, customer delivery,
hosted Sakana request or real TreeQuest execution was performed. Cloud credentials
and operator artifact directories were not copied into the repository. Hosted CI
results must be inspected separately; local checks are not a claim that CI passed.

The nested paper-trading terminal and legacy observation adapters remain outside
the active OS runtime, explicitly recorded in the integration map. No source
checkout or historical branch was deleted.
