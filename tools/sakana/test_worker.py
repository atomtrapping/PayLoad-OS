"""Run with unittest discovery; tests use the actual pinned TreeQuest dependency.

Set NOTATIONS_SAKANA_TEST_DEPENDENCIES to an absolute operator install directory,
or install to .stamp/sakana-python. Missing dependencies fail the real-worker tests.
"""

from __future__ import annotations

import copy
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch

import worker


ROOT = Path(__file__).resolve().parents[2]
DEPENDENCIES = str(Path(os.environ.get(
    "NOTATIONS_SAKANA_TEST_DEPENDENCIES", ROOT / ".stamp" / "sakana-python",
)).resolve())


def source(identifier: str, tokens: int, coverage: list[str], standing: str = "SYNTHETIC") -> dict:
    return {
        "id": identifier, "reference": "opaque-reference-do-not-open",
        "contentDigest": "sha256:" + "a" * 64, "knownAt": "2026-09-08T12:00:00Z",
        "standing": standing, "tokens": tokens, "coverage": coverage,
    }


def request() -> dict:
    return {
        "schema": worker.REQUEST_SCHEMA, "requestId": "test-context-1",
        "classification": "SYNTHETIC", "processingBasis": "Synthetic metadata fixture only.",
        "requirements": [{"id": "quality", "weight": 3}, {"id": "provenance", "weight": 2}],
        "sources": [source("quality-source", 4, ["quality"]), source("provenance-source", 3, ["provenance"])],
        "budget": {"maxTokens": 7, "maxSources": 2, "iterations": 32, "seed": 9},
    }


