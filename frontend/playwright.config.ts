import { defineConfig, devices } from "@playwright/test";

// Keep acceptance evidence attached to an isolated local application, never an
// arbitrary deployment or a server already authenticated in another session.
const origin = "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 40_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: "test-results/playwright",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: origin,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 4173",
    url: `${origin}/sample`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      MEND_MODE: "database_only",
      MEND_LIVE_ENABLED: "false",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
