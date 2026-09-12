# Data infrastructure: terminal result custody and lake qualification

2026-09-12. Additive work on `codex/terminal-control-contract`, following
`39d468b`. The original O checkout, source permissions, specialized applications,
and synchronous evidence-capture contracts are preserved. This is not an
Exoscale deployment or a permitted real-data/customer-delivery qualification.

## One operating path

| Stage | Owner and commitment |
| --- | --- |
| Reviewed mining | Existing terminal action binds exact request, source snapshot, method, budgets and optional storage destination |
| Result + pending custody | One PostgreSQL transaction retains the immutable result, completes its execution record and inserts the outbox event |
| Object custody | Conditional create-only content-addressed write, actual-byte SHA-256 and exact version readback, then a fenced PostgreSQL receipt |
| Derived Iceberg index | One fixture-only `terminal.result_publications` table; original job/artifact/release/knowledge-time/correction identities remain explicit |
| Lake acknowledgement | A second Python process reads the exact snapshot before PostgreSQL retains an immutable projection receipt |

There is no new authorization server, distributed bus or second execution ledger.
Terminals cannot choose URLs, buckets, catalog commands or filesystem paths. The
built-in navigator and independent client still use `/api/v1/terminal`. Job status
includes bounded object-publication status; result/recipient receipts remain
separate from object custody and lake projection acknowledgements.

## Activation and limits

Run `npm run terminal:service -- migrate` explicitly against the intended database
after backup and migration review. Schema version 3 adds object-publication and
lake-receipt tables and guards; upgrades from v1/v2 preserve existing history.
HTTP requests never migrate. Existing incompatible unversioned schemas still refuse.

Retention is disabled by default. For new retained jobs, configure:

- `PAYLOAD_TERMINAL_RETENTION=sos`, `PAYLOAD_OBJECT_STORE=sos`;
- explicit `PAYLOAD_SOS_ENDPOINT`, region, bucket and nonempty prefix;
- explicit key ID and exactly one secret value or mounted-secret-file setting.

See `.env.example` for lower-only limits. Internal deployment refuses the local
filesystem retention mode. Local qualification instead accepts
`PAYLOAD_TERMINAL_RETENTION=local` with an explicit absolute
`PAYLOAD_TERMINAL_OBJECT_ROOT`. There is no fallback after SOS failure.

Clients discover `mining.retentionDestination` and include that exact value in
new requests. Human approval covers it through the action digest. Old SQL-only
jobs are not backfilled. Changing configuration does not redirect a reviewed
request; incompatible jobs remain queued while compatible work can proceed.

Run the mining process with `npm run terminal:service -- worker` and the separate
custody process with `npm run terminal:service -- publisher`. Both use the same
database. Publisher startup does not admit records, acquire sources, index real
data or deliver to customers.

- At most 1,000 outstanding custody events; mining reserves room before claiming
  work. No result is committed while its required outbox event is discarded.
- Each result is at most 1 MiB. The reusable SOS adapter supports up to 8 MiB with
  lower-only configuration, at most two active operations per adapter (one in
  conserve), and a shared write/readback deadline of at most 10 seconds.
- Publication claims last at most 30 seconds; active claims across destinations
  use the shared production-worker ceiling. PostgreSQL retains its separate
  statement/lock timeouts. These are not measurements of host-wide capacity.
- Expired/uncertain attempts remain discoverable for reconciliation. Retries are
  safe only because they target the same create-only key and identical bytes.
  After ten attempts, the event becomes visible `BLOCKED`; there is no automatic
  reset, forced unlock, deletion or retry storm.
- Fresh source-use checks and the still-active, unrevoked exact execution grant
  are required before new custody/index work. A revoked or expired grant does not
  erase already retained history or independently prohibit authorized historical
  SQL result retrieval. Failed/unknown writes can leave unacknowledged bytes;
  absence of an acknowledgement is never reported as proof that no write occurred.

## Iceberg scope

