# Mend continuation — 21 October 2026

This continuation delivers offline preparation and evidence validation. It does not enable a provider repair run. No live Nebius call, model discovery, provider job, hosted database mutation or paid provisioning occurred. Existing holds remain.

## Delivered

The `/fix` screen preserves Paper and Proof while bringing the first mobile input and Review action into view. Describe / Review / Export reflects actual local state. Linked errors focus their inputs; targeted editing, Clear/Undo and review invalidation work with the keyboard. Exact source and downloaded JSON receive separate local SHA-256 identities. Stale asynchronous hashes cannot attach to edited inputs. Inputs remain in page memory; this screen makes no API call or upload and does not save browser storage. No native form submission occurs without JavaScript. See `frontend/DESIGN.md` for design decisions, asset guidance and observed browser results.

Python bug cases now have a strictly validated, frozen preparation contract, a bounded file CLI and an authenticated, CSRF-protected stateless endpoint. They require original source, proposed protected tests, named acceptance checks and a target regression. The proposed four-job allocation is unmeasured and not approved. The new template is deliberately not accepted by the existing live CSV execution engine. The local intake screen does not yet collect protected tests or call the endpoint. See [bug-case protocol](BUG_CASE_REVIEW.md).

Comparative review validates signed original/candidate observations from the same reserved comparative job, binding source, checks, task, attempt, image, model and signed run role. A passing candidate establishes the named regression only when the original has the required behavioral assertion failure. Malformed, replayed or inconsistent reports fail closed. Generated patches preserve Unicode separators and missing final newlines. This helper is not a browser endpoint and never authorizes repository application. Configured HMAC keys establish authentication within that trust boundary, not independent provider authority or a public signature.

The runner can explicitly receive paired HTTPS report/termination readers. They enforce operator-configured origins, bounded reads, no redirects, separate HMAC keys, project and persisted context bindings, observer metadata and chronology. Bootstrap and live release gates remain closed. External report producers, independent infrastructure authority, trusted context wiring, raw-wire archival and timing uncertainty measurements remain incomplete. See [trusted reader protocol](../backend/docs/TRUSTED_EVIDENCE_READERS.md).

The accelerated positive-lag test now uses the existing controlled-clock fixture: cancellation at 60 seconds, stop at 63 seconds and lag exactly three seconds. Production timing logic is unchanged. Removing its deadline recheck still makes the early-wakeup regression fail at 59 seconds.

## Actual verification

| Check | Result and limits |
| --- | --- |
| Frontend unit tests | 107 passed; no skips |
| Production Chrome cases | 34 passed, including six new `/fix` cases; desktop/mobile, light/dark, keyboard, reduced motion, byte identities, edit/undo, privacy and no-JavaScript behavior |
| Frontend build and typecheck | Passed; browser startup builds production source |
| ESLint | Zero errors; existing command-copy and machine-local browser-config warnings |
| New bug-case and CLI tests | 10 passed; inputs were never executed by preparation |
| Genuine FastAPI HTTP driver | Six passed, zero skips; fixture authentication, no hosted database |
| Focused readers/runner/supervisor/stop/release suite | 49 passed offline, including 14 reader tests; overlaps other suites |
| Measurement suite | Ten passed; exact positive-lag regression passed 100 consecutive runs |
| Full Windows backend | 292 discovered: 270 passed, seven skipped, four failed, 11 errored; retained POSIX permission, symlink and executable limitations |
| Captured local Python example | Original three passed / one failed; corrected four passed / zero failed. Actual curated local fixture execution, unsigned, no model or provider |
| Independent review | No remaining material finding in changed backend paths; invalid signed role/category probes rejected; patch byte round-trips passed |

Counts from focused suites overlap; do not add them into a new total. Linux CI has not run. The workflow now requires the existing fail-closed HTTP runtime driver before complete unittest discovery. WSL and Docker were unavailable locally. Real PostgreSQL fixtures skip without an explicitly configured isolated database; no database access is authorized by this continuation. Workspace browser cases use explicit synthetic HTTPS/API fixtures, not real Supabase authentication.

## Recording and release

A 70.4-second, 1440×1000 silent recording demonstrates the actual local intake, review, download, edit invalidation and Clear/Undo. Chrome readback decoded playback with no media error. It is an offline UI draft, not the final narrated hackathon walkthrough and not evidence of an AI repair. The standalone delivery includes its video, poster, metadata and source hashes; it is not bundled into application assets. Follow [the existing walkthrough plan](WALKTHROUGH.md) for the later public recording, retaining truthful labels.

GitHub readback still shows the public `saihaanmohammed120-cell/Mend` repository with only its existing MIT LICENSE. Connector installation discovery remains empty, even after the user's reply about reconnecting. No source write, commit, push or Actions run succeeded in this continuation. The clean source package preserves that published MIT notice and the archive's contributor notice. Enable the existing GitHub app installation's access to Mend, then publish through the connector with parent-SHA protection and exact file/license readback.

The public static Site remains version 19, separately deployed on 20 October. These full-stack changes are local and are not deployed there. Authentication, application hosting, Linux CI, protected-test contract editing, external evidence producers and the gated provider loop remain release work. Codebase Memory is still non-operational on Windows; its verified archive was not repeatedly installed or falsely registered as connected.

## Continue from here

1. Restore connector installation access; publish the refreshed clean candidate and verify every file and MIT notice against its manifest.
2. Run Linux CI, inspect any genuine failures, and complete authenticated application hosting/browser acceptance without database mutation under the current hold.
3. Complete the protected-test review workflow and trusted context/producer integrations offline. Establish independent authority, raw evidence retention and measured timing before requesting live execution authorization.
4. Record a narrated walkthrough that separates captured local execution, simulated states and genuinely verified capabilities. Never imply that this draft proves a provider repair or guarantees a hackathon result.
