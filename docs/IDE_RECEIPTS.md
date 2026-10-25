# Local IDE receipt inspection

`extensions/vscode-mend` is a small, dependency-free VS Code extension. **Mend: Inspect Local Receipt** opens a user-selected backend receipt JSON and writes a plain-text report to the native **Mend Receipts** Output panel. Open the folder containing the final exported source before running it. With multiple local folders open, choose the folder to compare. Without a local folder, the panel explicitly reports that workspace binding was not checked. Cancellation clears earlier output; invalid or unsupported input produces no verification result.

Supported input is the direct JSON returned by `GET /api/tasks/{task_id}/receipt`: backend schema version 1, `status: passed`, and the current reviewed `csv-cleaner-v1` contract. `/fix` review requests, prepared bug contracts, static landing proof files, task wrappers, ZIP archives and arbitrary repository receipts are not this schema. The extension does not fetch anything from the API or download an artifact. Save an already authorized receipt response as a local JSON file. Do not put API credentials in it.

The bundled `contract-v1.json` is an exact copy of `backend/mend/domain.py:curated_contract()` as of this implementation. Its canonical SHA-256 is `c3b9aade1196264a86e097c09e44060a85fb0dd9da25ebf65651f19e81147297`. A contract change requires reviewing this copy and updating verification tests; unknown contract hashes fail closed. The current receipt does not carry a path manifest, so the viewer derives the two permitted paths from this reviewed contract: `csv_tools.py` and `test_csv_tools.py` at the selected folder root.

The viewer performs these distinct checks:

- Rejects invalid UTF-8/JSON, receipt inputs above 1 MiB, nesting beyond 64, unsafe integer values, lone surrogates, unsupported schema/status/contract, malformed identities and contradictory evidence labels.
- Checks that the recorded bundle and final snapshot hashes agree. This is internal JSON consistency, not a ZIP download or bundle verification.
- Reads the two contracted local files without newline or Unicode normalization, including preserving any UTF-8 BOM. Hashes exactly the backend representation: SHA-256 of UTF-8 canonical JSON `{"files":{...},"schema_version":1}`, sorted object keys, compact separators and literal non-ASCII characters. Backend-produced ASCII and Unicode/control-character golden vectors are in the tests. Other workspace files do not enter this hash.
- Separately compares protected test text with the bundled reviewed contract. Files must be valid UTF-8 without NUL, within the backend 200,000-byte combined source limit. Traversal, hidden paths, absolute paths, Windows device aliases, trailing-dot aliases and source symlink/junction components are rejected. Only local regular files are read.
- Reports whether recorded check IDs/counts/results describe the four required passes, and whether a unique recorded final attempt agrees with task, snapshot, job, model and image identities. Missing or contradictory records remain explicitly unverifiable/inconsistent. This is an assertion comparison within unsigned input; it does not authenticate the report, commands or any execution.

Every report says **UNSIGNED / UNAUTHENTICATED**. Neither `source: live`, `live_verification: true`, a field named `signed`, nor a matching hash establishes a verified signature or live execution. Unknown properties are ignored and raw prompt, log, command and URL fields are not rendered. Execution labels appear as quoted plain text. The extension generates no HTML, links or executable command buttons; native editor text detection remains VS Code behavior. Runtime behavior, protected-test execution, stop timing, approved policy, team attribution, public signing and production readiness remain outside this viewer. No keys are requested or stored.

The extension reads files only when invoked. It runs in untrusted local workspaces because it evaluates neither workspace code nor configuration. It makes no network requests, adds no telemetry, writes no workspace files and never invokes a reproduction command. VS Code's own networking/telemetry settings are separate. Reads are a momentary comparison, not an atomic filesystem snapshot or protection against a process concurrently replacing directories; rerun inspection after edits. Unsaved editor buffers do not enter the comparison. A mismatch is displayed as a mismatch, never an approval.

## Install a local VSIX

Build an installable VSIX from `extensions/vscode-mend`, with Node.js 24 and npm:

```sh
npx --yes @vscode/vsce@4.0.0 package --no-dependencies --out mend-receipts.vsix --baseContentUrl https://github.com/saihaanmohammed120-cell/Mend/blob/main/extensions/vscode-mend
```

The first invocation downloads the pinned official packaging tool and its dependencies. The extension itself remains dependency-free. CI's `roadmap_tools` job tests, builds and uploads `mend-receipts-vsix` on success. Select the exact reviewed commit in [GitHub Actions](https://github.com/saihaanmohammed120-cell/Mend/actions); artifact download may require GitHub sign-in and is subject to artifact retention. Local packaging needs no Marketplace account. Source, tests and the MIT license stay public.

