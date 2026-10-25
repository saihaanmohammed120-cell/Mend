import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const capture = JSON.parse(readFileSync(new URL("../lib/captured-example.json", import.meta.url), "utf8"));
const contract = JSON.parse(readFileSync(new URL("../lib/receipt-contract.json", import.meta.url), "utf8"));
const provenance = JSON.parse(readFileSync(new URL("../lib/captured-provenance.json", import.meta.url), "utf8"));

async function keepLocal(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173" || url.pathname.startsWith("/api/") || request.method() !== "GET") {
      failures.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort();
    } else await route.continue();
  });
  await page.routeWebSocket("**/*", socket => { failures.push("Unexpected WebSocket"); socket.close(); });
  return failures;
}

for (const width of [390, 1440]) for (const colorScheme of ["light", "dark"] as const) {
  test(`Local tools compare, preview, inspect and clear privately at ${width}px in ${colorScheme}`, async ({ page }, testInfo) => {
    const failures = await keepLocal(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Local tools", exact: true }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Keep the review on your desk.");
    await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
    await page.getByRole("button", { name: "Load captured comparison" }).click();
    await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
    const result = page.getByTestId("repository-result");
    await expect(result).toBeFocused();
    await expect(result).toContainText("Comparison ready · not executed");
    await expect(result.locator("dl>div").filter({ hasText: "Changed paths" }).locator("dd")).toHaveText("1");
    const span = result.locator("summary").first(); await span.focus(); await span.press("Enter");
    await expect(result).toContainText("return [], 0");
    await page.screenshot({ path: testInfo.outputPath("repository.png"), fullPage: true });
    await result.getByRole("link", { name: "Preview policy for this comparison" }).click();
    await expect(page).toHaveURL(/#policy$/);
    await page.getByRole("button", { name: "Preview thresholds" }).click();
    await expect(page.getByTestId("policy-result")).toContainText("Within your thresholds · approval not established");
    await expect(page.getByTestId("policy-result")).toContainText("Not approved");
    await page.getByLabel("Maximum changed-line span").fill("1");
    await expect(page.getByTestId("policy-result")).toHaveCount(0);
    await page.getByRole("button", { name: "Preview thresholds" }).click();
    await expect(page.getByTestId("policy-result")).toContainText("Human review required");
    await page.getByRole("navigation", { name: "Local review tools" }).getByRole("link", { name: /Receipt inspection/ }).click();
    await page.getByRole("button", { name: "Load captured unsigned record" }).click();
    await page.getByRole("button", { name: "Inspect record and source" }).click();
    const receipt = page.getByTestId("receipt-result");
    await expect(receipt).toBeFocused();
    await expect(receipt).toContainText("Unsigned / unauthenticated inspection");
    await expect(receipt.locator("dl>div").filter({ hasText: "Selected source binding" }).locator("dd")).toHaveText("Consistent");
    await page.screenshot({ path: testInfo.outputPath("receipt.png"), fullPage: true });
    await page.getByLabel("Receipt source map JSON", { exact: true }).fill(JSON.stringify({ "csv_tools.py": capture.before_source }));
    await expect(receipt).toHaveCount(0);
    await page.getByRole("button", { name: "Inspect record and source" }).click();
    await expect(receipt.locator("dl>div").filter({ hasText: "Selected source binding" }).locator("dd")).toHaveText("Mismatch / inconsistent");
    expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Clear local inputs" }).click();
    await expect(page.getByLabel("Receipt or SLSA JSON", { exact: true })).toHaveValue("");
    await expect(receipt).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Receipt source map JSON", { exact: true })).toHaveValue("");
    expect(failures).toEqual([]);
  });
}

test("File selectors read exact local bytes, protect tests, reject duplicate JSON and retire stale hashing", async ({ page }) => {
  const failures = await keepLocal(page);
  await page.goto("/tools");
  const selected = (source: string) => [{ name: "csv_tools.py", mimeType: "text/x-python", buffer: Buffer.from(source) }, { name: "test_csv_tools.py", mimeType: "text/x-python", buffer: Buffer.from(contract.protected_files["test_csv_tools.py"]) }];
  await page.getByLabel("Select original snapshot json Python files", { exact: true }).setInputFiles(selected(capture.before_source));
  await expect(page.getByLabel("Original snapshot JSON", { exact: true })).toHaveValue(/csv_tools.py/);
  await page.getByLabel("Select candidate snapshot json Python files", { exact: true }).setInputFiles(selected(capture.after_source));
  await expect(page.getByLabel("Candidate snapshot JSON", { exact: true })).toHaveValue(/csv_tools.py/);
  await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
  await expect(page.getByTestId("repository-result")).toBeVisible();
  await page.getByLabel("Candidate snapshot JSON", { exact: true }).fill(JSON.stringify({ "csv_tools.py": capture.after_source, "test_csv_tools.py": "# tampered\n" }));
  await expect(page.getByTestId("repository-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
  await expect(page.getByTestId("repository-result")).toContainText("Blocked: protected content changed");
  await page.getByLabel("Candidate snapshot JSON", { exact: true }).fill('{"csv_tools.py":"x","csv_tools.py":"y"}');
  await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Duplicate JSON keys");
  await page.getByRole("button", { name: "Load captured comparison" }).click();
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => { await new Promise(resolve => setTimeout(resolve, 250)); return digest(...args); };
  });
  await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
  await page.getByLabel("Candidate snapshot JSON", { exact: true }).fill("{}");
  await expect(page.getByRole("status")).toContainText("Local only");
  await page.waitForTimeout(350);
  await expect(page.getByTestId("repository-result")).toHaveCount(0);
  await page.goto("/tools#receipt");
  await page.getByLabel("Select receipt JSON file", { exact: true }).setInputFiles({ name: "record.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(provenance)) });
  await expect(page.getByLabel("Receipt or SLSA JSON", { exact: true })).toHaveValue(/https:\/\/in-toto.io\/Statement\/v1/);
  await page.getByRole("button", { name: "Inspect record and source" }).click();
  await expect(page.getByTestId("receipt-result").locator("dl>div").filter({ hasText: "Selected source binding" }).locator("dd")).toHaveText("Not available");
  expect(failures).toEqual([]);
});

test("Guides, roadmap, source and license navigation stay inside Mend", async ({ page }) => {
  const failures = await keepLocal(page);
  await page.goto("/");
  const guides = await page.locator(".proof-roadmap-guide").evaluateAll(links => links.map(link => (link as HTMLAnchorElement).getAttribute("href")));
  expect(guides).toEqual(["/help#repository", "/help#ci", "/help#policy", "/help#team-ledger", "/help#check-history", "/help#receipts"]);
  for (const path of guides) {
    await page.goto(path!);
    const section = page.locator(path!.replace("/help", ""));
    await expect(section).toBeInViewport();
    await section.locator("summary").first().focus(); await section.locator("summary").first().press("Enter");
    await expect(section.locator("pre").first()).toBeVisible();
  }
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Source", exact: true }).click();
  await expect(page).toHaveURL(/\/help#source$/);
  await expect(page.getByRole("heading", { name: "Read the source here" })).toBeVisible();
  await page.locator("#source summary").first().click();
  await expect(page.locator("#source pre").first()).toContainText("compareRepository");
  await page.locator('nav[aria-label="Guide topics"]').getByRole("link", { name: "MIT license", exact: true }).click();
  await expect(page.getByLabel("Project MIT license", { exact: true })).toContainText("Permission is hereby granted");
  const outgoing = await page.locator("a[href]").evaluateAll(links => links.filter(link => (link as HTMLAnchorElement).origin !== location.origin).map(link => (link as HTMLAnchorElement).href));
  expect(outgoing).toEqual([]);
  expect(failures).toEqual([]);
});

test.describe("No JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("local tool inputs have no native submission or upload path", async ({ page }) => {
    const failures = await keepLocal(page);
    await page.goto("/tools");
    await expect(page.locator("form,button[type=submit]")).toHaveCount(0);
    await expect(page.getByText("JavaScript is required for these local operations.", { exact: false })).toBeVisible();
    await page.getByLabel("Original snapshot JSON", { exact: true }).fill('{"private.py":"private input"}');
    await page.getByRole("button", { name: "Compare snapshots", exact: true }).click();
    await expect(page).toHaveURL(/\/tools$/);
    expect(failures).toEqual([]);
  });
});
