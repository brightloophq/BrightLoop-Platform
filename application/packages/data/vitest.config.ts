import { defineConfig, configDefaults } from "vitest/config";

/**
 * Default test run: unit tests only. Live-DB integration tests
 * (`*.integration.test.ts`) require a real database and are EXCLUDED here so the
 * standard `pnpm test` stays deterministic and dependency-free. They run via
 * `pnpm test:integration` (see vitest.integration.config.ts) in the CI db-verify job.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
