#!/usr/bin/env python3
"""Unit and real-local-input checks; fake cosign cases are not crypto evidence."""
import argparse
import base64
import importlib.util
import json
import contextlib
import copy
import io
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("provenance", ROOT / "scripts/provenance.py")
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="mend-provenance-tests-")
        self.root = Path(self.temporary.name)
        for name in P.INPUTS.values():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        self.run_git("init", "-q")
        self.run_git("-c", "user.name=Mend Test", "-c", "user.email=test@example.invalid", "add", ".")
        self.run_git("-c", "user.name=Mend Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Committed test fixture")
        self.capture = self.root / "captured-run.json"
        subprocess.run([os.sys.executable, str(self.root / "scripts/capture-example.py"), "--output", str(self.capture)], check=True, capture_output=True)
        self.artifact = self.root / "example/csv_tools.py"
        self.output = self.root / "provenance.json"
        self.arguments = argparse.Namespace(repo_root=self.root, capture=self.capture, artifact=self.artifact, output=self.output, source_uri="https://example.invalid/test-fixture.git", entrypoint="scripts/capture-example.py", builder_id="urn:mend:test:local", trigger="manual", parameter=[])

    def tearDown(self):
        self.temporary.cleanup()

    def run_git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def prepare(self):
        P.prepare(self.arguments)
        return P.read_json(self.output)

    def verification_arguments(self):
        return argparse.Namespace(artifact=self.artifact, statement=self.output, bundle=self.root / "bundle.json", output=self.root / "verification.json", certificate_identity="https://github.com/example/test/.github/workflows/provenance.yml@refs/heads/main", certificate_oidc_issuer="https://token.actions.githubusercontent.com", cosign="cosign")

    def bundle(self, statement):
        return {"dsseEnvelope": {"payloadType": "application/vnd.in-toto+json", "payload": base64.b64encode(json.dumps(statement).encode()).decode(), "signatures": [{"sig": "unit-fixture-not-crypto"}]}, "verificationMaterial": {"tlogEntries": [{"inclusionProof": {"rootHash": "unit-fixture-not-crypto"}}]}}

    def test_real_local_capture_and_source_commit_are_preserved(self):
        statement = self.prepare()
        capture = P.read_json(self.capture)
        self.assertEqual(statement["_type"], P.STATEMENT_TYPE)
        self.assertEqual(statement["predicateType"], P.PREDICATE_TYPE)
        self.assertEqual(statement["subject"][0]["digest"]["sha256"], P.sha(self.artifact.read_bytes()))
        self.assertEqual(statement["predicate"]["buildDefinition"]["resolvedDependencies"][0]["digest"]["gitCommit"], self.run_git("rev-parse", "HEAD").stdout.decode().strip())
        self.assertEqual(statement["predicate"]["runDetails"]["metadata"]["finishedOn"], capture["after"]["finished_at"])
        self.assertNotIn("signature", statement)

    def test_resolved_dependencies_are_unordered(self):
        statement = self.prepare()
        statement["predicate"]["buildDefinition"]["resolvedDependencies"].reverse()
        P.validate_statement(statement, self.artifact)

    def test_output_cannot_overwrite_capture_or_artifact(self):
        original = self.artifact.read_bytes()
        self.arguments.output = self.artifact
        with self.assertRaisesRegex(ValueError, "must be distinct"):
            P.prepare(self.arguments)
        self.assertEqual(self.artifact.read_bytes(), original)

    def test_output_cannot_delete_any_committed_capture_input(self):
        for name in P.INPUTS.values():
            with self.subTest(input=name):
                target = self.root / name
                original = target.read_bytes()
                self.arguments.output = target
                try:
                    with self.assertRaisesRegex(ValueError, "must be distinct"):
                        P.prepare(self.arguments)
                    self.assertEqual(target.read_bytes(), original)
                finally:
                    target.write_bytes(original)

    def test_changed_artifact_rejected_before_cosign(self):
        self.prepare()
        arguments = self.verification_arguments()
        self.artifact.write_text("not captured source")
        with patch.object(P, "cosign_command") as command:
            with self.assertRaisesRegex(ValueError, "subject does not match"):
                P.verify(arguments)
        command.assert_not_called()
        self.assertFalse(arguments.output.exists())

    def test_dirty_source_rejected_and_stale_output_removed(self):
        self.prepare()
        self.artifact.write_text(self.artifact.read_text() + "\n# changed\n")
        with self.assertRaisesRegex(ValueError, "differs from git HEAD"):
            P.prepare(self.arguments)
        self.assertFalse(self.output.exists())

    def test_tampered_capture_rejected(self):
        value = P.read_json(self.capture)
        value["after"]["checks"]["passed"] = 999
        P.write_json(self.capture, value)
        with self.assertRaisesRegex(ValueError, "Capture is invalid"):
            self.prepare()

    def test_missing_real_source_uri_rejected(self):
        self.arguments.source_uri = None
        with self.assertRaisesRegex(ValueError, "real source repository URI"):
            self.prepare()

    def test_credentials_in_source_uri_rejected(self):
        self.arguments.source_uri = "https://token@example.invalid/repo.git"
        with self.assertRaisesRegex(ValueError, "credentials"):
            self.prepare()

    def test_unattended_signing_without_oidc_is_blocked(self):
        self.prepare()
        arguments = self.verification_arguments()
        P.write_json(arguments.output, {"stale": True})
        P.write_json(arguments.bundle, {"stale": True})
        with patch.dict(os.environ, {}, clear=True), patch.object(P, "cosign_command") as command:
            with self.assertRaisesRegex(ValueError, "OIDC"):
                P.sign(arguments)
        command.assert_not_called()
        self.assertFalse(arguments.output.exists())
        self.assertFalse(arguments.bundle.exists())

    def test_missing_transparency_proof_rejected(self):
        statement = self.prepare()
        value = self.bundle(statement)
        value["verificationMaterial"]["tlogEntries"][0].pop("inclusionProof")
        with self.assertRaisesRegex(ValueError, "inclusion proof"):
            P.validate_bundle(value, statement)

    def test_wrong_signed_statement_rejected(self):
        statement = self.prepare()
        value = self.bundle({**statement, "predicateType": "wrong"})
        with self.assertRaisesRegex(ValueError, "differs"):
            P.validate_bundle(value, statement)

    def test_malformed_local_profile_rejected_before_crypto_verification(self):
        valid = self.prepare()
        invalid = []
        for name, path, value in (
            ("source URI", ("buildDefinition", "resolvedDependencies"), [{"digest": {"gitCommit": "a" * 40}}]),
            ("empty commit", ("buildDefinition", "resolvedDependencies"), [{"uri": "https://example.invalid/test-fixture.git", "digest": {"gitCommit": ""}}]),
            ("builder", ("runDetails", "builder"), {}),
            ("entrypoint", ("buildDefinition", "externalParameters", "entryPoint"), "invented.py"),
            ("trigger", ("buildDefinition", "externalParameters", "trigger"), ""),
            ("parameters", ("buildDefinition", "externalParameters", "parameters"), []),
            ("platform", ("buildDefinition", "internalParameters", "executionPlatform"), ""),
            ("live claim", ("buildDefinition", "internalParameters", "liveNebiusExecution"), True),
        ):
            statement = copy.deepcopy(valid)
            target = statement["predicate"]
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            invalid.append((name, statement))
        for name, statement in invalid:
            with self.subTest(field=name):
                arguments = self.verification_arguments()
                P.write_json(self.output, statement)
                P.write_json(arguments.bundle, self.bundle(statement))
                P.write_json(arguments.output, {"stale": True})
                with contextlib.redirect_stdout(io.StringIO()), patch.object(P.shutil, "which", return_value="/unit-test/cosign"), patch.object(P, "cosign_command") as command:
                    with self.assertRaises(ValueError):
                        P.verify(arguments)
                command.assert_not_called()
                self.assertFalse(arguments.output.exists())

    def test_unit_mock_exact_identity_flags_and_no_insecure_bypass(self):
        statement = self.prepare()
        arguments = self.verification_arguments()
        P.write_json(arguments.bundle, self.bundle(statement))
        with contextlib.redirect_stdout(io.StringIO()), patch.object(P.shutil, "which", return_value="/unit-test/cosign"), patch.object(P, "cosign_command") as command:
            P.verify(arguments)
        argv = command.call_args.args[1]
        self.assertEqual(argv[0], "verify-blob-attestation")
        self.assertIn(arguments.certificate_identity, argv)
        self.assertIn(arguments.certificate_oidc_issuer, argv)
        self.assertNotIn("--insecure-ignore-tlog", argv)
        self.assertFalse(any("regexp" in item for item in argv))
        self.assertEqual(P.read_json(arguments.output)["verification"], "cosign_verified")

    def test_unit_mock_cosign_rejection_never_leaves_verified_status(self):
        statement = self.prepare()
        arguments = self.verification_arguments()
        P.write_json(arguments.bundle, self.bundle(statement))
        P.write_json(arguments.output, {"stale": True})
        with patch.object(P.shutil, "which", return_value="/unit-test/cosign"), patch.object(P, "cosign_command", side_effect=ValueError("cosign rejected")):
            with self.assertRaisesRegex(ValueError, "rejected"):
                P.verify(arguments)
        self.assertFalse(arguments.output.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
