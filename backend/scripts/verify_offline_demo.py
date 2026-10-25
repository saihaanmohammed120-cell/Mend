"""Reproduce the credential-free demo; write inspectable fixtures to a NEW directory."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def run(arguments, *, expected=0):
    environment = {**os.environ, "MEND_MODE": "database_only", "MEND_LIVE_ENABLED": "false",
                   "MEND_DATABASE_WRITES_ENABLED": "false", "PYTHONUTF8": "1"}
    result = subprocess.run(arguments, cwd=ROOT, env=environment, capture_output=True, timeout=60)
    if result.returncode != expected:
        raise ValueError("Offline subprocess returned an unexpected result; no passing summary written.")


def verify(destination, node):
    # Only this newly created directory is written; existing outputs are never reused.
    destination.mkdir(parents=True, exist_ok=False)
    capture = destination / "captured-example.json"
    run([sys.executable, str(ROOT / "frontend/scripts/capture-example.py"), "--output", str(capture)])
    observed = read_json(capture)
    if observed["source"] != "captured_local" or observed["live_verification"] is not False:
        raise ValueError("Capture labels changed.")
    # capture-example itself validates the actual before-failure/after-pass runs and identities.
    files = {"app/__init__.py": "", "app/value.py": "def value():\n    return 0\n",
             "app/label.py": "def label():\n    return 'old'\n", "tests/__init__.py": "",
             "tests/test_value.py": "# Proposed oracle only; never executed by this review.\n"}
    request = destination / "repository-request.json"
    case = destination / "repository-case.json"
    candidate = destination / "repository-candidate.json"
    review = destination / "repository-review.json"
    write_json(request, {"files": files, "editable_paths": ["app/value.py", "app/label.py"],
                         "required_check_ids": ["tests.test_value.Checks.test_value"]})
    script = str(ROOT / "backend/scripts/repository_case.py")
    run([sys.executable, script, "prepare", "--request", str(request), "--output", str(case)])
    frozen = read_json(case)
    pin = hashlib.sha256(json.dumps(frozen, sort_keys=True, ensure_ascii=False,
                                    separators=(",", ":")).encode("utf-8")).hexdigest()
    proposed = {**files, "app/value.py": files["app/value.py"].replace("return 0", "return 1"),
                "app/label.py": files["app/label.py"].replace("'old'", "'new'")}
    write_json(candidate, proposed)
    command = [sys.executable, script, "review", "--case", str(case), "--candidate", str(candidate),
               "--expected-case-sha256", pin, "--output", str(review)]
    run(command)
    reviewed = read_json(review)
    if (reviewed["changed_paths"] != ["app/label.py", "app/value.py"]
            or reviewed["approval_status"] != "not_approved"
            or any(reviewed[key] is not False for key in
                   ("execution_enabled", "apply_authorized", "live_verification", "repair_demonstrated"))):
        raise ValueError("Repository review boundaries changed.")
    tampered = destination / "repository-tampered.json"
    rejected = destination / "must-not-exist.json"
    write_json(tampered, {**proposed, "tests/test_value.py": "# tampered oracle\n"})
    bad_command = command.copy()
    bad_command[bad_command.index("--candidate") + 1] = str(tampered)
    bad_command[-1] = str(rejected)
    run(bad_command, expected=2)
    if rejected.exists():
        raise ValueError("Protected-file tampering produced an output.")
    fixture = destination / "ide-fixture"
    run([sys.executable, str(ROOT / "extensions/vscode-mend/test/export-fixture.py"), str(fixture)])
    # The actual service export must be understood by the independent JavaScript viewer.
    run([node, "-e", r"""
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const reader = require('./extensions/vscode-mend/receipt.js');
(async () => {
  const root = process.argv[1];
  const receipt = reader.parseReceipt(await fs.readFile(path.join(root, 'receipt.json')));
  assert.equal(receipt.source, 'local_test');
  assert.equal(receipt.live_verification, false);
  const workspace = await reader.verifyWorkspace(receipt, path.join(root, 'workspace'));
  assert.equal(workspace.sourceMatches, true);
  assert.equal(workspace.checksMatch, true);
  const report = reader.renderReceipt(receipt, workspace);
  assert.match(report, /UNSIGNED \/ UNAUTHENTICATED/);
  assert.match(report, /Recorded final-attempt identity: consistent/);
  await fs.writeFile(path.join(root, 'inspection.txt'), report, { flag: 'wx' });
})().catch(() => { process.exitCode = 1; });
""", str(fixture)])
    summary = {"schema_version": 1, "status": "passed", "source": "offline_demo",
               "live_verification": False, "provider_calls": 0, "hosted_database_changes": 0,
               "checks": ["actual curated Python failure then correction",
                          "two-file repository diff without execution",
                          "protected-file tampering rejected without output",
                          "actual simulated-service receipt and downloaded bundle",
                          "JavaScript viewer matches exported source and protected checks"],
               "limits": ["Curated correction is not model-generated.",
                          "Repository candidate and proposed oracle are not executed or approved.",
                          "Service execution is simulated; receipt assertions remain unsigned.",
                          "No hosted authentication, provider, stop timing or production proof."]}
    write_json(destination / "summary.json", summary)
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    node = shutil.which("node")
    if not node:
        print("Node.js is required; no output directory was created.", file=sys.stderr)
        return 2
    try:
        summary = verify(args.output_dir.resolve(), node)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print("Offline demo failed. Use a new directory, Python with backend installed and Node.js. "
              "Existing outputs were not replaced; partial new outputs are retained.", file=sys.stderr)
        return 1
    print(f"PASS: {len(summary['checks'])} offline checks. Inspect {args.output_dir.resolve() / 'summary.json'}")
    print("No live model repair, hosted database change, stop proof or authenticated receipt is established.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
