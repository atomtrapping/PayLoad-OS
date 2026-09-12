# Storage: polyglot persistence

Repository state, 2026-09-12. Seven information classes have distinct access
patterns and authority boundaries. [The storage model](../src/domain/storage.ts)
supplies `/model`; its tests check the class/state vocabulary and dependency
backing. Installed packages and implemented adapters do not prove running
services, production deployment or provider qualification.

## The seven classes

| Information | Store kind | Implementation here | State |
| --- | --- | --- | --- |
| Raw artifacts and retained result bytes; separate capture/custody receipts | Immutable object storage | Opt-in terminal publication through local or Exoscale SOS adapters; legacy synchronous evidence remains on local files | `ADAPTER_READY` |
| Admission rulings, served records, releases and transactional control history | Relational | PostgreSQL through `pg` and `drizzle-orm`, when configured | `ADAPTER_READY` |
| Derived terminal-result indexes and analytical snapshots | Lakehouse | Real Iceberg v2/Parquet with a local SQLite catalog and explicit fixture-only bridge | `LOCAL_PILOT` |
| Full text and facets | Search index | Pages filter fixtures in memory; no search index | `ABSENT` |
| Entities and explicit relationships | Graph | Declared record-to-subject incidence and authored notation relations; no graph database | `FIXTURE` |
| Embeddings | Vector store | No embedding computation or vector database | `ABSENT` |
| Geodetic positions, footprints and frames | Geospatial | Declared corpus geometry and Earth projections; no PostGIS adapter | `FIXTURE` |

`ADAPTER_READY` means wired when explicitly configured, with deployment
unverified. `LOCAL_PILOT` means local qualification, not a production service.
There is no GraphRAG or graph-assisted retrieval pilot port in this increment.

## What is connected

PostgreSQL is the relational authority, not the lakehouse. Configured corpus
adapters read its tables; without a configured corpus database, surfaces declare
their demonstration source. Admission exists: `src/db/admitRecords.ts` requires
supplied authority, complete declared serving projections, transactional ruling
and ancestry binding, and validated readback. Incomplete or mismatched history
refuses; moving storage does not promote a candidate or demonstration row.

Schema v3 adds a terminal-result outbox and immutable custody/projection receipts
without adding another authorization or execution system. An opted-in reviewed
action pins its storage destination. Result insertion, execution completion and
the required outbox event commit together. A separate publisher performs
conditional content-addressed creation and verifies actual exact-version bytes
before acknowledging custody. Current source permissions and the active,
unrevoked exact execution grant are required for new custody/index work.

The object SDK is present: `package.json` includes `@aws-sdk/client-s3`.
Exoscale SOS remains provider-unqualified. Selecting terminal retention neither
redirects the legacy synchronous evidence rail nor migrates existing `.payload/*`
histories. Local retention uses an explicit dedicated root; it is not accepted
as production remote custody.

`tools/terminal_lake` is a separate optional Python runtime, pinned in its
`requirements.lock.txt`. Its bridge accepts only published fixture results,
verifies artifact bytes and permissions, and requires a second Python process
to read the exact snapshot before PostgreSQL records a derived projection
acknowledgement. A `PUBLISHED` object alone is not an Iceberg commit. The index
is not canonical admission, a remote cloud catalog or customer delivery.

See [Data infrastructure increment](DATA_INFRASTRUCTURE_INCREMENT.md) for
activation, exact limits, recovery and follow-on verification, and the
[terminal operating contract](TERMINAL_OPERATING_CONTRACT.md) for the reviewed
workflow. No command automatically installs or deploys the optional lake runtime.

## Invariants and remaining qualification

- Object bytes remain immutable and content-addressed. Evidence and derived
  results are not canonical state; capture, retrieval, custody and lake receipts
  have different meanings.
- Relational transactions preserve authority, ancestry and both record clocks.
  Iceberg commit time is neither valid time nor knowledge time. Corrections keep
  earlier result bytes, identities and snapshots rather than rewriting them.
- Search and geospatial are derived projections, never new sources of identity
  or authority. A coordinate requires its declared frame and evidence.
- Graph edges require evidence; adjacency is not an edge. Vector similarity
  would be candidate generation, never an admitted relationship.

Next gates are managed PostgreSQL migration/restricted-role recovery, real SOS
versioning and conditional-write conformance, bucket/IAM policy, backup restore,
retention/recall obligations and production catalog custody. Real-data authority
must be established before widening the fixture-only lake bridge. Graph and
vector expansion still require explicit identity authority and declared models
with permitted, recomputable inputs. None of these gaps is closed by a dependency
or connection string alone.
