# Python bug review contracts

Implemented 21 October 2026: offline contract preparation, a stateless authenticated HTTP boundary, and an internal source-bound comparative-report validator. These additions do not enable the live CSV task engine to execute arbitrary modules. No model investigation, generated repair, database persistence, provider job or public signing is established by this slice.

## Prepare a contract

The `/fix` interface prepares its local schema-version-one intake entirely in browser memory. It does not upload source. As of 22 October, its optional protected-test review also collects a proposed `test_regression.py`, unique full unittest IDs and a target check. Original source and expected behavior are mandatory for that review, with a combined 200,000-byte source/test cap. Review and export `mend-bug-review-request.json`, then prepare it with:

```sh
cd backend
python scripts/prepare_bug_case.py --request /path/to/mend-bug-review-request.json --output /path/to/new-review.json
```

The JSON has exactly the same four fields as the authenticated preparation endpoint below. The CLI rejects duplicate/extra fields, malformed JSON, mixed separate-input flags and existing output files. It preserves source/test bytes without importing or executing them. The result remains `execution_enabled=false`, `approval_status=not_approved` and `live_verification=false`. Browser fingerprints identify the exported request bytes; they do not replace backend canonical contract identities. Neither exported requests nor preparation establish that the proposed test is a valid independent oracle.

The original separate-file CLI remains available. Export the intake packet, then supply a proposed protected regression and its full unittest IDs:

```sh
cd backend
python scripts/prepare_bug_case.py \
  --intake /path/to/mend-bug-intake.json \
  --checks /path/to/test_regression.py \
  --check test_regression.RegressionChecks.test_value \
  --target-check test_regression.RegressionChecks.test_value \
  --output /path/to/new-review.json
```

The output must not already exist. Inputs are read as bounded UTF-8 data and never imported or executed. Review the expected behavior and proposed test oracle: preparation does not establish that a submitted test correctly represents the bug.

`POST /api/bug-cases/prepare` exposes the same preparation for an authenticated client. It requires the existing allowed Origin, session cookie and CSRF token, with exactly these fields:

```json
{
  "intake": {"kind": "mend_bug_intake", "schema_version": 1, "file_path": "helper.py", "original_source": "def value(): return 0\n", "reported_error": "Wrong value", "expected_behavior": "Return one", "evidence": {"investigation": "not_run", "execution": "not_run", "regression": "not_generated"}},
  "protected_test_source": "import unittest\nfrom helper import value\nclass RegressionChecks(unittest.TestCase):\n    def test_value(self):\n        self.assertEqual(value(), 1)\n",
  "required_check_ids": ["test_regression.RegressionChecks.test_value"],
  "target_check_id": "test_regression.RegressionChecks.test_value"
}
```

The route makes no task/store/model/runner call. It returns the prepared record through its explicit schema, rather than weakening the existing CSV-only task payload allowlist. The inherited HTTP body limit is 65,536 bytes by default; the offline source-plus-check cap is 200,000 UTF-8 bytes. An oversized HTTP body is rejected before contract preparation.

## Frozen meaning and allocation

- One Python module and one protected regression file; no paths, arbitrary shell commands or dependency installation.
- Exact source/test snapshots, named required checks and one target check. The fixed command is `python -m unittest -v test_regression`.
- Proposed allocation: one reproduction, up to two candidate jobs and one comparative job; at most one repair, four executions total. The earlier CSV recipe retains its separate three-repair allocation.
- Preparation always returns `execution_enabled: false`, `approval_status: not_approved`, `live_verification: false` and `allocation_feasibility: unmeasured`.
- Contract and intake digests use canonical JSON. Source/snapshot/check digests use the existing domain source-manifest format. `/fix`'s exact source-byte/download-byte fingerprints are distinct identities; never compare them as if they used the same format.

The proposed 60-second job bound and comparative job feasibility require actual measurements before a later execution release. No UI approval or prepared packet lifts that gate.

## Comparative evidence

`mend.bug_cases.review_bug_comparison` is an internal controller function, not a browser endpoint. The signing key and expected identities must come from trusted controller state. It authenticates both envelopes using the existing verifier, then binds the case, protected tests, source snapshots, model and runner image. Both observations must share the same reserved comparative task/attempt/job and `execution_category: comparative_regression`, with separately authenticated `comparison_run_id` values `original` and `candidate`. These role/category fields are explicitly checked after signature verification. This permits the one reserved comparative job to check both snapshots without inventing a fifth job. The result retains those shared IDs and both run roles.

The target check must fail with an authenticated check-level `failure_kind: behavioral_assertion`, an ordinary unittest failure exit status and no skipped baseline checks. The candidate must pass every required check. Both passing is `not_demonstrated`; a missing/relevant-failure classification is `failure_not_established`; a failing candidate is `candidate_failed`. Report alteration, wrong identities and changed contracts are rejected.

The output includes the exact source-bound unified diff, original/candidate check summaries and explicit authority limits. LF-only patch splitting preserves Unicode separators and final-newline differences. `live_verification` and `apply_authorized` stay false: configured-key authentication does not establish independent provider authority, stop timing, public receipt signing or external repository permission. The tests use synthetic keys and reports and are not genuine model/cloud executions.

## Remaining integration

The optional authenticated [check-history gate](CHECK_HISTORY.md) now blocks comparative review when matching candidate observations disagree or are inconclusive. Supply `candidate_history` and `history_identities` together from trusted controller state. Missing history is explicitly `check_history: null`, not a consistency pass. This does not schedule repeat jobs or increase the frozen budget.

Owner persistence and approval records, durable category-aware budget reservations, isolated original/candidate/comparison execution, model investigation and generation, a reviewed protected test oracle, external evidence producers/context lookup, independent stop authority and measured release gates are still required. No database schema or cloud resource was changed to disguise these gaps.
