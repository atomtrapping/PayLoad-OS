# The control plane a terminal plugs into

PayLoad OS is the shared data-control and mining system. NotationsOS is its
built-in navigator, not its only possible terminal. A second terminal uses the
same permission-scoped reads, exact reviewed requests, durable jobs and results.
See [the operating contract](TERMINAL_OPERATING_CONTRACT.md) for commands and
[repository consolidation](REPOSITORY_CONSOLIDATION.md) for ownership.

## Three distinct surfaces

| Surface | Identity and execution boundary |
| --- | --- |
| Authenticated HTTP `/api/v1/terminal` | Operator-registered Bearer principal; current permissions, pinned release, exact reviewed mining action, budgets, PostgreSQL jobs and read receipts |
| Governed MCP reads | Session/purpose/scope decision through `src/mcp/serve.ts`; stdio identity is locally declared, not remote credential authentication |
| Legacy navigator/feed routes | Existing demonstrations and internal tools; internal deployment adds Basic shell ingress. Basic is not a terminal reviewer or execution grant |

Do not interpret a declared MCP session or a Basic-authenticated page as an
authenticated terminal principal. Hosted deployment is not established by these
local implementations.

## One vocabulary and capability map

`src/domain/terminalVocabulary.ts` holds terminal classes, purposes and outcomes.
`terminalPlane.ts` decides standing; `capabilityRegistry.ts` describes the
apparatus and `/capabilities` draws that same registry. The registry includes
unwired capabilities: a description is not an executable API.

The generic capability surface distinguishes:

- `READ`: permit a scoped answer only under an eligible purpose.
- `OPERATE`: return a proposal description; the generic surface does not execute it.
- `ADMIT`: refuse outside the firm's class; class standing alone does not admit bytes.

The authenticated terminal service implements one bounded mining method through
explicit submit/review/status/result commands. It does not make every described
operation remotely executable. Optional reasoning and specialist experiments
remain outside this execution contract until deliberately adapted.

## Scope and projection are resolved, not asserted by callers

The boundary validates strict tool arguments and copies the session before its
first asynchronous lookup. A release, ruling, receipt or event is resolved to its
actual corpus; an extra caller argument cannot override that ownership.
Unresolved ownership refuses. Collection reads are restricted to the session's
corpora. A caller cannot mutate an in-flight session to widen its authority.

A public session defaults to `PUBLIC_RULING`; an explicit request for the
counterparty projection refuses. Both the tool entrypoint and the corresponding
capability entrypoint apply these checks. Invalid, expired or not-yet-open session
times refuse rather than extending a declaration.

These repairs reconcile the extra-corpus-argument and public-projection bypasses
identified in the earlier terminal boundary.

## Durable asks and exact operations

`src/db/terminalLedger.ts` preserves the terminal capability/session/call schema
and SQL guards. `src/terminal/readLedger.ts` adds immutable authenticated session
bindings and writes READ events into the shared PostgreSQL history. A failed
required write withholds the result; it is not silently downgraded to an
unrecorded successful call.

The execution path retains exact input, method and action commitments. A HUMAN
or POLICY principal reviews the digest; an agent cannot authorize its own work.
Claims are durable, bounded and fenced. Results, optional object publication jobs
and later lake acknowledgements reuse that same service state. There is no
second process-memory proposal recorder standing in for this history.

Qualification uses synthetic releases. A valid foreign key and successful local
job do not establish real-data source permission or a completed customer delivery.

## Verification locations

- `src/mcp/serve.test.ts`: argument overrides, public projection, resource
  ownership, collection scope, unresolved objects and mutation races.
- `src/domain/terminalPlane.test.ts`: standing, purposes, time windows and
  generic capability outcomes.
- `src/db/terminalLedger.test.ts`: direct SQL registry/session/call/proposal guards.
- `src/terminal/readLedger.test.ts`: authenticated immutable receipt persistence,
  concurrency, upgrades, restart and rollback.
- `src/terminal/service.test.ts`: exact review and durable work, fail-closed
  recording and correction-sensitive reads.
- `src/access/access.test.ts`: shell/terminal authentication separation and
  internal-origin handling.
- `tests/terminal/qualification.mjs`: built-in widget and independent client,
  actual process restarts, interrupted publication and later-vintage correction.
- `tests/e2e/capabilities.spec.ts`: navigator registry rendering.

See [consolidation verification](CONSOLIDATION_VERIFICATION.md) for observed runs,
not historical counts copied forward.
