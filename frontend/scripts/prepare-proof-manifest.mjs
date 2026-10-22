import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const FILES = ["csv_tools.py", "test_csv_tools.py", "captured-run.json", "provenance.json"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const identity = filename => fs.existsSync(filename) ? fs.realpathSync(filename) : path.join(fs.realpathSync(path.dirname(filename)), path.basename(filename));
const inodeIdentity = filename => {
  const stat = fs.statSync(filename, { bigint: true });
  return `${stat.dev}:${stat.ino}`;
};
const writeAtomic = (filename, contents) => {
  const temporary = path.join(path.dirname(filename), `.mend-proof-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, contents, { flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
};

/** Fingerprints bind the included local example. They are not signatures or run authorization. */
export function prepareProofManifest(assetsDirectory, moduleFilename) {
  const assets = path.resolve(assetsDirectory);
  const output = path.resolve(moduleFilename);
  const inputs = FILES.map(name => path.join(assets, name));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const protectedInputs = new Set(inputs.map(identity));
  const protectedInodes = new Set(inputs.map(inodeIdentity));
  for (const destination of [output, path.join(assets, "integrity.json")]) {
    if (protectedInputs.has(identity(destination)) ||
        (fs.existsSync(destination) && protectedInodes.has(inodeIdentity(destination)))) {
      throw new Error("Manifest output must not replace a proof input.");
    }
  }
  const bytes = Object.fromEntries(FILES.map((name, index) => [name, fs.readFileSync(inputs[index])]));
  const capture = JSON.parse(bytes["captured-run.json"].toString("utf8"));
  const provenance = JSON.parse(bytes["provenance.json"].toString("utf8"));
  if (capture.source !== "captured_local" || capture.live_verification !== false ||
      !Buffer.from(capture.after_source ?? "", "utf8").equals(bytes["csv_tools.py"]) ||
      capture.source_sha256 !== sha256(bytes["csv_tools.py"]) ||
      capture.tests_sha256 !== sha256(bytes["test_csv_tools.py"])) {
    throw new Error("Captured source/tests do not match the proof files.");
  }
  const subjects = provenance.subject;
  const captureInputs = provenance.predicate?.buildDefinition?.resolvedDependencies?.filter(item => item.uri === "urn:mend:captured-local-run");
  if (provenance._type !== "https://in-toto.io/Statement/v1" || provenance.predicateType !== "https://slsa.dev/provenance/v1" ||
      !Array.isArray(subjects) || subjects.length !== 1 || subjects[0].name !== "csv_tools.py" || subjects[0].digest?.sha256 !== capture.source_sha256 ||
      !Array.isArray(captureInputs) || captureInputs.length !== 1 || captureInputs[0].digest?.sha256 !== sha256(bytes["captured-run.json"])) {
    throw new Error("Local provenance does not bind the captured source and raw output.");
  }
  const manifest = {
    schema_version: 1, scope: "captured_local_file_integrity", signature_verification: false,
    files: FILES.map(name => ({ name, path: `/example/${name}`, bytes: bytes[name].byteLength, sha256: sha256(bytes[name]) })),
  };
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  writeAtomic(output, serialized);
  writeAtomic(path.join(assets, "integrity.json"), serialized);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 4 || args[0] !== "--assets" || args[2] !== "--module")) {
    throw new Error("Use --assets DIRECTORY --module FILE, or omit both for the canonical frontend.");
  }
  const manifest = prepareProofManifest(args[1] ?? "public/example", args[3] ?? "lib/captured-file-digests.json");
  process.stdout.write(`Prepared ${manifest.files.length} local file fingerprints; no signature or provider execution.\n`);
}
