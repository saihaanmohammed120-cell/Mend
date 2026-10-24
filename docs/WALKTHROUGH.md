# Narrated walkthrough — current plan, 22 October 2026

24 October update: use the [current submission draft](HACKATHON_SUBMISSION_2026_10_24.md), [judge guide](JUDGE_GUIDE.md) and [release ledger](RELEASE_READINESS_2026_10_24.md). Public app is now https://mend-smasher.vercel.app/ ; actual source/CI have advanced beyond the historical baseline below. Record only the final verified commit and update any narrated counts from that run. Final public YouTube video and genuine provider repair remain incomplete; the 2:45 offline script does not satisfy them.

This current section supersedes the dated 19 October plan retained below. Public full-stack source and baseline Linux CI now exist: commit `30279ac41162e11eb26974a8f525d3db89b447e7`, [successful run](https://github.com/saihaanmohammed120-cell/Mend/actions/runs/39730504477). No final narrated video or public YouTube URL exists in this record. The earlier 70.4-second silent UI capture is a draft, not this recording.

Target: **2:45 total**, including transitions, below the official three-minute limit. Use the [submission checklist](HACKATHON_SUBMISSION_2026_10_22.md) for current requirements and unfinished fields. Keep a visible `OFFLINE DEMONSTRATION — curated patch; unsigned local evidence; no live Nebius/Nemotron run` label throughout local evidence. Both provider and database holds remain.

## Recordable English script: offline evidence workflow

Read the quoted narration only. This script demonstrates available behavior and does not establish the required provider runtime use. Rehearse the final cut; a script estimate is not an actual media duration. Keep code and UI text legible and use captions.

| Time | Show / perform | Narration |
| --- | --- | --- |
| 0:00–0:15 | Actual preview and visible offline label; immediately show before/after checks. | “Mend helps developers review a repair through its exact source and checks. This is an offline demonstration: the patch is curated, the evidence is unsigned, and no live Nebius or Nemotron run is shown.” |
| 0:15–0:35 | CSV empty-input defect and the four existing check names, then corrected guard. | “Here, an empty CSV input fails one of four protected checks. The corrected version passes all four. These checks are unchanged. We expose the complete source, check names and result, rather than asking a reviewer to trust a green badge.” |
| 0:35–0:55 | Run the capture command below to a new temporary destination; show actual stdout and capture identity. | “This command reproduces the example locally. It deliberately removes the known guard for the broken version, then checks both versions. The expected result is three passes and one failure before, and four passes after. This is local Python execution, not model-generated repair.” |
| 0:55–1:15 | Evidence tabs, unsigned status, source/check hashes and raw capture download. | “The evidence panel distinguishes simulated playback from captured execution. Download the raw record and compare its source and test identities. A matching SHA-256 confirms matching bytes; it does not establish a signature, a trusted observer or cloud execution.” |
| 1:15–1:40 | Local bug intake, review/edit, clear/undo and export. Use only fields present in the final recorded commit. | “The bug desk prepares a small Python case for review. Editing or restoring inputs requires a fresh review. Exporting a case does not start a job, approve a test oracle or apply a patch. Protected tests and execution approval remain separate responsibilities.” |
| 1:40–2:05 | Source contracts, report-reader protocol and stop-proof docs; do not present fixture receipt as live. | “The backend separates protected check reports from infrastructure stop evidence and binds both to expected job and source identities. Live release stays blocked. A cancellation request is not proof of stopped compute, and the strict sixty-second bound still requires independent real measurements.” |
| 2:05–2:30 | Public repository, exact commit, Linux CI run and setup commands. | “The public MIT repository includes the frontend, backend and reproducible local example. This published baseline passed Linux backend, HTTP, frontend and browser checks. Those tests establish offline behavior. They do not establish real account authentication, provider isolation, signing authority or live timing.” |
| 2:30–2:45 | Current limitations and source link. | “Next are verified authenticated hosting, trusted evidence producers and an authorized real model repair. Mend's principle is simple: make the evidence and its limits inspectable before treating a repair as ready.” |

Fresh capture, run from `frontend/` with Python 3.12, using a new output path:

```sh
python scripts/capture-example.py --output /path/to/new-mend-local-capture.json
```

The command was rerun successfully on 22 October with Python 3.12.14: 3 pass/1 fail before, 4 pass/0 fail after, `captured_local`, `live_verification: false`. Do not overwrite the historical capture or hide its timestamp. The capture executes the curated repository fixture only.

## Conditional replacement for a genuine provider recording

Only after the user separately lifts the relevant holds and all release gates pass, replace the local-only middle with the actual selected model request, generated patch, isolated failed/passing checks, durable source-linked receipt and independently observed termination. Keep the same 2:45 budget; show the useful result within the opening 30 seconds. Record model/request/job/image/source identities and retain original timing when cuts are labeled. A video edit cannot make an over-budget job satisfy its bound. Do not splice curated output into a live-repair claim.

## Acceptance for the final file and link

- Confirm the recorded commit, deployed UI and narration agree. New local features need their own final validation/publication; the baseline CI cannot certify a later commit.
- Measure the exported media duration, review audio/captions and play the complete file. Keep actual duration **under 3:00**, aiming for 2:45.
- Upload to public YouTube only when authorized; record the real URL and signed-out end-to-end playback. A local `.webm`, silent draft or untested link does not complete this step.
- Open source/build/video links without an owner session. Provide intentional judge credentials privately where needed and verify the actual supported task.
- Keep secrets, private account views and personal tabs out of frame; preserve offline/simulated/unsigned labels and any failures. No invented throughput, latency, user outcomes or signing claims.

## Historical plan — prepared 19 October 2026

The following is retained as history. Its publication-access and Linux-CI blockers have since been resolved as described above; its uncompleted live gates still apply.

# Recorded walkthrough plan

Prepared 19 October 2026. No video has been recorded or published by this continuation. Target duration: 2 minutes 45 seconds, leaving 15 seconds below the requested three-minute ceiling. Current event eligibility and submission requirements still need a separate official check before submission.

## Recording that can be prepared now

This is an **offline review of the source and captured local example**, not a provider-backed competition demo. Full-stack source is recovered and being prepared for publication; the public repository currently contains only its MIT license because connector access is blocked. Do not record the repository as containing application code until connector publication and readback succeed. Put `Captured local example - no live Nebius/Nemotron run` on screen and say it aloud. Keep the label visible whenever captured output is shown.

| Time | Screen and action | Narration / evidence |
| --- | --- | --- |
| 0:00-0:15 | Published repository README and status, after publication succeeds | Mend's intended bounded repair loop; show the actual commit and distinguish offline checks from live execution. |
| 0:15-0:40 | `frontend/example/csv_tools.py` and its four protected checks | Explain the empty-input failure. The before version and patch are curated, not model-generated. |
| 0:40-1:05 | Run `python scripts/capture-example.py --output <local-output-path>` from `frontend/` | Show the actual local failing-before and passing-after outputs and their checked source identities. Label the recording date; do not substitute a historical timestamp. |
| 1:05-1:25 | Inspect the resulting capture JSON beside the test source | Show complete named checks, unchanged tests, source/test digests, and local execution labels. Do not equate a digest with a signature. |
| 1:25-1:50 | Landing evidence tabs, source view, local case review/download | Show real implemented interactions. State that case export prepares input and starts no backend job. |
| 1:50-2:15 | `docs/STOP_PROOF.md` | Explain the gap between requested cancellation and independently confirmed stop. State explicitly that cloud stop timing remains unmeasured. |
| 2:15-2:35 | Fresh download of the public repository and local test command | Show how a judge can inspect and reproduce the available example without project credentials. |
| 2:35-2:45 | README evidence limits and MIT license | Close with remaining Linux backend verification, authenticated workflow and provider gates. No invented performance figures or completed-provider claims. |

Use a temporary output path for the fresh capture; do not overwrite the historical committed evidence or silently imply it was refreshed. The actual recorder, video host, captions and public URL remain to be selected and verified.

## Gates for a later genuine repair recording

Do not carry out this section until the user separately authorizes live provider execution and the prerequisites are met.

1. Publish the recovered canonical full-stack source and verify connector readback. Recheck owner authentication, provider gates, real prices, inference cap, credentials, project/subnet and immutable runner image without exposing secrets.
2. Establish a trusted verification producer and independent infrastructure-stop observer. Demonstrate the required end-to-end job bound before presenting the loop as bounded.
3. Freeze a small broken-starter task and independent acceptance commands. Identify the deliberately supplied defect as a broken starter; the repaired candidate must come from the actual selected model.
4. Capture the real request/model/job identities, failed execution, bounded repair, complete recheck, durable receipt, exact download, and receipt/source hash match. Preserve rejected attempts and omitted checks.
5. Reuse the 2:45 structure, replacing local-only segments with that real chain. If provisioning cannot fit on screen, label any edit/time compression and retain the original elapsed timing and raw evidence. Video length is not job duration.
6. If any gate fails, keep the recording accurately labeled incomplete. Do not splice a local pass or captured UI into a claim of provider-backed repair.

## Acceptance before sharing a final link

- Open the repository and video URL from a signed-out browser. Confirm no access request, owner session, expiring download token or local path is needed.
- Reproduce the named checks from a fresh checkout; record the commit shown in the video.
- Verify that readable text, code, captions and narration agree. Review the exported video end to end and confirm its actual duration is below three minutes.
- Hide personal tabs, private configuration, account identifiers and credentials. Public sample job IDs must identify only deliberately published evidence.
- Confirm the recorded UI is the version being described. Keep local, simulated, planned, unsigned and live evidence labels accurate.
- A shareable recording URL, actual duration and signed-out playback result are required before calling the walkthrough published or judge-ready.
