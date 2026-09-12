"""Offline qualification against actual Iceberg/Parquet and isolated temporary stores."""
import copy
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from .local_io import TerminalFileIO
from .writer import (CONTRACT, READ_CONTRACT, MAX_INPUT_BYTES, TerminalLake,
                     canonical_bytes, digest, parse_json, validate_manifest)


def publication(publication_id="pub-first", job_id="job-first", **updates):
    row = {"job_id": job_id, "result_digest": "sha256:" + "a" * 64,
           "artifact_digest": "sha256:" + "b" * 64,
           "object_key": "terminal-artifacts/sha256/" + "b" * 64 + ".json",
           "corpus_id": "caravan-fixture", "release_id": "REL-2026.09.12",
           "known_at": "2026-09-12T12:00:00.000Z", "corrects_job_id": None,
           "fixture_only": True, **updates}
    value = {"schema": CONTRACT, "publication_id": publication_id, "records": [row]}
    return {**value, "input_digest": digest(value)}


def read_request(value):
    return {"schema": READ_CONTRACT, "publication_id": value["publication_id"], "input_digest": value["input_digest"]}


def files(root):
    return {path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob("*") if path.is_file()}


def run_child(root, command, value=None, *, crash=False):
    # Explicit test bootstrap supports an externally provisioned, read-only dependency directory.
    bootstrap = "import sys;sys.path[:0]=" + repr(sys.path) + ";"
    if crash:
        bootstrap += ("import os;from tools.terminal_lake.writer import TerminalLake,parse_json;"
                      "TerminalLake(sys.argv[1]).publish(parse_json(sys.stdin.buffer.read()),_after_commit=lambda:os._exit(79))")
        args = [sys.executable, "-B", "-c", bootstrap, str(root)]
    else:
        bootstrap += "from tools.terminal_lake.__main__ import main;raise SystemExit(main())"
        args = [sys.executable, "-B", "-c", bootstrap, "--root", str(root), command]
    return subprocess.run(args, input=b"" if value is None else canonical_bytes(value),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45, check=False)


class ContractTests(unittest.TestCase):
    def test_pinned_dependency_baseline(self):
        self.assertEqual(importlib.metadata.version("pyiceberg"), "0.11.1")
        self.assertEqual(importlib.metadata.version("pyarrow"), "21.0.0")
        self.assertEqual(importlib.metadata.version("sqlalchemy"), "2.0.43")

    def test_exact_commitment_and_detached_manifest(self):
        value = publication()
        parsed = validate_manifest(value)
        self.assertEqual(parsed, value)
        parsed["records"][0]["job_id"] = "changed"
        self.assertEqual(value["records"][0]["job_id"], "job-first")

    def test_invalid_manifest_variants(self):
        variants = [None, {}, {**publication(), "extra": True},
                    {**publication(), "input_digest": "sha256:" + "c" * 64},
                    publication(fixture_only=False), publication(fixture_only=1),
                    publication(job_id="../escape"), publication(object_key="../../secret"),
                    publication(object_key="file:///private"), publication(object_key="C:\\private"),
                    publication(known_at="2026-02-30T12:00:00.000Z"),
                    publication(known_at="2026-09-12T12:00:00Z"),
                    publication(corrects_job_id="job-first"), publication(artifact_digest="b" * 64)]
        for value in variants:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_manifest(value)

    def test_strict_json_and_byte_limit(self):
        for data in (b'{"a":1,"a":2}', b'{"a":1,"\\u0061":2}', b'\xff', b'{"a":NaN}', b'[]' + b' ' * MAX_INPUT_BYTES):
            with self.subTest(data=data[:24]), self.assertRaises(ValueError):
                parse_json(data)

    def test_dedicated_absolute_root(self):
        for root in ("relative", str(Path.cwd().anchor), str(Path.cwd() / ".payload" / "index")):
            with self.subTest(root=root), self.assertRaises(ValueError):
                TerminalLake(root)


class IcebergTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="terminal-lake-test-")
        self.root = Path(self.temporary.name) / "index"
        self.lake = TerminalLake(self.root)
        self.lake.initialize()

    def tearDown(self):
        self.temporary.cleanup()

    def test_real_parquet_commit_and_fresh_process_exact_read(self):
        value = publication()
        result = self.lake.publish(value)
        self.assertIsInstance(result["snapshot_id"], str)
        self.assertEqual(result["manifest"], value)
        self.assertEqual(result["record_count"], 1)
        self.assertEqual(result["snapshot_record_count"], 1)
        self.assertFalse(result["canonical_admission"])
        parquet = list(self.root.rglob("*.parquet"))
        self.assertEqual(len(parquet), 1)
        self.assertEqual(parquet[0].read_bytes()[:4], b"PAR1")
        before = files(self.root)
        child = run_child(self.root, "read", read_request(value))
        self.assertEqual(child.returncode, 0, child.stderr.decode())
        self.assertEqual(json.loads(child.stdout), result)
        self.assertEqual(files(self.root), before)

    def test_retry_and_correction_preserve_old_snapshot(self):
        first = publication()
        original = self.lake.publish(first)
        before = files(self.root)
        self.assertEqual(self.lake.publish(first), original)
        self.assertEqual(files(self.root), before)
        correction = publication("pub-corrected", "job-corrected", corrects_job_id="job-first",
                                 known_at="2026-09-12T13:00:00.000Z", release_id="REL-2026.09.13")
        second = self.lake.publish(correction)
        self.assertEqual(second["snapshot_record_count"], 2)
        self.assertNotEqual(second["snapshot_id"], original["snapshot_id"])
        child = run_child(self.root, "read", read_request(first))
        self.assertEqual(child.returncode, 0, child.stderr.decode())
        self.assertEqual(json.loads(child.stdout), original)

    def test_collision_refuses_no_new_snapshot(self):
        self.lake.publish(publication())
        for value in (publication(result_digest="sha256:" + "c" * 64),
                      publication("another-publication", "job-first")):
            with self.assertRaisesRegex(ValueError, "PUBLICATION_ID_CONFLICT|JOB_ID_CONFLICT"):
                self.lake.publish(value)
        self.assertEqual(len(list(self.root.rglob("*.parquet"))), 1)

    def test_unresolved_or_nonchronological_correction_refuses(self):
        self.lake.publish(publication())
        for value in (publication("pub-c2", "job-2", corrects_job_id="missing"),
                      publication("pub-c3", "job-3", corrects_job_id="job-first", known_at="2026-09-12T11:00:00.000Z"),
                      publication("pub-c4", "job-4", corrects_job_id="job-first", known_at="2026-09-12T13:00:00.000Z", corpus_id="different")):
            with self.assertRaisesRegex(ValueError, "CORRECTION_PREDECESSOR_MISMATCH"):
                self.lake.publish(value)

    def test_correction_over_same_input_snapshot_preserves_equal_knowledge_time(self):
        self.lake.publish(publication())
        corrected = publication("pub-same-snapshot", "job-corrected", corrects_job_id="job-first")
        result = self.lake.publish(corrected)
        self.assertEqual(result["manifest"]["records"][0]["known_at"], "2026-09-12T12:00:00.000Z")
        self.assertEqual(result["snapshot_record_count"], 2)

    def test_abrupt_process_death_after_real_commit_recovers_without_duplicate(self):
        value = publication()
        child = run_child(self.root, "publish", value, crash=True)
        self.assertEqual(child.returncode, 79, child.stderr.decode())
        self.assertEqual(len(list(self.root.rglob("*.parquet"))), 1)
        with self.assertRaisesRegex(ValueError, "COMMITTED_UNACKNOWLEDGED"):
            self.lake.read(read_request(value))
        recovered = run_child(self.root, "publish", value)
        self.assertEqual(recovered.returncode, 0, recovered.stderr.decode())
        receipt = json.loads(recovered.stdout)
        self.assertEqual(receipt["record_count"], 1)
        self.assertEqual(receipt["snapshot_record_count"], 1)
        self.assertEqual(len(list(self.root.rglob("*.parquet"))), 1)
        self.assertEqual(self.lake.read(read_request(value)), receipt)

    def test_os_writer_lock_fences_competing_process_and_releases(self):
        with self.lake.writer_lock():
            child = run_child(self.root, "init")
            self.assertEqual(child.returncode, 1)
            self.assertEqual(json.loads(child.stderr)["error"], "LOCAL_WRITER_BUSY")
        child = run_child(self.root, "init")
        self.assertEqual(child.returncode, 0, child.stderr.decode())

    def test_attempt_without_commit_refuses_reappend(self):
        value = publication()
        with patch("pyiceberg.table.Table.append", side_effect=RuntimeError("test precommit failure")):
            with self.assertRaises(RuntimeError):
                self.lake.publish(value)
        with self.assertRaisesRegex(ValueError, "APPEND_OUTCOME_UNKNOWN_NO_REAPPEND"):
            self.lake.publish(value)
        self.assertEqual(list(self.root.rglob("*.parquet")), [])

    def test_intent_and_ack_tampering_refuse_without_repair(self):
        value = publication()
        self.lake.publish(value)
        intent_path = self.lake._publication_path(value["publication_id"], "intent.json")
        original = intent_path.read_bytes()
        changed = copy.deepcopy(value)
        changed["records"][0]["object_key"] = "other/key.json"
        intent_path.write_bytes(canonical_bytes(changed))
        before = files(self.root)
        with self.assertRaises(ValueError):
            self.lake.read(read_request(value))
        self.assertEqual(files(self.root), before)
        intent_path.write_bytes(original)
        ack_path = self.lake._publication_path(value["publication_id"], "receipt.json")
        ack_path.write_bytes(b'{}')
        before = files(self.root)
        with self.assertRaisesRegex(ValueError, "ACK_INTEGRITY_MISMATCH"):
            self.lake.read(read_request(value))
        self.assertEqual(files(self.root), before)

    def test_parquet_byte_tamper_detected(self):
        value = publication()
        self.lake.publish(value)
        parquet = next(self.root.rglob("*.parquet"))
        parquet.write_bytes(b"not a parquet file")
        before = files(self.root)
        with self.assertRaises(Exception):
            self.lake.read(read_request(value))
        self.assertEqual(files(self.root), before)

    def test_snapshot_summary_tamper_detected(self):
        value = publication()
        self.lake.publish(value)
        metadata_path = next(path for path in self.root.rglob("*.metadata.json")
                             if json.loads(path.read_bytes()).get("snapshots"))
        metadata = json.loads(metadata_path.read_bytes())
        metadata["snapshots"][0]["summary"]["terminal.input-digest"] = "sha256:" + "f" * 64
        metadata_path.write_bytes(canonical_bytes(metadata))
        before = files(self.root)
        with self.assertRaisesRegex(ValueError, "SNAPSHOT_INTENT_MISMATCH"):
            self.lake.read(read_request(value))
        self.assertEqual(files(self.root), before)

    def test_valid_parquet_with_changed_prior_row_is_not_accepted_in_new_snapshot(self):
        import pyarrow as pa
        import pyarrow.parquet as pq
        first = publication()
        self.lake.publish(first)
        correction = publication("pub-next", "job-next", corrects_job_id="job-first", known_at="2026-09-12T13:00:00.000Z")
        self.lake.publish(correction)
        for path in self.root.rglob("*.parquet"):
            original = pq.read_table(path)
            rows = original.to_pylist()
            if rows[0]["job_id"] == "job-first":
                rows[0]["result_digest"] = "sha256:" + "c" * 64
                pq.write_table(pa.Table.from_pylist(rows, schema=original.schema), path)
                break
        before = files(self.root)
        with self.assertRaisesRegex(ValueError, "COMMITTED_ROWS_MISMATCH"):
            self.lake.read(read_request(correction))
        self.assertEqual(files(self.root), before)

    def test_metadata_history_cap_refuses_new_publication(self):
        self.lake.publish(publication())
        with patch("tools.terminal_lake.writer.MAX_PUBLICATIONS", 1):
            with self.assertRaisesRegex(ValueError, "PUBLICATION_HISTORY_LIMIT"):
                self.lake.publish(publication("pub-2", "job-2"))
        self.assertEqual(len(list(self.root.rglob("*.parquet"))), 1)

    def test_read_missing_publication_does_not_create_directories(self):
        before = files(self.root)
        with self.assertRaises(FileNotFoundError):
            self.lake.read(read_request(publication("missing")))
        self.assertEqual(files(self.root), before)

    def test_initialization_refuses_nonempty_unmarked_root(self):
        other = self.root.parent / "unrelated"
        other.mkdir()
        protected = other / "existing.txt"
        protected.write_bytes(b"preserve")
        with self.assertRaisesRegex(ValueError, "EMPTY_DEDICATED_ROOT_REQUIRED"):
            TerminalLake(other).initialize()
        self.assertEqual(protected.read_bytes(), b"preserve")

    def test_file_io_cannot_open_remote_or_outside_index(self):
        properties = {"terminal.root": str(self.root)}
        for uri in ("s3://bucket/private", "https://host/private", (self.root.parent / "outside").as_uri()):
            with self.subTest(uri=uri), self.assertRaises(ValueError):
                TerminalFileIO.parse_location(uri, properties)

    def test_cli_bounds_errors_and_has_no_crash_flag(self):
        child = run_child(self.root, "publish", {"private": "DO_NOT_ECHO"})
        self.assertEqual(child.returncode, 1)
        self.assertNotIn(b"DO_NOT_ECHO", child.stderr)
        self.assertNotIn(str(self.root).encode(), child.stderr)


if __name__ == "__main__":
    unittest.main()
