import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { GET, PATCH, POST, DELETE } from "../app/api/[...path]/route";

const taskId = "96deff11-c0e2-4299-b5f0-b4f0a5020b7a";

test("catchall waits for framework params before forwarding through the existing proxy", async () => {
  const previousFetch = globalThis.fetch;
  const previousURL = process.env.MEND_BACKEND_URL;
  const forwarded: string[] = [];
  let resolveParams!: (params: { path: string[] }) => void;
  const params = new Promise<{ path: string[] }>(resolve => { resolveParams = resolve; });
  try {
    process.env.MEND_BACKEND_URL = "http://127.0.0.1:8000";
    globalThis.fetch = async (url) => {
      forwarded.push(String(url));
      return Response.json({ status: "draft" });
    };
    const pending = GET(new Request(`https://mend.test/api/tasks/${taskId}`), { params });
    await Promise.resolve();
    assert.deepEqual(forwarded, []);
    resolveParams({ path: ["tasks", taskId] });
    const response = await pending;
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "draft" });
    assert.deepEqual(forwarded, [`http://127.0.0.1:8000/api/tasks/${taskId}`]);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.MEND_BACKEND_URL;
    else process.env.MEND_BACKEND_URL = previousURL;
  }
});

test("awaited catchall params preserve the route and method allowlist", async () => {
  const previousFetch = globalThis.fetch;
  let forwarded = false;
  try {
    globalThis.fetch = async () => { forwarded = true; throw new Error("Unexpected forwarding"); };
    const response = await GET(new Request("https://mend.test/api/tasks"), {
      params: Promise.resolve({ path: ["tasks"] }),
    });
    assert.equal(response.status, 404);
    assert.equal(forwarded, false);
    assert.equal(PATCH, GET);
    assert.equal(POST, GET);
    assert.equal(DELETE, GET);
  } finally { globalThis.fetch = previousFetch; }
});

function loadTaskPage() {
  const source = readFileSync(new URL("../app/tasks/[id]/page.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { default?: (props: { params: Promise<{ id: string }> }) => Promise<unknown> } = {};
  const missing = new Error("NEXT_NOT_FOUND");
  const Workbench = Symbol("Workbench");
  runInNewContext(output, {
    exports,
    require(name: string) {
      if (name === "next/navigation") return { notFound: () => { throw missing; } };
      if (name === "@/components/workbench") return { Workbench };
      if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }) };
      throw new Error(`Unexpected TaskPage dependency: ${name}`);
    },
  });
  assert.equal(typeof exports.default, "function");
  return { TaskPage: exports.default!, missing, Workbench };
}

test("actual task page awaits framework params and passes only the validated task ID", async () => {
  const { TaskPage, Workbench } = loadTaskPage();
  const result = await TaskPage({ params: Promise.resolve({ id: taskId }) }) as {
    type: unknown; props: { initialTaskId: string };
  };
  assert.equal(result.type, Workbench);
  assert.equal(result.props.initialTaskId, taskId);
});

test("actual task page still invokes notFound for malformed or uppercase task IDs", async () => {
  const { TaskPage, missing } = loadTaskPage();
  for (const id of ["", "not-a-task", "../session", taskId.toUpperCase()]) {
    await assert.rejects(async () => TaskPage({ params: Promise.resolve({ id }) }), error => error === missing);
  }
});
