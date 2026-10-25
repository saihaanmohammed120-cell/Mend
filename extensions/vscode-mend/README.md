# Mend Receipts for VS Code

Run **Mend: Inspect Local Receipt** from the Command Palette, select an exported backend receipt JSON, and select a local workspace folder if several are open. The native **Mend Receipts** Output panel shows unsigned receipt assertions and compares the two contracted workspace files with the recorded source hash. It never executes code or reproduction commands.

Only current backend schema-1 `passed` receipts for `csv-cleaner-v1` are supported. A `/fix` review-request download is an intake document, not a receipt. Local fixture receipts remain labeled `local_test`. A receipt claiming `live_verification: true` remains an unauthenticated claim. Content equality does not prove execution, signing, approval or job termination.

To build an installable VSIX, run this command in the extension directory with Node.js 24 and npm (the packaging tool is downloaded on first use):

```sh
npx --yes @vscode/vsce@4.0.0 package --no-dependencies --out mend-receipts.vsix --baseContentUrl https://github.com/saihaanmohammed120-cell/Mend/blob/main/extensions/vscode-mend
```

In VS Code run **Extensions: Install from VSIX…**, select the package and reload if prompted. Alternatively, download the `mend-receipts-vsix` artifact from a successful GitHub Actions run for the commit you reviewed. GitHub may require sign-in to download Actions artifacts. This is a local, unsigned package; `mend-local` is its local identifier, not a verified Marketplace publisher. No Marketplace publication is claimed.

Open the folder containing the receipt's final `csv_tools.py` and `test_csv_tools.py`, then run the command. The installed extension needs no dependencies or compilation. It adds no network requests, telemetry, file writes or workspace execution. For a development host, launch VS Code with `--extensionDevelopmentPath` pointing at this directory.

Run `npm test` for parser/hash/path/source regressions. See the [IDE receipt guide](https://github.com/saihaanmohammed120-cell/Mend/blob/main/docs/IDE_RECEIPTS.md) for supported limits and isolated host tests, and the [offline demo guide](https://github.com/saihaanmohammed120-cell/Mend/blob/main/docs/OFFLINE_DEMO.md) for a single command that exports a fixture receipt and its matching workspace. The receipt remains simulated and unsigned.
