# Local terminal result lake qualification

This optional Python package writes a real Iceberg v2 table backed by Parquet and a local SQLite SQL catalog. It is a derived terminal-result index, not canonical domain state, customer authorization, a source connector or a production cloud catalog. Only explicitly supplied fixture publication manifests are accepted. No old lakehouse pilot, synthetic retrieval system, provider client or evidence store is imported.

The TypeScript publication bridge must verify the actual result/artifact bytes and permission boundary before submitting a manifest. Python checks the closed manifest and its exact input commitment; it never opens `object_key`, retrieves private evidence or grants exposure. `fixture_only` must be `true`. Artifact/source verification and canonical-admission nonclaims are explicit in every result.

## Protocol

Use a preprovisioned Python 3.12 runtime with the versions in `requirements.txt`. No command installs packages or contacts a provider. Run from the integration repository so `tools.terminal_lake` is importable:

```text
python -B -m tools.terminal_lake --root <dedicated-absolute-directory> init
python -B -m tools.terminal_lake --root <same-directory> publish
python -B -m tools.terminal_lake --root <same-directory> read
```

`init` expects empty stdin. `publish` and `read` consume one UTF-8 JSON document on stdin, bounded at 64 KiB, with duplicate keys and nonfinite values rejected. stdout is one JSON result; failure writes a bounded code to stderr and exits 1. The calling process must close stdin and impose its own process deadline. There is no HTTP endpoint, scheduler, automatic publication or arbitrary Python command in the protocol.

A publication has exactly `schema: "payload.terminal-lake-publication.v1"`, `publication_id`, `records` and `input_digest`. `input_digest` is `sha256:` plus the SHA-256 of the UTF-8 compact JSON encoding of the first three fields, with object keys sorted lexically and record order preserved. All accepted strings use ASCII, so this encoding agrees with the TypeScript sorted-key JSON bridge. Each record has exactly:

```json
{
  "job_id": "terminal-job-1",
  "result_digest": "sha256:<64 lowercase hexadecimal characters>",
  "artifact_digest": "sha256:<64 lowercase hexadecimal characters>",
  "object_key": "terminal-artifacts/sha256/<artifact>.json",
  "corpus_id": "caravan-fixture",
  "release_id": "REL-CAR-2026.09.12",
  "known_at": "2026-09-12T12:00:00.000Z",
  "corrects_job_id": null,
  "fixture_only": true
}
```

The example digest placeholders deliberately are not executable values. IDs allow 1–120 ASCII letters, digits, `.`, `_`, `:`, `-`, starting with a letter or digit. Object keys are bounded relative slash-separated ASCII identifiers, never URLs or filesystem paths to open. `known_at` preserves an explicit input snapshot knowledge instant in canonical UTC milliseconds; Python does not invent a new knowledge time. Corrections name an already committed job in the same corpus with no later knowledge time; equal knowledge times permit correcting an output over the same input snapshot, and new release IDs are permitted. Existing jobs are never rewritten or silently replaced.

A read has exactly `schema: "payload.terminal-lake-read.v1"`, `publication_id` and the expected `input_digest`. The result includes the original canonical manifest, table UUID, exact snapshot ID **as a string**, publication row count and historical snapshot row count. A later correction does not change the earlier snapshot response. This is exact publication readback, not a broad search/export interface.

## Integrity, failure and writer scope

- One table: `terminal.result_publications`, with the nine record fields plus `publication_id` and `input_digest`; knowledge time uses an Iceberg timezone-aware timestamp.
- Limits: 100 rows per publication, 100 committed publications, 10,000 cumulative rows, and 64 MiB per local Iceberg file. Metadata/snapshot scans are bounded by these local qualification limits. No snapshot expiry, deletion, overwrite, branch or schema-migration command exists.
- One cooperating local writer is fenced across processes by `msvcrt` byte-range locking on Windows or `fcntl.flock` on POSIX. Initialization uses the same lock. The inert lock file stays; OS ownership releases on normal exit or abrupt process death, so there is no stale-lock deletion protocol.
- Root/type/table UUID checks and a root-confined file I/O implementation reject detected links, external file URIs and remote storage. Initialization requires a dedicated empty root or the same existing marker. This assumes a trusted local filesystem and cooperating processes, not a hostile filesystem operator or distributed writers.
- Create-only intent binds publication ID to exact inputs. A durable append-attempt marker precedes the Iceberg commit. Snapshot summary binds the committed publication/input digest. Readback checks the intact managed append chain, exact cumulative rows and canonical manifests; only then is a create-only acknowledgement published.
- Retry after commit but before acknowledgement finds the exact committed snapshot and writes only the missing acknowledgement. If an append attempt exists but its commit outcome cannot be established, the operation refuses to append again. Incomplete files are preserved; the operator must investigate rather than reset markers or expire history.
- Saved acknowledgements, intents, Parquet rows and snapshot summaries must recompute. Hashes and exact readback provide local consistency, not authenticated origin, physical WORM, power-loss guarantees or independent verification. Python does not independently verify the artifact bytes named by the input manifest.

## Offline verification

`python -B -m unittest tools.terminal_lake.test_writer -v` uses isolated temporary roots and real Iceberg/Parquet. Tests cover fresh-process readback, exact retries, collision rejection, preserved old snapshots after corrections, filesystem/metadata mismatch rejection, interprocess writer fencing, and an abrupt subprocess exit immediately after a real commit. The crash callback is callable only from the direct Python testing API; there is no production CLI flag or environment variable that enables it. No test calls a source provider or modifies operator evidence.
