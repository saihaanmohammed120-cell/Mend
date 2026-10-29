"""Runtime equality is an acceptance gate, including transitive dependencies."""
import importlib.metadata
import io
from pathlib import Path
import unittest
from unittest.mock import patch

from scripts import verify_runtime_lock as verifier


HASH = " --hash=sha256:" + "a" * 64


class RuntimeLockTests(unittest.TestCase):
    def test_actual_runtime_lock_is_supported_and_exports_every_pin(self):
        pins = verifier.locked_versions(verifier.LOCK.read_text(encoding="utf-8"))
        self.assertIn("fastapi", pins)
        self.assertIn("starlette", pins)
        output = io.StringIO()
        self.assertEqual(verifier.main(["--constraints"], output), 0)
        self.assertEqual(output.getvalue().splitlines(), [f"{name}=={version}" for name, version in pins.items()])

    def test_continuations_and_distribution_name_normalization(self):
        self.assertEqual(verifier.locked_versions("# runtime\nExample_Package==1.2 \\\n" + HASH + "\n"),
                         {"example-package": "1.2"})

    def test_empty_unpinned_unhashed_malformed_and_duplicate_entries_fail_closed(self):
        for text in ("", "# no pins", "demo>=1" + HASH, "demo==1", "--index-url https://example.invalid",
                     "demo==1 --hash=sha256:bad", "demo==1" + HASH + "\nDEMO==1" + HASH,
                     "demo_pkg==1" + HASH + "\ndemo-pkg==1" + HASH):
            with self.subTest(text=text), self.assertRaises(ValueError):
                verifier.locked_versions(text)

    def test_missing_or_different_transitive_version_fails(self):
        pins = {"fastapi": "1", "starlette": "2"}
        for versions in (("1", "2"), ("1", "3"), ("1", importlib.metadata.PackageNotFoundError("starlette"))):
            output = io.StringIO()
            with patch.object(verifier, "locked_versions", return_value=pins), \
                    patch.object(verifier.importlib.metadata, "version", side_effect=versions):
                status = verifier.main([], output)
            self.assertEqual(status, 0 if versions == ("1", "2") else 1)
            self.assertIn("starlette: expected=2 installed=", output.getvalue())

    def test_unreadable_or_malformed_lock_fails_before_inspecting_runtime(self):
        for error in (OSError("fixture missing"), ValueError("fixture invalid")):
            with patch.object(Path, "read_text", side_effect=error), \
                    patch.object(verifier.importlib.metadata, "version") as version:
                self.assertEqual(verifier.main([], io.StringIO()), 1)
                version.assert_not_called()
