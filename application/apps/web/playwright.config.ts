import { defineConfig } from "@playwright/test";

if (!process.env["AUXION_DISPOSABLE_PROJECT"] || !process.env["SUPABASE_TEST_DB_CONTAINER"]) {
  throw new Error("Run through scripts/with-local-db.mjs against an explicit disposable local project");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env["CI"]),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: "../../test-results/browser",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:3108",
    // Auth cookies/headers must never become CI artifacts.
    trace: "off", screenshot: "off", video: "off",
  },
  webServer: {
    command: "pnpm exec next start --hostname 127.0.0.1 --port 3108",
    url: "http://127.0.0.1:3108/login",
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});
