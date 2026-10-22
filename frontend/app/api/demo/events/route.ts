import type { WorkEvent } from "@/lib/protocol";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Fixture only: not Nebius execution. UI and receipt explicitly label sample evidence.
const EVENTS: WorkEvent[] = [
  {
    type: "state",
    status: "writing",
    attempt: 1,
    message: "Sample: drafting an average sales function.",
  },
  {
    type: "log",
    text: "[sample] Drafted average_sales(values).",
    stream: "stdout",
    attempt: 1,
  },
  {
    type: "state",
    status: "queued",
    attempt: 1,
    message: "Sample: preparing a pinned Python runner.",
  },
  {
    type: "state",
    status: "running",
    attempt: 1,
    message: "Sample: checking normal and empty inputs.",
  },
  {
    type: "log",
    text: "$ pytest -q\n5 passed, 1 failed",
    stream: "stdout",
    attempt: 1,
  },
  {
    type: "log",
    text: "test_empty_input: ZeroDivisionError: division by zero",
    stream: "stderr",
    attempt: 1,
  },
  {
    type: "state",
    status: "fixing",
    attempt: 2,
    message: "Sample: adding an empty input guard. The checks stay unchanged.",
  },
  {
    type: "log",
    text: "+ if not values:\n+     return 0",
    stream: "stdout",
    attempt: 2,
  },
  {
    type: "state",
    status: "running",
    attempt: 2,
    message: "Sample: running the full check set again.",
  },
  {
    type: "log",
    text: "$ pytest -q\n6 passed in 0.04s",
    stream: "stdout",
    attempt: 2,
  },
  {
    type: "receipt",
    receipt: {
      receipt_id: "sample-receipt-01",
      task_id: "sample-task",
      source: "demo",
      status: "passed",
      model: "Illustrative Nemotron fixture",
      job_id: "sample-job-02",
      snapshot_sha256: "a".repeat(64),
      checks: { passed: 6, failed: 0, total: 6 },
      attempts: 2,
      duration_ms: 8000,
      created_at: "2026-10-11T00:00:00.000Z",
    },
  },
];

export async function GET(request: Request) {
  const lastId = Number(request.headers.get("last-event-id") ?? 0);
  let index =
    Number.isSafeInteger(lastId) && lastId >= 0 && lastId <= EVENTS.length
      ? lastId
      : 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  const encoder = new TextEncoder();
  let abort: () => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => {
        if (ended) return;
        ended = true;
        if (timer) clearTimeout(timer);
        request.signal.removeEventListener("abort", abort);
        controller.close();
      };
      abort = finish;
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) {
        finish();
        return;
      }
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      const send = () => {
        if (ended) return;
        if (index >= EVENTS.length) {
          finish();
          return;
        }
        const event = EVENTS[index++];
        controller.enqueue(
          encoder.encode(
            `id: ${index}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
        timer = setTimeout(send, event.type === "receipt" ? 25 : 700);
      };
      timer = setTimeout(send, 150);
    },
    cancel() {
      ended = true;
      if (timer) clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
