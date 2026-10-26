import { test, expect, type Page } from "@playwright/test";

const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftKey = "mend:task-draft:v1";
const fixtureOrigin = "https://mend-browser-fixture.test";
const loopbackOrigin = "http://127.0.0.1:4173";

// This browser transport fixture exercises HTTPS-only UI/controller behavior.
// It proxies production pages/assets to loopback HTTP; actual TLS needs separate smoke coverage.
test.use({ baseURL: fixtureOrigin });

async function isolateWorkspace(page: Page, signedIn = false, attempts = false, setup = false) {
  const unexpected: string[] = [];
  page.on("pageerror", error => unexpected.push(`Browser error: ${error.message}`));
  page.on("requestfailed", request => {
    if (!new URL(request.url()).pathname.startsWith("/api/") && request.failure()?.errorText !== "net::ERR_ABORTED") unexpected.push(`Asset failed: ${request.url()}`);
  });
  await page.routeWebSocket("**/*", socket => {
    const url = new URL(socket.url());
    unexpected.push(`WebSocket ${url.origin}${url.pathname}`);
    socket.close();
  });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin !== fixtureOrigin) {
      unexpected.push(`${request.method()} ${url.origin}${path}`);
      await route.abort("blockedbyclient");
    } else if (request.method() === "GET" && path === "/api/runtime") {
      await route.fulfill({ json: setup ? { ready: false, mode: "setup_only", blockers: ["backend_setup_only"], api_status: "reachable",
        database: { status: "not_checked", source: "none", release_gate: "unknown" }, checked_at: "2026-10-26T10:00:00Z" }
        : { ready: false, mode: "browser_test", blockers: ["Execution disabled in this test."] } });
    } else if (request.method() === "GET" && path === "/api/session") {
      await route.fulfill(setup ? { status: 503, json: { error: { code: "backend_setup_only", message: "Backend setup is incomplete." } } }
        : signedIn ? { json: { user_id: taskId, csrf_token: "a".repeat(32), expires_at: Math.floor(Date.now() / 1000) + 3600 } } : { status: 401, json: { error: { code: "unauthorized", message: "Sign in required." } } });
    } else if (request.method() === "GET" && path === `/api/tasks/${taskId}` && attempts) {
      await route.fulfill({ json: { id: taskId, status: "needs_help", source: "local_test", live_verification: false,
        prompt: "Browser fixture only", contract_version: 2, next_sequence: 6,
        contract: { editable_paths: ["csv_tools.py"], protected_files: { "test_csv_tools.py": "fixture source" },
          required_check_ids: ["fixture.empty_input"], limits: { job_timeout_seconds: 60, max_repairs: 3, max_executions: 4 } } } });
    } else if (request.method() === "GET" && path === `/api/tasks/${taskId}/events` && attempts) {
      // Synthetic transport records test presentation only; never a live/provider run.
      const records = [1, 2].flatMap(ordinal => [false, true].map(resolved => ({
        task_id: taskId, attempt_id: ordinal === 1 ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        event_type: "log", stream: "system", payload: { schema_version: 1,
          code: resolved ? "attempt_resolved" : "attempt_reserved", ordinal,
          attempt_status: resolved ? ordinal === 1 ? "failed" : "passed" : "reserved",
          snapshot_sha256: String(ordinal).repeat(64), model_id: "browser-fixture-only",
          checks: resolved ? { total: 1, passed: ordinal === 2 ? 1 : 0, failed: ordinal === 1 ? 1 : 0, skipped: 0,
            results: [{ check_id: "fixture.empty_input", status: ordinal === 1 ? "failed" : "passed" }] } : null },
      })));
      const body = records.map((data, index) => `id: ${index + 1}\nevent: log\ndata: ${JSON.stringify({ ...data, sequence: index + 1 })}\n\n`).join("") +
        `id: 5\nevent: state\ndata: ${JSON.stringify({ task_id: taskId, event_type: "state", sequence: 5, payload: { status: "needs_help" } })}\n\n`;
      await route.fulfill({ contentType: "text/event-stream", body });
    } else if (request.method() === "GET" && path === `/api/tasks/${taskId}` && signedIn) {
      await route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Task not found." } } });
    } else if (!path.startsWith("/api/") && path !== "/api" && request.method() === "GET") {
      const response = await route.fetch({ url: loopbackOrigin + path + url.search, maxRedirects: 0 });
      await route.fulfill({ response });
    } else {
      unexpected.push(`${request.method()} ${path}`);
      await route.abort("blockedbyclient");
    }
  });
  return unexpected;
}

