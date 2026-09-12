# Authenticated coordination — verification record

Date: 2026-09-12. Integration branch: `codex/terminal-control-contract`.
Baseline: `c5c89ebe86504ddcfc88cf15088fe5e32b3f9ff4`.

## Implemented boundary

The shared `coordination` command runs through the existing authenticated terminal
endpoint, PostgreSQL pool and execution-ledger readers. Durable board membership
binds the acting participant; registration cannot grant permission. Immutable
definitions, messages, ACKs and operator configuration events have explicit
versioned schema installation, bounded readback and exact retry semantics.

The built-in stable and board have an explicit authenticated mode. JavaScript and
Python clients use the same command. Typed job/result references recheck existing
owner/reviewer and current source permissions; board ACKs never claim, approve,
execute or complete jobs. There is no added scheduler or automatic worker launch.

## Evidence and limits

- `src/coordination/database.test.ts` exercises file-backed PostgreSQL-engine
  storage, immutable guards, rollback, duplicate requests, participant ownership,
  revocation, pagination, and schema/digest validation. Malformed rehashed
  declarations and whitespace drift in retained messages refuse without repair.
- `src/coordination/service.test.ts` uses real terminal authentication, terminal
  service, fixture source and file-backed PGlite. Distinct principals exchange
  messages; a retained result message is recovered after database close/reopen
  before the original request is ACKed. Repeated writes/ACKs preserve identities
  and timestamps. Shared board membership does not bypass mining-result ACLs.
- `src/coordination/terminalLinks.test.ts` checks exact job/action/result/receipt
  bindings, correction projections, current permission and existing reviewer
  access. Linked summaries expose no raw result or receipt bodies.
- `src/coordination/responseBounds.test.ts` uses real service/repository hydration
  with controlled SQL rows and terminal reads: 200 near-limit definitions retain
  their complete roster, and 50 near-limit messages with large correction lists
  paginate within the byte budget without loss, including 403/404 withholding.
- Authenticated UI tests cover memory-only credentials, explicit connection,
  stale-response cancellation, fixed identities, bounded transport, uncertain
  write retries and exact readback before ACK. Browser tests intercept API calls
  with synthetic responses; they do not qualify a live PostgreSQL deployment.
- JavaScript tests cover the existing Bearer HTTP boundary and client envelopes.
  Python standard-library tests use controlled transports. These are not a claim
  that two independent live terminals have operated a managed backend.
- Operator configuration is a separate CLI, not a terminal capability. Its file
  reader limits actual bytes, rejects invalid UTF-8 and refuses unknown fields.
  Declared audit labels do not independently authenticate the database operator.

The embedded engine serializes transactions inside one process. Close/reopen and
lost-response simulations do **not** prove abrupt-process recovery, independent
PostgreSQL connection contention, Exoscale TLS, least-privilege deployment roles,
provider backup restoration or production availability.

## Verification commands

Observed locally:

- Full regression: **7,139 passed, 6 skipped, 316 files**, 586.89 seconds.
  This run preceded the final stored-whitespace readback guard.
- Final focused coordination pass after that guard: **78 passed, 7 files**,
  60.22 seconds, including the new regression and real terminal integration.
- Final TypeScript and repository ESLint checks passed.
- Deployment/trace-policy tests: **15 passed**. Python coordination clients:
  **15 passed** (authenticated and preserved legacy clients).
- Production build passed; all **102 app route traces** passed the runtime-file
  audit. Built-app access smoke passed **104 HTTP assertions** across loopback
  and container-metadata configurations with synthetic credentials.
- Desktop/mobile coordination browser tests: **21 passed, 1 skipped**, 28.4
  seconds, using installed Edge. This includes all four new authenticated-page
  checks; the skip is the existing desktop exclusion of a mobile-only case.

The test harness reports Next's existing `next start`/standalone warning; this
does not establish container-image execution. No Docker or provider deployment
was used for these checks.

Run from the repository root with installed dependencies and `TZ=UTC`:

```sh
npm run typecheck
npm run lint
npm test -- --maxWorkers=2 --minWorkers=1
node --test scripts/deployment.test.mjs scripts/build-traces.test.mjs
python -m unittest discover -s tests/python -p '*coordination_client.py' -q
npm run build
npm run test:access-smoke
npx playwright test tests/e2e/coordination.spec.ts tests/e2e/coordination-authenticated.spec.ts --project=desktop --project=mobile --workers=2
```

Use an installed Chromium-compatible browser through `PW_CHROMIUM_PATH` where
required. Packaging tests reject the administrative entrypoint in web traces;
the CLI also bundles and refuses a missing operator command before database setup.

## Deployment standing

No live migration, membership grant, worker launch or deployment was performed.
`PAYLOAD_COORDINATION_DURABLE` remains `0` by default. Existing sandbox histories
and regulatory/contract/build-inspection workers are preserved and are not
automatically migrated. Follow [the coordination contract](AGENT_COORDINATION.md)
for explicit operator setup. Next: dedicated managed-PostgreSQL qualification and
deliberate adoption by one existing worker, retaining execution-ledger authority.
