"""Bounded, metadata-only context selection using the pinned TreeQuest package.

Coverage is supplied by the caller, not inferred or fact-checked here. This worker
does not read source references, generate code, contact models, or admit evidence.
The dependencies directory is operator configuration, never a request field.
"""

from __future__ import annotations

import os

# Set these before importing NumPy/SciPy through TreeQuest.
for _thread_variable in (
    "OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
    "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "BLIS_NUM_THREADS",
):
    os.environ[_thread_variable] = "1"

import contextlib
import datetime
import importlib.metadata
import json
from pathlib import Path
import random
import re
import sys
from typing import Any


MAX_INPUT_BYTES = 65536
TREEQUEST_VERSION = "0.3.2"
REQUEST_SCHEMA = "notation.sakana-context-search.v1"
RESULT_SCHEMA = "notation.sakana-context-result.v1"
ID_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,119}\Z")
DIGEST_PATTERN = re.compile(r"sha256:[0-9a-f]{64}\Z")
TIMESTAMP_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\Z"
)
STANDINGS = frozenset({
    "SYNTHETIC", "OBSERVATION", "UNADMITTED", "ADMITTED", "REFUSED", "WITHDRAWN",
})


class InvalidInput(ValueError):
    """An intentionally non-descriptive input failure; never echo caller data."""


class Unavailable(RuntimeError):
    """The operator's pinned runtime is unavailable."""


def _object(value: Any, keys: set[str]) -> dict[str, Any]:
    if type(value) is not dict or set(value) != keys:
        raise InvalidInput()
    return value


