"""Offline CI gate for existing signed check histories; never run submitted code."""
import argparse
from pathlib import Path
import sys

from mend.check_history import analyze_check_history
from mend.domain import MendError, canonical_json
from mend.transport import strict_json


def read_bounded(path, maximum):
    with path.open("rb") as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("Input exceeds the history gate bound.")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--expected-runs", required=True, type=Path,
                        help="Operator-controlled identity inventory, in report order; never workload-owned.")
    parser.add_argument("--report", required=True, action="append", type=Path)
    parser.add_argument("--key-file", required=True, type=Path,
                        help="Private controller HMAC key as 32–256 raw bytes; never commit it.")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if len(args.report) > 100:
            raise ValueError("Too many reports.")
        key = read_bounded(args.key_file, 256)
        contract = strict_json(read_bounded(args.contract, 262144))
        expected = strict_json(read_bounded(args.expected_runs, 262144))
        reports = [strict_json(read_bounded(path, 65536)) for path in args.report]
        result = analyze_check_history(reports, expected, contract, signing_key=key)
        with args.output.open("xb") as handle:
            try:
                handle.write(canonical_json(result) + b"\n")
            except OSError:
                handle.close()
                args.output.unlink()
                raise
    except (OSError, ValueError, UnicodeError, RecursionError, MendError):
        print("History gate failed: inspect authority, frozen inventory, bounded inputs and destination. No tests were run.",
              file=sys.stderr)
        return 2
    print(f"History gate: {result['gate_status']}; {result['observed_runs']} observed runs; "
          f"{len(result['quarantine_candidates'])} checks flagged for review. No tests excluded.")
    return {"passed": 0, "blocked": 1, "inconclusive": 2}[result["gate_status"]]


if __name__ == "__main__":
    raise SystemExit(main())
