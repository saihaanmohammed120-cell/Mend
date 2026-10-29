"use client";

import Link from "next/link";
import { LocalReportDownload } from "./local-report";
import { repositoryReport, policyReport, receiptReport } from "../lib/local-report";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import capture from "../lib/captured-example.json";
import provenance from "../lib/captured-provenance.json";
import contract from "../lib/receipt-contract.json";
import { compareRepository, inspectReceipt, parseLocalJson, previewPolicy, readSourceFiles, readSourceMapFile, sourceFiles, sha256, MAX_JSON_BYTES, type RepositoryReview, type ReceiptInspection } from "../lib/local-review";

const TOOLS = ["repository", "policy", "receipt"] as const;
type Tool = typeof TOOLS[number];
type SourceKind = "original" | "candidate" | "receipt";
type InputKind = SourceKind | "record";
const INPUT_LABELS: Record<InputKind, string> = { original: "Original snapshot", candidate: "Candidate snapshot", receipt: "Receipt source map", record: "Receipt record" };
const subscribeHash = (notify: () => void) => { window.addEventListener("hashchange", notify); return () => window.removeEventListener("hashchange", notify); };
const readTool = (): Tool => TOOLS.find(tool => window.location.hash === `#${tool}`) ?? "repository";
const serverTool = (): Tool => "repository";
const asJson = (value: unknown) => JSON.stringify(value, null, 2);
const outcome = (value: boolean | null) => value === null ? "Not available" : value ? "Consistent" : "Mismatch / inconsistent";

function SourceInput({ id, label, value, onChange, onFiles, onMap }: { id: string; label: string; value: string; onChange(value: string): void; onFiles(files: File[]): void; onMap(file: File): void }) {
  return <div className="desk-field"><label htmlFor={id}>{label}</label><textarea id={id} rows={9} spellCheck={false} maxLength={MAX_JSON_BYTES} value={value} onChange={event => onChange(event.target.value)} placeholder={'{"module.py": "exact source text"}'} aria-describedby={`${id}-hint`} /><p className="desk-note" id={`${id}-hint`}>Paste a JSON map, select a source-map JSON file (up to 3,000,000 bytes), or select Python files. Up to 20 files / 200,000 UTF-8 source bytes per snapshot. JSON maps preserve explicit folder paths; Python file selection uses filenames.</p><label htmlFor={`${id}-map`}>Select source-map JSON</label><input id={`${id}-map`} type="file" accept=".json,application/json" aria-label={`Select ${label.toLowerCase()} source-map file`} aria-describedby={`${id}-hint`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onMap(file); }} /><label htmlFor={`${id}-files`}>Select Python files</label><input id={`${id}-files`} type="file" accept=".py" multiple aria-label={`Select ${label.toLowerCase()} Python files`} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) onFiles(files); }} /></div>;
}