Run **Extensions: Install from VSIX…**, select the package and reload if prompted. To use isolated directories instead of changing an everyday profile:

```sh
code --user-data-dir /NEW/mend-profile --extensions-dir /NEW/mend-extensions --install-extension /PATH/mend-receipts.vsix
code --new-window --user-data-dir /NEW/mend-profile --extensions-dir /NEW/mend-extensions /PATH/ide-fixture/workspace
```

Replace placeholders with actual paths; quote paths containing spaces. Run **Mend: Inspect Local Receipt** and select the matching receipt. The [offline demo command](OFFLINE_DEMO.md) exports a simulated-service receipt and workspace. The package is unsigned; `mend-local` is a local identity, not a verified Marketplace publisher. Packaging adds no receipt-signing authority. No Marketplace publication or everyday-profile installation is automatic. The 24 October record below predates this packaging work.

## Development and checks

Requirements: VS Code 1.85 or later and its built-in Node runtime. Unit tests use Node 18 or later. There are no extension dependencies to install and no build step. From the repository root:

```powershell
node --test extensions/vscode-mend/test/receipt.test.js extensions/vscode-mend/test/extension.test.js
code --new-window --extensionDevelopmentPath="$PWD/extensions/vscode-mend"
```

Open the final source folder in that development host and invoke the command with the palette. This does not install the extension in an everyday user profile. To create a real exported **local fixture** for inspection, the existing backend must be importable by Python. The fixture uses `LocalTestStore`, `FixtureModel`, `FixtureRunner` and `TaskService`, simulates failure/repair, exports the service's actual public receipt, and retrieves/validates its final artifact. It does not execute candidate code, call a provider or touch a hosted database. Choose a new output directory outside the public source:

```powershell
python extensions/vscode-mend/test/export-fixture.py C:/Temp/mend-ide-fixture
$env:MEND_IDE_SMOKE_ROOT = 'C:/Temp/mend-ide-fixture'
code --new-window --disable-extensions --disable-workspace-trust --skip-welcome --skip-release-notes --user-data-dir=C:/Temp/mend-ide-profile --extensions-dir=C:/Temp/mend-ide-extensions --extensionDevelopmentPath="$PWD/extensions/vscode-mend" --extensionTestsPath="$PWD/extensions/vscode-mend/test/host.js" C:/Temp/mend-ide-fixture/workspace
```

Use new isolated profile/extension directories; do not point these paths at an everyday profile. VS Code launches the extension test runner; `host-result.json` in the fixture directory records activation, command registration, the actual backend receipt, exact source and protected-check match, unsigned labels, internal final-attempt identity and mismatch after a temporary source edit. The host test edits/restores **only the disposable fixture**, while the extension command itself remains read-only. Desktop file-picker interaction, screen-reader interaction and Marketplace packaging are separate from automated command activation.

## Verification on 24 October 2026

All 13 Node tests passed on Node 24.19.0, including native API mocks for picker selection, multi-root selection, cancellation/stale-output clearing and safe failure messages. An actual installed VS Code 1.140.0 extension development host passed the eight automated checks above against a fresh backend-exported `local_test` receipt. It used isolated profile/extension directories outside the public source and exited after completion. The initial host harness compared Windows drive-letter casing literally; it was corrected to normalize platform paths, then rerun successfully. No provider request, generated-code execution, hosted database change or everyday VS Code profile change occurred.

Workspace evidence: `outputs/Mend_IDE_Fixture_20261024/host-result.json` outside the canonical source. This is local fixture evidence, not evidence of a live repair. Manual desktop file-picker accessibility/screen-reader interaction, minimum-version VS Code, remote/virtual workspaces, public signature verification and Marketplace installation/publication were not verified. The extension remains a local development integration with the current two-file contract.

## Packaged installation verification on 25 October 2026

The official `vsce` 4.0.0 tool produced a VSIX containing only the generated manifest/content-type metadata and six extension payload files. It was installed with VS Code's CLI into new isolated profile/extension directories. A separate, empty development-test harness then found `mend-local.mend-receipts` **at its installed extension path**, not the source development directory. The installed VSIX passed the same eight actual VS Code 1.140.0 host checks listed above against the new offline demo's backend-exported receipt and restored the fixture after its mismatch check. The 13 Node tests and the complete offline demo/no-overwrite regression also passed locally. No everyday profile changed. VS Code emitted its own deprecation/agent-host channel messages; the host exited successfully and produced the passing result.

This establishes local packaging, isolated installation and automated command behavior. Manual file-picker/screen-reader interaction, minimum-version VS Code, remote workspaces, Marketplace publication, public signatures and live execution remain unverified. The package is unsigned and the simulated receipt is unsigned. See [official VS Code installation guidance](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) for managing installed extensions.
