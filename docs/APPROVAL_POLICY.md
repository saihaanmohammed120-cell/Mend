# Offline policy-as-code review gate

`backend/scripts/approval_policy.py` evaluates an operator-selected policy against
an exact prepared Python bug case, candidate source and existing signed reports.
It never runs submitted code, discovers models, starts/cancels jobs, contacts a
service, modifies a database or applies a patch. All existing execution, provider,
database and release holds remain in force.

The version-one policy has exactly these fields, with no implicit defaults:

```json
{
  "kind": "mend_review_policy",
  "schema_version": 1,
  "policy_id": "small-helper-review",
  "case_sha256": "REPLACE_WITH_OPERATOR_VERIFIED_CANONICAL_CASE_SHA256",
  "max_changed_lines": 10,
  "max_changed_bytes": 1000,
  "min_history_runs": 2
}
```

The placeholder deliberately fails validation. Compute the case hash with Mend's
`sha256_bytes(canonical_json(case))`, after independently reviewing the complete
case and protected regression. Do not hash the JSON file's formatting bytes.
Pin the policy in operator-controlled state before evaluating candidate evidence.
Case pinning includes exact original source, proposed protected test source,
required check identities, target, commands and limits. Replacing a protected
test or original and rebuilding the case cannot bypass that pin.

`policy_id` permits 1–80 ASCII letters, digits, dots, underscores and hyphens.
Line/byte thresholds are positive integers up to 400,000; `min_history_runs` is an
integer from 2 to 100. Unknown fields, booleans in integer fields and floats fail.
Thresholds are review size limits, not estimates of semantic/security risk.

## Evidence and trust boundary

The evidence JSON has exactly `original`, `candidate`, and `history` keys. The
first two contain controller-signed `{report, signature}` envelopes accepted by
`review_bug_comparison`; history is an ordered list of envelopes accepted by
`analyze_check_history`. There is no accepted approval boolean, supplied risk
score or precomputed comparison result. Missing history can produce a human
review decision; malformed or unauthenticated evidence produces an error.

The separately supplied expected-runs JSON has exactly the same three keys.
`original` and `candidate` contain operator-controlled identities with exactly
`task_id`, `attempt_id`, `job_id`, `contract_sha256`, `snapshot_sha256`,
`protected_checks_sha256`, `image_digest`, `model_id`, `comparison_run_id`, and
`execution_category`. The roles are respectively `original` and `candidate`,
and category is `comparative_regression`; both use the same reserved comparative
job. Each ordered history identity contains the first eight fields only.
History observations must have distinct job IDs and match this exact candidate,
contract, task, protected checks, image and model. Existing validators require
complete signed results for every frozen check and command.

Policy, expected identities and the private HMAC key must be selected by an
operator outside the candidate workload. Do not derive expected identities from
the incoming report or accept a candidate's replacement policy/key. HMAC verifies
the configured authority; it cannot prove observer independence, real execution,
inventory completeness, infrastructure stop timing or public signing identity.
Synthetic signatures in unit tests establish only local validator behavior.

## Decision and binding

`review_approved` requires all of:

- The case matches the policy pin and both comparative reports authenticate.
- The original target fails by a behavioral assertion, with no skipped checks;
  the original command exits 1 and the candidate passes every protected check.
- Candidate history passes the existing consistency gate and contains at least
  the policy's minimum number of distinct observations.
- Both measured change sizes are at or below the explicit policy thresholds.

The size calculation removes an identical prefix and suffix of LF-delimited
lines, then counts all removed plus added lines and their UTF-8 bytes. A replaced
line counts twice. CRLF, a missing trailing newline and Unicode bytes are
preserved. Unchanged interior lines between separated edits also count: this is
a conservative, linear-time bound rather than a minimal diff. Equality passes;
overflow requires human review. It never parses/imports the submitted Python.

A valid but failing/inconclusive comparison, insufficient history or size
overflow yields `human_review_required` with reason codes. A malformed contract,
changed case pin, unauthenticated report, replayed history job or mismatched
identity fails closed with no output artifact. A human-review decision does not
provide a bypass or grant authority to edit protected tests.

The output includes canonical hashes of the policy, exact case, contract,
original and candidate snapshots, protected checks, verified comparison, complete
signed evidence inventory and operator identity inventory. It includes the
derived risk counts and comparison/history statuses, with `execution_enabled`,
`apply_authorized` and `live_verification` always false. It omits source, full
reports and private key material. The output is an **unsigned offline review
record**, not an executable permission token or public receipt. Recompute it
from trusted inputs before using it for review; a copied JSON decision can be
edited. No existing worker/API consumes it as an execution or apply approval.

## Local CLI

Run from `backend` using the configured project Python environment:

```powershell
python scripts/approval_policy.py --policy operator-policy.json --case prepared-case.json --candidate candidate.py --evidence signed-evidence.json --expected-runs operator-identities.json --key-file private-controller.key --output new-review-decision.json
```

The key file contains 32–256 **raw bytes** and stays outside candidate jobs,
source control, browser uploads and published artifacts. JSON is parsed with
duplicate-key/nonfinite rejection. Reads are bounded: policy 8,192 bytes, case
3,000,000, candidate 200,000, evidence 8,000,000, identities 262,144. Existing
case/report/history validators impose tighter logical source and report limits.
Source is decoded directly from bytes to preserve CRLF. Output creation is
exclusive: existing files, symlinks or hard links cannot be overwritten.

Exit 0 means review approved; exit 1 means human review required, with a decision
artifact; exit 2 means invalid/untrusted inputs or an output failure. Diagnostics
are deliberately generic and do not echo file contents, paths, keys or reports.
Keep operator files in an access-controlled location; the CLI does not establish
their provenance or filesystem ownership. It does not sign a new receipt.

Validation: `python -m unittest discover -s tests -p test_approval_policy.py -v`.
Tests use synthetic signed observations and the actual subprocess CLI, covering
threshold boundaries, changed policy hashes, report/source/oracle tampering,
identity/replay rejection, failed/inconsistent histories, duplicate JSON,
bounded reads, exit statuses, secret-free diagnostics and refusal to overwrite.
