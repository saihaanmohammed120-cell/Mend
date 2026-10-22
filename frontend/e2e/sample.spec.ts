import { test as base, expect, type Locator } from "@playwright/test";

const ink = "rgb(24, 32, 27)";
const paper = "rgb(245, 242, 234)";
const white = "rgb(255, 255, 255)";

function visibleShadows(value: string) {
  // Tailwind composes invisible ring layers into box-shadow; inspect the actual
  // visible shadow without mistaking those zero-alpha layers for extra depth.
  return value.split(/,(?![^()]*\))/).map((shadow) => shadow.trim())
    .filter((shadow) => !shadow.startsWith("rgba(0, 0, 0, 0)"));
}

// The sample must stay useful without account, backend or provider access. Abort
// protected requests before they leave the browser, then fail on any attempt.
const test = base.extend<{ isolatedSample: void }>({
  isolatedSample: [async ({ page }, use) => {
    const forbiddenRequests: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const protectedApi = /^\/api\/(?:tasks|auth|runtime)(?:\/|$)/.test(url.pathname);
      const provider = /(^|\.)nebius\.(?:com|ai)$/.test(url.hostname);
      if (protectedApi || provider) {
        forbiddenRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });
    await use();
    expect(forbiddenRequests, "The sample attempted a protected API or provider request").toEqual([]);
    expect(pageErrors, "Uncaught browser errors occurred in the sample").toEqual([]);
  }, { auto: true }],
});

