# Bounded repository review

Repository review is available locally for explicit multi-file Python snapshots.
Live repository repair remains pending. This feature freezes a proposed case and
validates a candidate diff; it does not execute code, inspect your filesystem,
install dependencies, apply patches or demonstrate a repair. Provider, hosted
database and release holds remain in force.

## Prepare an explicit case

The request JSON contains exactly `files`, `editable_paths`, and
`required_check_ids`. `files` maps repository-relative paths to exact UTF-8 source
strings; nothing is read from those path names. For example:

```json
{
  "files": {
    "app/__init__.py": "",
    "app/math.py": "def value():\n    return 0\n",
    "app/format.py": "def label():\n    return 'old'\n",
    "tests/__init__.py": "",
    "tests/test_math.py": "import unittest\nfrom app.math import value\nclass Checks(unittest.TestCase):\n    def test_value(self):\n        self.assertEqual(value(), 1)\n"
  },
  "editable_paths": ["app/math.py", "app/format.py"],
  "required_check_ids": ["tests.test_math.Checks.test_value"]
}
```

Run from `backend` in the configured project Python environment:

```powershell
python scripts/repository_case.py prepare --request repository-request.json --output new-repository-case.json
```

The version-one `python-repository-review-v1` contract freezes every original
path/source, editable path, protected source, required check ID and command. All
files outside the editable list are protected, including the entire `tests/`
tree and its package initializers. Original inputs are detached before return.
The contract includes source limits, canonical contract hash, full source snapshot
hash, protected-test hash and protected-file hash. It carries no execution
allocation, scheduling permission or policy approval.

Supported snapshots contain 1–20 files totaling at most 200,000 UTF-8 bytes;
the required source and protected tests make practical minimums larger. Every
path must be a safe, importable ASCII Python module/package path ending in `.py`.
Each supplied directory needs its supplied `__init__.py`, including `tests/`.
Nested application modules and nested tests packages are supported. Hidden,
absolute, traversal, backslash, binary, dependency/configuration and startup-hook
paths are rejected. Dependency/vendor directories, Windows reserved names,
case-insensitive aliases and module/package import-name collisions are rejected.
This is an explicit source-only subset, not arbitrary repository ingestion.

The editable list must be nonempty, unique, present in the snapshot and outside
`tests/`; `test_*.py` files cannot be editable. Check inventory has 1–64 unique,
bounded IDs of the form `tests.package.test_module.Class.test_method`, naming
supplied protected test modules. Preparation validates names and structure, not
Python syntax, class/method existence, actual importability, test discovery or
oracle quality. Even the example is not run during preparation.

The sole frozen command is:

```text
python -m unittest discover -s tests -t . -p test_*.py -v
```

It is recorded as a future reviewed command, never run here. Dependencies,
editable test oracles, custom commands, application entrypoints and external
repository fetching are outside this contract. Existing single-module signed
comparison/policy review does not automatically accept this new template.

## Review an exact candidate

Independently review the frozen base and pin
`sha256_bytes(canonical_json(case))` with Mend's existing hash helpers. This is
the canonical case hash, not the SHA-256 of a formatted JSON file. Store that
expected value outside candidate-controlled inputs; recomputing it from an
untrusted replacement case defeats base pinning.

Supply a candidate JSON **map** containing exactly every frozen path and its
complete candidate source, including unchanged protected files:

```powershell
python scripts/repository_case.py review --case new-repository-case.json --candidate candidate-files.json --expected-case-sha256 OPERATOR_PINNED_CANONICAL_CASE_HASH --output new-candidate-review.json
```

Review first checks the operator pin, then rebuilds and compares the complete
base contract and hashes. It rejects additions, deletions, any protected-file
change, invalid/oversized source and an unchanged candidate. It does not accept
caller approval/evidence flags or a caller-provided diff. It computes a sorted
multi-file unified diff with real paths and exact LF/CRLF, Unicode and missing
trailing-newline handling, then binds the original/candidate snapshots,
protected files/tests, contract and case hashes.

Success means only `candidate_diff_prepared`. `execution_enabled`,
`apply_authorized`, `live_verification` and `repair_demonstrated` remain false;
`approval_status` is `not_approved`. The result is unsigned, includes source in
the diff, and must be kept private when source is private. It is not a receipt,
an authenticated regression report or permission for a worker to execute/apply.

CLI JSON reads reject duplicate keys and nonfinite numbers, with a 3,000,000-byte
transport cap per file that permits JSON escaping of bounded source and the
frozen protected-source copy. Source maps retain exact text; no code is imported
or executed. Outputs use exclusive creation, refusing existing paths, symlinks
and hard links. Exit 0 means the offline artifact was written; exit 2 means
invalid inputs or output failure, without a review artifact. Generic diagnostics
do not echo source or input paths. No secret/key input is needed.

Validation: `python -m unittest discover -s tests -p test_repository_case.py -v`.
Tests cover multi-module/nested-package snapshots, actual CLI preparation/review,
changed-base/command tampering, protected test/source changes, add/delete limits,
unsafe/dependency paths, UTF-8/CRLF, maximum JSON escaping, strict parsing,
nonoverwrite and inert source that must never execute.
