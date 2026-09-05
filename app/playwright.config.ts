import { defineConfig, devices } from "@playwright/test";
import { assertLocalBaseUrl } from "./load/target-safety.mjs";

/**
 * End-to-end and accessibility tests — Annexure F.1 "End-to-End / Functional"
 * and "Accessibility: WCAG 2.1 AA for primary user journeys".
 *
 * Runs against a server that already exists (BASE_URL), never against Vercel.
 * Locally that is the staging build on 3100; in CI it is `next start` over the
 * ephemeral Postgres, seeded with the demo data.
 *
 * Authentication happens once per role in the setup project and is reused via
 * storageState, so tests never log in themselves. That is both faster and
 * necessary: the credentials login is limited to 10 per minute per IP.
 */
const BASE_URL = assertLocalBaseUrl(process.env.BASE_URL ?? "http://localhost:3100");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Requests carry a marker so server logs can separate E2E traffic.
    extraHTTPHeaders: { "X-E2E": "playwright" },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
