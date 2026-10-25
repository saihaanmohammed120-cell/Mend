import { test, expect } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`Public landing at ${width}px leads to a usable local desk without auth requests`, async ({ page }) => {
    const backendRequests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname.startsWith("/api/")) backendRequests.push(request.url());
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByTestId("proof-hero")).toBeVisible();
    await expect(page.locator("#task-prompt")).toHaveCount(0);
    await expect(page.locator("#main-content").getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".landing-quick-intake")).not.toHaveAttribute("open", "");
    const primary = page.locator('[data-primary-cta="true"]');
    await expect(primary).toHaveAccessibleName("Prepare a bug");
    await primary.click();
    await expect(page).toHaveURL(/\/fix$/);
    const desk = page.getByTestId("bug-desk");
    await desk.getByRole("button", { name: "Load captured input" }).click();
    await desk.getByRole("button", { name: "Review intake", exact: true }).click();
    const download = page.waitForEvent("download");
    await desk.getByRole("button", { name: "Download intake JSON", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("mend-bug-intake.json");
    expect(backendRequests).toEqual([]);
  });
}

test("Evidence link opens its actual disclosure before navigating to the live slot", async ({ page }) => {
  await page.goto("/");
  const disclosure = page.locator(".proof-live-slot");
  await expect(disclosure).not.toHaveAttribute("open", "");
  await page.getByRole("link", { name: "Inspect the live slot" }).click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(page.getByTestId("live-run-panel")).toBeVisible();
  await expect(page.getByTestId("live-run-panel")).toContainText("No Nebius job has run in this view.");
});
