import { defineConfig } from "vitest/config";

/**
 * Live-DB integration run: ONLY `*.integration.test.ts`. Requires a running
 * Supabase/Postgres (env from `supabase status -o env`). Used by
 * `pnpm test:integration` and the CI db-verify job. A longer timeout accommodates
 * real network round-trips to the local database.
 */
export default defineConfig({
  test: {
    include: ["**/*.integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
