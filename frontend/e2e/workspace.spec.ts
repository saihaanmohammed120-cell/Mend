import { test, expect, type Page } from "@playwright/test";

const taskId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftKey = "mend:task-draft:v1";
const fixtureOrigin = "https://mend-browser-fixture.test";
const loopbackOrigin = "http://127.0.0.1:4173";

// This browser transport fixture exercises HTTPS-only UI/controller behavior.
// It proxies production pages/assets to loopback HTTP; actual TLS needs separate smoke coverage.
test.use({ baseURL: fixtureOrigin });

async function isolateWorkspace(page: Page, signedIn = false) {
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
      await route.fulfill({ json: { ready: false, mode: "browser_test", blockers: ["Execution disabled in this test."] } });
    } else if (request.method() === "GET" && path === "/api/session") {
      await route.fulfill(signedIn ? { json: { user_id: taskId, csrf_token: "a".repeat(32), expires_at: Math.floor(Date.now() / 1000) + 3600 } } : { status: 401, json: { error: { code: "unauthorized", message: "Sign in required." } } });
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