def _integer(value: Any, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise InvalidInput()
    return value


def _text(value: Any, maximum: int) -> str:
    if type(value) is not str or not value.strip() or len(value) > maximum:
        raise InvalidInput()
    # Reject lone Unicode surrogates, including escaped ones accepted by json.loads.
    try:
        value.encode("utf-8", errors="strict")
    except UnicodeEncodeError:
        raise InvalidInput() from None
    return value


def _id(value: Any) -> str:
    if type(value) is not str or ID_PATTERN.fullmatch(value) is None:
        raise InvalidInput()
    return value


def _array(value: Any, minimum: int, maximum: int) -> list[Any]:
    if type(value) is not list or not minimum <= len(value) <= maximum:
        raise InvalidInput()
    return value


def _timestamp(value: Any) -> None:
    if type(value) is not str or len(value) > 64 or not TIMESTAMP_PATTERN.fullmatch(value):
        raise InvalidInput()
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
        # fromisoformat normalizes invalid offset minutes, so check them explicitly.
        if not value.endswith("Z"):
            if int(value[-5:-3]) > 23 or int(value[-2:]) > 59:
                raise ValueError()
    except ValueError:
        raise InvalidInput() from None


def validate_request(value: Any) -> dict[str, Any]:
    request = _object(value, {
        "schema", "requestId", "classification", "processingBasis", "requirements",
        "sources", "budget",
    })
    if request["schema"] != REQUEST_SCHEMA:
        raise InvalidInput()
    _id(request["requestId"])
    if type(request["classification"]) is not str or request["classification"] not in {
        "SYNTHETIC", "PUBLIC", "INTERNAL",
    }:
        raise InvalidInput()
    _text(request["processingBasis"], 500)
    requirement_ids: set[str] = set()
    for requirement in _array(request["requirements"], 1, 32):
        _object(requirement, {"id", "weight"})
        identifier = _id(requirement["id"])
        if identifier in requirement_ids:
            raise InvalidInput()
        requirement_ids.add(identifier)
        _integer(requirement["weight"], 1, 1000)
    source_ids: set[str] = set()
    for source in _array(request["sources"], 1, 64):
        _object(source, {
            "id", "reference", "contentDigest", "knownAt", "standing", "tokens", "coverage",
        })
        identifier = _id(source["id"])
        if identifier in source_ids:
            raise InvalidInput()
        source_ids.add(identifier)
        _text(source["reference"], 500)
        if type(source["contentDigest"]) is not str or not DIGEST_PATTERN.fullmatch(source["contentDigest"]):
            raise InvalidInput()
        _timestamp(source["knownAt"])
        if type(source["standing"]) is not str or source["standing"] not in STANDINGS:
            raise InvalidInput()
        if request["classification"] == "SYNTHETIC" and source["standing"] != "SYNTHETIC":
            raise InvalidInput()
        _integer(source["tokens"], 1, 131072)
        coverage_ids: set[str] = set()
        for covered in _array(source["coverage"], 0, 32):
            _id(covered)
            if covered not in requirement_ids or covered in coverage_ids:
                raise InvalidInput()
            coverage_ids.add(covered)
    budget = _object(request["budget"], {"maxTokens", "maxSources", "iterations", "seed"})
    _integer(budget["maxTokens"], 1, 32768)
    _integer(budget["maxSources"], 1, 16)
    _integer(budget["iterations"], 1, 128)
    _integer(budget["seed"], 0, 4294967295)
    return request


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise InvalidInput()
        result[key] = value
    return result


def _invalid_constant(_value: str) -> None:
    raise InvalidInput()


def read_request(stream: Any) -> dict[str, Any]:
    raw = stream.read(MAX_INPUT_BYTES + 1)
    if type(raw) is not bytes or len(raw) > MAX_INPUT_BYTES:
        raise InvalidInput()
    try:
        value = json.loads(
            raw.decode("utf-8", errors="strict"),
            object_pairs_hook=_unique_object,
            parse_constant=_invalid_constant,
        )
        return validate_request(value)
    except (UnicodeError, ValueError, TypeError, RecursionError):
        raise InvalidInput() from None


def load_treequest(dependencies: str) -> tuple[Any, Any]:
    """Use an explicit path because the bundled isolated Python ignores PYTHONPATH."""
    try:
        path = Path(dependencies)
        if not path.is_absolute():
            raise Unavailable()
        path = path.resolve(strict=True)
        if not path.is_dir():
            raise Unavailable()
        sys.path.insert(0, str(path))
        if importlib.metadata.version("treequest") != TREEQUEST_VERSION:
            raise Unavailable()
        import numpy
        import treequest

        if not Path(treequest.__file__).resolve().is_relative_to(path):
            raise Unavailable()
        return treequest, numpy
    except (ImportError, OSError, TypeError, ValueError):
        raise Unavailable() from None


def search(request: dict[str, Any], treequest: Any, numpy: Any) -> dict[str, Any]:
    """Optimize caller-declared weighted coverage, not relevance or factual truth."""
    validate_request(request)
    budget = request["budget"]
    generator = random.Random(budget["seed"])
    # TreeQuest 0.3.2's SciPy distributions and NumPy draws use this shared RNG.
    numpy.random.seed(budget["seed"])
    sources = {
        source["id"]: source for source in request["sources"]
        if source["standing"] not in {"REFUSED", "WITHDRAWN"}
    }
    weights = {requirement["id"]: requirement["weight"] for requirement in request["requirements"]}
    total_weight = sum(weights.values())
    trace: list[dict[str, Any]] = []

    def statistics(state: tuple[str, ...]) -> tuple[list[str], int, int]:
        covered = sorted({identifier for key in state for identifier in sources[key]["coverage"]})
        return covered, sum(weights[key] for key in covered), sum(sources[key]["tokens"] for key in state)

    def generate(parent_state: tuple[str, ...] | None) -> tuple[tuple[str, ...], float]:
        parent = parent_state if parent_state is not None else ()
        parent_tokens = statistics(parent)[2]
        feasible = [
            key for key in sorted(sources)
            if key not in parent and len(parent) < budget["maxSources"]
            and parent_tokens + sources[key]["tokens"] <= budget["maxTokens"]
        ]
        selected = tuple(sorted((*parent, generator.choice(feasible)))) if feasible else parent
        score = statistics(selected)[1] / total_weight
        trace.append({
            "step": len(trace) + 1,
            "parentSourceIds": list(parent),
            "selectedSourceIds": list(selected),
            "score": score,
        })
        return selected, score

    algorithm = treequest.ABMCTSA()
    tree = algorithm.init_tree()
    for _iteration in range(budget["iterations"]):
        # TreeQuest chooses the parent; this is not a separately ranked random search.
        tree = algorithm.step(tree, {"extend-supplied-context": generate}, inplace=True)
    if len(trace) != budget["iterations"]:
        raise Unavailable()

    def rank(pairs: list[Any]) -> list[Any]:
        return sorted(pairs, key=lambda pair: (-pair[1], statistics(pair[0])[2], pair[0]))

    selected, _score = treequest.top_k(tree, algorithm, k=1, ranking_fn=rank)[0]
    covered, covered_weight, token_count = statistics(selected)
    return {
        "schema": RESULT_SCHEMA,
        "requestId": request["requestId"],
        "tool": {"name": "treequest", "version": TREEQUEST_VERSION, "algorithm": "ABMCTS-A"},
        "selectedSourceIds": list(selected),
        "coveredRequirementIds": covered,
        "coveredWeight": covered_weight,
        "totalWeight": total_weight,
        "tokenCount": token_count,
        "trace": trace,
        "searchIterations": len(trace),
    }


class _DiscardOutput:
    def write(self, value: str) -> int:
        return len(value)

    def flush(self) -> None:
        pass


def main(argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv
    try:
        if len(arguments) != 2 or arguments[0] != "--dependencies":
            raise Unavailable()
        request = read_request(sys.stdin.buffer)
        # Keep the protocol to one JSON document, even if a dependency logs.
        with contextlib.redirect_stdout(_DiscardOutput()), contextlib.redirect_stderr(_DiscardOutput()):
            treequest, numpy = load_treequest(arguments[1])
            result = search(request, treequest, numpy)
        exit_code = 0
    except InvalidInput:
        result, exit_code = {"error": "SAKANA_WORKER_INVALID_INPUT"}, 2
    except Exception:
        result, exit_code = {"error": "SAKANA_WORKER_UNAVAILABLE"}, 3
    sys.stdout.write(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
