"""Credential-safe output regressions against real temporary filesystem entries."""
import os
from pathlib import Path
import stat
import tempfile
import unittest

from scripts.verify_http_preflight import evidence_destination, write_evidence


class EvidenceDestinationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.environment = self.root / ".env"
        self.environment.write_text("DUMMY_CONFIGURATION=keep\n")
        self.output = self.root / "probe.json"

    def test_hardlink_to_environment_is_rejected_without_overwrite(self):
        os.link(self.environment, self.output)
        with self.assertRaisesRegex(ValueError, "invalid_evidence_destination"):
            evidence_destination(self.output, self.environment)
        self.assertEqual(self.environment.read_text(), "DUMMY_CONFIGURATION=keep\n")

    def test_symlink_is_rejected_without_following(self):
        self.output.symlink_to(self.environment)
        with self.assertRaisesRegex(ValueError, "invalid_evidence_destination"):
            evidence_destination(self.output, self.environment)
        self.assertEqual(self.environment.read_text(), "DUMMY_CONFIGURATION=keep\n")

    def test_directory_target_is_rejected(self):
        self.output.mkdir()
        with self.assertRaisesRegex(ValueError, "invalid_evidence_destination"):
            evidence_destination(self.output, self.environment)

    def test_existing_report_can_be_updated_when_optional_environment_is_absent(self):
        self.environment.unlink()
        self.output.write_text('{"previous":true}\n')
        destination = evidence_destination(self.output, self.environment)
        write_evidence(destination, '{"updated":true}\n')
        self.assertEqual(self.output.read_text(), '{"updated":true}\n')
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)

    def test_output_cannot_replace_missing_private_environment_path(self):
        self.environment.unlink()
        private_environment = self.root / "private.json"
        with self.assertRaisesRegex(ValueError, "invalid_evidence_destination"):
            evidence_destination(private_environment, private_environment)

    def test_atomic_write_preserves_environment_after_target_swap(self):
        destination = evidence_destination(self.output, self.environment)
        os.link(self.environment, self.output)
        write_evidence(destination, '{"observed":true}\n')
        self.assertEqual(self.environment.read_text(), "DUMMY_CONFIGURATION=keep\n")
        self.assertEqual(self.output.read_text(), '{"observed":true}\n')
        self.assertFalse(os.path.samefile(self.environment, self.output))
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)
        self.assertEqual(list(self.root.glob(".mend-evidence-*")), [])


if __name__ == "__main__":
    unittest.main()
