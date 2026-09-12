# Terminal operating contract — integration qualification

Status: local integration; not deployed or production-qualified. Date: 2026-09-12.

The built-in `/control` workbench and `clients/javascript/terminal-cli.mjs` use
the same `POST /api/v1/terminal` protocol, `payload.terminal.v1`. Neither client
owns authorization, corpus storage, approvals, job execution or result history.
The first executable method is a bounded evidence-concentration calculation
under the existing `discovery.run-workload` capability. It is not arbitrary code,
LLM inference, source acquisition, admission or customer delivery.

Schema-v3 internal result custody and the optional fixture-only Iceberg bridge
extend this baseline. Their activation, recovery limits and follow-on evidence
are recorded in [Data infrastructure increment](DATA_INFRASTRUCTURE_INCREMENT.md).

Optional authenticated agent coordination uses this same endpoint through the
`coordination` command. Operator-assigned board membership binds declarations,
message authors and ACK actors; PostgreSQL retains the board alongside, not in
place of, the execution ledger. Typed job/result links recheck existing terminal
permissions. Board messages never approve, schedule or complete work. The feature
is disabled by default and has a separate explicit migration: see
[Agent coordination](AGENT_COORDINATION.md).

## Operating path

1. Authenticate with an operator-issued bearer credential and `discover`.
2. `pin` an exact release. Inspect its digest and permitted standing-record subset,
   including selected and withheld counts. Missing permissions are not widened.
3. `submit` the release, snapshot digest, compiled method digest, exact parameters,
   budgets and idempotency key. If `discover` supplies `mining.retentionDestination`,
   include that exact operator-owned identity; it is not a caller-selected URL or
   bucket. The backend persists a proposal and decision packet binding it too.
4. An explicitly configured reviewer `review`s that exact action digest. Approval
   queues work; denial remains possible after a source or method becomes unavailable.
5. A separate backend worker claims a durable job and runs the fixed bounded process.
6. `job`, `jobs` and `result` return state, immutable cited results and a retained
   per-terminal retrieval receipt. A correction names the earlier job and reason,
   uses a later release vintage, and passes the same review/execution path.
7. For opted-in results, a separate publisher reads the atomic outbox and verifies
   immutable object custody. An explicit local lake command may then index a
   published fixture result and verify its exact snapshot in a fresh process.

The job owns one existing governance proposal, decision packet, authorization,
operation and attempt history. The additional read-event ledger records governed
reads; it does not create a second proposal for mining or replace result receipts.
Unknown tools, malformed requests and authentication failures are not represented
as successfully persisted read events.

Object custody and lake projection acknowledgements are additional immutable
receipts, not replacement job histories or terminal retrieval receipts. Old
SQL-only jobs are not backfilled. Changing retention configuration does not
redirect an earlier reviewed action.

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
- New object custody and lake-index work also require the still-active, unrevoked
  execution grant for the exact reviewed action and current source-use permission.
  Expiry or revocation does not erase retained history or itself remove permission
  for otherwise authorized historical SQL result retrieval.
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
Schema v3 adds the object-publication outbox and derived lake-receipt table;
upgrades from v1/v2 preserve existing corpus and execution history.
Local qualification uses file-backed PGlite with real schema/guards, not a claim
of a successful managed-PostgreSQL or Exoscale installation.

Exact owner/key retries return the same job; changed requests under that key
refuse. A job retains exact inputs, method identity and review digest. Claims have
a 30-second lease and at most three attempts. Claim tokens fence late workers.
Result insertion, attempt reconciliation, job completion and any required pending
object-publication event commit atomically. Capacity is reserved before retained
work is claimed, so the event is not discarded after a successful result commit.
Job bindings, results, read events and retrieval receipts are immutable.

Recovery here is valid only for pure computation with an atomic database result:
an expired claim with no committed result can be retried. It must not be reused
unchanged for payments, source writes, object publication or external effects.

