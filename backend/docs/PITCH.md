# Mend pitch and truthful recording plan

Track: **Coding and Agentic Engineering**. Target pillars: technological implementation, design, potential impact, quality of the idea. The intended value is a smaller gap between plausible generated code and code with reproducible evidence; no adoption, time-saved, success-rate or testimonial statistics are invented.

## Recording sequence — under three minutes

| Time | Screen and purpose |
|---|---|
| 0:00–0:20 | Paper and Proof landing page. Label the animation “simulated evidence” if that remains the displayed source. State the problem and bounds. |
| 0:20–0:45 | Real task contract: editable Python file, protected check names, exact command, three-repair and sixty-second policies. |
| 0:45–1:40 | Real run if release gates pass: actual inference identity, isolated execution, failed empty-input check, bounded replacement, rerun. Keep real sequence; do not stitch simulated logs into live execution. |
| 1:40–2:10 | Persisted receipt and download: show model/job/source/check identities and reproduce the downloaded bundle. Local-test receipt must be labeled if no live run exists. |
| 2:10–2:40 | Honest cancellation/failure outcome and measured safety limits. Show a real measured result when available; otherwise identify the blocker. |
| 2:40–2:55 | Architecture, MIT repository and next narrow milestone. Finish before three minutes. |

## Concise spoken script

“Mend closes the loop between writing code and checking what actually ran. The task starts with a reviewed contract: editable Python source, protected checks, an approved command and visible budgets.

The intended live path uses an NVIDIA Nemotron 3 model through Nebius Token Factory and runs the source in an isolated Nebius job. A failed check becomes evidence for a bounded repair. Mend allows up to three repairs, keeps execution identity immutable and refuses to replace missing verification with a success label.

The receipt names the exact checks, source snapshot, model and job. The downloadable bundle must match the tested source, and the checks must be reproducible.

The interface makes that evidence readable in seconds: warm paper, ink borders, restrained orange and a receipt that prints. The landing animation is explicitly simulated; it is never proof of provider execution.

The implemented backend has dependency-injected local regression tests, ownership and worker fencing, protected contracts, replayable events and cancellation-before-success rules. Live release still requires real provider integration and measured safety evidence. In particular, a cancel acknowledgement does not prove a job stopped within sixty seconds.

Mend targets Coding and Agentic Engineering with a narrow Python workflow and an MIT-licensed implementation. The next milestone is one real, reproducible repair with honest failure handling and measured limits.”

If live verification completes, replace the implementation-status sentences with the **specific recorded run evidence**, not generalized success claims. Until then, this is an engineering-progress pitch and does not satisfy a requirement for a working live provider demonstration.

## Evidence collection before recording

Retain actual run IDs, model request ID, timestamps, source/contract hashes, exact protected check results, downloaded bundle identity, cancellation measurement and test output in a private evidence directory. Publish a scrubbed manifest without credentials or signed download links. Use the run shown in the video; do not substitute a more favorable unrelated execution. Confirm official submission rules and deadline before publishing.
