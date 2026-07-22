import { defineConfig } from "vitest/config";

/**
 * Default test config. Runs unit tests only — the live crawl tests
 * (*.live.test.ts) are excluded here and live in vitest.live.config.ts, gated on
 * AUXION_RUN_LIVE_CRAWLER_TESTS + a configured safe URL. Default CI makes NO
 * external network request.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.live.test.ts"],
  },
});
