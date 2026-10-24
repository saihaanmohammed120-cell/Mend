# Mend Receipts for VS Code

Run **Mend: Inspect Local Receipt** from the Command Palette, select an exported backend receipt JSON, and select a local workspace folder if several are open. The native **Mend Receipts** Output panel shows unsigned receipt assertions and compares the two contracted workspace files with the recorded source hash. It never executes code or reproduction commands.

Only current backend schema-1 `passed` receipts for `csv-cleaner-v1` are supported. A `/fix` review-request download is an intake document, not a receipt. Local fixture receipts remain labeled `local_test`. A receipt claiming `live_verification: true` remains an unauthenticated claim. Content equality does not prove execution, signing, approval or job termination.

For a development host, open this extension directory in VS Code and launch a new extension host with `--extensionDevelopmentPath` pointing here. Open the folder containing the receipt's final `csv_tools.py` and `test_csv_tools.py`, then run the command. No dependencies or compilation are required. No automatic activation, network requests, telemetry, file writes or workspace execution are added by the extension.

Run `npm test` for parser/hash/path/source regressions. See [IDE receipt guide](../../docs/IDE_RECEIPTS.md) in the source repository for supported limits, fixture generation and isolated VS Code host tests. A local development extension is provided; Marketplace publication and installation in your everyday profile are separate steps.
