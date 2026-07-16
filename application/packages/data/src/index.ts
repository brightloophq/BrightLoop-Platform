/* =============================================================================
 * @brightloop/data — repository bindings.
 *
 * THIS FILE IS THE ONLY SEAM between the application and its persistence.
 * Consumers ask for a repository by port; they never name an implementation.
 *
 * Today every port resolves to a placeholder implementation because Supabase is
 * not yet provisioned. When it is:
 *   1. add SupabaseReputationRepository / SupabaseCatalogRepository here,
 *   2. flip the resolver below on `dataSource`,
 *   3. change nothing else — not a page, not a component, not a query.
 *
 * `isPlaceholderData()` lets the UI honestly label non-real content (handoff
 * integrity rule 4). The label disappears automatically once real data is bound.
 * ========================================================================== */

import type { CatalogRepository, DataSource, ReputationRepository } from "@brightloop/domain";
import { PlaceholderReputationRepository } from "./placeholder/reputation.repository.js";
import { PlaceholderCatalogRepository } from "./placeholder/catalog.repository.js";

export { PlaceholderReputationRepository } from "./placeholder/reputation.repository.js";
export { PlaceholderCatalogRepository } from "./placeholder/catalog.repository.js";
export {
  PLACEHOLDER_PROJECTS,
  PLACEHOLDER_TESTIMONIALS,
  PLACEHOLDER_TRUST_BAR,
} from "./placeholder/reputation.dataset.js";
export {
  PLACEHOLDER_MODULES,
  PLACEHOLDER_PLANS,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_GOALS,
  PLACEHOLDER_CONTENT,
  PLACEHOLDER_RANGE_FACTORS,
  PLACEHOLDER_DISCIPLINE_COPY,
} from "./placeholder/catalog.dataset.js";

export interface DataConfig {
  /**
   * Which persistence to bind. Defaults to "placeholder".
   * Supabase is selected only when it is BOTH requested and configured — there
   * is no path that silently falls back to placeholder data while claiming to
   * be real, nor one that tries Supabase without credentials.
   */
  source?: DataSource;
}

let resolved: DataSource = "placeholder";

/**
 * Resolve which source to use. Kept explicit rather than sniffing env deep in
 * the stack, so the binding is always visible at the app boundary.
 */
export function resolveDataSource(config: DataConfig = {}): DataSource {
  const requested = config.source ?? "placeholder";
  if (requested === "supabase") {
    // Not implemented until the Supabase project exists (Decision C). Fail loudly
    // rather than quietly serving placeholder content as if it were real.
    throw new Error(
      "Supabase repositories are not implemented yet. Provision the project, add " +
        "SupabaseReputationRepository/SupabaseCatalogRepository, then bind them here.",
    );
  }
  resolved = requested;
  return resolved;
}

export function createReputationRepository(config: DataConfig = {}): ReputationRepository {
  resolveDataSource(config);
  return new PlaceholderReputationRepository();
}

export function createCatalogRepository(config: DataConfig = {}): CatalogRepository {
  resolveDataSource(config);
  return new PlaceholderCatalogRepository();
}

/** True while any bound repository is serving non-real content. */
export function isPlaceholderData(source: DataSource): boolean {
  return source === "placeholder";
}
