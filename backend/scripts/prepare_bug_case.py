"""Prepare an unsigned offline bug contract; never execute submitted code."""
import argparse
import sys
from pathlib import Path

from mend.bug_cases import prepare_bug_case
from mend.domain import MendError, canonical_json
from mend.transport import strict_json


def read_bounded(path, maximum):
    with Path(path).open("rb") as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("Input exceeds the offline review size limit.")
    return data.decode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--intake", type=Path)
    inputs.add_argument("--request", type=Path, help="Review-request JSON exported by the local bug desk.")
    parser.add_argument("--checks", type=Path)
    parser.add_argument("--check", action="append", dest="check_ids")
    parser.add_argument("--target-check")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.request:
            if any((args.checks, args.check_ids, args.target_check)):
                parser.error("--request cannot be combined with separate check inputs.")
            request = strict_json(read_bounded(args.request, 1_048_576))
            if (not isinstance(request, dict) or set(request) != {
                    "intake", "protected_test_source", "required_check_ids", "target_check_id"}):
                raise ValueError("Review request fields do not match the preparation contract.")
            case = prepare_bug_case(**request)
        else:
            if not all((args.checks, args.check_ids, args.target_check)):
                parser.error("--intake requires --checks, --check and --target-check.")
            case = prepare_bug_case(strict_json(read_bounded(args.intake, 1_048_576)),
                                    read_bounded(args.checks, 200000), args.check_ids, args.target_check)
        output = canonical_json(case) + b"\n"
        # Exclusive creation cannot truncate the input or a prior review artifact.
        with args.output.open("xb") as handle:
            try:
                handle.write(output)
            except OSError:
                handle.close()
                args.output.unlink()
                raise
    except (OSError, ValueError, UnicodeError, RecursionError, MendError):
        print("Preparation failed: check input format, size and destination; no execution was started.", file=sys.stderr)
        return 2
    print("Prepared unsigned review contract; no execution approval, provider request or database write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
