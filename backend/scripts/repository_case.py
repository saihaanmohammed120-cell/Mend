"""Prepare or review explicit offline repository snapshots; never execute source."""
import argparse
from pathlib import Path
import sys

from mend.domain import MendError, canonical_json
from mend.repository_case import MAX_REPOSITORY_JSON_BYTES, prepare_repository_case, review_repository_candidate
from mend.transport import strict_json


def read_json(path):
    with path.open("rb") as handle:
        data = handle.read(MAX_REPOSITORY_JSON_BYTES + 1)
    if len(data) > MAX_REPOSITORY_JSON_BYTES:
        raise ValueError("Repository input exceeds the offline bound.")
    return strict_json(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--request", required=True, type=Path,
                         help="JSON containing files, editable_paths and required_check_ids only.")
    review = commands.add_parser("review")
    review.add_argument("--case", required=True, type=Path)
    review.add_argument("--candidate", required=True, type=Path, help="Exact JSON path-to-source map.")
    review.add_argument("--expected-case-sha256", required=True, help="Operator-pinned canonical case hash.")
    for command in (prepare, review):
        command.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            request = read_json(args.request)
            if not isinstance(request, dict) or set(request) != {"files", "editable_paths", "required_check_ids"}:
                raise ValueError("Repository request fields do not match the contract.")
            result = prepare_repository_case(**request)
        else:
            result = review_repository_candidate(read_json(args.case), read_json(args.candidate),
                                                expected_case_sha256=args.expected_case_sha256)
        with args.output.open("xb") as handle:
            try:
                handle.write(canonical_json(result) + b"\n")
            except OSError:
                handle.close()
                args.output.unlink()
                raise
    except (OSError, ValueError, UnicodeError, RecursionError, MendError):
        print("Repository review failed: check frozen inputs, bounded sources and destination. No code was executed.",
              file=sys.stderr)
        return 2
    print("Prepared offline repository review; no execution, approval or patch application.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
