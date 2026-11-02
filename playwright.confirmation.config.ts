import { defineConfig, devices } from "@playwright/test";

process.env.BERTHIO_CONFIRMATION_FIXTURES = "1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "checkout-confirmation.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3110", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1504, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: "node tests/fixtures/checkout-confirmation-server.mjs", url: "http://127.0.0.1:3110/marina/test-harbour/checkout/return?session_id=cs_test_paid", reuseExistingServer: false },
});
