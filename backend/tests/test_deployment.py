"""Build-script safety checks using fake Docker command capture, never real builds."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND / "deploy" / "build_images.sh"


class DeploymentBuildScriptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.capture = self.root / "docker-calls.txt"
        self.bash = shutil.which("bash")
        dirname = shutil.which("dirname")
        if not self.bash or not dirname:
            self.skipTest("Real bash and dirname are required for the shell safety test.")
        (self.bin / "dirname").symlink_to(dirname)
        self.environment = {
            "PATH": str(self.bin),
            "PYTHON_BASE_IMAGE": "python:3.12-slim@sha256:" + "a" * 64,
            "MEND_TEST_CAPTURE": str(self.capture),
        }

    def fake_docker(self, exit_status=0):
        docker = self.bin / "docker"
        docker.write_text(
            '#!/bin/sh\nprintf "%s\\n" CALL "$@" >> "$MEND_TEST_CAPTURE"\n'
            + f"exit {exit_status}\n"
        )
        docker.chmod(0o755)

    def run_script(self, **overrides):
        environment = self.environment | overrides
        return subprocess.run(
            [self.bash, str(SCRIPT)],
            cwd=self.root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=10,
        )

    def calls(self):
        if not self.capture.exists():
            return []
        return [call.strip().splitlines() for call in self.capture.read_text().split("CALL\n")[1:]]

    def test_missing_base_is_rejected_before_any_docker_command(self):
        self.fake_docker()
        result = self.run_script(PYTHON_BASE_IMAGE="")
        self.assertEqual(result.returncode, 2)
        self.assertIn("operator-supplied", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_floating_or_malformed_digest_is_rejected(self):
        self.fake_docker()
        for base in ("python:3.12-slim", "python@sha256:abc", "python@sha256:" + "g" * 64):
            with self.subTest(base=base):
                result = self.run_script(PYTHON_BASE_IMAGE=base)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(self.calls(), [])

    def test_shell_syntax_in_tag_never_executes_or_reaches_docker(self):
        self.fake_docker()
        sentinel = self.root / "unexpected-shell-execution"
        result = self.run_script(MEND_API_BUILD_TAG=f"mend:local; touch {sentinel}")
        self.assertEqual(result.returncode, 2)
        self.assertFalse(sentinel.exists())
        self.assertEqual(self.calls(), [])

    def test_missing_docker_fails_without_claiming_an_image_build(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 3)
        self.assertIn("Docker is not available; no images were built", result.stderr)
        self.assertEqual(self.calls(), [])

    def test_fake_docker_captures_only_three_builds_from_any_working_directory(self):
        self.fake_docker()
        result = self.run_script(
            MEND_API_BUILD_TAG="mend-api:review",
            MEND_API_IMAGE="registry.example/mend-api@sha256:" + "b" * 64,
            MEND_RUNNER_BUILD_TAG="mend-runner:review",
            MEND_SPIKE_BUILD_TAG="mend-spike:review",
            SUPABASE_SERVICE_ROLE_KEY="fixture-credential-never-a-build-argument",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(len(calls), 3)
        for call, kind in zip(calls, ("api", "runner", "spike")):
            self.assertEqual(call, [
                "build", "--build-arg", "PYTHON_BASE_IMAGE=" + self.environment["PYTHON_BASE_IMAGE"],
                "--tag", f"mend-{kind}:review", "--file", str(BACKEND / "deploy" / f"{kind}.Dockerfile"),
                str(BACKEND),
            ])
        self.assertNotIn("fixture-credential", self.capture.read_text())

    def test_first_build_failure_aborts_remaining_builds(self):
        self.fake_docker(exit_status=7)
        result = self.run_script()
        self.assertEqual(result.returncode, 7)
        self.assertEqual(len(self.calls()), 1)


if __name__ == "__main__":
    unittest.main()
