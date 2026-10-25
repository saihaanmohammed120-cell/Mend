"""Actual offline service/store events; fixture execution never becomes live evidence."""
import copy
import unittest
import uuid

from mend.artifacts import LocalArtifacts
from mend.domain import curated_contract, public_payload
from mend.fakes import FixtureModel, FixtureRunner
from mend.local_store import LocalTestStore
from mend.service import TaskService


class AttemptEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_failure_and_repair_emit_owned_replayable_attempt_outcomes(self):
        store = LocalTestStore()
        self.addCleanup(store.close)
        service = TaskService(store, FixtureModel(), FixtureRunner(), LocalArtifacts(), {"poll_interval_seconds": .001})
        user = str(uuid.uuid4())
        task = await service.create(user, "Offline event fixture", str(uuid.uuid4()))
        task = await service.propose(task["id"], user, task["contract_version"], curated_contract())
        await service.start(task["id"], user, task["contract_version"])
        await service.run_task(task["id"])
        events = [event async for event in service.events(task["id"], user)]
        observations = [e for e in events if e["payload"].get("code") in {"attempt_reserved", "attempt_resolved"}]
        self.assertEqual([e["payload"]["code"] for e in observations],
                         ["attempt_reserved", "attempt_resolved"] * 2)
        self.assertEqual([e["payload"]["ordinal"] for e in observations], [1, 1, 2, 2])
        self.assertEqual([e["payload"]["attempt_status"] for e in observations], ["reserved", "failed", "reserved", "passed"])
        raw = store.call("get_task", {"task_id": task["id"], "user_id": user})
        for event in observations:
            attempt = raw["attempts"][event["payload"]["ordinal"] - 1]
            self.assertEqual(event["attempt_id"], attempt["id"])
            self.assertEqual(event["payload"]["snapshot_sha256"], attempt["snapshot_sha256"])
            self.assertNotIn("snapshot_storage_key", event["payload"])
        failed = observations[1]["payload"]["checks"]
        self.assertEqual([r["check_id"] for r in failed["results"] if r["status"] == "failed"],
                         ["test_csv_tools.CsvChecks.test_empty_input"])
        self.assertEqual(observations[3]["payload"]["checks"]["passed"], 4)
        self.assertIsNone(observations[0]["payload"]["checks"])
        replay = [e async for e in service.events(task["id"], user, after=observations[1]["sequence"])]
        self.assertEqual([e for e in replay if e["payload"].get("code") in {"attempt_reserved", "attempt_resolved"}], observations[2:])
        before = copy.deepcopy(events)
        final = raw["attempts"][-1]
        store.call("resolve_attempt", {"task_id": task["id"], "worker_id": service.worker_id,
                   "attempt_id": final["id"], "status": final["status"],
                   "provider_stopped_at": final["provider_stopped_at"], "resolution_evidence": final["resolution_evidence"]})
        self.assertEqual([e async for e in service.events(task["id"], user)], before)
        self.assertEqual(raw["source"], "local_test")
        self.assertIs(raw["live_verification"], False)

    def test_public_attempt_identity_does_not_expose_storage_or_worker_authority(self):
        event = public_payload({"attempt_id": "recorded-id", "payload": {"ordinal": 1},
                                "worker_id": "private", "snapshot_storage_key": "private"})
        self.assertEqual(event, {"attempt_id": "recorded-id", "payload": {"ordinal": 1}})
