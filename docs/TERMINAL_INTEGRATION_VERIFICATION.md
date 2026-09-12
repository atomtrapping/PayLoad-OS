# Terminal integration verification — 2026-09-12

This is an observed local engineering qualification, not a release certificate,
production admission, managed-PostgreSQL qualification or Exoscale deployment.
Qualification was performed in the isolated `codex/terminal-control-contract`
integration checkout. Repository delivery does not imply deployment or a merge
into O; the original O checkout was not overwritten.

## Findings addressed

| Finding | Change | Verification boundary |
| --- | --- | --- |
| Extra argument defeats corpus scope | Strict schemas; owned argument/session snapshots; ownership resolved from release/case/ruling/receipt/event | Positive authorized controls and negative override/alias/scope tests in `src/mcp/serve.test.ts` |
| Public request receives counterparty projection | Public projection default and explicit projection refusal | Public/default/explicit projection regression tests; internal legitimate reads retained |
| Proposals not executable or restart-safe | Exact retained request, input/method/action digests, existing governance ledger, explicit review, durable claims and fenced completion | File-backed SQL tests plus actual HTTP/backend restart and abrupt-kill qualification |
| Admitted rows cannot be served | Require serving projection before admitted persistence; no silent legacy-row hydration | Admission, statutory persistence and live corpus readback tests |
| Fingerprints fail to commit meaningful changes | Canonical full inputs and output/model/horizon/lineage commitments; unresolved lineage refuses | Discovery-engine mutation and missing-lineage tests |
| Retention overlooked during mining | Enforce deadline and source-expiry retention alongside retrieval/derivation grants | `src/terminal/mining.test.ts`, including exact deadline |
| Stale proposals cannot be denied | Current method/source prerequisites apply to approval, not denial | Changed binary and unavailable-source denial regressions |
| New read receipts risk duplicate governance | Shared PostgreSQL READ-event sink; no generic proposal writer; immutable authenticated session binding | v1→v2 upgrade, exact session conflict, concurrent calls, restart, rollback and immutable-row tests |

The security-fix workflow supplied independent investigation, exploit-oriented
regressions and one independent candidate review. The review found the retention
and stale-denial defects above; both were repaired and tested. This was not a
repository-wide penetration test. Existing unauthenticated legacy/demo routes
remain outside the new authenticated terminal endpoint and require ingress policy.

## Verification ledger

Final combined source results are recorded below after completion. The initial
full suite passed 6,468 tests and failed one new API-envelope structural check
(six skipped). That mismatch was repaired by routing the terminal protocol through
the central v1 response boundary, without falsely stamping database results as
the fixed synthetic demo corpus. The targeted 54-test API/auth rerun passed.

A subsequent full run overlapped a capability-status wording edit and was stopped
after its cached module disagreed with the updated assertion. Its partial totals
are not used as a final qualification. A fresh run against frozen source replaces it.

The focused combined authorization/read-ledger/service run passed 104 tests.
The retention/denial/kernel-runtime rerun passed 26. These counts overlap the
full suite and must not be added to it. The Rust suite passed 29 tests separately.

Final frozen-source verification:

| Gate | Observed result |
| --- | --- |
| Syntax/types/build | `npm run typecheck`, `npm run lint`, `npm run build`: passed; 57 static pages and runtime tracing guard passed |
| Security/compatibility boundary | Original override and projection triggers refuse; alias/mutation negatives and legitimate scoped controls pass in the complete suite |
| Full unit/component suite | **6,487 passed, 6 skipped; 285 files passed**, 504.90 seconds; UTC; process exit 0 |
| Native kernel | `npm run kernel:test`: **29 passed** |
| Built application browser checks | Capability map: **10 passed**, five desktop and five mobile, including accessibility and overflow assertions |
| Real operating workflow | `npm run terminal:qualify`: passed with the actual widget, independent CLI, four backend processes, crash recovery and correction |
| Diff hygiene | `git diff --check`: passed |

Machine-readable unit results: `.stamp/terminal-integration-vitest.json` (local
generated artifact, not committed). The six skipped tests are the existing
operator-bootstrap GAT integrations gated by `GAT_INTEGRATION=1`; this increment
does not qualify that separate engine. Existing React `act` test warnings and the
Vite CJS deprecation warning remain; they were not suppressed. The entire legacy
Playwright suite was not run locally; the targeted browser checks above were.

## Real process and browser qualification

Command: `npm run terminal:qualify`.

The default command requires a real Chromium browser and fails if one is
unavailable. `--no-browser` is a separately labelled process-only mode. On this
machine the full qualification used installed Microsoft Edge Chromium; no browser
was downloaded. Missing-browser behavior was also tested and failed explicitly.

The dedicated loopback backend serves the real `TerminalWorkbench` component and
the real `terminalHttp` handler. This is not a mocked response or intercepted
request. It is also not a claim that the complete Next.js application was driven
end to end; the capability-page browser checks cover that built application separately.

Observed full qualification:

- Four real backend processes and three clean closures.
- One abrupt kill after a committed RUNNING claim, before result publication.
- Real 30-second lease expiry and recovery, with a separately spawned bounded worker.
- Browser authenticate/discover/pin/submit, explicit human-credential review,
  status/result retrieval, and later-vintage correction.
- Identical cited result through the built-in widget, independent JavaScript
  client and separately spawned standalone CLI; distinct terminal receipts.
- Earlier result and both original retrieval receipts unchanged after correction.
- Two proposals, two reviews, two jobs, two results, three retrieval receipts,
  three execution attempts and three reconciliations. No duplicate committed result.
- Browser token and responses cleared on disconnect; no token in cookies or web storage.

All data and identities were disposable fixtures. The correction is an explicitly
reviewed later fixture vintage, not an asserted real-world source correction.
No source-use grant was broadened to make qualification pass.

## Reproduction commands

```text
npm run kernel:test
npm run kernel:build
npm run production:build
npm run terminal:build
npm run typecheck
npm run lint
npx vitest run --maxWorkers=2 --minWorkers=1 --reporter=default --reporter=json --outputFile.json=.stamp/terminal-integration-vitest.json
npm run build
npx playwright test tests/e2e/capabilities.spec.ts --project=desktop --project=mobile --workers=1
npm run terminal:qualify
```

Use `TZ=UTC`. On this Windows installation browser checks use `PW_CHROMIUM_PATH`
pointing to the already installed Edge executable. Local subprocess checks needed
the approved unsandboxed execution mode because the sandbox prevented esbuild's
parent-directory resolution; this is not an application test failure.

The existing CI workflow now fixes UTC and includes the browser/process terminal
qualification. No GitHub-hosted run was triggered or observed during qualification.
At verification completion, no commit, push, merge into O, deployment, provider
request or real-data ingestion had been performed. Repository delivery, if
subsequently approved, is a separate step from these local verification results.

## Remaining release gates

The local acceptance path is intentionally narrow. Managed PostgreSQL migration
and least-privilege runtime-role tests, verified Exoscale connectivity, backup
restoration, private ingress, durable object publication and a permitted real-data
correction are still required before production acceptance. The remaining O
storage/deployment/replay extensions are preserved but not all integrated here.
See [operating contract and reconciliation record](TERMINAL_OPERATING_CONTRACT.md).
