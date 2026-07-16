/* =============================================================================
 * @brightloop/db — generated database types.
 *
 * `generated/database.types.ts` is GENERATED from the live schema — never edit
 * it by hand. Regenerate after any migration:
 *
 *   pnpm --filter @brightloop/db gen:types
 *
 * The chain of custody is: packages/schema MACHINES → SQL migrations → live
 * database → these types. schema.js remains the source of truth; this is its
 * reflection, and a mismatch means a migration is missing.
 * ========================================================================== */

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from "./generated/database.types.js";
