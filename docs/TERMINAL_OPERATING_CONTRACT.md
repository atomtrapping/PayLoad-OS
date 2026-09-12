# Terminal operating contract — integration qualification

Status: local integration; not deployed or production-qualified. Date: 2026-09-12.

The built-in `/control` workbench and `clients/javascript/terminal-cli.mjs` use
the same `POST /api/v1/terminal` protocol, `payload.terminal.v1`. Neither client
owns authorization, corpus storage, approvals, job execution or result history.
The first executable method is a bounded evidence-concentration calculation
under the existing `discovery.run-workload` capability. It is not arbitrary code,
LLM inference, source acquisition, admission or customer delivery.

## Operating path

1. Authenticate with an operator-issued bearer credential and `discover`.
2. `pin` an exact release. Inspect its digest and permitted standing-record subset,
   including selected and withheld counts. Missing permissions are not widened.
3. `submit` the release, snapshot digest, compiled method digest, exact parameters,
   budgets and idempotency key. The backend persists a proposal and decision packet.
4. An explicitly configured reviewer `review`s that exact action digest. Approval
   queues work; denial remains possible after a source or method becomes unavailable.
5. A separate backend worker claims a durable job and runs the fixed bounded process.
6. `job`, `jobs` and `result` return state, immutable cited results and a retained
   per-terminal retrieval receipt. A correction names the earlier job and reason,
   uses a later release vintage, and passes the same review/execution path.

The job owns one existing governance proposal, decision packet, authorization,
operation and attempt history. The additional read-event ledger records governed
reads; it does not create a second proposal for mining or replace result receipts.
Unknown tools, malformed requests and authentication failures are not represented
as successfully persisted read events.

## Data and permission boundaries

- Server configuration binds principal, terminal, class, purpose, scope and review
  authority. Request JSON cannot select them. Two terminals may share a principal
  only with matching authority and scope; each has a distinct credential.
- Strict tool arguments, authoritative release ownership, collection filtering,
  and explicit projection checks close the reported corpus-override and public
  counterparty-projection bypasses. Receipt/dispatch/ruling aliases are checked too.
- Mining currently requires `FIRM_INTERNAL`, `internal_research`, and source
  grants for both retrieval and derivation. Retention deadlines also apply.
- Rights are re-read from the configured source's release schedule before execution,
  after computation and before result access. This is not an external licence
  revocation service or an automated retention/deletion system.
- Canonical input fingerprints cover full records. Output fingerprints cover the
  model, horizon, claims and exact lineage; missing lineage refuses rather than
  silently disappearing. Result citations include each retained record digest.
- `NOT_VALIDATED` and `fixture_only` travel with results. Concentration counts
  registered sources, not empirically independent sources. Withheld records make
  this a subset finding, not a complete-release conclusion.
- Admission now requires a complete serving projection before persistence. A
  harvester that supplies no projection refuses explicitly; this increment does
  not make that remaining harvester path operational by inventing one.

## Durability and limits

Production code uses the existing PostgreSQL pool and corpus tables. Schema
installation is an explicit operator command, never an HTTP side effect. An
unversioned pre-existing governance schema refuses rather than being overwritten.
Local qualification uses file-backed PGlite with real schema/guards, not a claim
of a successful managed-PostgreSQL or Exoscale installation.

Exact owner/key retries return the same job; changed requests under that key
refuse. A job retains exact inputs, method identity and review digest. Claims have
a 30-second lease and at most three attempts. Claim tokens fence late workers.
Result insertion, attempt reconciliation and job completion commit atomically.
Job bindings, results, read events and retrieval receipts are immutable.

Recovery here is valid only for pure computation with an atomic database result:
an expired claim with no committed result can be retried. It must not be reused
unchanged for payments, source writes, object publication or external effects.

Default ceilings are 1,000 records, 1 MiB input/output, 5 seconds computation,
100 pending jobs and 50 listed jobs per page. Requests are at most 64 KiB with a
10-second total body-read deadline. Corpus compatibility reads also refuse at
their explicit history limits; pages are transaction-consistent per request,
not a cross-request cursor snapshot. Job lists do not hydrate retained inputs.

`PAYLOAD_EXECUTION_PROFILE=conserve` lowers child concurrency to one and database
connections to two per process. Normal ceilings are four child processes, two
production workers, two kernel workers and ten database connections. Operator
overrides can lower ceilings, not raise them. Configure all service instances
consistently. Database claims cap this mining queue across instances; child
measurements and pool limits remain per-process, not host-wide capacity.
`discover` exposes those bounded process observations to internal callers.

