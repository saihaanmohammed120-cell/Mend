import { test, expect } from "@playwright/test";

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
for (const colorScheme of ["light", "dark"] as const) {
  test(`Hero at ${width}px in ${colorScheme} preserves one goal, focus, tap targets and containment`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 1024 ? 1000 : 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const hero = page.getByTestId("proof-hero");
    await expect(hero.getByRole("heading", { level: 1 })).toHaveText("Code that runs.Proof to keep.");
    const primary = hero.locator('[data-primary-cta="true"]');
    await expect(primary).toHaveCount(1);
    await expect(hero.locator(".proof-authorship")).toBeVisible();
    await expect(hero.locator(".proof-authorship")).toHaveText("This is a curated patch, not a model-generated repair.");
    await expect(page.locator("#proof-reading")).toHaveCount(1);
    await expect(page.locator("#evidence-local")).toContainText("Real local checks.");
    await expect(page.locator("#evidence-provenance")).toContainText("Real document. Unsigned.");
    await expect(page.locator("#evidence-nebius")).toContainText("Not yet connected.");
    await expect(primary).toHaveAttribute("href", "/fix");
    const bounds = await primary.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    const summary = hero.locator(".proof-boundaries > summary");
    expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await primary.focus();
    const focus = await primary.evaluate(node => { const s = getComputedStyle(node); return { width: s.outlineWidth, offset: s.outlineOffset, style: s.outlineStyle }; });
    expect(focus).toEqual({ width: "3px", offset: "3px", style: "solid" });
    await expect(primary).toBeFocused();
    await hero.getByRole("link", { name: "Explore the checked example", exact: true }).click();
    await expect(page.locator("#worked-example")).toBeInViewport();
    await expect(hero.locator(".proof-live-slot")).not.toHaveAttribute("open", "");
    const tabs = hero.getByRole("tablist", { name: "Inspect captured repair evidence" });
    const patch = tabs.getByRole("tab", { name: "Patch", exact: true });
    await expect(patch).toHaveAttribute("aria-selected", "true");
    for (const tab of await tabs.getByRole("tab").all()) {
      expect((await tab.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    const afterLines = hero.locator('[data-inspection="patch"] [data-line]');
    const afterNumbers = await afterLines.evaluateAll(lines => lines.map(line => Number(line.getAttribute("data-line"))));
    expect(afterNumbers).toEqual(Array.from({ length: afterNumbers.length }, (_, i) => i + 1));
    await expect(afterLines.nth(2)).toContainText("return [], 0");
    const complete = hero.locator('[data-inspection="patch"] [data-source-disclosure="after"]');
    await expect(complete).not.toHaveAttribute("open", "");
    await complete.locator("summary").click();
    await expect(complete).toHaveAttribute("open", "");
    await expect(complete.getByRole("region", { name: "Patched Python source", exact: true })).toBeVisible();
    await patch.focus();
    await patch.press("ArrowRight");
    const checksTab = tabs.getByRole("tab", { name: "Checks", exact: true });
    await expect(checksTab).toBeFocused();
    await expect(checksTab).toHaveAttribute("aria-selected", "true");
    await expect(hero.getByRole("tabpanel", { name: "Checks", exact: true })).toBeVisible();
    await expect(hero.locator(".proof-check-comparison tbody tr")).toHaveCount(4);
    const changedCheck = hero.getByRole("row", { name: "test_empty_input failed passed" });
    await expect(changedCheck).toBeVisible();
    const tabFocus = await checksTab.evaluate(node => { const s = getComputedStyle(node); return { width: s.outlineWidth, offset: s.outlineOffset, style: s.outlineStyle }; });
    expect(tabFocus).toEqual({ width: "3px", offset: "3px", style: "solid" });
    await checksTab.press("End");
    await expect(tabs.getByRole("tab", { name: "Provenance", exact: true })).toBeFocused();
    await expect(hero.getByRole("tabpanel", { name: "Provenance", exact: true })).toContainText("Unsigned");
    await expect(hero.getByRole("link", { name: /Download in-toto provenance JSON/ })).toBeVisible();
    const integrity = hero.getByTestId("artifact-integrity");
    await expect(integrity.getByRole("status")).toContainText("Not checked in this browser.");
    await integrity.getByRole("button", { name: "Check file hashes", exact: true }).click();
    await expect(integrity.getByRole("status")).toContainText("The fetched files match this build’s recorded hashes.");
    await expect(integrity.locator('[data-integrity="match"]')).toHaveCount(4);
    await expect(integrity).toContainText("File consistency only.");
    await expect(page.locator("#evidence-provenance")).toContainText("Unsigned.");
    await tabs.getByRole("tab", { name: "Provenance", exact: true }).press("Home");
    await expect(hero.getByRole("tabpanel", { name: "Before", exact: true })).toBeVisible();
    await expect(page.locator(`#flow .proof-flow-${width <= 1000 ? "mobile" : "desktop"}`)).toBeVisible();
    await expect(page.locator(`#flow .proof-flow-${width <= 1000 ? "desktop" : "mobile"}`)).not.toBeVisible();
    const outputSummary = hero.locator('[data-inspection="before"] .proof-output-disclosure > summary');
    await outputSummary.click();
    const output = hero.locator('[data-inspection="before"]').getByRole("region", { name: "Recorded before stderr" });
    await output.focus();
    await expect(output).toBeFocused();
    for (const selector of [".proof-kicker", ".proof-capture-note", ".proof-source-code", ".proof-case-summary dt", ".proof-provenance-fields dt"]) {
      const size = await hero.locator(selector).first().evaluate(node => parseFloat(getComputedStyle(node).fontSize));
      expect(size).toBeGreaterThanOrEqual(11);
    }
    const flow = page.locator("#flow");
    const gutter = await flow.evaluate(node => ({ left: getComputedStyle(node).paddingLeft, right: getComputedStyle(node).paddingRight }));
    expect(gutter).toEqual({ left: "0px", right: "0px" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const palette = await hero.evaluate(node => getComputedStyle(node).getPropertyValue("--proof-paper").trim());
    expect(palette.toUpperCase()).toBe(colorScheme === "light" ? "#F5F2EA" : "#121814");
  });
}

}


test("Local case preparation preserves input, exports a packet and invalidates review after edits", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#prepare-case");
  const intakeDisclosure = page.locator(".landing-quick-intake");
  if (!await intakeDisclosure.evaluate(node => (node as HTMLDetailsElement).open)) await intakeDisclosure.locator("summary").first().click();
  const local = page.getByTestId("repair-case");
  const currentStep = local.locator('.case-steps [aria-current="step"]');
  await expect(currentStep).toContainText("Describe");
  await expect(currentStep).toContainText("Current step");
  await expect(local.locator("form, button[type=submit]")).toHaveCount(0);
  await local.getByRole("button", { name: "Review the case", exact: true }).click();
  await expect(local.getByRole("alert")).toBeFocused();
  await local.getByRole("button", { name: "Use the captured CSV case" }).click();
  await local.getByRole("button", { name: "Review the case", exact: true }).click();
  await expect(local.locator(".case-review")).toBeFocused();
  await expect(currentStep).toContainText("Review");
  await expect(currentStep).toHaveAttribute("data-step-state", "current");
  await expect(local.locator('.case-steps [data-step-state="complete"]')).toHaveCount(1);
  await expect(local.getByRole("status")).toContainText("Case prepared locally.");
  const waiting = page.waitForEvent("download");
  await local.getByRole("button", { name: "Download case JSON", exact: true }).click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe("mend-bug-intake.json");
  await expect(currentStep).toContainText("Download");
  await expect(currentStep).toContainText("Requested");
  await expect(local.locator('.case-steps [data-step-state="complete"]')).toHaveCount(2);
  await expect(local.getByRole("status")).toContainText("Download requested. No backend task was created");
  await local.locator('textarea[name="expectedBehavior"]').fill("A changed expected result");
  await expect(currentStep).toContainText("Describe");
  await expect(local.getByRole("button", { name: "Download case JSON", exact: true })).toHaveCount(0);
  await expect(local.getByRole("status")).toContainText("The validated case will appear here.");
  await local.getByRole("button", { name: "Clear fields", exact: true }).click();
  await local.getByRole("button", { name: "Undo clear", exact: true }).click();
  await expect(local.locator('textarea[name="expectedBehavior"]')).toHaveValue("A changed expected result");
  await expect(local.getByRole("button", { name: "Download case JSON", exact: true })).toHaveCount(0);
  await local.getByRole("button", { name: "Review the case", exact: true }).click();
  await local.getByRole("button", { name: "Change original source", exact: true }).click();
  await expect(local.getByLabel("Original Python source", { exact: true })).toBeFocused();
  const capture = page.locator("#worked-example");
  await capture.getByRole("tab", { name: "Checks", exact: true }).click();
  const command = capture.getByRole("textbox", { name: "Reproduction command", exact: true });
  await command.focus();
  await expect(command).toHaveValue("python -m unittest -v test_csv_tools");
  const selected = await command.evaluate(node => { const input = node as HTMLInputElement; return input.selectionStart === 0 && input.selectionEnd === input.value.length; });
  expect(selected).toBe(true);
});


test("Public landing stays still and readable without exposing an unconnected task form", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#task-prompt")).toHaveCount(0);
  const example = page.locator("#worked-example");
  await example.scrollIntoViewIfNeeded();
  await page.mouse.move(300, 400);
  expect(await example.evaluate(node => getComputedStyle(node).transform)).toBe("none");
  expect(errors).toEqual([]);
});

test("Hash verification reports a changed file instead of a passing fingerprint", async ({ page }) => {
  await page.route("**/example/csv_tools.py", async route => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({ response, body: source + "\n# controlled integrity mismatch\n" });
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Provenance", exact: true }).click();
  const integrity = page.getByTestId("artifact-integrity");
  await integrity.getByRole("button", { name: "Check file hashes", exact: true }).click();
  await expect(integrity.getByRole("status")).toContainText("A file differs from this build’s recorded hash.");
  await expect(integrity.locator('[data-integrity="mismatch"]')).toHaveCount(1);
  await expect(integrity.getByRole("status")).not.toContainText("The fetched files match");
});
