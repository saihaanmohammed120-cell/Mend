"""Build-script safety checks using fake Docker command capture, never real builds."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import shlex


BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND / "deploy" / "build_images.sh"


class DeploymentDefinitionTests(unittest.TestCase):
    def test_every_image_definition_and_copy_source_is_packaged(self):
        for kind in ("api", "runner", "spike"):
            definition = BACKEND / "deploy" / f"{kind}.Dockerfile"
            self.assertTrue(definition.is_file(), str(definition))
            text = definition.read_text(encoding="utf-8")
            self.assertIn("ARG PYTHON_BASE_IMAGE\nFROM ${PYTHON_BASE_IMAGE}", text)
            self.assertIn("USER 10001:10001", text)
            for line in text.splitlines():
                if line.startswith("COPY "):
                    for source in shlex.split(line)[1:-1]:
                        self.assertTrue((BACKEND / source).exists(), source)

    def test_candidate_and_timing_images_receive_only_their_trusted_probe(self):
        for kind, source, executable in (("runner", "mend/supervisor.py", "/opt/mend/probe.py"),
                                         ("spike", "deploy/timing_probe.py", "/opt/mend/timing_probe.py")):
            text = (BACKEND / "deploy" / f"{kind}.Dockerfile").read_text(encoding="utf-8")
            self.assertEqual([shlex.split(line)[1:-1] for line in text.splitlines() if line.startswith("COPY ")], [[source]])
            self.assertIn(f'ENTRYPOINT ["python", "-I", "{executable}"]', text)
            self.assertNotIn("pip install", text)


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

    def test_missing_definition_blocks_before_any_image_build(self):
        self.fake_docker()
        backend = self.root / "backend"
        deploy = backend / "deploy"
        deploy.mkdir(parents=True)
        copied_script = deploy / "build_images.sh"
        copied_script.write_bytes(SCRIPT.read_bytes())
        (backend / "requirements.runtime.lock").write_text("fixture lock")
        for kind in ("api", "runner"):
            (deploy / f"{kind}.Dockerfile").write_text("FROM fixture\n")
        result = subprocess.run([self.bash, str(copied_script)], cwd=self.root,
                                env=self.environment, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 2)
        self.assertIn("spike.Dockerfile", result.stderr)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