The index is real Iceberg v2/Parquet using PyIceberg 0.11.1, but the currently
qualified catalog and warehouse are **local SQLite/filesystem**, not Exoscale.
The bridge refuses nonfixture results; this restriction is not a license grant.
Python receives only a closed, byte-verified publication manifest, not credentials
or arbitrary source paths. It is not a terminal-serving or permission engine.

One OS-owned writer lock serializes cooperating local processes and releases on
process death. Immutable intent and append-attempt records bind publication input.
If a prior append cannot be proven from retained snapshots, publication refuses
instead of assuming it is safe to append again. Successful replay returns the
original exact snapshot, represented as a decimal string rather than a JavaScript
number. Corrections append a new identity without replacing old rows or objects.

Limits are 100 publications, 100 rows per publication, 10,000 total rows and
64 MiB per Iceberg file. These are deliberately qualification bounds, not scaling
claims. Optional packages are pinned in `tools/terminal_lake/requirements.lock.txt`
(version pins, not a cross-platform hash-lock guarantee) and excluded from the
Next.js runtime image.

Configure absolute `PAYLOAD_LAKE_PYTHON`, `PAYLOAD_LAKE_PYTHON_PACKAGES` and a new,
dedicated `PAYLOAD_LAKE_ROOT`. No command installs packages automatically.

```text
npm run terminal:lake -- init
npm run terminal:lake -- publish <published-object-publication-id>
```

The second command verifies object bytes and authority, writes/reads the local
fixture index and acknowledges it in PostgreSQL. Retrying the same identity reads
back the original snapshot; it does not mint another mining job. An object marked
`PUBLISHED` means verified object custody only, not an Iceberg commit. A missing
lake receipt is explicit unfinished projection work; automatic production lake
scheduling and a remote catalog adapter are not implemented.

## Recovery and provider boundaries