async function expectSourceLines(code: Locator, source: readonly string[]) {
  const lines = code.locator("[data-line]");
  await expect(lines).toHaveCount(source.length);
  expect(await lines.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-line"))))
    .toEqual(source.map((_, index) => String(index + 1)));
  for (const [index, text] of source.entries()) {
    // Read source separately from its rendered gutter; a preserved blank line is
    // meaningful source and must not disappear when the phase changes.
    const line = lines.nth(index);
    await expect(line.locator(":scope > span").first()).toHaveText(String(index + 1));
    const content = await line.locator(":scope > span").nth(1).textContent();
    expect(content?.replaceAll("\u00a0", "")).toBe(text);
  }
}

const original = [
  "def average_sales(values):",
  "    # Empty-input guard missing",
  "",
  "    total = sum(values)",
  "    return total / len(values)",
] as const;
const patched = [
  "def average_sales(values):",
  "    if not values:",
  "        return 0",
  "    total = sum(values)",
  "    return total / len(values)",
] as const;

test("public sample opens with honest evidence labels and continuous original source", async ({ page }) => {
  await page.goto("/sample");
  await expect(page.getByRole("heading", { name: "Demo — simulated evidence", exact: true })).toBeVisible();
  await expect(page.getByTestId("repair-phase")).toHaveAttribute("data-phase", "fail");
  await expect(page.getByRole("button", { name: "Play demo", exact: true })).toBeVisible();
  await expect(page.getByTestId("repair-preview")).toContainText("No model call, isolated job, or live test is running.");
  await expectSourceLines(page.getByTestId("sample-code"), original);
  await expect(page.getByTestId("sample-receipt")).toHaveCount(0);
});

test("manual repair progression preserves patched line three and prints a sample-only receipt", async ({ page }) => {
  await page.goto("/sample");
  const next = page.getByRole("button", { name: "Next step", exact: true });
  const phase = page.getByTestId("repair-phase");
  await next.click();
  await expect(phase).toHaveAttribute("data-phase", "patch");
  await expectSourceLines(page.getByTestId("sample-code"), patched);
  await next.click();
  await expect(phase).toHaveAttribute("data-phase", "pass");
  await expect(page.getByLabel("Illustrative output", { exact: true })).toContainText("not a live test result");
  await next.click();
  await expect(phase).toHaveAttribute("data-phase", "receipt");
  const receipt = page.getByTestId("sample-receipt");
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText("source: demo · execution: not_run");
  await expect(receipt).toContainText("No live verification performed.");
  await expect(receipt).toContainText("test_empty_input_returns_zero");
  await next.click();
  await expect(phase).toHaveAttribute("data-phase", "fail");
  await expectSourceLines(page.getByTestId("sample-code"), original);
  await expect(receipt).toHaveCount(0);
});

test("explicit playback advances the sequence and can be paused", async ({ page }) => {
  await page.goto("/sample");
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause demo", exact: true })).toBeVisible();
  await expect(page.getByTestId("repair-phase")).toHaveAttribute("data-phase", "patch", { timeout: 8_000 });
  await page.getByRole("button", { name: "Pause demo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play demo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByTestId("repair-phase")).toHaveAttribute("data-phase", "pass");
});

test("download contains both sources, a regression test and a non-execution receipt", async ({ page }) => {
  await page.goto("/sample");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download sample bundle", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("mend-sample-bundle.json");
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The sample download produced no readable content");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bundle = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(bundle.source).toBe("demo");
  expect(bundle.execution).toBe("not_run");
  expect(bundle.files.before["sales.py"]).toBe(original.join("\n"));
  expect(bundle.files.after["sales.py"]).toBe(patched.join("\n"));
  expect(bundle.files.tests["test_sales.py"]).toContain("def test_empty_input_returns_zero(self):");
  expect(bundle.files.tests["test_sales.py"]).toContain("self.assertEqual(average_sales([]), 0)");
  expect(bundle.receipt).toMatchObject({ source: "demo", execution: "not_run", result: "illustrative_only" });
  expect(bundle.receipt.notice).toContain("No inference, isolated job, or live verification was performed.");
  expect(bundle.receipt.checks).toEqual([
    "test_empty_input_returns_zero", "test_single_sale", "test_multiple_sales",
    "test_zero_sales", "test_negative_sales", "test_decimal_sales",
  ]);
});

test("paper canvas, hard panel, primary button and static canvas texture retain brand tokens", async ({ page }) => {
  await page.goto("/sample");
  await expect(page.getByTestId("repair-preview")).toBeVisible();
  expect(await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(paper);
  const panel = await page.getByTestId("repair-preview").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor, borderColor: style.borderTopColor,
      borderStyle: style.borderTopStyle, borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius, shadow: style.boxShadow,
      willChange: style.willChange,
    };
  });
  expect({ ...panel, shadow: visibleShadows(panel.shadow) }).toEqual({
    background: white, borderColor: ink, borderStyle: "solid", borderWidth: "2px",
    radius: "20px", shadow: [`${ink} 8px 8px 0px 0px`], willChange: "transform",
  });
  expect(await page.getByTestId("sample-code").evaluate((node) =>
    node.parentElement ? getComputedStyle(node.parentElement).backgroundColor : null)).toBe(white);
  const buttonShadow = await page.getByRole("button", { name: "Play demo", exact: true })
    .evaluate((node) => getComputedStyle(node).boxShadow);
  expect(visibleShadows(buttonShadow)).toEqual([`${ink} 4px 4px 0px 0px`]);
  const noise = await page.locator("main.paper-noise").evaluate((node) => {
    const style = getComputedStyle(node, "::before");
    return { opacity: style.opacity, events: style.pointerEvents, animation: style.animationName, image: style.backgroundImage };
  });
  expect(noise.opacity).toBe("0.05");
  expect(noise.events).toBe("none");
  expect(noise.animation).toBe("none");
  expect(noise.image).toContain("data:image/svg+xml");
});

test("keyboard navigation displays the ink outline with the paper gap", async ({ page }) => {
  await page.goto("/sample");
  const next = page.getByRole("button", { name: "Next step", exact: true });
  await expect(next).toBeVisible();
  let reached = false;
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press("Tab");
    reached = await next.evaluate((node) => document.activeElement === node);
    if (reached) break;
  }
  expect(reached, "The next-step control must be reachable through keyboard navigation").toBe(true);
  await expect(next).toHaveCSS("outline-style", "solid");
  await expect(next).toHaveCSS("outline-color", ink);
  await expect(next).toHaveCSS("outline-width", "3px");
  await expect(next).toHaveCSS("outline-offset", "3px");
  const focusedShadows = await next.evaluate((node) => getComputedStyle(node).boxShadow);
  expect(visibleShadows(focusedShadows)).toContain(`${paper} 0px 0px 0px 3px`);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("repair-phase")).toHaveAttribute("data-phase", "patch");
});

