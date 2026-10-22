import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const capture: { before_source: string } = JSON.parse(readFileSync(new URL("../lib/captured-example.json", import.meta.url), "utf8"));

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1" || /^\/api(?:\/|$)/.test(url.pathname)) {
      await route.abort("blockedbyclient");
      throw new Error(`Local intake attempted a network handoff: ${route.request().method()} ${url.origin}${url.pathname}`);
    }
    await route.continue();
  });
});

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`local intake reviews, fingerprints and exports original input at ${width}px in ${colorScheme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: width === 390 ? "reduce" : "no-preference" });
      await page.goto("/fix");
      const desk = page.getByTestId("bug-desk");
      await expect(desk.getByRole("heading", { level: 1 })).toHaveText("Bug intake");
      await expect(page.locator("#bug-errorMessage")).toBeInViewport();
      await expect(desk.getByRole("button", { name: "Review intake", exact: true })).toBeInViewport();
      await expect(desk.locator("form, [type=submit]")).toHaveCount(0);
      await desk.getByRole("button", { name: "Review intake", exact: true }).click();
      const issue = desk.getByRole("alert");
      await expect(issue).toBeFocused();
      await issue.getByRole("link").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#bug-errorMessage")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator("#bug-expectedBehavior")).toBeFocused();
      await desk.getByRole("button", { name: "Load captured input", exact: true }).click();
      await desk.getByRole("button", { name: "Review intake", exact: true }).click();
      await expect(desk.locator(".bug-review")).toBeFocused();
      await expect(desk.locator('.bug-steps [aria-current="step"]')).toContainText("Review");
      await desk.locator("summary").filter({ hasText: "Input identities" }).click();
      const hashes = desk.locator(".bug-identities code");
      await expect(hashes).toHaveCount(2);
      await expect(hashes.first()).toHaveText(createHash("sha256").update(capture.before_source).digest("hex"));
      await desk.locator("summary").filter({ hasText: "Inspect exact source" }).click();
      const source = desk.getByRole("region", { name: "Reviewed original source", exact: true });
      await source.focus(); await expect(source).toBeFocused();
      await expect(source).toContainText(capture.before_source.split("\n")[0]);
      await desk.locator("summary").filter({ hasText: "Inspect exact source" }).click();
      const waiting = page.waitForEvent("download");
      await desk.getByRole("button", { name: "Download intake JSON", exact: true }).click();
      const download = await waiting;
      expect(download.suggestedFilename()).toBe("mend-bug-intake.json");
      const payload = readFileSync((await download.path())!, "utf8");
      const packet = JSON.parse(payload);
      expect(packet.original_source).toBe(capture.before_source);
      expect(packet.evidence).toEqual({ investigation: "not_run", execution: "not_run", regression: "not_generated" });
      expect(packet.schema_version).toBe(1);
      await expect(hashes.nth(1)).toHaveText(createHash("sha256").update(payload).digest("hex"));
      await expect(desk.getByRole("status")).toContainText("No task was created and no checks ran.");
      await expect(desk.locator('.bug-steps [aria-current="step"]')).toContainText("Export");
      await desk.getByRole("button", { name: "Change expected behavior", exact: true }).click();
      await expect(page.locator("#bug-expectedBehavior")).toBeFocused();
      await page.locator("#bug-expectedBehavior").fill("A changed expected result");
      await expect(desk.getByRole("button", { name: "Download intake JSON", exact: true })).toHaveCount(0);
      await desk.getByRole("button", { name: "Clear fields", exact: true }).click();
      await desk.getByRole("button", { name: "Undo clear", exact: true }).click();
      await expect(page.locator("#bug-expectedBehavior")).toHaveValue("A changed expected result");
      await expect(desk.getByRole("button", { name: "Download intake JSON", exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.reload();
      await expect(page.locator("#bug-errorMessage")).toHaveValue("");
      await expect(page.locator("#bug-source")).toHaveValue("");
      expect(errors).toEqual([]);
    });
  }
}

test("source validation opens the exact field and rejects oversized UTF-8 input", async ({ page }) => {
  await page.goto("/fix");
  await page.locator(".bug-source-editor > summary").click();
  await page.locator("#bug-source").fill("print('original')\n");
  await page.locator("#bug-filePath").fill("../private.py");
  await page.locator(".bug-source-editor > summary").click();
  await page.getByRole("button", { name: "Review intake", exact: true }).click();
  const issues = page.getByTestId("bug-desk").getByRole("alert");
  await issues.getByRole("link", { name: /Use one Python filename/ }).click();
  await expect(page.locator("#bug-filePath")).toBeFocused();
  await expect(page.locator(".bug-source-editor")).toHaveAttribute("open", "");
  await page.locator("#bug-filePath").fill("sample.py");
  await page.locator("#bug-source").fill("é".repeat(100_001));
  await page.getByRole("button", { name: "Review intake", exact: true }).click();
  await expect(issues).toContainText("Keep the source within the local intake size limit.");
  await expect(page.getByRole("button", { name: "Download intake JSON", exact: true })).toHaveCount(0);
});

test.describe("before hydration", () => {
  test.use({ javaScriptEnabled: false });
  test("private inputs have no native form submission path", async ({ page }) => {
    await page.goto("/fix");
    await page.locator("#bug-errorMessage").fill("Private local error");
    await expect(page.locator("form, [type=submit]")).toHaveCount(0);
    await page.getByRole("button", { name: "Review intake", exact: true }).click();
    await expect(page).toHaveURL(/\/fix$/);
    await expect(page.locator("#bug-errorMessage")).toHaveValue("Private local error");
    await expect(page.locator(".bug-privacy")).toContainText("JavaScript is required for local review and export.");
    await expect(page.locator(".bug-privacy")).toBeVisible();
  });
});
