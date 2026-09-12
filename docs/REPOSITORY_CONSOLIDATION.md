# One repository, one operating contract

Canonical destination: `atomtrapping/PayLoad-OS`. This integration is developed on
`codex/terminal-control-contract`. Existing local checkouts and historical remote
branches are preserved. No deployment, provider activation or credential migration
is implied by repository delivery.

## System boundary

PayLoad OS is the shared data-control, evidence-production and mining system.
The interdisciplinary navigator and Caravan, Landshark and Tradewind desks remain
first-class interfaces; they are not three independent backends. The authenticated
terminal contract is the supported path for another terminal to operate the same
permitted, version-pinned mining workflow.

| Responsibility | Canonical implementation |
| --- | --- |
| Built-in navigator and product desks | `src/app`, `src/components` |
| Independent terminal/client | `clients/javascript`, using `/api/v1/terminal` |
| Terminal credentials, scope, reviewed action and budgets | `src/terminal`, shared domain rights and `src/runtime` |
| Durable jobs, results, read receipts and publication jobs | PostgreSQL through `src/terminal/database.ts`, `schema.ts`, `service.ts`, `readLedger.ts`, `publication.ts` |
| Admission and bounded corpus readback | `src/db`, `src/adapter` |
| Immutable evidence and object custody | `src/data-os`; SOS adapter is explicit and bounded |
| Local Iceberg publication qualification | `tools/terminal_lake` through `src/terminal/lake.ts`; fixture-only, separate Python environment |
| Replay and interdisciplinary analytical instruments | `src/state-kernel`, `src/observation`, `src/compute`; shared bounded process policy |
| Optional commercial/reasoning assistance | `src/commercial`, `src/reasoning`, `tools/sakana`; local operator tools, disabled hosted processing by default |
| Agent stable and noticeboard | `src/coordination`, `/agents`, `/board`; current local development board, not a second execution scheduler |
| Internal image and access boundary | `Dockerfile`, `deploy`, `src/access`, `src/proxy.ts` |
| Shared verification | Root package/lockfile and `.github/workflows/check.yml` |

There is one application npm dependency graph. Optional Python workers have
separate pinned environments; combining Iceberg and TreeQuest dependencies is not
required to run the application. Local artifact journals are not substitutes for
PostgreSQL execution grants or fleet-wide budgets.

## Baselines and deliberate resolutions

- `b4e857c` is the common reviewed frontend baseline. `39d468b` adds the exact-input,
  authenticated terminal workflow, admission repairs, provenance commitments,
  bounded reads and operating controls. `00c3b3c` adds durable object publication
  and the locally qualified Iceberg path. These are retained together.
- Claude's `af338e0`, `e8b73ec`, `0e3b15c` add terminal ledger concepts and boundary
  repairs. Preserve the ledger schema and its SQL invariant tests. Keep the
  stronger resource-resolved, strict-argument and immutable-session boundary,
  including public projection refusal. Use the authenticated PostgreSQL read
  sink and exact reviewed job path, not the optional process-memory recorder or
  generic proposal-writing demonstration as a second operational history.
- O's committed `07c4695` supplies the missing save-scoped kernel verification
  optimization and four explicit corpus-query indexes. Preserve the integration's
  browser-safe encoding, bounded process runner and newer site-atlas schema.
- O's deployment and optional commercial/Sakana additions are imported from
  consistent, bounded file snapshots while its author continues elsewhere.
  Subsequent O edits are not implicitly part of this integration. The original
  checkout is not edited, reset or redirected to a different remote.
  Newly evaluated commercial reports hash shared canonical JSON; previously
  retained reports and their reasoning packets are not rewritten or relabelled.
- The regulatory-manager handoff `365aa29` is ported and its ancestry retained.
  Its Federal Register capture adapter and local review agent share the existing
  acquisition and noticeboard contracts. The integration additionally rejects
  malformed non-null PDF links, verifies posted result readback before ACK, and
  preserves every agency name within one explicit parser/manager size boundary.
- Access is adapted: Basic authenticates the legacy internal shell; the exact
  terminal API continues to authenticate its existing Bearer principal. Basic
  credentials never grant terminal review or execution authority. Browser origin
  checks and internal container URL handling are tested separately.
- The older generic `publicationJobs` queue, old SOS interface and observation
  lake writer are not installed alongside the current atomic terminal outbox and
  immutable object interface. Old calibration/replay experiments remain in Git
  history; current analytical modules are the maintained implementations, not
  complete feature-equivalent copies. Legacy camera-pixel residuals, translation
  timing sensitivity and the Boreas downloader/sample remain unported research
  adapters, along with their older HTTP persistence routes.
- The separate O `notations-terminal` paper-trading runtime is not copied into
  the OS backend. Its separate SQLite ledger, authentication, execution policy
  and Node-version requirements need a deliberate client integration. Its source
  remains intact in O. This avoids silently presenting trading execution as a
  supported OS capability.
- Offline graph-assisted retrieval and raw-evidence async custody experiments
  remain research inputs, not activated services. A schema-compatible,
  permission-scoped adapter is required before they can use terminal results.

## Working from this repository

Run from the repository root:

```text
npm ci
npm run dev
npm run check
npm run build
npm run test:access-smoke
npm run terminal:qualify -- --storage
```

The native kernel requires Cargo. The default development listener stays on
loopback. `terminal:qualify` is a synthetic, isolated local test, not a command to
qualify a configured production database. See
[the terminal contract](TERMINAL_OPERATING_CONTRACT.md) for credential registration,
schema migration, worker operation and the independent CLI.

The [agent coordination contract](AGENT_COORDINATION.md) describes the existing
stable, inboxes, handoffs and acknowledgements, and the server-bound identity and
PostgreSQL message persistence still required for multi-terminal deployment.
Board acknowledgements are not execution claims or authorization. Existing seed
identities are preserved so old local board logs are not invalidated by a catalog edit.
The [regulatory manager](REGULATORY_MANAGER.md) is a review-only participant; it
does not establish legal effect or execute the changes it proposes.

Optional operator tools:

```text
npm run agent:commercial -- --help
npm run reasoning -- preview --request examples/reasoning-synthetic.json
npm run sakana:tools -- preview --request examples/sakana-context-search.json
```

Hosted reasoning needs an explicit processing review, policy, enabled provider
and dispatch approval. It remains candidate output; operator declarations are
not authenticated source-use permission or customer delivery authority. See
[reasoning workflow](REASONING_WORKFLOW.md) and [local Sakana tooling](SAKANA_TOOLING.md).
No hosted model request is made by the integration tests.

The image separates `web`, `worker` and `publisher` modes. It does not migrate,
collect data or start a publisher merely because the web process starts.
See [deployment packaging](../deploy/README.md). Image configuration tests do not
establish that a Linux image or an Exoscale service has been qualified.

## Acceptance and remaining gates

The shared local operating path must continue to let the built-in terminal and
independent client obtain the same cited result, survive interrupted execution
and publication, and observe a correction. Earlier versions remain addressable.

Managed PostgreSQL TLS/roles, a dedicated versioned SOS bucket, abrupt-process
publication recovery against those actual services, and backup/fork restoration
are still required before enabling real-data lake publication. Do not treat
merged code, local PGlite, or a synthetic Iceberg run as provider qualification.

Repository integration verification is recorded separately from historical
counts in [the consolidation verification record](CONSOLIDATION_VERIFICATION.md).
