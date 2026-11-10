"use client";

import { LocalReportDownload } from "./local-report";
import { repositoryReport, policyReport, receiptReport } from "../lib/local-report";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import capture from "../lib/captured-example.json";
import provenance from "../lib/captured-provenance.json";
import contract from "../lib/receipt-contract.json";
import { compareRepository, inspectReceipt, parseLocalJson, previewPolicy, readSourceFiles, readSourceMapFile, sourceFiles, sha256, MAX_JSON_BYTES, type RepositoryReview, type ReceiptInspection } from "../lib/local-review";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Banner } from "@astryxdesign/core/Banner";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { MendLink } from "./mend-link";

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
  return <div className="desk-field"><TextArea id={id} label={label} rows={9} hasSpellCheck={false} maxLength={MAX_JSON_BYTES} value={value} onChange={(next) => onChange(next.slice(0, MAX_JSON_BYTES))} placeholder={'{"module.py": "exact source text"}'} aria-describedby={`${id}-hint`} /><p className="desk-note" id={`${id}-hint`}>Paste a JSON map, select a source-map JSON file (up to 3,000,000 bytes), or select Python files. Up to 20 files / 200,000 UTF-8 source bytes per snapshot. JSON maps preserve explicit folder paths; Python file selection uses filenames.</p><label htmlFor={`${id}-map`}>Select source-map JSON</label><input id={`${id}-map`} type="file" accept=".json,application/json" aria-label={`Select ${label.toLowerCase()} source-map file`} aria-describedby={`${id}-hint`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onMap(file); }} /><label htmlFor={`${id}-files`}>Select Python files</label><input id={`${id}-files`} type="file" accept=".py" multiple aria-label={`Select ${label.toLowerCase()} Python files`} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) onFiles(files); }} /></div>;
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
    <div className="desk-title"><Heading level={1}>Keep the review on your desk.</Heading><Text type="body" as="p">Compare Python files, preview a change policy and inspect a receipt right here. These tools run in your browser. Nothing is uploaded, applied or executed.</Text></div>
    <nav className="desk-tool-nav" aria-label="Local review tools">{TOOLS.map((name, index) => <a key={name} href={`#${name}`} aria-current={tool === name ? "page" : undefined}>{index + 1}. {name === "repository" ? "Repository comparison" : name === "policy" ? "Policy preview" : "Receipt inspection"}</a>)}</nav>
    <div className="desk-actions"><Button label="Clear local inputs" variant="secondary" onClick={clear} /><MendLink href="/help#local-tools" isStandalone>How these tools work</MendLink></div>
    {error ? <div ref={errorBox} tabIndex={-1} role="alert"><Banner status="error" title="Check the input" description={error} collapsible={false} /></div> : null}
    <p className="desk-note" role="status" aria-live="polite">{busy ? "Reading and comparing local bytes…" : "Local only · no code run · no approval granted. Leaving or reloading clears this desk."}</p>
    <section id="repository" hidden={tool !== "repository"} className="desk-sheet" aria-labelledby="repo-title">
      <div id="repo-title"><Heading level={2}>What changed, and did a locked file change?</Heading></div><Text type="body" as="p">Compare exact snapshots. Paths must stay the same. Test modules and the tests/ package are always protected. This checks file content, not Python syntax, dependencies or test behavior.</Text>
      <Button label="Load captured comparison" variant="secondary" onClick={loadComparison} />
      <div className="desk-fields"><SourceInput id="repo-original" label="Original snapshot JSON" value={original} onChange={value => changeSource("original", value)} onFiles={files => void importSources("original", files)} onMap={file => void importMap("original", file)} /><SourceInput id="repo-candidate" label="Candidate snapshot JSON" value={candidate} onChange={value => changeSource("candidate", value)} onFiles={files => void importSources("candidate", files)} onMap={file => void importMap("candidate", file)} /></div>
      <div className="desk-field"><TextArea label="Additional protected paths · one per line" rows={2} maxLength={4000} value={protectedPaths} onChange={(value) => { invalidate("repository"); setProtectedPaths(value.slice(0, 4000)); }} /></div>
      <Button label="Compare snapshots" variant="primary" isDisabled={busy} onClick={() => void compare()} />
      {repository ? <div className="desk-result" ref={tool === "repository" ? resultBox : undefined} tabIndex={-1} data-testid="repository-result"><Heading level={3}>{repository.protectedChanged.length ? "Blocked: protected content changed" : repository.changed.length ? "Comparison ready · not executed" : "The snapshots are identical"}</Heading><dl><div><dt>Changed paths</dt><dd>{repository.changed.length}</dd></div><div><dt>Protected paths changed</dt><dd>{repository.protectedChanged.length}</dd></div><div><dt>Changed-line span</dt><dd>{repository.changedLines}</dd></div><div><dt>Changed-byte span</dt><dd>{repository.changedBytes.toLocaleString()} UTF-8 bytes</dd></div><div><dt>Original snapshot SHA-256</dt><dd><code>{repository.originalHash}</code></dd></div><div><dt>Candidate snapshot SHA-256</dt><dd><code>{repository.candidateHash}</code></dd></div></dl><Text type="body" as="p">The span includes unchanged interior lines between separate edits, matching the conservative backend policy metric. Hashes identify content; no checks have run.</Text><Text type="body" as="p">Locked paths: {repository.protectedPaths.join(", ")}</Text>{repository.changed.map(row => <details key={row.path}><summary>{repository.protectedPaths.includes(row.path) ? "Locked" : "Editable"} · {row.path} · changed span from line {row.startLine}</summary><Heading level={4}>Original span</Heading><CodeBlock code={row.removed.slice(0, 20_000) || "No removed text."} language="plaintext" hasCopyButton={false} width="100%" /><Heading level={4}>Candidate span</Heading><CodeBlock code={row.added.slice(0, 20_000) || "No added text."} language="plaintext" hasCopyButton={false} width="100%" />{row.removed.length > 20_000 || row.added.length > 20_000 ? <Text type="body" as="p">Preview shortened; all bytes were included in the comparison.</Text> : null}</details>)}<LocalReportDownload report={repositoryReport(repository)} /><Button label="Preview policy for this comparison" variant="primary" href="#policy" /></div> : <Text type="body" as="p">Add two snapshots or load the captured inputs. A comparison will appear here after you request it.</Text>}
    </section>
    <section id="policy" hidden={tool !== "policy"} className="desk-sheet" aria-labelledby="policy-title"><div id="policy-title"><Heading level={2}>Does this change fit your limits?</Heading></div><Text type="body" as="p">This preview uses your current repository comparison and your chosen thresholds. Authenticated regression evidence, trusted history and private signing authority are not available in this browser. Even a change within these limits remains not approved.</Text>
      {repository ? <Text type="body" as="p">Current comparison: {repository.changed.length} changed paths · {repository.changedLines} lines in the conservative span · {repository.changedBytes.toLocaleString()} bytes.</Text> : <Text type="body" as="p">First <AstryxLink href="#repository">compare repository snapshots</AstryxLink>. No sample risk score or approval has been filled in.</Text>}
      <div className="desk-fields"><label className="desk-field"><span>Maximum changed-line span</span><input type="number" min={1} max={400000} step={1} value={maxLines} onChange={event => { invalidate("policy"); setMaxLines(event.target.value); }} /></label><label className="desk-field"><span>Maximum changed-byte span</span><input type="number" min={1} max={400000} step={1} value={maxBytes} onChange={event => { invalidate("policy"); setMaxBytes(event.target.value); }} /></label></div><Button label="Preview thresholds" variant="primary" isDisabled={!repository || busy} onClick={() => { try { setError(null); setPolicy(previewPolicy(repository!, Number(maxLines), Number(maxBytes))); } catch (error) { setError(error instanceof Error ? error.message : "Check policy limits."); } }} />
      {policy ? <div className="desk-result" ref={tool === "policy" ? resultBox : undefined} tabIndex={-1} data-testid="policy-result"><Heading level={3}>{policy.withinThresholds ? "Within your thresholds · approval not established" : "Human review required"}</Heading>{policy.reasons.length ? <ul>{policy.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : null}<dl><div><dt>Approval</dt><dd>Not approved</dd></div><div><dt>Execution</dt><dd>Not run</dd></div><div><dt>Authenticated regression evidence</dt><dd>Not available</dd></div><div><dt>Trusted check history</dt><dd>Not available</dd></div></dl><Text type="body" as="p">The existing server-side policy gate still requires its configured trusted authority. This preview cannot approve a change, start a job or apply a patch.</Text><LocalReportDownload report={policyReport(repository!, Number(maxLines), Number(maxBytes))} /></div> : null}
    </section>
    <section id="receipt" hidden={tool !== "receipt"} className="desk-sheet" aria-labelledby="receipt-title"><div id="receipt-title"><Heading level={2}>Does this record identify these source bytes?</Heading></div><Text type="body" as="p">Inspect an unsigned SLSA v1 statement or a schema-1 csv-cleaner-v1 backend receipt. Uploaded live/fixture labels are untrusted claims. No signature, provider identity, test execution or stop timing is authenticated here.</Text>
      <Button label="Load captured unsigned record" variant="secondary" onClick={() => { cancelImports("receipt", "record"); invalidate("receipt"); setReceiptJson(asJson(provenance)); setReceiptSources(asJson({ "csv_tools.py": capture.after_source, ...contract.protected_files })); }} />
      <div className="desk-fields"><div className="desk-field"><TextArea id="receipt-json" label="Receipt or SLSA JSON" rows={9} maxLength={1_048_576} hasSpellCheck={false} value={receiptJson} onChange={(value) => { cancelImports("record"); invalidate("receipt"); setReceiptJson(value.slice(0, 1_048_576)); }} /><input type="file" accept=".json" aria-label="Select receipt JSON file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void importInput("record", async () => { if (file.size > 1_048_576) throw new Error("Receipt exceeds 1 MiB."); return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }); }} /><p className="desk-note">Select a local JSON file, up to 1 MiB. Source identities are checked only when you supply source files too.</p></div><SourceInput id="receipt-source" label="Receipt source map JSON" value={receiptSources} onChange={value => changeSource("receipt", value)} onFiles={files => void importSources("receipt", files)} onMap={file => void importMap("receipt", file)} /></div>
      <Button label="Inspect record and source" variant="primary" isDisabled={busy} onClick={() => void inspect()} />
      {receipt ? <div className="desk-result" ref={tool === "receipt" ? resultBox : undefined} tabIndex={-1} data-testid="receipt-result"><Heading level={3}>Unsigned / unauthenticated inspection</Heading><Text type="body" as="p">{receipt.format} · {receipt.sourceClaim}</Text><dl><div><dt>Selected source binding</dt><dd>{outcome(receipt.sourceMatches)}</dd></div><div><dt>Protected content against bundled CSV contract</dt><dd>{outcome(receipt.protectedMatches)}</dd></div><div><dt>Recorded check assertions</dt><dd>{outcome(receipt.checksConsistent)}</dd></div><div><dt>Recorded final-attempt identity</dt><dd>{outcome(receipt.identityConsistent)}</dd></div><div><dt>Public signature</dt><dd>Not verified</dd></div><div><dt>Live execution / stop proof</dt><dd>Not verified</dd></div>{receipt.expectedSnapshot ? <div><dt>Receipt snapshot SHA-256</dt><dd><code>{receipt.expectedSnapshot}</code></dd></div> : null}{receipt.computedSnapshot ? <div><dt>Computed snapshot SHA-256</dt><dd><code>{receipt.computedSnapshot}</code></dd></div> : null}</dl>{receipt.files.map(file => <details key={file.path}><summary>{file.path} · {outcome(file.matches)}</summary><Text type="body" as="p">Recorded SHA-256: <code>{file.expected}</code></Text><Text type="body" as="p">Selected-file SHA-256: <code>{file.actual ?? "Not supplied"}</code></Text></details>)}<Text type="body" as="p">Only the record’s supported subjects are bound. Other selected files are outside a SLSA subject comparison. Consistency is not authenticity or a new passing test run. Inspect again after editing any input.</Text><LocalReportDownload report={receiptReport(receipt, receipt.reviewedJsonSha256)} /></div> : <Text type="body" as="p">The inspection will appear here. Missing sources remain unavailable; no successful result is assumed.</Text>}
    </section>
    <Text type="supporting" as="p">JavaScript is required for these local operations. If it is unavailable, the controls cannot run and nothing is uploaded.</Text>
  </>;
}
