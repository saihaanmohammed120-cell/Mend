# Mend: test the available build

## Without installing anything

Open [Mend](https://mend-smasher.vercel.app/), then [the bug desk](https://mend-smasher.vercel.app/fix). The public build supports local input/review/download and captured evidence inspection. [Sample playback](https://mend-smasher.vercel.app/sample) is explicitly simulated. Hosted authentication and live repair are not available yet; no judge credentials or provider-backed demonstration are claimed.

On the bug desk, load the captured input or paste a small Python module. Enter the expected behavior and review the intake. Editing invalidates review. Clear/Undo restores inputs and requires fresh review. Download the intake JSON. To prepare a full proposed-check request, expand the optional checks editor, supply `test_regression.py`, unique required unittest IDs and a target from that list, review, then download the request. No export starts a job or approves the checks. Inputs stay in page memory; keep private code out of public demonstrations.

The evidence panel names its source, displays captured source/check identities and offers raw example/provenance downloads. A SHA-256 match confirms bytes; it does not establish signing authority or live cloud execution.

## Reproduce the captured example locally

Use Python 3.12 and a fresh [public checkout](https://github.com/saihaanmohammed120-cell/Mend). From the repository root:

```bash
python frontend/scripts/capture-example.py --output mend-local-capture.json
```

Use a new output filename. The known empty-input defect is curated: expected original result is three passes/one failure, corrected result four passes/zero failures. This command runs only the repository's known local example, not submitted code or a model request. Inspect the output's local/unsigned/live-false labels. If results differ, retain the failure rather than presenting the expected counts as observations.

For the frontend, use Node.js 24 and the existing lockfile:

```bash
cd frontend
npm ci
npm test
npm run build
npm run start
```

Open the loopback URL printed by Next. Authenticated workbench routes require separately configured server infrastructure; no API key is needed to inspect local input/export and sample pages.

## Freeze an exported review request without execution

From the repository root, install the declared backend package in a private Python virtual environment:

```bash
python -m venv .venv
```

Activate with `.venv\Scripts\Activate.ps1` in Windows PowerShell, or `source .venv/bin/activate` in a POSIX shell, then:

```bash
python -m pip install './backend[test]'
python backend/scripts/prepare_bug_case.py --request /path/to/mend-bug-review-request.json --output mend-prepared-case.json
```

Use your actual downloaded input path and a new output filename. The output must say `not_approved`, `execution_enabled: false` and `live_verification: false`; exact source/test text is retained. Preparation neither executes those files nor produces a passing repair receipt.

## Verification evidence

Review the [Actions run for the exact selected commit](https://github.com/saihaanmohammed120-cell/Mend/actions), not a count copied from an older README paragraph. The workflow checks backend/HTTP, frontend/browser/production proxy chain, image builds and disposable PostgreSQL migrations/rollback. The HTTP chain uses fixture identity. The PostgreSQL service uses synthetic Supabase prerequisite schemas; neither establishes hosted Auth, Storage, concurrency or provider performance.

For live judge testing, this guide must be updated only after real hosted authentication, a genuine supported repair, required evidence and private judge access actually pass. See the [release blockers](RELEASE_READINESS_2026_10_24.md). Never ask judges to supply service-role or provider keys.
