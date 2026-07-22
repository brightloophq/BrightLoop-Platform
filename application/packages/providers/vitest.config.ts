import { defineConfig } from "vitest/config";

/**
 * Default test config. Runs unit tests only — the live provider tests
 * (*.live.test.ts) are excluded here and live in vitest.live.config.ts, gated on
 * AUXION_RUN_LIVE_PROVIDER_TESTS + credentials. CI never spends API credit.
 */
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.live.test.ts"],
  },
});
