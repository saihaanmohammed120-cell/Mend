"""Read-only retention contracts; transports here are fixtures, not live DB proof."""
from copy import deepcopy
import importlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest

from mend.domain import MendError
from mend.repository import SupabaseRepository


class Response(io.BytesIO):
    status = 200


def plan():
    return {
        "schema_version": 1, "as_of": "2026-10-17T16:00:00+00:00",
        "limit": 20, "has_more": False,
        "tasks": [
            {"task_id": "10000000-0000-0000-0000-000000000001", "blockers": [],
             "purge_guard_satisfied": True},
            {"task_id": "10000000-0000-0000-0000-000000000002",
             "blockers": ["active_lease", "unresolved_attempts"], "purge_guard_satisfied": False},
            {"task_id": "10000000-0000-0000-0000-000000000003",
             "blockers": ["storage_objects"], "purge_guard_satisfied": False},
        ],
    }


class RetentionTests(unittest.TestCase):
    def summary(self, value):
        self.assertIsNotNone(importlib.util.find_spec("mend.retention"),
                             "Read-only retention summarizer is missing")
        return importlib.import_module("mend.retention").summarize_retention(value)

    def test_retention_request_has_only_bounded_limit_and_a_fixed_read_only_rpc(self):
        seen = []
        def request(req, timeout):
            seen.append((req, timeout))
            return Response(json.dumps(plan()).encode())
        repo = SupabaseRepository("https://example.supabase.co", "fixture-secret", opener=request)
        self.assertTrue(callable(getattr(repo, "retention_plan", None)),
                        "A bounded read-only retention request is missing")
        self.assertEqual(repo.retention_plan(20), plan())
        self.assertEqual(len(seen), 1)
        self.assertEqual(seen[0][0].full_url,
                         "https://example.supabase.co/rest/v1/rpc/mend_retention_plan")
        self.assertEqual(json.loads(seen[0][0].data), {"p_limit": 20})
        self.assertEqual(seen[0][1], 10)

    def test_invalid_limits_never_make_a_request(self):
        def unexpected(*args, **kwargs):
            self.fail("Invalid retention limit reached the database")
        repo = SupabaseRepository("https://example.supabase.co", "fixture", opener=unexpected)
        self.assertTrue(callable(getattr(repo, "retention_plan", None)))
        for value in (True, False, 0, -1, 101, 1.5, "20", None):
            with self.subTest(value=value), self.assertRaises(MendError):
                repo.retention_plan(value)

    def test_readiness_counts_never_claim_deletion_and_do_not_disclose_task_ids(self):
        value = plan()
        value["private_secret"] = "DO_NOT_EXPORT"
        value["tasks"][0]["prompt"] = "PRIVATE_PROMPT"
        result = self.summary(value)
        self.assertEqual(result["checked_tasks"], 3)
        self.assertEqual(result["metadata_purge_guard_satisfied"], 1)
        self.assertEqual(result["blocked_tasks"], 2)
        self.assertEqual(result["blocker_counts"], {
            "active_state": 0, "active_lease": 1, "unresolved_attempts": 1, "storage_objects": 1,
        })
        self.assertFalse(result["deletion_performed"])
        self.assertEqual(result["mode"], "read_only")
        serialized = json.dumps(result)
        for private in ("10000000", "DO_NOT_EXPORT", "PRIVATE_PROMPT"):
            self.assertNotIn(private, serialized)

    def test_empty_page_does_not_claim_global_cleanup(self):
        value = plan() | {"tasks": [], "has_more": True}
        result = self.summary(value)
        self.assertEqual(result["checked_tasks"], 0)
        self.assertTrue(result["has_more"])
        self.assertFalse(result["deletion_performed"])

    def test_unknown_duplicate_or_contradictory_blockers_fail_closed(self):
        for blockers, eligible in ((["unknown"], False), (["active_state", "active_state"], False),
                                   (["storage_objects"], True), ([], False)):
            value = plan()
            value["tasks"][0].update(blockers=blockers, purge_guard_satisfied=eligible)
            with self.subTest(blockers=blockers, eligible=eligible), self.assertRaises(MendError):
                self.summary(value)

    def test_malformed_plan_and_oversized_page_are_rejected(self):
        values = [None, [], {}, plan() | {"schema_version": True},
                  plan() | {"has_more": "false"}, plan() | {"limit": True},
                  plan() | {"limit": 1}, plan() | {"as_of": "not-a-date"},
                  plan() | {"as_of": "2026-10-17T16:00:00"}]
        for value in values:
            with self.subTest(value=value), self.assertRaises(MendError):
                self.summary(value)

    def test_duplicate_and_invalid_task_identifiers_are_not_counted_as_verified(self):
        for bad in ("not-a-uuid", plan()["tasks"][1]["task_id"]):
            value = deepcopy(plan())
            value["tasks"][0]["task_id"] = bad
            with self.subTest(bad=bad), self.assertRaises(MendError):
                self.summary(value)

    def test_cli_has_no_apply_or_delete_mode(self):
        script = Path(__file__).resolve().parents[1] / "scripts" / "inspect_retention.py"
        self.assertTrue(script.is_file(), "Read-only retention CLI is missing")
        result = subprocess.run([sys.executable, str(script), "--apply"],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertIn("unrecognized arguments", result.stderr)


if __name__ == "__main__":
    unittest.main()
