import { defineConfig, devices } from "@playwright/test";

// Runs against the built site (npm run build) served like production (clean URLs, 404 page), or
// against a deployed site with E2E_BASE_URL=https://… . Prices come from tests/e2e/fixtures/prices.json,
// so results do not depend on the live cache.
const external = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: external ?? "http://localhost:4180", trace: "off" },
  webServer: external ? undefined : { command: "node tests/e2e/serve.mjs", url: "http://localhost:4180/", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
});
