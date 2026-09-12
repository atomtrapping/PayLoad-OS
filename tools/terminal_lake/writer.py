"""A real local Iceberg index of explicit TS-verified terminal fixture results.

No source reads, object downloads, exposure decision, or canonical state admission.
The TypeScript publisher owns actual artifact verification before this boundary.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from typing import Callable

import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.io.pyarrow import schema_to_pyarrow
from pyiceberg.schema import Schema
from pyiceberg.types import BooleanType, NestedField, StringType, TimestamptzType
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from .local_io import safe_path

TABLE = "terminal.result_publications"
CONTRACT = "payload.terminal-lake-publication.v1"
READ_CONTRACT = "payload.terminal-lake-read.v1"
MAX_INPUT_BYTES = 64 * 1024
MAX_PUBLICATION_ROWS = 100
MAX_TOTAL_ROWS = 10000
MAX_PUBLICATIONS = 100
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
FIELDS = ("job_id", "result_digest", "artifact_digest", "object_key", "corpus_id",
          "release_id", "known_at", "corrects_job_id", "fixture_only")
MARKER = {"schema": "payload.terminal-lake-root.v1", "table": TABLE,
          "contract": CONTRACT, "fixture_only": True, "canonical_admission": False}


def canonical_bytes(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")


def digest(value) -> str:
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()


def parse_json(data: bytes):
    if not isinstance(data, bytes) or len(data) > MAX_INPUT_BYTES:
        raise ValueError("INPUT_BYTE_LIMIT")

    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("DUPLICATE_JSON_KEY")
            result[key] = value
        return result

    def nonfinite(_):
        raise ValueError("NONFINITE_JSON")

    try:
        return json.loads(data.decode("utf-8", errors="strict"), object_pairs_hook=pairs,
                          parse_constant=nonfinite)
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("INVALID_JSON") from None


def exact(value, fields):
    if type(value) is not dict or set(value) != set(fields):
        raise ValueError("CLOSED_MANIFEST_REQUIRED")


def identifier(value):
    if not isinstance(value, str) or ID.fullmatch(value) is None:
        raise ValueError("INVALID_IDENTIFIER")
    return value


def commitment(value):
    if not isinstance(value, str) or DIGEST.fullmatch(value) is None:
        raise ValueError("INVALID_DIGEST")
    return value


def utc(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z", value):
        raise ValueError("CANONICAL_UTC_MILLISECONDS_REQUIRED")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("INVALID_KNOWN_AT") from None
    if parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z") != value:
        raise ValueError("INVALID_KNOWN_AT")
    return value


def validate_manifest(value):
    exact(value, ("schema", "publication_id", "records", "input_digest"))
    if value["schema"] != CONTRACT:
        raise ValueError("PUBLICATION_SCHEMA_REQUIRED")
    identifier(value["publication_id"])
    commitment(value["input_digest"])
    records = value["records"]
    if type(records) is not list or not 1 <= len(records) <= MAX_PUBLICATION_ROWS:
        raise ValueError("PUBLICATION_ROW_LIMIT")
    seen = set()
    for row in records:
        exact(row, FIELDS)
        for field in ("job_id", "corpus_id", "release_id"):
            identifier(row[field])
        for field in ("result_digest", "artifact_digest"):
            commitment(row[field])
        key = row["object_key"]
        if (not isinstance(key, str) or len(key) > 512
                or not re.fullmatch(r"[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*", key)
                or any(part in (".", "..") for part in key.split("/"))):
            raise ValueError("OPAQUE_OBJECT_KEY_REQUIRED")
        utc(row["known_at"])
        if row["fixture_only"] is not True:
            raise ValueError("FIXTURE_PUBLICATION_REQUIRED")
        if row["corrects_job_id"] is not None:
            identifier(row["corrects_job_id"])
            if row["corrects_job_id"] == row["job_id"]:
                raise ValueError("SELF_CORRECTION_REFUSED")
        if row["job_id"] in seen:
            raise ValueError("DUPLICATE_JOB_ID")
        seen.add(row["job_id"])
    if digest({key: value[key] for key in ("schema", "publication_id", "records")}) != value["input_digest"]:
        raise ValueError("INPUT_DIGEST_MISMATCH")
    if len(canonical_bytes(value)) > MAX_INPUT_BYTES:
        raise ValueError("INPUT_BYTE_LIMIT")
    return json.loads(canonical_bytes(value))


def schema():
    fields = [(name, TimestamptzType() if name == "known_at" else
               BooleanType() if name == "fixture_only" else StringType(), name != "corrects_job_id")
              for name in FIELDS]
    fields += [("publication_id", StringType(), True), ("input_digest", StringType(), True)]
    return Schema(*(NestedField(index + 1, name, kind, required=required)
                    for index, (name, kind, required) in enumerate(fields)))


def bounded_read(path: Path, limit=MAX_INPUT_BYTES):
    safe_path(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
        raise ValueError("LOCAL_FILE_BOUND")
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        data = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
    if len(data) > limit or len(data) != before.st_size or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("LOCAL_FILE_CHANGED")
    return data


def immutable(path: Path, data: bytes):
    safe_path(path)
    if path.exists():
        if bounded_read(path, max(MAX_INPUT_BYTES, len(data))) != data:
            raise ValueError("IMMUTABLE_PUBLICATION_CONFLICT")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".terminal-pending-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            if bounded_read(path, max(MAX_INPUT_BYTES, len(data))) != data:
                raise ValueError("IMMUTABLE_PUBLICATION_CONFLICT") from None
    finally:
        os.unlink(temporary)


class TerminalLake:
    def __init__(self, root: str | Path):
        path = Path(root)
        if not path.is_absolute() or path == Path(path.anchor) or any(part.lower() in (".payload", ".git") for part in path.parts):
            raise ValueError("DEDICATED_ABSOLUTE_ROOT_REQUIRED")
        safe_path(path)
        self.root = path.resolve()

    @contextmanager
    def writer_lock(self):
        safe_path(self.root)
        self.root.mkdir(parents=True, exist_ok=True)
        lock = self.root / "writer.lock"
        safe_path(lock)
        descriptor = os.open(lock, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
        acquired = False
        try:
            if not stat.S_ISREG(os.fstat(descriptor).st_mode):
                raise ValueError("REGULAR_LOCK_REQUIRED")
            try:
                if os.name == "nt":
                    import msvcrt
                    os.lseek(descriptor, 0, os.SEEK_SET)
                    msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                raise ValueError("LOCAL_WRITER_BUSY") from None
            acquired = True
            yield
        finally:
            try:
                if acquired:
                    if os.name == "nt":
                        import msvcrt
                        os.lseek(descriptor, 0, os.SEEK_SET)
                        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(descriptor, fcntl.LOCK_UN)
            finally:
                os.close(descriptor)
        # Keep the inert lock file. Kernel ownership vanishes automatically on process death.

    def _marker(self):
        if bounded_read(self.root / "terminal-lake.json") != canonical_bytes(MARKER):
            raise ValueError("LOCAL_INDEX_MARKER_MISMATCH")

    @contextmanager
    def _catalog(self, *, initialize=False):
        path = self.root / "catalog.sqlite"
        safe_path(path)
        if path.exists() and not stat.S_ISREG(path.lstat().st_mode):
            raise ValueError("REGULAR_CATALOG_REQUIRED")
        if not initialize and not path.exists():
            raise ValueError("CATALOG_NOT_INITIALIZED")
        catalog = SqlCatalog("terminal-local", **{
            "uri": "sqlite:///" + path.as_posix(), "warehouse": (self.root / "warehouse").as_uri(),
            "py-io-impl": "tools.terminal_lake.local_io.TerminalFileIO", "terminal.root": str(self.root),
            "init_catalog_tables": "true" if initialize else "false",
        })
        catalog.engine.dispose()
        catalog.engine = create_engine(catalog.properties["uri"], poolclass=NullPool)
        try:
            yield catalog
        finally:
            catalog.engine.dispose()

    def _check_table(self, table):
        if table.schema() != schema() or table.properties.get("terminal.contract") != CONTRACT or table.metadata.format_version != 2:
            raise ValueError("TABLE_CONTRACT_MISMATCH")
        if bounded_read(self.root / "table-identity.json") != canonical_bytes({"table_uuid": str(table.metadata.table_uuid), "table": TABLE}):
            raise ValueError("TABLE_IDENTITY_MISMATCH")
        if len(table.snapshots()) > MAX_PUBLICATIONS:
            raise ValueError("PUBLICATION_HISTORY_LIMIT")

    def _history(self, table):
        """Only a bounded, intact single append chain belongs to this local writer."""
        self._check_table(table)
        history, seen, previous, total = [], set(), None, 0
        for snapshot in table.snapshots():
            summary = snapshot.summary
            if summary is None or summary.operation.value != "append" or snapshot.parent_snapshot_id != previous:
                raise ValueError("UNMANAGED_SNAPSHOT_HISTORY")
            publication_id = summary.get("terminal.publication-id")
            if publication_id in seen:
                raise ValueError("DUPLICATE_PUBLICATION_COMMIT")
            manifest = self._intent(identifier(publication_id))
            if summary.get("terminal.input-digest") != manifest["input_digest"]:
                raise ValueError("SNAPSHOT_INTENT_MISMATCH")
            expected_attempt = {"input_digest": manifest["input_digest"], "table_uuid": str(table.metadata.table_uuid)}
            if bounded_read(self._publication_path(publication_id, "append-attempt.json")) != canonical_bytes(expected_attempt):
                raise ValueError("APPEND_ATTEMPT_MISMATCH")
            total += len(manifest["records"])
            if total > MAX_TOTAL_ROWS or summary.get("total-records") != str(total):
                raise ValueError("SNAPSHOT_ROW_COUNT_MISMATCH")
            history.append((snapshot, manifest))
            seen.add(publication_id)
            previous = snapshot.snapshot_id
        current = table.current_snapshot()
        if (current.snapshot_id if current else None) != previous:
            raise ValueError("SNAPSHOT_HEAD_MISMATCH")
        return history

    def initialize(self):
        with self.writer_lock():
            marker = self.root / "terminal-lake.json"
            if not marker.exists() and any(item.name != "writer.lock" for item in self.root.iterdir()):
                raise ValueError("EMPTY_DEDICATED_ROOT_REQUIRED")
            immutable(marker, canonical_bytes(MARKER))
            self._marker()
            with self._catalog(initialize=True) as catalog:
                catalog.create_namespace_if_not_exists("terminal")
                table = catalog.create_table_if_not_exists(TABLE, schema=schema(), properties={"format-version": "2", "terminal.contract": CONTRACT})
                immutable(self.root / "table-identity.json", canonical_bytes({"table_uuid": str(table.metadata.table_uuid), "table": TABLE}))
                self._check_table(table)
                return {**MARKER, "table_uuid": str(table.metadata.table_uuid)}

    def _publication_path(self, publication_id, name):
        return self.root / "publications" / hashlib.sha256(identifier(publication_id).encode()).hexdigest() / name

    def _intent(self, publication_id):
        data = bounded_read(self._publication_path(publication_id, "intent.json"))
        manifest = validate_manifest(parse_json(data))
        if manifest["publication_id"] != publication_id or canonical_bytes(manifest) != data:
            raise ValueError("PUBLICATION_INTENT_MISMATCH")
        return manifest

    def _rows(self, table, snapshot_id):
        rows = table.scan(snapshot_id=snapshot_id, selected_fields=tuple(field.name for field in schema().fields),
                          limit=MAX_TOTAL_ROWS + 1).to_arrow().to_pylist()
        if len(rows) > MAX_TOTAL_ROWS:
            raise ValueError("TOTAL_ROW_LIMIT")
        for row in rows:
            if not isinstance(row["known_at"], datetime) or row["known_at"].microsecond % 1000:
                raise ValueError("STORED_TIME_MISMATCH")
            row["known_at"] = row["known_at"].astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        return rows

    def _inspect(self, table, publication_id, input_digest):
        history = self._history(table)
        manifest = self._intent(publication_id)
        if manifest["input_digest"] != input_digest:
            raise ValueError("PUBLICATION_ID_CONFLICT")
        snapshots = [item for item in table.snapshots() if item.summary and item.summary.get("terminal.publication-id") == publication_id]
        if not snapshots:
            raise ValueError("PUBLICATION_NOT_COMMITTED")
        if len(snapshots) != 1:
            raise ValueError("DUPLICATE_PUBLICATION_COMMIT")
        snapshot = snapshots[0]
        if snapshot.summary.get("terminal.input-digest") != input_digest:
            raise ValueError("SNAPSHOT_INTENT_MISMATCH")
        attempt = {"input_digest": input_digest, "table_uuid": str(table.metadata.table_uuid)}
        if bounded_read(self._publication_path(publication_id, "append-attempt.json")) != canonical_bytes(attempt):
            raise ValueError("APPEND_ATTEMPT_MISMATCH")
        rows = self._rows(table, snapshot.snapshot_id)
        expected = [dict(row, publication_id=publication_id, input_digest=input_digest) for row in manifest["records"]]
        prefix = []
        for item, previous_manifest in history:
            prefix.extend(dict(row, publication_id=previous_manifest["publication_id"], input_digest=previous_manifest["input_digest"])
                          for row in previous_manifest["records"])
            if item.snapshot_id == snapshot.snapshot_id:
                break
        if (len({row["job_id"] for row in prefix}) != len(prefix)
                or sorted(rows, key=lambda row: row["job_id"]) != sorted(prefix, key=lambda row: row["job_id"])):
            raise ValueError("COMMITTED_ROWS_MISMATCH")
        return {
            "schema": "payload.terminal-lake-receipt.v1", "table": TABLE,
            "table_uuid": str(table.metadata.table_uuid), "snapshot_id": str(snapshot.snapshot_id),
            "publication_id": publication_id, "input_digest": input_digest,
            "record_count": len(expected), "snapshot_record_count": len(rows),
            "manifest": manifest, "fixture_only": True, "canonical_admission": False,
            "source_permissions_verified": False, "artifact_bytes_verified_by_python": False,
        }

    def publish(self, value, *, _after_commit: Callable[[], None] | None = None):
        manifest = validate_manifest(value)
        publication_id, input_digest = manifest["publication_id"], manifest["input_digest"]
        with self.writer_lock():
            self._marker()
            with self._catalog() as catalog:
                table = catalog.load_table(TABLE)
                self._history(table)
                path = self._publication_path(publication_id, "intent.json")
                if path.exists() and bounded_read(path) != canonical_bytes(manifest):
                    raise ValueError("PUBLICATION_ID_CONFLICT")
                immutable(path, canonical_bytes(manifest))
                snapshots = [item for item in table.snapshots() if item.summary and item.summary.get("terminal.publication-id") == publication_id]
                ack_path = self._publication_path(publication_id, "receipt.json")
                attempt_path = self._publication_path(publication_id, "append-attempt.json")
                if not snapshots:
                    if ack_path.exists() or attempt_path.exists():
                        raise ValueError("APPEND_OUTCOME_UNKNOWN_NO_REAPPEND")
                    if len(table.snapshots()) >= MAX_PUBLICATIONS:
                        raise ValueError("PUBLICATION_HISTORY_LIMIT")
                    current = table.current_snapshot()
                    if current is not None:
                        self._inspect(table, current.summary.get("terminal.publication-id"), current.summary.get("terminal.input-digest"))
                    previous = self._rows(table, current.snapshot_id) if current else []
                    by_id = {row["job_id"]: row for row in previous}
                    if len(by_id) != len(previous):
                        raise ValueError("DUPLICATE_STORED_JOB")
                    for row in manifest["records"]:
                        if row["job_id"] in by_id:
                            raise ValueError("JOB_ID_CONFLICT")
                        predecessor = row["corrects_job_id"]
                        if predecessor is not None:
                            old = by_id.get(predecessor)
                            if old is None or old["corpus_id"] != row["corpus_id"] or old["known_at"] > row["known_at"]:
                                raise ValueError("CORRECTION_PREDECESSOR_MISMATCH")
                    if len(previous) + len(manifest["records"]) > MAX_TOTAL_ROWS:
                        raise ValueError("TOTAL_ROW_LIMIT")
                    written = [dict(row, publication_id=publication_id, input_digest=input_digest) for row in manifest["records"]]
                    for row in written:
                        row["known_at"] = datetime.fromisoformat(row["known_at"].replace("Z", "+00:00"))
                    arrow = pa.Table.from_pylist(written, schema=schema_to_pyarrow(table.schema(), include_field_ids=False))
                    immutable(attempt_path, canonical_bytes({"input_digest": input_digest, "table_uuid": str(table.metadata.table_uuid)}))
                    table.append(arrow, snapshot_properties={"terminal.publication-id": publication_id, "terminal.input-digest": input_digest})
                    if _after_commit is not None:
                        _after_commit()  # Only a direct unittest callback; never a CLI/environment feature.
                    table.refresh()
                receipt = self._inspect(table, publication_id, input_digest)
                immutable(ack_path, canonical_bytes(receipt))
                if bounded_read(ack_path, 2 * MAX_INPUT_BYTES) != canonical_bytes(receipt):
                    raise ValueError("ACK_READBACK_MISMATCH")
                return receipt

    def read(self, value):
        exact(value, ("schema", "publication_id", "input_digest"))
        if value["schema"] != READ_CONTRACT:
            raise ValueError("READ_SCHEMA_REQUIRED")
        identifier(value["publication_id"])
        commitment(value["input_digest"])
        self._marker()
        with self._catalog() as catalog:
            receipt = self._inspect(catalog.load_table(TABLE), value["publication_id"], value["input_digest"])
        ack = self._publication_path(value["publication_id"], "receipt.json")
        if not ack.exists():
            raise ValueError("COMMITTED_UNACKNOWLEDGED_RETRY_SAME_PUBLICATION")
        if bounded_read(ack, 2 * MAX_INPUT_BYTES) != canonical_bytes(receipt):
            raise ValueError("ACK_INTEGRITY_MISMATCH")
        return receipt
