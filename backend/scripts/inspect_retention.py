"""Read-only retention readiness. No apply/delete mode, provider calls or task writes."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from mend.bootstrap import database_repository_from_env
from mend.domain import MendError
from mend.retention import summarize_retention
from scripts.verify_http_preflight import environment


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20, help="Maximum expired tasks to inspect, 1–100.")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    args = parser.parse_args()
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be 1–100")
    try:
        values = environment(args.env_file) if args.env_file.is_file() else os.environ.copy()
        repository = database_repository_from_env(values)
        result = summarize_retention(repository.retention_plan(args.limit))
    except MendError as error:
        print(json.dumps({"status": "blocked", "code": error.code, "deletion_performed": False}))
        return 2
    except Exception:
        print(json.dumps({"status": "blocked", "code": "retention_inspection_failed", "deletion_performed": False}))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