No retention expiration, compaction, garbage collection or customer export is
enabled. Exact-package preservation needs a separate policy: Iceberg snapshot
expiration removes time-travel history, while compaction changes physical files.
[Apache Iceberg maintenance](https://iceberg.apache.org/docs/latest/maintenance/)

Exoscale documents conditional creation using `If-None-Match: *`; the adapter
uses it and requires real version identifiers. Offline SDK tests do not establish
that a selected bucket is correctly versioned or configured. Provider conformance,
bucket/IAM policy, backup restoration, object retention/WORM, managed PostgreSQL
and cloud catalog recovery remain deployment gates.
[Exoscale conditional writes](https://www.exoscale.com/blog/exoscale-sos-conditional-write/)

The Python catalog integration uses the official catalog/snapshot API, while
explicit local file I/O rejects remote warehouses and detected path escapes.
[PyIceberg API](https://py.iceberg.apache.org/api/)

## Verification

Reproduction commands (UTC):

```text
npm run typecheck
npm run lint
npm test -- --maxWorkers=2 --minWorkers=1
npm run build
npm run terminal:qualify -- --lake
```

The final command requires the explicit already-provisioned Python interpreter
and package directory above. It uses a fresh disposable fixture database/object
root/lake, actual installed Chromium, the built-in widget and independent CLI.
`--storage` omits Python; `--no-browser` is explicitly process/HTTP-only.
Python crash/tamper tests run with `python -B -m unittest
tools.terminal_lake.test_writer -v` and the explicit package directory on the
module path. CI includes the optional Python runtime and these qualifications;
a GitHub-hosted run has not been observed for this increment.

Observed locally on 2026-09-12, with application/test source frozen for the final
run (documentation and a Linux CI interpreter-path correction followed separately):

| Gate | Observed result |
| --- | --- |
| Complete Vitest regression, UTC, two workers | **6,644 passed, six opt-in GAT checks skipped, zero failed; 293 files**, 698.23 seconds |
| Typecheck and ESLint | Passed |
| Production build and runtime trace checks | Passed; 57 static pages generated |
| Locked Rust kernel suite | 29 passed |
| Real Python Iceberg/Parquet unit and crash suite | 22 passed |
| Storage inventory browser regression | Desktop and mobile both passed using installed Microsoft Edge Chromium |
| Combined terminal/object/Iceberg process qualification | Passed with the actual built-in widget, native-fetch client and standalone CLI |

The first whole-suite pass found one stale inventory assertion that equated an
installed object-store SDK with a running service (6,640 passed, one failed, six
skipped). The storage model, its browser projection and tests were corrected to
separate configured adapters from deployment and relational storage from the
local lake pilot. The complete rerun above includes that correction.

The combined qualification used five fresh backend processes, three clean
closures and two hard kills: after a committed mining claim, and after object
bytes were written but before SQL custody acknowledgement. Real lease recovery
returned the same cited result to the independent terminals without duplicate
publication. Two result vintages retained their original object bytes, recipient
receipts and Iceberg snapshots through a correction. Fresh Python readback and
the durable SQL projection acknowledgement agreed after restart. The test
database was file-backed PGlite; custody and catalog were local qualification
stores, not managed PostgreSQL or Exoscale.

The machine-readable full-suite report is retained locally at
`.stamp/data-infrastructure-vitest-final.json` (ignored scratch, not a signed
release receipt). Existing React test `act(...)` and tooling warnings remain;
they did not fail these gates. At the close of this verification pass, CI YAML
parsed locally but the Linux workflow and provider integration had not been
observed running. No cloud resources, production migration, source collection,
customer delivery, merge, commit or push had been performed at that point.
Subsequent repository delivery is recorded in Git; it does not change deployment
or provider-qualification status.

## Live qualification handoff — 2026-09-12

**Not started: live targets and secure configuration are missing.** Read-only
preflight found no database endpoint/credentials, database CA path, SOS target or
SOS credentials in the current process environment. Both the integration and O
checkout roots contain only `.env.example`; no other credential locations were
searched. `exo`, `psql`, `pg_dump`, `pg_restore` and Docker were not on PATH.
This describes the accessible environment, not the existence of resources in
the user's Exoscale account. No provider account was accessed, resource created,
database migrated, bucket written or real-data restriction removed.

Before live execution, designate:

- The Exoscale organization/zone and an isolated qualification PostgreSQL
  service/database, with a protected CA file and separate migration and runtime
  credentials. Supply credentials through secure local configuration, not chat,
  committed files or command arguments. Confirm the database may receive fixture
  schema/data and that the test worker may be hard-stopped.
- A dedicated versioned SOS bucket and test prefix, with prefix-scoped runtime
  credentials and separate read-only policy/versioning inspection access. No
  customer/source artifacts are test inputs; no existing keys may be overwritten
  or deleted. Versioning must be observed, not inferred from a configuration name.
- The restore destination or authorization to create a temporary managed-service
  fork, including a spending ceiling and retention/cleanup decision. Restore only
  the qualification service, never an unidentified production source.

Exoscale's managed backup recovery creates a **new service fork**; a local
database copy or a logical dump reload does not qualify that provider mechanism.
Capture the backup/recovery point and service identities, then compare immutable
jobs, results, publication receipts and exact SOS object versions in the restored
service. Keep restore workers disabled during comparison so recovery does not
silently publish or duplicate work.
[Exoscale managed backup restoration](https://community.exoscale.com/product/dbaas/how-to/backups-restore/)

The live sequence is: verify target identity, TLS and restricted-role access;
install/verify the fixture schema on the designated database; observe SOS
versioning, conditional creation and exact-version byte readback; hard-stop only
the dedicated publisher after object creation but before SQL acknowledgement;
restart and prove one durable publication; then recover a provider backup into
the separate fork and compare the same retained commitments. Review bucket
policy and version retention separately: versioning alone is not deletion
protection or independent backup.
[Exoscale SOS versioning](https://community.exoscale.com/product/storage/object-storage/how-to/versioning/)

The existing `terminal:qualify` harness is intentionally file-backed PGlite plus
local objects. Pointing environment variables at a provider does not turn it
into a managed-service test. A separately gated live runner is still needed
after target scope is settled. The Iceberg bridge remains fixture-only until
live custody, recovery and real-data permission gates have independently passed.