/** Local review only: no fetch, storage, native form submission, code execution or private signing keys. */
export function LocalTools() {
  const tool = useSyncExternalStore(subscribeHash, readTool, serverTool);
  const [original, setOriginal] = useState(""), [candidate, setCandidate] = useState(""), [protectedPaths, setProtectedPaths] = useState("");
  const [maxLines, setMaxLines] = useState("40"), [maxBytes, setMaxBytes] = useState("4000");
  const [receiptJson, setReceiptJson] = useState(""), [receiptSources, setReceiptSources] = useState("");
  const [repository, setRepository] = useState<RepositoryReview | null>(null), [policy, setPolicy] = useState<ReturnType<typeof previewPolicy> | null>(null), [receipt, setReceipt] = useState<(ReceiptInspection & { reviewedJsonSha256: string }) | null>(null);
  const [operationError, setError] = useState<string | null>(null), [operating, setBusy] = useState(false);
  const [importErrors, setImportErrors] = useState<Partial<Record<InputKind, string>>>({});
  const error = operationError || (Object.entries(importErrors) as [InputKind, string][]).map(([kind, message]) => `${INPUT_LABELS[kind]}: ${message}`).join(" ") || null;
  const [pendingImports, setPendingImports] = useState<Partial<Record<InputKind, number>>>({});
  const importVersions = useRef<Record<InputKind, number>>({ original: 0, candidate: 0, receipt: 0, record: 0 });
  const busy = operating || Object.keys(pendingImports).length > 0;
  const revision = useRef(0), errorBox = useRef<HTMLDivElement>(null), resultBox = useRef<HTMLDivElement>(null);
  useEffect(() => { const version = revision, imports = importVersions.current; return () => { version.current++; for (const kind of Object.keys(imports) as InputKind[]) imports[kind]++; }; }, []);
  useEffect(() => { if (error) errorBox.current?.focus(); else if (repository || policy || receipt) resultBox.current?.focus(); }, [error, repository, policy, receipt, tool]);
  function invalidate(kind: "repository" | "receipt" | "policy") {
    revision.current++; setError(null); setBusy(false);
    if (kind === "repository") { setRepository(null); setPolicy(null); }
    else if (kind === "receipt") setReceipt(null);
    else setPolicy(null);
  }
  async function operation(action: () => Promise<void>) {
    const current = ++revision.current; setBusy(true); setError(null);
    try { await action(); } catch (error) { if (revision.current === current) setError(error instanceof Error ? error.message : "Local review could not finish."); }
    finally { if (revision.current === current) setBusy(false); }
  }
  function clearImportErrors(...kinds: InputKind[]) {
    setImportErrors(errors => { const next = { ...errors }; for (const kind of kinds) delete next[kind]; return next; });
  }
  function cancelImports(...kinds: InputKind[]) {
    clearImportErrors(...kinds);
    for (const kind of kinds) importVersions.current[kind]++;
    setPendingImports(pending => { const next = { ...pending }; for (const kind of kinds) delete next[kind]; return next; });
  }
  function changeSource(kind: SourceKind, value: string) {
    cancelImports(kind);
    invalidate(kind === "receipt" ? "receipt" : "repository");
    (kind === "original" ? setOriginal : kind === "candidate" ? setCandidate : setReceiptSources)(value);
  }
  async function importInput(kind: InputKind, read: () => Promise<string>) {
    clearImportErrors(kind);
    invalidate(kind === "receipt" || kind === "record" ? "receipt" : "repository");
    const current = ++importVersions.current[kind];
    setPendingImports(pending => ({ ...pending, [kind]: current }));
    try {
      const text = await read();
      if (importVersions.current[kind] !== current) return;
      invalidate(kind === "receipt" || kind === "record" ? "receipt" : "repository");
      (kind === "original" ? setOriginal : kind === "candidate" ? setCandidate : kind === "receipt" ? setReceiptSources : setReceiptJson)(text);
    } catch (error) {
      if (importVersions.current[kind] === current) setImportErrors(errors => ({ ...errors, [kind]: error instanceof Error ? error.message : "Local input could not be read." }));
    } finally {
      if (importVersions.current[kind] === current) setPendingImports(pending => { const next = { ...pending }; delete next[kind]; return next; });
    }
  }
  async function importSources(kind: SourceKind, files: File[]) {
    await importInput(kind, async () => asJson(await readSourceFiles(files)));
  }
  async function importMap(kind: SourceKind, file: File) {
    await importInput(kind, async () => asJson(await readSourceMapFile(file)));
  }
  function loadComparison() {
    cancelImports("original", "candidate");
    invalidate("repository"); setOriginal(asJson({ "csv_tools.py": capture.before_source, ...contract.protected_files }));
    setCandidate(asJson({ "csv_tools.py": capture.after_source, ...contract.protected_files })); setProtectedPaths("test_csv_tools.py");
  }
  async function compare() {
    invalidate("repository");
    await operation(async () => { const current = revision.current; const result = await compareRepository(sourceFiles(parseLocalJson(original)), sourceFiles(parseLocalJson(candidate)), protectedPaths.split(/\r?\n/).map(path => path.trim()).filter(Boolean)); if (current === revision.current) setRepository(result); });
  }
  async function inspect() {
    invalidate("receipt");
    await operation(async () => { const current = revision.current; const [result, reviewedJsonSha256] = await Promise.all([inspectReceipt(parseLocalJson(receiptJson, 1_048_576), receiptSources.trim() ? sourceFiles(parseLocalJson(receiptSources)) : null), sha256(receiptJson)]); if (current === revision.current) setReceipt({ ...result, reviewedJsonSha256 }); });
  }
  function clear() {
    cancelImports("original", "candidate", "receipt", "record");
    invalidate("repository"); invalidate("receipt"); setOriginal(""); setCandidate(""); setProtectedPaths(""); setReceiptJson(""); setReceiptSources(""); setMaxLines("40"); setMaxBytes("4000");
  }

  return <>
    <div className="desk-title"><h1>Keep the review on your desk.</h1><p>Compare Python files, preview a change policy and inspect a receipt right here. These tools run in your browser. Nothing is uploaded, applied or executed.</p></div>
    <nav className="desk-tool-nav" aria-label="Local review tools">{TOOLS.map((name, index) => <a key={name} href={`#${name}`} aria-current={tool === name ? "page" : undefined}>{index + 1}. {name === "repository" ? "Repository comparison" : name === "policy" ? "Policy preview" : "Receipt inspection"}</a>)}</nav>
    <div className="desk-actions"><button className="desk-button" type="button" onClick={clear}>Clear local inputs</button><Link href="/help#local-tools">How these tools work</Link></div>
    {error ? <div className="desk-error" ref={errorBox} role="alert" tabIndex={-1}><strong>Check the input</strong><p>{error}</p></div> : null}
    <p className="desk-note" role="status" aria-live="polite">{busy ? "Reading and comparing local bytes…" : "Local only · no code run · no approval granted. Leaving or reloading clears this desk."}</p>
    <section id="repository" hidden={tool !== "repository"} className="desk-sheet" aria-labelledby="repo-title">
      <h2 id="repo-title">What changed, and did a locked file change?</h2><p className="desk-note">Compare exact snapshots. Paths must stay the same. Test modules and the tests/ package are always protected. This checks file content, not Python syntax, dependencies or test behavior.</p>
      <button className="desk-button" type="button" onClick={loadComparison}>Load captured comparison</button>
      <div className="desk-fields"><SourceInput id="repo-original" label="Original snapshot JSON" value={original} onChange={value => changeSource("original", value)} onFiles={files => void importSources("original", files)} onMap={file => void importMap("original", file)} /><SourceInput id="repo-candidate" label="Candidate snapshot JSON" value={candidate} onChange={value => changeSource("candidate", value)} onFiles={files => void importSources("candidate", files)} onMap={file => void importMap("candidate", file)} /></div>
      <label className="desk-field"><span>Additional protected paths · one per line</span><textarea rows={2} style={{ minHeight: 80 }} maxLength={4000} value={protectedPaths} onChange={event => { invalidate("repository"); setProtectedPaths(event.target.value); }} /></label>
      <button className="desk-button desk-primary" type="button" disabled={busy} onClick={() => void compare()}>Compare snapshots</button>
      {repository ? <div className="desk-result" ref={tool === "repository" ? resultBox : undefined} tabIndex={-1} data-testid="repository-result"><h3>{repository.protectedChanged.length ? "Blocked: protected content changed" : repository.changed.length ? "Comparison ready · not executed" : "The snapshots are identical"}</h3><dl><div><dt>Changed paths</dt><dd>{repository.changed.length}</dd></div><div><dt>Protected paths changed</dt><dd>{repository.protectedChanged.length}</dd></div><div><dt>Changed-line span</dt><dd>{repository.changedLines}</dd></div><div><dt>Changed-byte span</dt><dd>{repository.changedBytes.toLocaleString()} UTF-8 bytes</dd></div><div><dt>Original snapshot SHA-256</dt><dd><code>{repository.originalHash}</code></dd></div><div><dt>Candidate snapshot SHA-256</dt><dd><code>{repository.candidateHash}</code></dd></div></dl><p className="desk-note">The span includes unchanged interior lines between separate edits, matching the conservative backend policy metric. Hashes identify content; no checks have run.</p><p>Locked paths: {repository.protectedPaths.join(", ")}</p>{repository.changed.map(row => <details key={row.path}><summary>{repository.protectedPaths.includes(row.path) ? "Locked" : "Editable"} · {row.path} · changed span from line {row.startLine}</summary><h4>Original span</h4><pre tabIndex={0}>{row.removed.slice(0, 20_000) || "No removed text."}</pre><h4>Candidate span</h4><pre tabIndex={0}>{row.added.slice(0, 20_000) || "No added text."}</pre>{row.removed.length > 20_000 || row.added.length > 20_000 ? <p>Preview shortened; all bytes were included in the comparison.</p> : null}</details>)}<LocalReportDownload report={repositoryReport(repository)} /><a className="desk-button desk-primary desk-line" href="#policy">Preview policy for this comparison</a></div> : <p className="desk-empty">Add two snapshots or load the captured inputs. A comparison will appear here after you request it.</p>}
    </section>
    <section id="policy" hidden={tool !== "policy"} className="desk-sheet" aria-labelledby="policy-title"><h2 id="policy-title">Does this change fit your limits?</h2><p className="desk-note">This preview uses your current repository comparison and your chosen thresholds. Authenticated regression evidence, trusted history and private signing authority are not available in this browser. Even a change within these limits remains not approved.</p>
      {repository ? <p>Current comparison: {repository.changed.length} changed paths · {repository.changedLines} lines in the conservative span · {repository.changedBytes.toLocaleString()} bytes.</p> : <p className="desk-empty">First <a href="#repository">compare repository snapshots</a>. No sample risk score or approval has been filled in.</p>}
      <div className="desk-fields"><label className="desk-field"><span>Maximum changed-line span</span><input type="number" min={1} max={400000} step={1} value={maxLines} onChange={event => { invalidate("policy"); setMaxLines(event.target.value); }} /></label><label className="desk-field"><span>Maximum changed-byte span</span><input type="number" min={1} max={400000} step={1} value={maxBytes} onChange={event => { invalidate("policy"); setMaxBytes(event.target.value); }} /></label></div><button type="button" className="desk-button desk-primary" disabled={!repository || busy} onClick={() => { try { setError(null); setPolicy(previewPolicy(repository!, Number(maxLines), Number(maxBytes))); } catch (error) { setError(error instanceof Error ? error.message : "Check policy limits."); } }}>Preview thresholds</button>
      {policy ? <div className="desk-result" ref={tool === "policy" ? resultBox : undefined} tabIndex={-1} data-testid="policy-result"><h3>{policy.withinThresholds ? "Within your thresholds · approval not established" : "Human review required"}</h3>{policy.reasons.length ? <ul>{policy.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}<dl><div><dt>Approval</dt><dd>Not approved</dd></div><div><dt>Execution</dt><dd>Not run</dd></div><div><dt>Authenticated regression evidence</dt><dd>Not available</dd></div><div><dt>Trusted check history</dt><dd>Not available</dd></div></dl><p className="desk-note">The existing server-side policy gate still requires its configured trusted authority. This preview cannot approve a change, start a job or apply a patch.</p><LocalReportDownload report={policyReport(repository!, Number(maxLines), Number(maxBytes))} /></div> : null}
    </section>
    <section id="receipt" hidden={tool !== "receipt"} className="desk-sheet" aria-labelledby="receipt-title"><h2 id="receipt-title">Does this record identify these source bytes?</h2><p className="desk-note">Inspect an unsigned SLSA v1 statement or a schema-1 csv-cleaner-v1 backend receipt. Uploaded live/fixture labels are untrusted claims. No signature, provider identity, test execution or stop timing is authenticated here.</p>
      <button className="desk-button" type="button" onClick={() => { cancelImports("receipt", "record"); invalidate("receipt"); setReceiptJson(asJson(provenance)); setReceiptSources(asJson({ "csv_tools.py": capture.after_source, ...contract.protected_files })); }}>Load captured unsigned record</button>
      <div className="desk-fields"><div className="desk-field"><label htmlFor="receipt-json">Receipt or SLSA JSON</label><textarea id="receipt-json" rows={9} maxLength={1_048_576} spellCheck={false} value={receiptJson} onChange={event => { cancelImports("record"); invalidate("receipt"); setReceiptJson(event.target.value); }} /><input type="file" accept=".json" aria-label="Select receipt JSON file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void importInput("record", async () => { if (file.size > 1_048_576) throw new Error("Receipt exceeds 1 MiB."); return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }); }} /><p className="desk-note">Select a local JSON file, up to 1 MiB. Source identities are checked only when you supply source files too.</p></div><SourceInput id="receipt-source" label="Receipt source map JSON" value={receiptSources} onChange={value => changeSource("receipt", value)} onFiles={files => void importSources("receipt", files)} onMap={file => void importMap("receipt", file)} /></div>
      <button className="desk-button desk-primary" type="button" disabled={busy} onClick={() => void inspect()}>Inspect record and source</button>
      {receipt ? <div className="desk-result" ref={tool === "receipt" ? resultBox : undefined} tabIndex={-1} data-testid="receipt-result"><h3>Unsigned / unauthenticated inspection</h3><p>{receipt.format} · {receipt.sourceClaim}</p><dl><div><dt>Selected source binding</dt><dd>{outcome(receipt.sourceMatches)}</dd></div><div><dt>Protected content against bundled CSV contract</dt><dd>{outcome(receipt.protectedMatches)}</dd></div><div><dt>Recorded check assertions</dt><dd>{outcome(receipt.checksConsistent)}</dd></div><div><dt>Recorded final-attempt identity</dt><dd>{outcome(receipt.identityConsistent)}</dd></div><div><dt>Public signature</dt><dd>Not verified</dd></div><div><dt>Live execution / stop proof</dt><dd>Not verified</dd></div>{receipt.expectedSnapshot ? <div><dt>Receipt snapshot SHA-256</dt><dd><code>{receipt.expectedSnapshot}</code></dd></div> : null}{receipt.computedSnapshot ? <div><dt>Computed snapshot SHA-256</dt><dd><code>{receipt.computedSnapshot}</code></dd></div> : null}</dl>{receipt.files.map(file => <details key={file.path}><summary>{file.path} · {outcome(file.matches)}</summary><p>Recorded SHA-256: <code>{file.expected}</code></p><p>Selected-file SHA-256: <code>{file.actual ?? "Not supplied"}</code></p></details>)}<p className="desk-note">Only the record’s supported subjects are bound. Other selected files are outside a SLSA subject comparison. Consistency is not authenticity or a new passing test run. Inspect again after editing any input.</p><LocalReportDownload report={receiptReport(receipt, receipt.reviewedJsonSha256)} /></div> : <p className="desk-empty">The inspection will appear here. Missing sources remain unavailable; no successful result is assumed.</p>}
    </section>
    <p className="desk-note desk-line">JavaScript is required for these local operations. If it is unavailable, the controls cannot run and nothing is uploaded.</p>
  </>;
}
