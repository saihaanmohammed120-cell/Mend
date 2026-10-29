#!/usr/bin/env python3
"""Verify installed runtime pins, or export plain constraints for test extras."""
import argparse
import importlib.metadata
from pathlib import Path
import re
import sys


LOCK = Path(__file__).resolve().parents[1] / "requirements.runtime.lock"


def locked_versions(text):
    pins = {}
    for number, line in enumerate(text.replace("\\\n", " ").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(
            r"([A-Za-z0-9][A-Za-z0-9._-]*)==([A-Za-z0-9][A-Za-z0-9.!+_-]*)"
            r"(?:\s+--hash=sha256:[0-9a-f]{64})+", line,
        )
        if not match:
            raise ValueError(f"unsupported or unhashed runtime lock entry at line {number}")
        name, version = match.groups()
        name = re.sub(r"[-_.]+", "-", name).lower()
        if name in pins:
            raise ValueError(f"duplicate runtime lock entry: {name}")
        pins[name] = version
    if not pins:
        raise ValueError("runtime lock has no pinned distributions")
    return pins


def main(argv=None, stream=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--constraints", action="store_true")
    args = parser.parse_args(argv)
    stream = sys.stdout if stream is None else stream
    try:
        pins = locked_versions(LOCK.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        print(f"RUNTIME_LOCK FAIL: {error}", file=stream)
        return 1
    if args.constraints:
        for name, version in pins.items():
            print(f"{name}=={version}", file=stream)
        return 0
    failed = False
    for name, expected in pins.items():
        try:
            observed = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            observed = "missing"
        if observed != expected:
            failed = True
        print(f"{name}: expected={expected} installed={observed}", file=stream)
    print(f"RUNTIME_LOCK {'FAIL' if failed else 'PASS'}: {len(pins)} runtime pins checked", file=stream)
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
