/* =============================================================================
 * @brightloop/data — repository bindings.
 *
 * THIS FILE IS THE ONLY SEAM between the application and its persistence.
 * Consumers ask for a repository by PORT; they never name an implementation.
 *
 * CURRENT BINDINGS
 *   ReputationRepository → Supabase (production) | Placeholder (dev/tests)
 *   CatalogRepository    → Static catalog, ALWAYS.
 *
 * WHY THE CATALOG IS NOT SUPABASE-BACKED
 *   There are no catalog tables. The service modules, plans and prices were
 *   never part of the handoff's database schema (schema.js ENTITIES) — they live
 *   in the design bundle's `platform/data.js` as reference content, and their
 *   real values are still open decisions 1 & 2. Giving them tables before the
 *   product owner has decided the pricing model would be inventing a schema.
 *   When real pricing lands, either the dataset is edited or catalog tables get
 *   a migration and a SupabaseCatalogRepository slots in here — no page changes
 *   either way, because pages only know the port.
 * ========================================================================== */

import type { CatalogRepository, DataSource, ReputationRepository } from "@brightloop/domain";
import { PlaceholderReputationRepository } from "./placeholder/reputation.repository.js";
import { PlaceholderCatalogRepository } from "./placeholder/catalog.repository.js";
import {
  SupabaseReputationRepository,
  type AuxionSupabaseClient,
} from "./supabase/reputation.repository.js";

export { PlaceholderReputationRepository } from "./placeholder/reputation.repository.js";
export { PlaceholderCatalogRepository } from "./placeholder/catalog.repository.js";
export { SupabaseReputationRepository } from "./supabase/reputation.repository.js";
export type { AuxionSupabaseClient } from "./supabase/reputation.repository.js";
export { toPortfolioProject, toTestimonial } from "./supabase/mappers.js";
// Transformation cycle — Supabase-backed adapter for the domain repository port.
export { SupabaseTransformationRepository } from "./transformation/repository.js";
// Transformation dashboard — fully typed read adapter (Sprint 4).
export { SupabaseTransformationDashboardRepository } from "./transformation/dashboard.js";
// Signals — fully typed read adapter (Sprint 5). Writes go through the domain service.
export { SupabaseSignalsRepository } from "./transformation/signals.read.js";
// Core surfaces (Phase 1B) — fully typed Business Scan / Domains / Findings adapter.
export { SupabaseCoreSurfaceRepository } from "./core-surfaces/adapter.js";
// Runtime persistence (Phase B) — fully typed runtime repository adapter.
export { SupabaseRuntimeRepository } from "./runtime/adapter.js";
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
  PLACEHOLDER_ASSESSMENT,
  PLACEHOLDER_CHOICES,
  PLACEHOLDER_STATUS_META,
} from "./placeholder/catalog.dataset.js";

export interface ReputationConfig {
  source: DataSource;
  /**
   * Required when source is "supabase". MUST be a request-scoped client — it
   * carries the caller's session, and therefore determines what RLS lets them
   * see.
   */
  client?: AuxionSupabaseClient;
}

/**
 * Build a ReputationRepository.
 *
 * ⚠️ NEVER cache the result across requests. The Supabase implementation holds a
 * session-bearing client; a module-level singleton would serve one user's
 * session — and therefore one client org's rows — to another. Call this per
 * request.
 */
export function createReputationRepository(config: ReputationConfig): ReputationRepository {
  if (config.source === "supabase") {
    if (!config.client) {
      // Fail loudly. Falling back to placeholder here would silently serve
      // sample case studies as if they were the client's real published work.
      throw new Error(
        "createReputationRepository({ source: 'supabase' }) requires a request-scoped Supabase client.",
      );
    }
    return new SupabaseReputationRepository(config.client);
  }
  return new PlaceholderReputationRepository();
}

/**
 * Build a CatalogRepository.
 *
 * Always the static catalog — see the note at the top of this file. Its `source`
 * reports "placeholder" because the prices genuinely are placeholder, and the UI
 * uses that to keep labelling the site honestly even once reputation is real.
 */
export function createCatalogRepository(): CatalogRepository {
  return new PlaceholderCatalogRepository();
}

/** True while a bound repository is serving non-real content. */
export function isPlaceholderData(source: DataSource): boolean {
  return source === "placeholder";
}
