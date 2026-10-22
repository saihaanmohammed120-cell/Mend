#!/usr/bin/env python3
"""Prepare real local SLSA provenance, then keylessly attest and verify with cosign.

Unsigned provenance is not proof of authenticity, a SLSA level, or Nebius execution.
Signing publishes the statement and signing identity to Sigstore's public log.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlparse
import zipfile

STATEMENT_TYPE = "https://in-toto.io/Statement/v1"
PREDICATE_TYPE = "https://slsa.dev/provenance/v1"
BUILD_TYPE = "https://mend-paper-proof.bravebadge32.chatgpt.site/standards/local-csv-capture-v1.html"
INPUTS = {"source_sha256": "example/csv_tools.py", "tests_sha256": "example/test_csv_tools.py", "capture_script_sha256": "scripts/capture-example.py"}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def git(root, *arguments):
    result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, check=False, timeout=20)
    if result.returncode:
        raise ValueError("Git source identity or committed input could not be read")
    return result.stdout


def source_uri(value):
    if not value or any(character.isspace() for character in value):
        raise ValueError("A real source repository URI is required; origin is absent")
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "ssh", "git", "git+https", "git+ssh"} or not parsed.hostname or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Source URI must identify a real git repository without credentials, query or fragment")
    if parsed.scheme in {"https", "git+https"} and parsed.username:
        raise ValueError("Source URI must not contain credentials")
    return value


def validate_statement(statement, artifact):
    if not isinstance(statement, dict):
        raise ValueError("Provenance statement must be a JSON object")
    if statement.get("_type") != STATEMENT_TYPE or statement.get("predicateType") != PREDICATE_TYPE:
        raise ValueError("Expected in-toto Statement/v1 and SLSA provenance/v1")
    subjects = statement.get("subject")
    expected = {"name": artifact.name, "digest": {"sha256": sha(artifact.read_bytes())}}
    if subjects != [expected]:
        raise ValueError("Provenance subject does not match artifact bytes/name")
    # Validate this documented local-capture profile, not merely its type labels.
    # Cryptographic authenticity alone cannot make incomplete provenance valid.
    def object_value(value, label):
        if not isinstance(value, dict):
            raise ValueError(f"{label} must be a JSON object")
        return value

    def nonempty_string(value, label):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{label} must be a nonempty string")
        return value

    predicate = object_value(statement.get("predicate"), "Provenance predicate")
    definition = object_value(predicate.get("buildDefinition"), "Build definition")
    if definition.get("buildType") != BUILD_TYPE:
        raise ValueError("Unexpected build type")
    dependencies = definition.get("resolvedDependencies")
    if not isinstance(dependencies, list) or any(not isinstance(item, dict) for item in dependencies):
        raise ValueError("Resolved dependencies must be an array of objects")
    # SLSA dependencies are unordered; do not assume the source is first.
    sources = [item for item in dependencies if isinstance(item.get("digest"), dict) and "gitCommit" in item["digest"]]
    if len(sources) != 1:
        raise ValueError("Expected one resolved source repository commit")
    source_uri(nonempty_string(sources[0].get("uri"), "Source repository URI"))
    commit = sources[0]["digest"]["gitCommit"]
    if not isinstance(commit, str) or len(commit) not in {40, 64} or any(char not in "0123456789abcdef" for char in commit):
        raise ValueError("Invalid resolved source repository commit")
    external = object_value(definition.get("externalParameters"), "External parameters")
    if external.get("entryPoint") != "scripts/capture-example.py":
        raise ValueError("Entrypoint must name the actual capture script")
    nonempty_string(external.get("trigger"), "Trigger")
    parameters = object_value(external.get("parameters"), "Capture parameters")
    if any(not isinstance(key, str) or not key or not isinstance(value, str) for key, value in parameters.items()):
        raise ValueError("Capture parameters must map nonempty string keys to string values")
    for name in ("capture", "artifact"):
        nonempty_string(parameters.get(name), f"{name} parameter")
    internal = object_value(definition.get("internalParameters"), "Internal parameters")
    nonempty_string(internal.get("executionPlatform"), "Execution platform")
    if internal.get("liveNebiusExecution") is not False:
        raise ValueError("Local capture provenance must not claim live Nebius execution")
    details = object_value(predicate.get("runDetails"), "Run details")
    builder = object_value(details.get("builder"), "Builder")
    identity = nonempty_string(builder.get("id"), "Builder identity")
    if any(character.isspace() for character in identity) or not urlparse(identity).scheme:
        raise ValueError("Builder identity must be a URI")


def distinct_paths(*paths):
    resolved = [Path(path).resolve() for path in paths]
    if len(resolved) != len(set(resolved)):
        raise ValueError("Artifact, statement, capture, bundle and status paths must be distinct")


def prepare(arguments):
    output = arguments.output.resolve()
    root = arguments.repo_root.resolve()
    distinct_paths(output, arguments.capture, arguments.artifact)
    distinct_paths(output, *(root / name for name in INPUTS.values()))
    output.unlink(missing_ok=True)
    if arguments.entrypoint != "scripts/capture-example.py":
        raise ValueError("Entrypoint must name the actual committed capture script")
    commit = git(root, "rev-parse", "HEAD").decode().strip()
    if len(commit) not in {40, 64} or any(char not in "0123456789abcdef" for char in commit):
        raise ValueError("Invalid real git commit")
    uri = arguments.source_uri
    if not uri:
        result = subprocess.run(["git", "-C", str(root), "remote", "get-url", "origin"], capture_output=True, text=True, check=False, timeout=20)
        uri = result.stdout.strip() if result.returncode == 0 else None
    uri = source_uri(uri)
    capture = read_json(arguments.capture)
    hashes = {}
    for key, name in INPUTS.items():
        current = (root / name).read_bytes()
        if git(root, "show", f"{commit}:{name}") != current:
            raise ValueError(f"Working input differs from git HEAD: {name}")
        hashes[key] = sha(current)
    capture_path = root / "scripts/capture-example.py"
    spec = importlib.util.spec_from_file_location("mend_committed_capture", capture_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source = (root / INPUTS["source_sha256"]).read_bytes()
    tests = (root / INPUTS["tests_sha256"]).read_bytes()
    before = source.replace(module.GUARD, b"", 1)
    if not module.valid_capture(capture, hashes, before.decode(), source.decode()):
        raise ValueError("Capture is invalid or does not describe the committed inputs")
    artifact = arguments.artifact.resolve()
    if zipfile.is_zipfile(artifact):
        with zipfile.ZipFile(artifact) as archive:
            if archive.read("csv_tools.py") != source or archive.read("test_csv_tools.py") != tests:
                raise ValueError("Artifact ZIP source/test bytes differ from captured inputs")
    elif artifact.read_bytes() != source:
        raise ValueError("Artifact must be the captured source or a ZIP containing its exact source/tests")
    parameters = {}
    for pair in arguments.parameter:
        if "=" not in pair:
            raise ValueError("Parameters must be KEY=VALUE")
        key, value = pair.split("=", 1)
        if not key or key in parameters:
            raise ValueError("Parameter keys must be unique and nonempty")
        parameters[key] = value
    parameters.update({"capture": arguments.capture.as_posix(), "artifact": arguments.artifact.as_posix()})
    statement = {
        "_type": STATEMENT_TYPE,
        "subject": [{"name": artifact.name, "digest": {"sha256": sha(artifact.read_bytes())}}],
        "predicateType": PREDICATE_TYPE,
        "predicate": {
            "buildDefinition": {
                "buildType": BUILD_TYPE,
                "externalParameters": {"entryPoint": arguments.entrypoint, "parameters": parameters, "trigger": arguments.trigger},
                "internalParameters": {"executionPlatform": getattr(arguments, "platform", "local Python subprocess"), "liveNebiusExecution": False},
                "resolvedDependencies": [{"uri": uri, "digest": {"gitCommit": commit}}, *[
                    {"uri": f"{uri}#{name}", "digest": {"sha256": hashes[key]}} for key, name in INPUTS.items()
                ], {"uri": "urn:mend:captured-local-run", "digest": {"sha256": sha(arguments.capture.read_bytes())}}],
            },
            "runDetails": {
                "builder": {"id": arguments.builder_id},
                "metadata": {
                    "invocationId": "urn:sha256:" + sha(arguments.capture.read_bytes()),
                    "startedOn": capture["before"]["started_at"],
                    "finishedOn": capture["after"]["finished_at"],
                },
            },
        },
    }
    validate_statement(statement, artifact)
    write_json(output, statement)
    print("Prepared unsigned in-toto/SLSA provenance for actual local capture; authenticity is unverified.")


def cosign_command(executable, arguments):
    try:
        result = subprocess.run([executable, *arguments], capture_output=True, check=False, timeout=180)
    except subprocess.TimeoutExpired as error:
        raise ValueError("cosign exceeded the bounded signing/verification deadline") from error
    if result.returncode:
        # Provider output can contain identity material; never echo it into build logs.
        raise ValueError(f"cosign failed with exit status {result.returncode}; no verified status was emitted")


def validate_bundle(bundle, statement):
    if not isinstance(bundle, dict):
        raise ValueError("Sigstore bundle must be a JSON object")
    envelope = bundle.get("dsseEnvelope", {})
    if envelope.get("payloadType") != "application/vnd.in-toto+json" or not envelope.get("signatures"):
        raise ValueError("Bundle is missing a signed in-toto DSSE envelope")
    try:
        decoded = json.loads(base64.b64decode(envelope["payload"], validate=True))
    except (KeyError, ValueError, TypeError) as error:
        raise ValueError("Malformed DSSE payload") from error
    if decoded != statement:
        raise ValueError("Signed DSSE statement differs from expected provenance")
    entries = bundle.get("verificationMaterial", {}).get("tlogEntries", [])
    if not entries or not all(item.get("inclusionProof") for item in entries):
        raise ValueError("Bundle has no transparency-log inclusion proof")
    return entries


def verify(arguments, bundle_path=None):
    distinct_paths(arguments.output, arguments.artifact, arguments.statement, bundle_path or arguments.bundle)
    arguments.output.unlink(missing_ok=True)
    artifact = arguments.artifact.resolve()
    statement = read_json(arguments.statement)
    validate_statement(statement, artifact)
    bundle_path = bundle_path or arguments.bundle
    bundle = read_json(bundle_path)
    entries = validate_bundle(bundle, statement)
    executable = shutil.which(arguments.cosign)
    if not executable:
        raise ValueError("cosign is unavailable; cryptographic verification is unverified")
    cosign_command(executable, ["verify-blob-attestation", "--bundle", str(bundle_path), "--certificate-identity", arguments.certificate_identity, "--certificate-oidc-issuer", arguments.certificate_oidc_issuer, "--type", PREDICATE_TYPE, str(artifact)])
    write_json(arguments.output, {
        "schema_version": 1,
        "verification": "cosign_verified",
        "notice": "CLI verification result; browsers must not trust this status file as a signature.",
        "statement_sha256": sha(arguments.statement.read_bytes()),
        "artifact_sha256": sha(artifact.read_bytes()),
        "bundle_sha256": sha(Path(bundle_path).read_bytes()),
        "certificate_identity": arguments.certificate_identity,
        "certificate_oidc_issuer": arguments.certificate_oidc_issuer,
        "transparency_log_entries": len(entries),
    })
    print("cosign verified the exact artifact, signed statement, identity, issuer and transparency-log evidence.")


def sign(arguments):
    distinct_paths(arguments.output, arguments.bundle, arguments.artifact, arguments.statement)
    arguments.output.unlink(missing_ok=True)
    arguments.bundle.unlink(missing_ok=True)
    if not os.environ.get("SIGSTORE_ID_TOKEN") and not (os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL") and os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")):
        raise ValueError("Unattended keyless signing requires genuine OIDC credentials; no signature was created")
    executable = shutil.which(arguments.cosign)
    if not executable:
        raise ValueError("cosign is unavailable; signing is unverified")
    statement = read_json(arguments.statement)
    validate_statement(statement, arguments.artifact.resolve())
    arguments.bundle.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mend-keyless-") as temporary:
        bundle = Path(temporary) / "bundle.sigstore.json"
        cosign_command(executable, ["attest-blob", "--statement", str(arguments.statement), "--bundle", str(bundle), "--yes", str(arguments.artifact.resolve())])
        verify(arguments, bundle)
        try:
            os.replace(bundle, arguments.bundle)
        except OSError:
            arguments.output.unlink(missing_ok=True)
            raise
    print("Published and verified keyless Sigstore attestation; no live execution or SLSA level is implied.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("prepare", help="Prepare unsigned standards-based provenance from real committed local inputs")
    command.add_argument("--repo-root", type=Path, required=True)
    command.add_argument("--capture", type=Path, required=True)
    command.add_argument("--artifact", type=Path, required=True)
    command.add_argument("--output", type=Path, required=True)
    command.add_argument("--source-uri", help="Actual repository URI; default git origin; never a fabricated public repository")
    command.add_argument("--entrypoint", default="scripts/capture-example.py")
    command.add_argument("--builder-id", default="urn:mend:builder:local-csv-capture-v1")
    command.add_argument("--trigger", default="manual")
    command.add_argument("--platform", default="local Python subprocess")
    command.add_argument("--parameter", action="append", default=[], metavar="KEY=VALUE")
    command.set_defaults(function=prepare)
    for name, function in (("sign", sign), ("verify", verify)):
        command = commands.add_parser(name)
        for flag in ("artifact", "statement", "bundle", "output"):
            command.add_argument("--" + flag, type=Path, required=True)
        command.add_argument("--certificate-identity", required=True, help="Exact expected certificate identity, never a regular expression")
        command.add_argument("--certificate-oidc-issuer", required=True, help="Exact expected OIDC issuer")
        command.add_argument("--cosign", default="cosign")
        command.set_defaults(function=function)
    arguments = parser.parse_args()
    try:
        arguments.function(arguments)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.TimeoutExpired, zipfile.BadZipFile) as error:
        print(f"Provenance operation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