class ValidationTests(unittest.TestCase):
    def test_accepts_valid_request_without_mutation(self):
        packet = request()
        self.assertEqual(worker.read_request(io.BytesIO(json.dumps(packet).encode())), packet)
        self.assertEqual(worker.validate_request(packet), request())

    def test_rejects_duplicate_json_keys_at_any_depth(self):
        for raw in (b'{"schema":1,"schema":2}', b'{"nested":{"x":1,"x":2}}'):
            with self.subTest(raw=raw), self.assertRaises(worker.InvalidInput):
                worker.read_request(io.BytesIO(raw))

    def test_rejects_nonfinite_invalid_utf8_and_oversize_input(self):
        for raw in (b'{"x":NaN}', b'{"x":Infinity}', b'{"x":-Infinity}', b'\xff', b" " * 65537):
            with self.subTest(length=len(raw)), self.assertRaises(worker.InvalidInput):
                worker.read_request(io.BytesIO(raw))

    def test_reads_at_most_limit_plus_one(self):
        stream = io.BytesIO(b" " * 100000)
        with self.assertRaises(worker.InvalidInput):
            worker.read_request(stream)
        self.assertEqual(stream.tell(), 65537)

    def test_rejects_unknown_keys_and_caller_execution_fields(self):
        for location in ("root", "budget", "source", "requirement"):
            packet = request()
            container = {"root": packet, "budget": packet["budget"], "source": packet["sources"][0],
                         "requirement": packet["requirements"][0]}[location]
            container["command"] = "not-an-executable-input"
            with self.subTest(location=location), self.assertRaises(worker.InvalidInput):
                worker.validate_request(packet)

    def test_collection_limits_and_missing_fields(self):
        for key, length in (("requirements", 0), ("requirements", 33), ("sources", 0), ("sources", 65)):
            packet = request()
            packet[key] = [copy.deepcopy(packet[key][0]) for _ in range(length)]
            with self.subTest(key=key, length=length), self.assertRaises(worker.InvalidInput):
                worker.validate_request(packet)
        for key in request():
            packet = request(); del packet[key]
            with self.subTest(missing=key), self.assertRaises(worker.InvalidInput):
                worker.validate_request(packet)

    def test_numeric_boundaries_reject_boolean_float_and_out_of_range(self):
        checks = [
            ("budget", "maxTokens", [0, 32769, True, 1.0]),
            ("budget", "maxSources", [0, 17, False, "1"]),
            ("budget", "iterations", [0, 129, True, 1.0]),
            ("budget", "seed", [-1, 4294967296, True, 1.0]),
            ("source", "tokens", [0, 131073, True, 1.0]),
            ("requirement", "weight", [0, 1001, True, 1.0]),
        ]
        for location, key, values in checks:
            for value in values:
                packet = request()
                container = {"budget": packet["budget"], "source": packet["sources"][0],
                             "requirement": packet["requirements"][0]}[location]
                container[key] = value
                with self.subTest(location=location, key=key, value=value), self.assertRaises(worker.InvalidInput):
                    worker.validate_request(packet)

    def test_rejects_duplicate_ids_unknown_or_duplicate_coverage(self):
        packets = []
        packet = request(); packet["sources"].append(copy.deepcopy(packet["sources"][0])); packets.append(packet)
        packet = request(); packet["requirements"].append(copy.deepcopy(packet["requirements"][0])); packets.append(packet)
        packet = request(); packet["sources"][0]["coverage"] = ["unknown"]; packets.append(packet)
        packet = request(); packet["sources"][0]["coverage"] = ["quality", "quality"]; packets.append(packet)
        for packet in packets:
            with self.subTest(packet=packet), self.assertRaises(worker.InvalidInput):
                worker.validate_request(packet)

    def test_classification_standing_digests_ids_dates_and_text(self):
        mutations = [
            ("classification", "RESTRICTED"), ("requestId", "../path"),
            ("processingBasis", " "), ("processingBasis", "x" * 501),
            ("processingBasis", "\ud800"),
        ]
        for key, value in mutations:
            packet = request(); packet[key] = value
            with self.subTest(key=key), self.assertRaises(worker.InvalidInput):
                worker.validate_request(packet)
        for key, value in (
            ("standing", "ADMITTED"), ("standing", "unknown"), ("contentDigest", "a" * 64),
            ("knownAt", "2026-02-30T12:00:00Z"), ("knownAt", "2026-09-08T12:00:00"),
            ("knownAt", "2026-09-08T12:00:00+05:99"), ("reference", ""),
        ):
            packet = request(); packet["sources"][0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(worker.InvalidInput):
                worker.validate_request(packet)

    def test_real_metadata_version_is_required(self):
        with patch.object(worker.importlib.metadata, "version", return_value="0.3.1"):
            with self.assertRaises(worker.Unavailable):
                worker.load_treequest(str(ROOT))


class RealTreeQuestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.treequest, cls.numpy = worker.load_treequest(DEPENDENCIES)

    def run_search(self, packet: dict) -> dict:
        return worker.search(packet, self.treequest, self.numpy)

    def assert_valid_result(self, packet: dict, result: dict):
        sources = {s["id"]: s for s in packet["sources"]}
        weights = {r["id"]: r["weight"] for r in packet["requirements"]}
        prior_states = {()}
        self.assertEqual(result["tool"], {"name": "treequest", "version": "0.3.2", "algorithm": "ABMCTS-A"})
        self.assertEqual(result["searchIterations"], packet["budget"]["iterations"])
        self.assertEqual(len(result["trace"]), result["searchIterations"])
        self.assertEqual(result["requestId"], packet["requestId"])
        self.assertEqual(result["schema"], worker.RESULT_SCHEMA)
        for step, entry in enumerate(result["trace"], 1):
            parent, selected = entry["parentSourceIds"], entry["selectedSourceIds"]
            self.assertEqual(entry["step"], step)
            self.assertIn(tuple(parent), prior_states)
            self.assertEqual(selected, sorted(set(selected)))
            self.assertTrue(set(parent).issubset(selected))
            self.assertLessEqual(len(set(selected) - set(parent)), 1)
            self.assertLessEqual(len(selected), packet["budget"]["maxSources"])
            token_count = sum(sources[key]["tokens"] for key in selected)
            self.assertLessEqual(token_count, packet["budget"]["maxTokens"])
            for key in selected:
                self.assertNotIn(sources[key]["standing"], {"REFUSED", "WITHDRAWN"})
            coverage = {r for key in selected for r in sources[key]["coverage"]}
            self.assertEqual(entry["score"], sum(weights[r] for r in coverage) / sum(weights.values()))
            if parent == selected:
                feasible = [s for s in sources.values() if s["id"] not in parent
                            and s["standing"] not in {"REFUSED", "WITHDRAWN"}
                            and token_count + s["tokens"] <= packet["budget"]["maxTokens"]]
                self.assertTrue(len(parent) == packet["budget"]["maxSources"] or not feasible)
            prior_states.add(tuple(selected))
        selected = result["selectedSourceIds"]
        self.assertIn(tuple(selected), prior_states)
        coverage = sorted({r for key in selected for r in sources[key]["coverage"]})
        self.assertEqual(result["coveredRequirementIds"], coverage)
        self.assertEqual(result["coveredWeight"], sum(weights[r] for r in coverage))
        self.assertEqual(result["totalWeight"], sum(weights.values()))
        self.assertEqual(result["tokenCount"], sum(sources[key]["tokens"] for key in selected))
        ranked = sorted(result["trace"], key=lambda e: (
            -e["score"], sum(sources[key]["tokens"] for key in e["selectedSourceIds"]), e["selectedSourceIds"],
        ))
        self.assertEqual(selected, ranked[0]["selectedSourceIds"])

    def test_real_step_and_top_k_with_full_coverage(self):
        packet = request()
        with patch.object(self.treequest.ABMCTSA, "step", autospec=True, side_effect=self.treequest.ABMCTSA.step) as step:
            with patch.object(self.treequest, "top_k", wraps=self.treequest.top_k) as top_k:
                result = self.run_search(packet)
        self.assertEqual(step.call_count, packet["budget"]["iterations"])
        top_k.assert_called_once()
        self.assert_valid_result(packet, result)
        self.assertEqual(result["coveredWeight"], 5)
        self.assertTrue(any(t["parentSourceIds"] for t in result["trace"]))

    def test_same_seed_same_result_and_no_packet_mutation(self):
        packet = request(); original = copy.deepcopy(packet)
        self.assertEqual(self.run_search(packet), self.run_search(packet))
        self.assertEqual(packet, original)

    def test_refused_withdrawn_and_over_budget_sources_excluded(self):
        packet = request(); packet["classification"] = "INTERNAL"
        packet["sources"] += [source("refused", 1, ["quality", "provenance"], "REFUSED"),
                              source("withdrawn", 1, ["quality", "provenance"], "WITHDRAWN"),
                              source("too-large", 8, ["quality", "provenance"], "ADMITTED")]
        result = self.run_search(packet)
        self.assert_valid_result(packet, result)
        self.assertEqual(result["coveredWeight"], 5)

    def test_no_feasible_sources_returns_empty_plan(self):
        packet = request(); packet["budget"]["maxTokens"] = 1
        result = self.run_search(packet)
        self.assert_valid_result(packet, result)
        self.assertEqual(result["selectedSourceIds"], [])
        self.assertEqual(result["coveredWeight"], 0)

    def test_all_refused_and_withdrawn_sources_return_empty_plan(self):
        packet = request(); packet["classification"] = "PUBLIC"
        packet["sources"][0]["standing"] = "REFUSED"
        packet["sources"][1]["standing"] = "WITHDRAWN"
        result = self.run_search(packet)
        self.assert_valid_result(packet, result)
        self.assertEqual(result["selectedSourceIds"], [])

    def test_reordered_source_metadata_does_not_change_search(self):
        packet = request(); packet["budget"]["seed"] = 4294967295
        original = self.run_search(packet)
        packet["sources"].reverse(); packet["requirements"].reverse()
        self.assertEqual(self.run_search(packet), original)

    def test_ties_use_lower_tokens_then_sorted_ids(self):
        packet = request()
        packet["sources"] = [source("z-costly", 3, ["quality"]), source("b-cheap", 2, ["quality"]),
                             source("a-cheap", 2, ["quality"])]
        packet["budget"].update(maxSources=1, iterations=128)
        result = self.run_search(packet)
        self.assert_valid_result(packet, result)
        self.assertEqual(result["selectedSourceIds"], ["a-cheap"])

    def test_no_network_or_child_process_required(self):
        with patch.object(socket, "socket", side_effect=AssertionError("Network forbidden")):
            with patch.object(socket, "create_connection", side_effect=AssertionError("Network forbidden")):
                with patch.object(subprocess, "Popen", side_effect=AssertionError("Child process forbidden")):
                    self.assert_valid_result(request(), self.run_search(request()))

    def test_cli_outputs_single_json_without_input_text(self):
        packet = request()
        completed = subprocess.run(
            [sys.executable, str(Path(worker.__file__).resolve()), "--dependencies", DEPENDENCIES],
            input=json.dumps(packet).encode(), capture_output=True, timeout=30, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr.decode())
        self.assertEqual(completed.stderr, b"")
        self.assertEqual(len(completed.stdout.splitlines()), 1)
        result = json.loads(completed.stdout)
        self.assert_valid_result(packet, result)
        self.assertNotIn(packet["processingBasis"].encode(), completed.stdout)
        self.assertNotIn(packet["sources"][0]["reference"].encode(), completed.stdout)

    def test_cli_rejects_invalid_input_without_echo(self):
        for raw in (b'{"requestId":"private-marker","requestId":"duplicate"}', b" " * 65537, b'{"x":NaN}'):
            completed = subprocess.run(
                [sys.executable, str(Path(worker.__file__).resolve()), "--dependencies", DEPENDENCIES],
                input=raw, capture_output=True, timeout=30, check=False,
            )
            self.assertEqual(completed.returncode, 2)
            self.assertEqual(completed.stderr, b"")
            self.assertEqual(json.loads(completed.stdout), {"error": "SAKANA_WORKER_INVALID_INPUT"})


if __name__ == "__main__":
    unittest.main()
