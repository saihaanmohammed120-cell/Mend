"""Evaluate an offline review policy against existing signed evidence; execute nothing."""
import argparse
from pathlib import Path
import sys

from mend.approval_policy import evaluate_approval_policy
from mend.domain import MendError, canonical_json
from mend.transport import strict_json


def read_bounded(path, maximum):
    with path.open("rb") as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("Input exceeds the offline policy bound.")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", required=True, type=Path, help="Operator-controlled case-specific policy.")
    parser.add_argument("--case", required=True, type=Path, help="Frozen prepared bug contract.")
    parser.add_argument("--candidate", required=True, type=Path, help="Candidate module UTF-8 source, read only.")
    parser.add_argument("--evidence", required=True, type=Path, help="Raw signed original/candidate/history envelopes.")
    parser.add_argument("--expected-runs", required=True, type=Path,
                        help="Operator-controlled original/candidate/history identities; never workload-owned.")
    parser.add_argument("--key-file", required=True, type=Path,
                        help="Private trusted controller HMAC key, 32–256 raw bytes; never commit it.")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        key = read_bounded(args.key_file, 256)
        policy = strict_json(read_bounded(args.policy, 8192))
        case = strict_json(read_bounded(args.case, 3_000_000))
        candidate = read_bounded(args.candidate, 200000).decode("utf-8")
        evidence = strict_json(read_bounded(args.evidence, 8_000_000))
        expected = strict_json(read_bounded(args.expected_runs, 262144))
        result = evaluate_approval_policy(policy, case, candidate, evidence, expected, signing_key=key)
        with args.output.open("xb") as handle:
            try:
                handle.write(canonical_json(result) + b"\n")
            except OSError:
                handle.close()
                args.output.unlink()
                raise
    except (OSError, ValueError, UnicodeError, RecursionError, MendError):
        print("Policy review failed: inspect trusted authority, frozen inputs, bounds and destination. No code was executed.",
              file=sys.stderr)
        return 2
    print("Policy review: " + result["decision"] + "; execution and patch application remain disabled.")
    return 0 if result["decision"] == "review_approved" else 1


if __name__ == "__main__":
    raise SystemExit(main())