Object publication has a separate bounded recovery protocol. Expired or uncertain
claims remain discoverable; retries target only the same conditional create-only
key and identical bytes. Exact-version readback precedes a fenced SQL custody
acknowledgement. There are at most 1,000 outstanding events, leases of at most
30 seconds and at most ten attempts. Exhausted or integrity-failed work remains
visible as `BLOCKED`. Missing acknowledgement never proves that no external write
occurred.

The optional index uses real Iceberg v2/Parquet and a local SQLite catalog, but
accepts only fixture results. The bridge verifies actual object bytes, preserves exact source
knowledge time and requires fresh-process snapshot readback before an immutable
PostgreSQL projection acknowledgement. Snapshot IDs remain decimal strings.
Corrections append new identities while preserving earlier rows and snapshots.
Neither object custody nor this derived acknowledgement admits a corpus record.

Default ceilings are 1,000 records, 1 MiB input/output, 5 seconds computation,
100 pending jobs and 50 listed jobs per page. Requests are at most 64 KiB with a
10-second total body-read deadline. Corpus compatibility reads also refuse at
their explicit history limits; pages are transaction-consistent per request,
not a cross-request cursor snapshot. Job lists do not hydrate retained inputs.

`PAYLOAD_EXECUTION_PROFILE=conserve` lowers child concurrency to one and database
connections to two per process. Normal ceilings are four child processes, two
production workers, two kernel workers and ten database connections. Operator
overrides can lower ceilings, not raise them. Configure all service instances
consistently. Database claims cap the mining queue and separately cap active
publication claims across destinations; child measurements and pool limits remain
per-process, not host-wide capacity.
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

Retention is disabled by default. When explicitly configured, run the separate
`npm run terminal:service -- publisher` process against the same database.
The optional `terminal:lake` commands require a preprovisioned Python runtime
and dedicated local root. Follow the
[storage activation instructions](DATA_INFRASTRUCTURE_INCREMENT.md#activation-and-limits);
these paths do not migrate synchronous evidence history or enable customer export.

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
- At baseline commit `39d468b`, the O SOS/publication-outbox experiments,
  deployment packaging/access proxy, Sakana/Iceberg/GraphRAG pilots and notation
  replay optimization remained outside the integration. The subsequent schema-v3
  increment selectively implements terminal object custody and a new local
  fixture-only `tools/terminal_lake` bridge; it does not claim a wholesale port of
  those experiments. Deployment packaging/access proxy, Sakana, GraphRAG and
  notation replay optimization remain outside this increment. Neither tree has
  replaced the other wholesale.

## Qualification and remaining acceptance

`npm run terminal:qualify` exercises the actual built-in workbench in Chromium,
local HTTP/backend processes, the bounded worker, hard interruption, lease
recovery, an independent CLI, exact results and a reviewed later-vintage correction. Fixtures and ephemeral
test credentials are explicit. Unit tests additionally cover ownership, scope,
idempotency races, immutable SQL guards, retention refusal and stale review denial.
See [the baseline verification record](TERMINAL_INTEGRATION_VERIFICATION.md) for
the observed `39d468b` run, not just the command: 6,487 local tests passed (six
opt-in GAT checks skipped), along with ten desktop/mobile capability checks and
the production build. Those are baseline counts, not a claim about the expanded
schema-v3 suite. Current follow-on commands and observed results belong in
[Data infrastructure increment](DATA_INFRASTRUCTURE_INCREMENT.md#verification).
The `--storage` and `--lake` qualification modes extend the local path to object
custody and the fixture index; a successful local run is not remote deployment.

Before production acceptance: reconcile the remaining deployment changes;
qualify the migration against managed PostgreSQL and its restricted runtime role;
verify private ingress/TLS, backup restoration and multi-instance recovery;
select a genuinely permitted real corpus and correction; define retention and
delivery obligations. The durable object outbox and verified acknowledgement are
implemented; provider conformance, bucket/IAM and versioning policy, remote
catalog custody and production backup/recovery remain unqualified. The lake
bridge remains fixture-only. GraphRAG and Sakana are not ported by this increment;
future adapters must not become alternative owners of authority, storage or
execution history.
