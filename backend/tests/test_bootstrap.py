import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from mend.bootstrap import DiskTestArtifacts, Runtime, build_runtime
from mend.config import Settings
from mend.domain import MendError, public_payload


class BootstrapTests(unittest.TestCase):
    def test_flag_cannot_bypass_unresolved_live_gate(self):
        with self.assertRaises(MendError) as caught:
            build_runtime({"MEND_MODE": "live", "MEND_LIVE_ENABLED": "true"})
        self.assertEqual(caught.exception.code, "release_blocked")

    def test_disk_artifacts_shared_and_immutable(self):
        with tempfile.TemporaryDirectory() as root:
            first, second = DiskTestArtifacts(root), DiskTestArtifacts(root)
            task, owner = str(uuid.uuid4()), str(uuid.uuid4())
            key = first.put(task, owner, "final/bundle.zip", b"fixture")
            self.assertEqual(second.get(key), b"fixture")
            with self.assertRaises(MendError):
                second.put(task, owner, "final/bundle.zip", b"different")
            self.assertTrue(second.signed_download(key).startswith("local_test://"))
            with self.assertRaises(MendError):
                second.get(key.replace("final/bundle.zip", "../secret"))

    def test_disk_symlink_escape_rejected(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            artifacts = DiskTestArtifacts(root)
            owner, task = str(uuid.uuid4()), str(uuid.uuid4())
            (Path(root) / owner).symlink_to(outside, target_is_directory=True)
            with self.assertRaises(MendError):
                artifacts.put(task, owner, "bundle.zip", b"fixture")

    def test_disk_rejects_fifo_directory_and_final_symlink_without_blocking(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            artifacts = DiskTestArtifacts(root)
            task, owner = str(uuid.uuid4()), str(uuid.uuid4())
            parent = Path(root) / owner / task
            parent.mkdir(parents=True)
            os.mkfifo(parent / "pipe.bin")
            (parent / "directory.bin").mkdir()
            target = Path(outside) / "secret.bin"
            target.write_bytes(b"outside")
            (parent / "link.bin").symlink_to(target)
            for name in ("pipe.bin", "directory.bin", "link.bin"):
                with self.subTest(name=name), self.assertRaises(MendError) as caught:
                    original_open = os.open
                    def require_nonblocking(path, flags, *args, **kwargs):
                        if path == "pipe.bin":
                            self.assertTrue(flags & os.O_NONBLOCK)
                        return original_open(path, flags, *args, **kwargs)
                    with patch("mend.bootstrap.os.open", side_effect=require_nonblocking):
                        artifacts.get(owner + "/" + task + "/" + name)
                self.assertEqual(caught.exception.code, "artifact_scope")
            with self.assertRaises(MendError):
                artifacts.put(task, owner, "link.bin", b"replacement")
            self.assertEqual(target.read_bytes(), b"outside")

    def test_disk_directory_rebinding_cannot_redirect_publication(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            artifacts = DiskTestArtifacts(root)
            task, owner = str(uuid.uuid4()), str(uuid.uuid4())
            parent = Path(root) / owner / task
            parent.mkdir(parents=True)
            moved = parent.with_name(task + "-old")
            original_link = os.link
            def rebind(source, destination, **kwargs):
                parent.rename(moved)
                parent.symlink_to(outside, target_is_directory=True)
                return original_link(source, destination, **kwargs)
            with patch("mend.bootstrap.os.link", side_effect=rebind):
                artifacts.put(task, owner, "bundle.zip", b"fixture")
            self.assertEqual((moved / "bundle.zip").read_bytes(), b"fixture")
            self.assertFalse((Path(outside) / "bundle.zip").exists())
            self.assertEqual(list(moved.glob(".pending-*")), [])
            with self.assertRaises(MendError):
                artifacts.get(owner + "/" + task + "/bundle.zip")

    def test_disk_permission_failures_are_safe_and_descriptors_close(self):
        with tempfile.TemporaryDirectory() as root:
            artifacts = DiskTestArtifacts(root)
            task, owner = str(uuid.uuid4()), str(uuid.uuid4())
            key = artifacts.put(task, owner, "bundle.zip", b"fixture")
            original_open = os.open
            def reject_file(path, flags, *args, **kwargs):
                if path == "bundle.zip":
                    raise PermissionError(13, "fixture denial")
                return original_open(path, flags, *args, **kwargs)
            descriptor_directory = Path("/proc/self/fd")
            before = len(list(descriptor_directory.iterdir())) if descriptor_directory.exists() else None
            with patch("mend.bootstrap.os.open", side_effect=reject_file), self.assertRaises(MendError) as caught:
                artifacts.get(key)
            if before is not None:
                self.assertEqual(len(list(descriptor_directory.iterdir())), before)
            self.assertEqual(caught.exception.code, "artifact_unavailable")
            self.assertEqual(artifacts.get(key), b"fixture")

    def test_local_runtime_uses_no_provider_credentials(self):
        with tempfile.TemporaryDirectory() as root:
            runtime = build_runtime({"MEND_LOCAL_DATABASE": root + "/db.sqlite3",
                                     "MEND_LOCAL_ARTIFACT_ROOT": root + "/artifacts"})
            try:
                self.assertEqual(runtime.service.store.source, "local_test")
                self.assertEqual(runtime.service.model.source, "local_test")
                self.assertEqual(runtime.service.runner.source, "local_test")
                self.assertFalse(runtime.settings.live_enabled)
            finally:
                runtime.close()

    def test_public_usage_keeps_reservation_and_actual_separate(self):
        self.assertEqual(public_payload({"usage": {"tokens": 2000, "cost": 0.1,
            "actual_tokens": 140, "actual_cost": 0.01}, "lease_token": "secret"}),
            {"usage": {"tokens": 2000, "cost": 0.1, "actual_tokens": 140, "actual_cost": 0.01}})

    def test_shutdown_closes_all_resources_once_after_one_failure(self):
        calls = []
        class Resource:
            def __init__(self, name, broken=False):
                self.name, self.broken = name, broken
            def close(self):
                calls.append(self.name)
                if self.broken:
                    raise RuntimeError("fixture failure")
        runtime = Runtime(Settings(), None, [Resource("first"), Resource("second", True)])
        with self.assertLogs("mend.runtime", level="ERROR"):
            runtime.close()
        runtime.close()
        self.assertEqual(calls, ["second", "first"])

    def test_production_retry_counter_is_not_lost_in_public_usage(self):
        self.assertEqual(public_payload({"usage": {"api_retries": 2, "tokens": 100}}),
                         {"usage": {"api_retry_count": 2, "tokens": 100}})
        with self.assertRaises(MendError):
            public_payload({"usage": {"api_retries": 2, "api_retry_count": 1}})

    def test_production_cancel_diagnostics_match_public_fixture_wire(self):
        self.assertEqual(public_payload({"payload": {"diagnostic_code": "runner_ambiguous", "status": "stopping"}}),
                         {"payload": {"code": "runner_ambiguous", "status": "stopping"}})
        with self.assertRaises(MendError):
            public_payload({"payload": {"diagnostic_code": "runner_ambiguous", "code": "different"}})
