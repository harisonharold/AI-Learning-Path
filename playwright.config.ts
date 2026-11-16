import { defineConfig, devices } from "@playwright/test";

/** E2E runs against the Compose stack started with infra/compose/compose.test.yaml (`pnpm up:test`). */
export default defineConfig({
  testDir: "tests",
  testMatch: ["e2e/**/*.spec.ts", "a11y/**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "off", ...devices["Desktop Chrome"] },
  projects: [
    { name: "e2e", testMatch: "e2e/**/*.spec.ts" },
    { name: "a11y", testMatch: "a11y/**/*.spec.ts" },
  ],
});
