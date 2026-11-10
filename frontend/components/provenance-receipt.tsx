import provenance from "../lib/captured-provenance.json";
import { ArtifactIntegrityCheck } from "./artifact-integrity-check";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";
import { Link } from "@astryxdesign/core/Link";

/** The included document is unsigned. A JSON flag is never signature verification. */
export function ProvenanceReceipt() {
  const definition = provenance.predicate.buildDefinition;
  const run = provenance.predicate.runDetails;
  const source = definition.resolvedDependencies.find(dependency => "gitCommit" in dependency.digest);
  const parameters = definition.externalParameters;
  return <article className="proof-provenance" aria-labelledby="provenance-title" data-signature-state="unsigned">
    <div className="proof-provenance-heading"><div><Text type="label">The artifact’s paper trail</Text><div id="provenance-title"><Heading level={3}>SLSA provenance</Heading></div></div><Badge variant="neutral" label="Unsigned" /></div>
    <div className="proof-document-verdict"><Text type="body" as="p"><strong>A real record. No signature.</strong></Text><Text type="body" as="p">No signing identity or transparency-log entry was issued. Inspect the record and its files before sharing.</Text><Link href="#evidence-provenance">Unsigned provenance · see legend</Link></div>
    <div className="proof-document-artifacts" aria-label="Recorded artifacts">{provenance.subject.map(subject => <div key={subject.name}><div className="proof-document-file"><span>Recorded artifact</span><code>{subject.name}</code></div><div className="proof-document-hash"><span>Source SHA-256</span><code>{subject.digest.sha256}</code></div></div>)}</div>
    <dl className="proof-document-facts"><div><dt>Execution platform</dt><dd>{definition.internalParameters.executionPlatform}</dd></div><div><dt>Record format</dt><dd>in-toto · SLSA</dd></div></dl>
    <details className="proof-provenance-details"><summary>Inspect all provenance fields <span aria-hidden="true">↗</span></summary><dl className="proof-provenance-fields">
      <div><dt>FORMAT</dt><dd><code>{provenance._type}</code><br /><code>{provenance.predicateType}</code></dd></div>
      <div><dt>SOURCE REPOSITORY</dt><dd><code>{source?.uri ?? "Not recorded"}</code></dd></div>
      <div><dt>SOURCE COMMIT</dt><dd><code>{source && "gitCommit" in source.digest ? source.digest.gitCommit : "Not recorded"}</code></dd></div>
      <div><dt>BUILD PLATFORM</dt><dd><code>{run.builder.id}</code></dd></div>
      <div><dt>ENTRYPOINT</dt><dd><code>{String(parameters.entryPoint)}</code></dd></div>
      <div><dt>PARAMETERS</dt><dd><code>{JSON.stringify(parameters.parameters, null, 2)}</code></dd></div>
      <div><dt>TRIGGER</dt><dd><code>{JSON.stringify(parameters.trigger, null, 2)}</code></dd></div>
      <div><dt>ARTIFACT / SHA-256</dt><dd>{provenance.subject.map(subject => <p key={subject.name}><code>{subject.name}<br />{subject.digest.sha256}</code></p>)}</dd></div>
      <div><dt>SIGSTORE SIGNATURE</dt><dd>Not signed · OIDC unavailable</dd></div>
      <div><dt>PUBLIC TRANSPARENCY LOG</dt><dd>No entry issued</dd></div>
    </dl></details>
    <Text type="body" as="p">The document format does not certify a SLSA security level.</Text>
    <details className="proof-output-disclosure"><summary>Read full provenance JSON here</summary><pre tabIndex={0} role="region" aria-label="Full unsigned provenance JSON">{JSON.stringify(provenance, null, 2)}</pre></details>
    <Text type="body" as="p"><Link href="/tools#receipt">Inspect this record against source files inside Mend →</Link></Text>
    <div className="proof-document-downloads" aria-label="Keep the evidence"><a className="proof-provenance-download" href="/example/provenance.json" download>Download in-toto provenance JSON <span aria-hidden="true">↓</span></a><div><Link href="/example/captured-run.json" download>Raw local capture <span aria-hidden="true">↓</span></Link><Link href="/example/mend-example.zip" download>Complete example ZIP <span aria-hidden="true">↓</span></Link></div></div>
    <ArtifactIntegrityCheck />
  </article>;
}
