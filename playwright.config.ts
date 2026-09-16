import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Auth recovery and booking-capacity scenarios share one local Supabase
  // database. Serialize that integration suite so projects cannot invalidate
  // each other's recovery sessions or capacity snapshots.
  workers: process.env.E2E_SUPABASE_READY ? 1 : 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI && !process.env.BERTHIO_ISOLATED_TESTS,
  },
});
