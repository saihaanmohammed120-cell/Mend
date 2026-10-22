# Mend local-capture provenance tools

This standalone export generates an actual in-toto Statement/v1 with the SLSA provenance/v1 predicate. It describes only the curated local CSV capture. The published statement is unsigned. Signing it does not prove Nebius execution or certify a SLSA level.

## Prepare from real committed inputs

Run from this directory after committing these standalone files in the actual source repository. The script requires the real source, tests and capture script to match Git HEAD; an uncommitted download is not source provenance.

```bash
mkdir -p dist/example
cp example/csv_tools.py dist/example/csv_tools.py
python3 scripts/capture-example.py --output dist/example/captured-run.json
python3 scripts/provenance.py prepare --repo-root . --capture dist/example/captured-run.json --artifact dist/example/csv_tools.py --output dist/example/provenance.json
```

The actual repository URI is read from origin; --source-uri may identify the actual native repository when origin is not persisted. No GitHub URL is invented.

## Genuine keyless signing gate

`provenance-keyless.yml` is workflow source for a standalone export, not an installed or observed CI workflow. In an actual GitHub repository with this layout, commit it as `.github/workflows/provenance-keyless.yml`, then dispatch the workflow. It uses GitHub-hosted OIDC, cosign and exact identity/issuer verification; it neither merges nor deploys anything and is not a required CI gate. Its pinned actions and cosign release were inspected through GitHub MCP during implementation.

The local `sign` subcommand requires real OIDC credentials and the installed cosign CLI. Never paste OIDC tokens or API keys into chat. The output bundle is checked for exact DSSE payload and inclusion proof; real cosign verification must then succeed with the expected certificate identity and issuer. No `--insecure-ignore-tlog`, broad identity regex or fallback private key is used. Status JSON is a CLI report, not a browser trust root.

The current environment has neither cosign nor OIDC credentials, and GitHub MCP returned no accessible repositories. Real signing, public transparency publication and cryptographic end-to-end verification remain unverified. The current live backend receipt/database path is not converted into signed provenance by these standalone tools.

## Local checks

```bash
python3 tests/captured-example.test.py
python3 tests/provenance.test.py
```

Provenance tests use real temporary Git repositories and real local captures for source binding. Cosign argument/error tests explicitly mock the CLI and do not establish cryptographic verification. No browser or Nebius test is implied.