test.describe("normal motion and pointer depth", () => {
  test.use({ reducedMotion: "no-preference" });

  test("changing reduced-motion preference pauses automatic playback while mounted", async ({ page }) => {
    await page.goto("/sample");
    await expect(page.getByRole("button", { name: "Pause demo", exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByRole("button", { name: "Play demo", exact: true })).toBeVisible();
    const phase = page.getByTestId("repair-phase");
    const stoppedAt = await phase.getAttribute("data-phase");
    await page.waitForTimeout(2200);
    await expect(phase).toHaveAttribute("data-phase", stoppedAt!);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.getByRole("button", { name: "Pause demo", exact: true })).toBeVisible();
  });

  test("autoplay advances, and paused pointer tilt stays bounded before returning flat", async ({ page }) => {
    await page.goto("/sample");
    const preview = page.getByTestId("repair-preview");
    const phase = page.getByTestId("repair-phase");
    const pause = page.getByRole("button", { name: "Pause demo", exact: true });
    await expect(pause).toBeVisible();
    const initialPhase = await phase.getAttribute("data-phase");
    await expect.poll(() => phase.getAttribute("data-phase"), {
      timeout: 10_000,
      message: "Normal-motion startup should advance without pressing Play or Next step",
    }).not.toBe(initialPhase);
    await pause.click();
    await expect(page.getByRole("button", { name: "Play demo", exact: true })).toBeVisible();

    // Leave focus on a local navigation link outside the card; do not navigate
    // into the protected workbench. Focus inside the card intentionally disables tilt.
    await page.getByRole("link", { name: "Open developer workbench", exact: true }).focus();
    const host = preview.locator("..");
    await host.scrollIntoViewIfNeeded();
    await page.mouse.move(4, 4);
    const box = await host.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("The pointer host has no local rendered bounds");
    const x = Math.min(viewport.width - 24, box.x + box.width * 0.85);
    const y = Math.min(viewport.height - 24, Math.max(24, box.y + 100));
    expect(x).toBeGreaterThan(box.x);
    expect(y).toBeGreaterThan(box.y);
    expect(y).toBeLessThan(box.y + box.height);
    await page.mouse.move(x, y);

    const angles = () => preview.evaluate((node) => {
      const match = (node as HTMLElement).style.transform.match(/rotateX\(([-.\d]+)deg\) rotateY\(([-.\d]+)deg\)/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    });
    await expect.poll(async () => {
      const rotation = await angles();
      return rotation ? Math.max(Math.abs(rotation.x), Math.abs(rotation.y)) : 0;
    }, { timeout: 5_000 }).toBeGreaterThan(0.1);
    const rotation = await angles();
    if (!rotation) throw new Error("The card has no readable pointer rotation");
    expect(Math.abs(rotation.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(rotation.y)).toBeLessThanOrEqual(3);
    expect(await preview.evaluate((node) => (node as HTMLElement).style.transition)).toBe("none");

    await page.mouse.move(4, 4);
    await expect.poll(async () => {
      const rotation = await angles();
      return rotation ? Math.max(Math.abs(rotation.x), Math.abs(rotation.y)) : Infinity;
    }, { timeout: 5_000 }).toBeLessThan(0.01);
  });
});

test("mobile layout fits its viewport and keeps sample controls usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sample");
  await expect(page.getByRole("heading", { name: "Demo — simulated evidence", exact: true })).toBeVisible();
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(bounds.document).toBeLessThanOrEqual(bounds.viewport);
  const panel = await page.getByTestId("repair-preview").boundingBox();
  if (!panel) throw new Error("The sample panel has no rendered box");
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(bounds.viewport);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByTestId("repair-phase")).toHaveAttribute("data-phase", "patch");
  await expect(page.getByRole("button", { name: "Download sample bundle", exact: true })).toBeVisible();
});
