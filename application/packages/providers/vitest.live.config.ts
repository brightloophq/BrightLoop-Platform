import { defineConfig } from "vitest/config";

/**
 * Live-provider test config. Runs ONLY the *.live.test.ts files, which are
 * themselves gated on AUXION_RUN_LIVE_PROVIDER_TESTS=true + real credentials.
 * The default `test` script never includes these, so CI never spends API credit.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.live.test.ts"],
  },
});
