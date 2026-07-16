import "server-only";

import { createCatalogRepository, createReputationRepository } from "@brightloop/data";
import type { CatalogRepository, ReputationRepository } from "@brightloop/domain";

/**
 * Repository access for Server Components.
 *
 * THE ONLY PLACE the app names a data source. Pages import these getters and
 * depend on the PORT types — they never import a placeholder dataset or a
 * concrete repository, so binding Supabase later touches only this file and the
 * factory in @brightloop/data.
 *
 * `server-only` makes a client-component import a build error rather than a
 * silent bundle bloat (or a leak of the whole dataset to the browser).
 */

let reputation: ReputationRepository | null = null;
let catalog: CatalogRepository | null = null;

/**
 * Which persistence to bind. Supabase is not implemented yet (Decision C —
 * region unconfirmed), so this resolves to the placeholder source. When the
 * project exists this reads BRIGHTLOOP_DATA_SOURCE and nothing else changes.
 */
function source(): "placeholder" | "supabase" {
  return process.env.BRIGHTLOOP_DATA_SOURCE === "supabase" ? "supabase" : "placeholder";
}

export function getReputationRepository(): ReputationRepository {
  reputation ??= createReputationRepository({ source: source() });
  return reputation;
}

export function getCatalogRepository(): CatalogRepository {
  catalog ??= createCatalogRepository({ source: source() });
  return catalog;
}

/**
 * True while the site is serving sample content. Drives PlaceholderNotice, so
 * the label disappears automatically once real data is bound — nobody has to
 * remember to remove it.
 */
export function isServingPlaceholderData(): boolean {
  return getReputationRepository().source === "placeholder";
}
