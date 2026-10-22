# Mend submission draft — 22 October 2026

**Status: prepared for review; not submitted and not yet an eligible live demonstration.** Both user holds remain: no live Nebius requests, discovery, jobs or cancellation experiments; no hosted database changes. This document cannot lift either hold. Publication of this draft does not establish the unfinished facts below.

## Official requirements checked today

The [official rules](https://nebiusglobalaihackathon.devpost.com/rules) give a 30 October 2026, 10:00 PDT deadline (17:00 UTC / 22:30 IST). Judging ends 15 December 2026, 12:00 Pacific. A working project must use Nebius at runtime and an NVIDIA open-source model. Supply an accessible demo/test build, public licensed source with setup instructions, English materials, track, tool feedback and a public YouTube demonstration shorter than three minutes. Give judges any necessary login and free access through judging. Explain substantial in-period changes if the project predates the event. Confirm entrant eligibility and rights against the complete rules before entry.

The organizer's [judging update 46204](https://nebiusglobalaihackathon.devpost.com/updates/46204-here-s-how-judging-works) favors coding agents that plan, write, run tests and iterate in a real repository. Initial viability/theme screening precedes equally weighted scores for implementation, design, impact and idea. Mend's local evidence workflow supports the intended story; a curated before/after example does not demonstrate that autonomous loop.

## Submission fields

| Field | Draft / verified status |
| --- | --- |
| Project title | Mend — Paper and Proof |
| Tagline | Review a repair through the exact source and checks behind it. |
| Track | Coding and Agentic Engineering — proposed; owner confirms on entry. |
| Source | [Public MIT repository](https://github.com/saihaanmohammed120-cell/Mend), published baseline `30279ac41162e11eb26974a8f525d3db89b447e7`. |
| Baseline CI | [Exact-commit Linux run](https://github.com/saihaanmohammed120-cell/Mend/actions/runs/39730504477): 303 backend passes / one isolated-PostgreSQL skip, six required HTTP passes, 107 frontend unit passes, 39 browser passes; build/types/lint pass. These counts describe this commit only. |
| Public preview | [Static evidence preview](https://mend-paper-proof.bravebadge32.chatgpt.site/). Separate from authenticated Next.js/FastAPI hosting; previous signed-out acceptance was 21 October. |
| Working authenticated build | **UNFINISHED:** stable HTTPS URL or downloadable test build, clean-session acceptance and intentional judge account/access instructions. |
| Nebius/NVIDIA runtime | **UNVERIFIED / ON HOLD:** no genuine model/run evidence supplied by this continuation. Candidate model in configuration is not proof of use. |
| Video | **UNFINISHED:** public YouTube URL, actual exported duration, English narration/captions and signed-out playback. [2:45 script](WALKTHROUGH.md) is prepared. |
| Team / representative | **OWNER INPUT REQUIRED:** names, authorized representative, eligibility and project ownership. Do not infer personal eligibility from account access. |
| Existing-project declaration | **OWNER INPUT REQUIRED:** confirm creation date; if before 26 August, identify significant work during the submission period. Dated repository checkpoints can support, not replace, that declaration. |
| Provider feedback | **UNFINISHED:** complete the factual template below after authorized observation; do not invent use or onboarding outcomes. |
| Submission confirmation | **UNFINISHED:** owner reviews final form and submits; retain actual confirmation. No form has been submitted here. |

## English project description — truthful current draft

### Inspiration

Developers reviewing an AI repair need to know which source was checked, whether the tests changed, and what the execution evidence actually proves. Mend makes those questions visible before asking someone to trust a result. Its intended audience is developers reviewing small Python repairs; user interviews and measured productivity gains have not yet been established.

### What it does today

Mend presents source, named checks, provenance and downloads in a restrained Paper and Proof interface. The public preview separates simulated playback from a captured local CSV example. A fresh local reproduction on 22 October produced three passing checks and one failure for the curated broken version, then four passing checks for the supplied corrected version, with unchanged tests. The patch is curated, not model-generated; the capture is unsigned and is not a Nebius run.

The full-stack source includes a local Python bug-intake workflow, offline contract preparation, an authenticated preparation boundary, comparative report validation and a check-history analyzer. Contract preparation freezes source, proposed protected tests and check identities without executing them or granting approval. History disagreement blocks review; it never removes a failing test. The authenticated bridge and task views exist in source, while fresh real-account hosted acceptance remains open.

### How it is built

The repository combines Next.js/React with a Python FastAPI backend, Supabase authentication/storage adapters and bounded task orchestration. Intended live execution uses NVIDIA Nemotron through Nebius Token Factory and isolated Nebius jobs. Source contracts, protected checks, budgets, owner authorization and separate execution/stop evidence guard the proposed loop. Environment flags alone cannot activate it: live bootstrap deliberately rejects release while trusted producers, measured infrastructure stop evidence and other safety gates remain unresolved.

### What we can demonstrate

The published baseline passed Linux backend, HTTP, frontend and browser checks. Reviewers can reproduce the curated local failure/pass pair and inspect its exact bytes without provider credentials. They can distinguish a matching hash from a signature, and a cancel request from confirmed infrastructure termination. Those distinctions are product behavior, not claims of completed provider verification.

### Challenges and next steps

The difficult boundary is proving that a protected checker and an independent infrastructure observer describe the same real job and exact source. Configured timeouts and synthetic signatures cannot establish that. Remaining work includes real authenticated hosting, trusted report/stop producers, conservative timing and isolation evidence, a genuine model-generated repair, and a narrated recording. The strict 60-second job limit and 600-second task budget remain release requirements, not measured performance. We have not demonstrated general repository repair, automatic application, a production receipt ledger or the complete roadmap.

**Publication note:** the 22 October protected-test export/CLI handoff and persisted-context adapter are being integrated separately. Describe them as completed only after final tests and publication identify the new exact commit; the baseline CI above cannot certify later edits.

## Judge testing instructions — available offline scope

1. Open the source link and the exact-commit CI run above. Read the current integration status and evidence limits. No provider key is required for these steps.
2. Open the static preview. Inspect its evidence labels, before/after source, complete named checks and downloadable captured evidence. Any simulated playback is illustrative; stopping it stops playback only. The preview is not the authenticated repair service.
3. For local review, install Python 3.12 and Node.js 22.13 or later. Clone the public repository and pin the published baseline:

   ```sh
   git clone https://github.com/saihaanmohammed120-cell/Mend.git
   cd Mend
   git checkout 30279ac41162e11eb26974a8f525d3db89b447e7
   cd frontend
   python scripts/capture-example.py --output ../mend-judge-local-capture.json
   npm ci
   npm run build
   npm start
   ```

   In PowerShell use an installed Python 3.12 interpreter, for example `py -3.12`, if `python` points to another version. Use a fresh capture destination so the historical committed capture stays intact. The capture script intentionally constructs the curated broken source and runs the repository's four known checks locally; it executes no user-supplied source and makes no provider request. Expected summary: before 3 pass / 1 fail; after 4 pass / 0 fail.
4. Open `http://localhost:3000/sample` to inspect labeled sample playback. The `/fix` intake on the baseline is preparation-only. The source/backend READMEs contain further offline checks. Do not supply credentials or start database/provider operations to reproduce this example.
5. **AUTHENTICATED JOURNEY NOT YET READY FOR JUDGES:** fill the final application URL, dedicated judge login delivery, exact supported task and expected result only after real validation. Keep credentials out of public source. There is no public registration workflow. A static preview, synthetic browser fixture or green CI cannot fill this gap.

## Provider-feedback worksheet — owner completes from observed use

| Required subject | Facts to supply |
| --- | --- |
| Nebius Token Factory | Exact model/version and use; dated request evidence; first-call onboarding; what worked; specific failure/doc friction; whether to use again and why. **Current runtime observations absent under hold.** |
| Nebius AI Cloud | Services actually used; immutable image/config identity; provisioning and stop observations; specific limitations and improvements. **No genuine job/stop measurements supplied.** |
| NVIDIA model/tools | Exact NVIDIA open-source model; observed repair strengths/failures and reproducible example; actual tools used. **Configured Nemotron candidate is not a completed-use statement.** |

Keep technical feedback grounded in actual observations. Do not report a review of code adapters as feedback from running the provider. Add no Tavily/bonus-use claim without functional runtime evidence.

## Final review gate

- Replace every unfinished field with verified information, or retain a candid limitation rather than implying it was satisfied.
- Freeze the submitted commit and evidence links; rerun relevant checks for that commit. New changes require their own evidence.
- Review the [walkthrough acceptance checks](WALKTHROUGH.md) and compare the video, text and actual build. Record no secret values.
- Recheck official dates/rules and judge access before submission. Only the owner can confirm entrant declarations, approve final materials and perform entry.

No deployment, public video upload, submission, provider experiment or hosted database mutation was performed to prepare this document.
