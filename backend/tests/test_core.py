import io
import json
import unittest
import zipfile
from unittest.mock import patch

from mend.artifacts import ArtifactStore, LocalArtifacts, deterministic_zip, verify_bundle
from mend.domain import MendError, canonical_json, curated_contract, initial_files, protected_checks_sha256, public_payload, source_sha256, validate_contract
from mend.patches import validate_replacements

USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
TASK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


class CoreTests(unittest.TestCase):
    def test_canonical_hash_order_and_content(self):
        self.assertEqual(source_sha256({"b.py": "b", "a.py": "a"}), source_sha256({"a.py": "a", "b.py": "b"}))
        self.assertNotEqual(source_sha256({"a.py": "a"}), source_sha256({"a.py": "b"}))
        with self.assertRaises(MendError):
            canonical_json({"cost": float("nan")})

    def test_canonical_evidence_rejects_nested_floats_and_non_json_types(self):
        for value in (1.25, {"limits": {"cap": 60.0}}, [1, {"value": float("inf")}],
                      ("tuple",), {1: "non-string-key"}):
            with self.subTest(value=repr(value)), self.assertRaises(MendError):
                canonical_json(value)
        self.assertEqual(canonical_json({"zero": 0, "ok": True}), b'{"ok":true,"zero":0}')

    def test_contract_protects_commands_checks_limits(self):
        contract = curated_contract()
        self.assertEqual(validate_contract(contract), contract)
        self.assertEqual(contract["limits"]["max_source_bytes"], 200000)
        self.assertEqual(len(contract["required_check_ids"]), 4)
        self.assertEqual(len(protected_checks_sha256(contract)), 64)
        for field, replacement in (("commands", [{"id": "unit-tests", "argv": ["sh", "-c", "bad"]}]),
                                   ("editable_paths", ["test_csv_tools.py"]), ("required_check_ids", [])):
            changed = curated_contract()
            changed[field] = replacement
            with self.subTest(field=field), self.assertRaises(MendError):
                validate_contract(changed)

    def test_protected_source_and_stale_hash(self):
        contract, files = curated_contract(), initial_files()
        changed = validate_replacements(contract, files, {"csv_tools.py": "def clean_rows(rows):\n    return [], 0\n"}, source_sha256(files))
        self.assertEqual(changed["test_csv_tools.py"], files["test_csv_tools.py"])
        with self.assertRaises(MendError):
            validate_replacements(contract, files, {"csv_tools.py": "changed"}, "0" * 64)
        files["test_csv_tools.py"] = "skip tests"
        with self.assertRaises(MendError):
            validate_replacements(contract, files, {"csv_tools.py": "changed"})

    def test_unsafe_replacements(self):
        for path in ("../csv_tools.py", "/csv_tools.py", "x//a.py", "csv_tools.py/../x", "a\\b.py", "test_csv_tools.py", ".env"):
            with self.subTest(path=path), self.assertRaises(MendError):
                validate_replacements(curated_contract(), initial_files(), {path: "bad"})
        for text in ("\x00", "x" * 200001, "\ud800"):
            with self.assertRaises(MendError):
                validate_replacements(curated_contract(), initial_files(), {"csv_tools.py": text})
        with self.assertRaises(MendError):
            validate_replacements(curated_contract(), initial_files(), {})

    def test_bundle_is_deterministic_and_matches_snapshot(self):
        files = initial_files()
        data = deterministic_zip(files)
        self.assertEqual(data, deterministic_zip(dict(reversed(list(files.items())))))
        self.assertEqual(verify_bundle(data, source_sha256(files)), files)
        with self.assertRaises(MendError):
            verify_bundle(data, "0" * 64)
        with self.assertRaises(MendError):
            verify_bundle(data + b"unexpected trailing payload", source_sha256(files))

    def test_archive_rejects_traversal_duplicates_symlinks_and_compression(self):
        for kind in ("traversal", "duplicate", "symlink", "compressed"):
            output = io.BytesIO()
            with zipfile.ZipFile(output, "w") as archive:
                if kind == "traversal":
                    archive.writestr("../bad.py", "bad")
                elif kind == "duplicate":
                    archive.writestr("a.py", "a")
                    with self.assertWarns(UserWarning):
                        archive.writestr("a.py", "a")
                elif kind == "symlink":
                    info = zipfile.ZipInfo("a.py")
                    info.external_attr = 0o120777 << 16
                    archive.writestr(info, "target")
                else:
                    archive.writestr("a.py", "a", compress_type=zipfile.ZIP_DEFLATED)
            with self.subTest(kind=kind), self.assertRaises(MendError):
                verify_bundle(output.getvalue(), source_sha256({"a.py": "a"}))

    def test_local_artifacts_immutable_scoped_and_labeled(self):
        store = LocalArtifacts()
        key = store.put(TASK, USER, "source.zip", b"bundle")
        self.assertEqual(key, USER + "/" + TASK + "/source.zip")
        self.assertEqual(store.get(key), b"bundle")
        self.assertEqual(store.source, "local_test")
        self.assertTrue(store.signed_download(key).startswith("local_test://"))
        with self.assertRaises(MendError):
            store.put(TASK, USER, "source.zip", b"new")
        with self.assertRaises(MendError):
            store.put(TASK, USER, "../../other/source.zip", b"new")
        for expires in (0, 301, True):
            with self.assertRaises(MendError):
                store.signed_download(key, expires)

    def test_safe_public_fields_keep_frozen_contract_without_secrets(self):
        result = public_payload({"id": TASK, "worker_id": "private", "lease_token": "private",
                                 "provider_token": "private", "contract": curated_contract(),
                                 "receipt": {"job_id": "job", "service_role_key": "secret"}})
        self.assertEqual(result["contract"], curated_contract())
        self.assertEqual(public_payload({"files": initial_files()})["files"], initial_files())
        self.assertEqual(public_payload({"protected_files": curated_contract()["protected_files"]})["protected_files"], curated_contract()["protected_files"])
        self.assertNotIn("worker_id", result)
        self.assertNotIn("service_role_key", result["receipt"])

    def test_supabase_transport_paths_and_immutable_upload(self):
        store = ArtifactStore("https://example.supabase.co", "private-key")
        with patch.object(store, "_request", return_value=b"{}") as request:
            key = store.put(TASK, USER, "source.zip", b"bytes")
            self.assertEqual(request.call_args.args[:2], ("POST", "object/mend-artifacts/" + key))
        signed = "/object/sign/mend-artifacts/" + key + "?token=short-lived"
        with patch.object(store, "_request", return_value=json.dumps({"signedURL": signed}).encode()):
            self.assertEqual(store.signed_download(key), "https://example.supabase.co/storage/v1" + signed)
        for url in ("https://evil.example/object/sign/" + key + "?token=x",
                    "/object/sign/mend-artifacts/" + USER + "/" + USER + "/source.zip?token=x"):
            with patch.object(store, "_request", return_value=json.dumps({"signedURL": url}).encode()):
                with self.assertRaises(MendError):
                    store.signed_download(key)

    def test_artifact_configuration_failures_are_safe(self):
        cases = ({"base_url": "https://[broken"}, {"base_url": "https://example.supabase.co:bad"},
                 {"base_url": "https://example.supabase.co:444"}, {"base_url": None},
                 {"bucket": None}, {"service_role_key": "secret\x00value"},
                 {"timeout": "15"}, {"timeout": True}, {"max_bytes": True}, {"max_bytes": 1.5})
        for changed in cases:
            settings = {"base_url": "https://example.supabase.co", "service_role_key": "secret"}
            settings.update(changed)
            with self.subTest(changed=changed), self.assertRaises(MendError) as caught:
                ArtifactStore(**settings)
            self.assertEqual(caught.exception.code, "artifact_config")
            self.assertEqual(caught.exception.status, 503)

    def test_public_task_sequence_is_available_without_leases(self):
        self.assertEqual(public_payload({"next_sequence": 6, "lease_token": "private"}), {"next_sequence": 6})

    def test_transport_response_is_bounded_and_redirects_forbidden(self):
        store = ArtifactStore("https://example.supabase.co", "private-key", max_bytes=10)
        class Response:
            headers = {"Content-Length": "11"}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, amount): raise AssertionError("Oversized body must not be read")
        with patch.object(store._opener, "open", return_value=Response()):
            with self.assertRaises(MendError):
                store.get(USER + "/" + TASK + "/source.zip")
        class UnknownLength(Response):
            headers = {}
            def read(self, amount):
                self.requested = amount
                return b"x" * amount
        with patch.object(store._opener, "open", return_value=UnknownLength()):
            with self.assertRaises(MendError):
                store.get(USER + "/" + TASK + "/source.zip")
        for url in ("http://example.supabase.co", "https://token@example.supabase.co", "https://example.supabase.co/?key=x"):
            with self.assertRaises(MendError):
                ArtifactStore(url, "secret")


if __name__ == "__main__":
    unittest.main()
