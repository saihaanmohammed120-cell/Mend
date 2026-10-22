import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const provenance = JSON.parse(readFileSync(new URL("../lib/captured-provenance.json", import.meta.url), "utf-8"));

for (const width of [390, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`Evidence document at ${width}px in ${colorScheme}: keyboard, exact download and honest hash result`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      // Isolate public UI acceptance from auth, database and provider services.
      await page.route("**/api/**", route => route.fulfill({ status: 503,
        contentType: "application/json", body: '{"error":{"code":"offline_fixture","message":"Offline UI acceptance"}}' }));
      await page.route(/https:\/\/[^/]*nebius\.(com|ai)\//, route => route.abort());
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/");
      const tab = page.getByRole("tab", { name: "Provenance", exact: true });
      await tab.focus();
      await tab.press("Enter");
      const document = page.locator(".proof-provenance");
      await expect(document).toHaveAttribute("data-signature-state", "unsigned");
      await expect(document).toContainText("A real record. No signature.");
      await expect(document.locator(".proof-document-hash code")).toHaveText(provenance.subject[0].digest.sha256);
      const fields = document.locator(".proof-provenance-details");
      await fields.locator("summary").focus();
      await fields.locator("summary").press("Space");
      await expect(fields).toHaveAttribute("open", "");
      await expect(fields).toContainText("No entry issued");
      const downloadLink = document.getByRole("link", { name: "Download in-toto provenance JSON" });
      await downloadLink.focus();
      await expect(downloadLink).toBeFocused();
      expect(await downloadLink.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
      expect((await downloadLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const waiting = page.waitForEvent("download");
      await downloadLink.press("Enter");
      const downloaded = await waiting;
      const file = await downloaded.path();
      expect(file).not.toBeNull();
      expect(JSON.parse(await readFile(file!, "utf-8"))).toEqual(provenance);
      await expect(document.getByRole("link", { name: "Raw local capture" })).toHaveAttribute("href", "/example/captured-run.json");
      await expect(document.getByRole("link", { name: "Complete example ZIP" })).toHaveAttribute("href", "/example/mend-example.zip");
      const integrity = document.getByTestId("artifact-integrity");
      await integrity.getByRole("button", { name: "Check file hashes", exact: true }).click();
      await expect(integrity.getByRole("status")).toContainText("The fetched files match");
      await expect(integrity).toHaveAttribute("aria-busy", "false");
      await expect(document).toHaveAttribute("data-signature-state", "unsigned");
      await expect(document).toContainText("not authenticate the publisher");
      expect(await page.evaluate(() => window.document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test("Evidence file mismatch stays explicit and never changes the unsigned verdict", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ status: 503, contentType: "application/json", body: '{}' }));
  await page.route("**/example/csv_tools.py", route => route.fulfill({ status: 200,
    contentType: "text/plain", body: "# Different source: hash check must fail\n" }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Provenance", exact: true }).click();
  const document = page.locator(".proof-provenance");
  await document.getByRole("button", { name: "Check file hashes", exact: true }).click();
  await expect(document.getByRole("status")).toContainText("A file differs");
  await expect(document.locator('[data-integrity="mismatch"]')).toHaveCount(1);
  await expect(document).toContainText("A real record. No signature.");
  await expect(document).toHaveAttribute("data-signature-state", "unsigned");
});
