"""Bounded stdin/stdout protocol for the local terminal publication bridge."""
import argparse
import json
import re
import sys

from .writer import MAX_INPUT_BYTES, TerminalLake, canonical_bytes, parse_json


def main(argv=None):
    parser = argparse.ArgumentParser(description="Local fixture index; no source access or authorization.")
    parser.add_argument("--root", required=True)
    parser.add_argument("command", choices=("init", "publish", "read"))
    args = parser.parse_args(argv)
    try:
        body = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        lake = TerminalLake(args.root)
        if args.command == "init":
            if body.strip():
                raise ValueError("INIT_TAKES_NO_INPUT")
            result = lake.initialize()
        else:
            value = parse_json(body)
            result = lake.publish(value) if args.command == "publish" else lake.read(value)
        sys.stdout.buffer.write(canonical_bytes(result) + b"\n")
        return 0
    except Exception as failure:
        # Never expose SQL diagnostics, local paths, manifest values or dependency exception text.
        message = str(failure)
        code = message if isinstance(failure, ValueError) and re.fullmatch(r"[A-Z][A-Z0-9_]{0,95}", message) else "LOCAL_INDEX_FAILED"
        sys.stderr.write(json.dumps({"error": code, "fixture_only": True, "canonical_admission": False}) + "\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
