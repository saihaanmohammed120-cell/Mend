"use client";

import type { Runtime } from "../lib/use-workbench";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";

export function RuntimeConnection({ runtime, checking, onRecheck }: {
  runtime: Runtime | null; checking: boolean; onRecheck: () => void;
}) {
  const ready = runtime?.ready === true;
  const setup = runtime?.mode === "setup_only";
  const api = runtime?.api_status === "reachable" ? "Reached" : runtime?.api_status === "unavailable" ? "Unavailable" : "Not checked";
  const database = runtime?.database?.status === "verified" ? "Supabase responded" : runtime?.database?.status === "unavailable" ? "Unavailable" : "Not checked";
  return <section aria-label="Runtime connections" aria-busy={checking} className="mb-8 rounded-xl border-2 border-ink bg-paper p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Heading level={2}>{ready ? "Execution available" : "Execution locked"}</Heading>
      <Button label={checking ? "Checking connections…" : "Recheck connections"} variant="secondary" onClick={onRecheck} isDisabled={checking} />
    </div>
    <dl className="mt-4 grid gap-3 sm:grid-cols-3" aria-live="polite">
      {[ ["App API", api], ["Database", database], ["Execution", ready ? "Release gates permit a start" : "Start disabled"] ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-ink/20 bg-white p-3"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 break-words text-base font-medium">{value}</dd></div>)}
    </dl>
    <Text type="body" as="p">{setup ? "The setup service is reachable. Sign-in and saved tasks are unavailable until backend setup is completed. You can still prepare a bug and use the local tools inside Mend." : ready ? "The backend permits execution. A persisted receipt is still required to establish the result." : "Task review can prepare a contract. Start stays disabled until the backend configuration and database release gate permit execution."} Connection checks do not run code or establish passing checks.</Text>
    {setup ? <ul className="mt-3 list-disc space-y-1 pl-5 text-base leading-6 text-muted"><li>Authentication is not connected.</li><li>The database has not been checked; writes remain on hold.</li><li>Live execution remains on hold pending release evidence.</li></ul> : null}
    {runtime?.database?.release_gate === "disabled" ? <Text type="body" as="p">The database release gate is disabled.</Text> : null}
    {runtime?.checked_at ? <Text type="supporting" as="p">Last backend check: <time dateTime={runtime.checked_at}>{runtime.checked_at}</time></Text> : null}
  </section>;
}
