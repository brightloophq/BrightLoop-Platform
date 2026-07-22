import { defineConfig } from "vitest/config";

/**
 * Live-crawl test config. Runs ONLY the *.live.test.ts files, which are
 * themselves gated on AUXION_RUN_LIVE_CRAWLER_TESTS=true + a configured safe URL.
 * The default `test` script never includes these, so CI makes NO external
 * network request.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.live.test.ts"],
  },
});