for (const width of [390, 1440]) {
  test(`setup connectivity is inspectable without credential submission at ${width}px`, async ({ page }) => {
    const unexpected = await isolateWorkspace(page, false, false, true);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light", reducedMotion: "reduce" });
    await page.goto("/sign-in");
    await expect(page.getByLabel("Email", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Password", { exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Backend setup pending" })).toBeDisabled();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    const details = page.locator("summary").filter({ hasText: "Backend connection details" });
    await details.focus(); await details.press("Enter");
    await expect(details).toBeFocused();
    const panel = page.getByRole("region", { name: "Runtime connections" });
    await expect(panel).toContainText("Reached");
    await expect(panel).toContainText("Sign-in and saved tasks are unavailable");
    await expect(panel).toContainText("Start disabled");
    await page.getByRole("button", { name: "Recheck connections" }).click();
    await expect(page.getByRole("button", { name: "Recheck connections" })).toBeEnabled();
    await expect(panel).toContainText("Start disabled");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Local tools", exact: true }).click();
    await expect(page).toHaveURL(/\/tools$/);
    expect(unexpected).toEqual([]);
  });

  test(`landing opens a compact sign-in with credentials in view at ${width}px`, async ({ page }) => {
    const unexpected = await isolateWorkspace(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(key => sessionStorage.setItem(key, "My saved CSV task"), draftKey);
    await page.getByRole("link", { name: "Open workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in to your workspace.");
    await expect(page.getByLabel("Email", { exact: true })).toBeInViewport();
    await expect(page.getByLabel("Password", { exact: true })).toBeInViewport();
    await expect(page.getByLabel("Email", { exact: true })).toBeEnabled();
    await expect(page.getByTestId("proof-hero")).toHaveCount(0);
    await expect(page.locator("#task-prompt")).toHaveCount(0);
    expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toBe("My saved CSV task");
    expect(unexpected).toEqual([]);
  });
}

test("a restored workspace session exposes the saved draft without a second sign-in", async ({ page }) => {
  const unexpected = await isolateWorkspace(page, true);
  await page.goto("/sign-in");
  await page.evaluate(key => sessionStorage.setItem(key, "Clean duplicate CSV rows"), draftKey);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your workspace.");
  await expect(page.locator("#task-prompt")).toHaveValue("Clean duplicate CSV rows");
  await expect(page.getByRole("button", { name: "Review task", exact: true })).toBeEnabled();
  await expect(page.locator("#signin-password")).toHaveCount(0);
  await expect(page.getByTestId("proof-hero")).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test("a private or missing task stays in its compact view and shows the owner-authorized error", async ({ page }) => {
  const unexpected = await isolateWorkspace(page, true);
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your task, with its paper trail.");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Task not found.");
  await expect(page.locator("#task-prompt")).toHaveCount(0);
  await expect(page.getByTestId("proof-hero")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Get verified code links" })).toHaveCount(0);
  await expect(page.getByText("No verified receipt is available.", { exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Fixture attempts and locked paths remain honest at ${width}px in ${colorScheme}`, async ({ page }, testInfo) => {
      const unexpected = await isolateWorkspace(page, true, true);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(`/tasks/${taskId}`);
      const timeline = page.getByTestId("attempt-timeline");
      await expect(timeline.locator("[data-attempt]")).toHaveCount(2);
      await expect(timeline).toContainText("Fixture records — not live execution.");
      await expect(timeline.locator('[data-attempt="1"]')).toContainText("Reported failed");
      await expect(timeline.locator('[data-attempt="2"]')).toContainText("Reported passed");
      await expect(timeline.locator('[data-attempt="1"]')).toContainText("fixture.empty_input — failed");
      await expect(timeline).toContainText("Not recorded.");
      const details = timeline.locator("summary").first();
      await details.focus(); await details.press("Enter");
      await expect(timeline.locator("details").first()).toHaveAttribute("open", "");
      await expect(details).toBeFocused();
      await expect(page.getByTestId("editable-files")).toContainText("Unlocked · agent may edit");
      await expect(page.getByTestId("editable-files")).toContainText("csv_tools.py");
      await expect(page.getByTestId("protected-files")).toContainText("Locked · agent cannot edit");
      await expect(page.getByTestId("protected-files")).toContainText("test_csv_tools.py");
      const badge = page.getByTestId("trust-badge");
      await expect(badge.locator('[data-trust="unavailable"]')).toHaveCount(4);
      await badge.locator("summary").focus(); await badge.locator("summary").press("Space");
      await expect(badge).toContainText("A stop request or task status alone is insufficient.");
      await expect(page.getByRole("button", { name: "Start locked — provider gates pending" })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("fixture-workspace.png"), fullPage: true });
      expect(unexpected).toEqual([]);
    });
  }
}