## Local operator setup

Use an isolated development database and separately owned migration credentials.
Do not point a first qualification at a production database.

```text
npm ci
npm run kernel:build
npm run production:build
npm run terminal:build
npm run terminal:service -- migrate
npm run terminal:service -- worker
```

Run the web application separately with `npm run dev` (loopback by default),
then open `/control`. The existing corpus schema and actual source configuration
must already exist; the terminal migration neither fabricates nor admits records.
The worker artifact `.stamp/terminal-mining-worker.cjs` must be built once and
mounted read-only with identical bytes in the web and worker working directories.
It is intentionally not included in Next's standalone trace. Rebuilding changes
the method digest and refuses execution of proposals bound to older bytes.

Supply `PAYLOAD_TERMINAL_PRINCIPALS` only to the backend as a JSON array of:

```text
principalId, terminalId, displayName, kind, terminalClass, purpose,
corpusScope, canReview, tokenSha256, expiresAt
```

Use independently generated high-entropy URL-safe bearer tokens, 32–256 characters;
store only their SHA-256 digests in that configuration. Do not commit tokens or
put them in URLs, command arguments, screenshots or browser storage. The widget
keeps its token in memory and clears retained responses when disconnected.
The CLI reads `PAYLOAD_TERMINAL_TOKEN` and `PAYLOAD_TERMINAL_ORIGIN` from its
environment; it allows HTTPS, or HTTP only on loopback. Its optional argument
is a local JSON command file. With no argument it discovers capabilities:

```text
npm run terminal:cli
```

Internal deployment requires `PAYLOAD_DEPLOYMENT_MODE=internal`,
`PAYLOAD_DB_TLS_MODE=verify-full`, an absolute `PAYLOAD_DB_CA_FILE`, and explicit
database connection credentials. TLS verifies CA and hostname; strict-mode URL
query overrides are rejected. These checks have local tests, not an observed
Exoscale handshake. An authenticated terminal endpoint does not secure every
legacy/demo route: enforce private ingress and whole-application access before
exposing this installation.

## Reconciliation record

Integration branch: `codex/terminal-control-contract` in the isolated
`audit-payload-os` checkout. The original dirty `O` tree remains untouched.

- Claude base: `b4e857cc4a5ee3c1ef97396323e899956382bb91`.
- Local O base: `07c4695`, plus its preserved uncommitted work.
- Claude advanced during integration to `0e3b15c3ad5ae3ff2478ff0ad027c67227b57d56`.
  Its vocabulary/read-ledger changes are selectively reconciled; its ephemeral
  demonstration store and generic proposal writer are not made the HTTP backend.
  Our stricter boundary protections are retained instead of replacing `serve.ts`.
- Carried/reconciled from O: admission projection checks, bounded consistent corpus
  reads, shared process limits, bounded request reader and verified database TLS.
- Preserved in O, not claimed integrated here: SOS/publication-outbox experiments,
  deployment packaging/access proxy, Sakana/Iceberg/GraphRAG pilots and notation
  replay optimization. These require their own compatibility and recovery gates;
  neither tree has replaced the other wholesale.

## Qualification and remaining acceptance

`npm run terminal:qualify` exercises the actual built-in workbench in Chromium,
local HTTP/backend processes, the bounded worker, hard interruption, lease
recovery, an independent CLI, exact results and a reviewed later-vintage correction. Fixtures and ephemeral
test credentials are explicit. Unit tests additionally cover ownership, scope,
idempotency races, immutable SQL guards, retention refusal and stale review denial.
See `TERMINAL_INTEGRATION_VERIFICATION.md` for the observed run, not just the command.
The full local suite passed 6,487 tests (six opt-in GAT checks skipped); ten
desktop/mobile capability checks and the production build also passed.

Before production acceptance: reconcile the remaining deployment/storage changes;
qualify the migration against managed PostgreSQL and its restricted runtime role;
verify private ingress/TLS, backup restoration and multi-instance recovery;
select a genuinely permitted real corpus and correction; define retention and
delivery obligations. Object publication needs its own durable outbox and verified
acknowledgement. Iceberg, GraphRAG and Sakana remain adapters behind this contract,
not alternative owners of authority, storage or execution history.
