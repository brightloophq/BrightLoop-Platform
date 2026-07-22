import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Web test config. Adds the `@/` → `src` alias (so route handlers resolve as
 * they do under Next) and runs in a node environment — these are API route and
 * lib tests, not DOM tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
