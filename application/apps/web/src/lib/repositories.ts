import "server-only";

import {
  createCatalogRepository,
  createReputationRepository,
  SupabaseTransformationDashboardRepository,
  SupabaseSignalsRepository,
  SupabaseInsightsRepository,
  SupabaseTransformationRepository,
} from "@brightloop/data";
import {
  createTransformationService,
  type CatalogRepository,
  type DataSource,
  type ReputationRepository,
  type TransformationService,
} from "@brightloop/domain";
import { createAnonClient } from "./supabase/anon";
import { createClient } from "./supabase/server";

/** Prefixed-id generator injected into the transformation service (mirrors the app convention). */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Repository access for Server Components.
 *
 * THE ONLY PLACE the app names a data source. Pages depend on the PORT types and
 * these getters — never on a concrete repository or a dataset.
 *
 * `server-only` makes a client-component import a build error rather than a
 * silent bundle bloat (or leaking the whole dataset to the browser).
 *
 * ⚠️ NOTHING IS CACHED HERE, DELIBERATELY.
 * The Supabase repository holds a request-scoped client carrying the caller's
 * session cookies. The previous version memoised the repository in a module-level
 * variable — harmless for a static placeholder dataset, but with Supabase that
 * would pin one user's session (and therefore one client org's RLS view) into a
 * module that every subsequent request shares. Build them per request.
 */

/**
 * Which persistence backs reputation data.
 *
 * Defaults to "supabase". The env var is an escape hatch for local development
 * without a database — it is NOT a fallback: an unset/invalid value means
 * production, and a Supabase failure throws rather than quietly degrading to
 * sample content.
 */
function reputationSource(): DataSource {
  return process.env.BRIGHTLOOP_DATA_SOURCE === "placeholder" ? "placeholder" : "supabase";
}

/**
 * Reputation repository for PUBLIC pages (portfolio, case studies, testimonials,
 * homepage proof, sitemap).
 *
 * Uses the cookie-less ANON client, deliberately:
 *   * public marketing content is not user-scoped — it looks the same to every
 *     visitor, so there is no session worth binding;
 *   * `generateStaticParams` and static prerendering run at BUILD time where no
 *     request (and therefore no cookie store) exists — a cookie client throws
 *     there, which is exactly what broke the first build after the flip;
 *   * anon is the LEAST privileged role available. RLS gives it only
 *     publish ∈ {public, featured}. It cannot see a draft or any client row.
 *
 * The admin CMS needs drafts, so it will use the session client via a separate
 * getter — internal roles get their own RLS view. Public never should.
 */
export async function getReputationRepository(): Promise<ReputationRepository> {
  const source = reputationSource();
  if (source === "placeholder") {
    return createReputationRepository({ source: "placeholder" });
  }
  return createReputationRepository({ source: "supabase", client: createAnonClient() });
}

/**
 * Reputation repository for AUTHENTICATED surfaces (the admin Reputation CMS).
 *
 * Uses the request-scoped cookie client so RLS sees the caller's role claim and
 * an internal user can read drafts. Never cached — it carries the caller's
 * session.
 */
export async function getAuthedReputationRepository(): Promise<ReputationRepository> {
  const source = reputationSource();
  if (source === "placeholder") {
    return createReputationRepository({ source: "placeholder" });
  }
  const client = await createClient();
  return createReputationRepository({ source: "supabase", client });
}

export function getCatalogRepository(): CatalogRepository {
  return createCatalogRepository();
}

/**
 * Transformation dashboard reader for the AUTHENTICATED command center.
 *
 * Request-scoped cookie client so RLS scopes the read to what the caller may see
 * (internal → the whole portfolio; a client role → only its own org). Fully typed
 * against the generated Database types. Never cached — it carries the session.
 */
export async function getTransformationDashboardRepository(): Promise<SupabaseTransformationDashboardRepository> {
  const client = await createClient();
  return new SupabaseTransformationDashboardRepository(client);
}

/**
 * Signals READ adapter for the authenticated command center (fully typed).
 * Request-scoped so RLS scopes what the caller can see. Never cached.
 */
export async function getSignalsRepository(): Promise<SupabaseSignalsRepository> {
  const client = await createClient();
  return new SupabaseSignalsRepository(client);
}

/**
 * Insights READ adapter for the authenticated command center (fully typed).
 * Request-scoped so RLS scopes what the caller can see. Never cached.
 */
export async function getInsightsRepository(): Promise<SupabaseInsightsRepository> {
  const client = await createClient();
  return new SupabaseInsightsRepository(client);
}

/**
 * The transformation domain service for WRITES (create / transition). Bound to the
 * request-scoped repository so every mutation runs the capability + lifecycle guard
 * + transition audit + event path under the caller's RLS. Never cached.
 */
export async function getTransformationService(): Promise<TransformationService> {
  const client = await createClient();
  const repo = new SupabaseTransformationRepository(client);
  return createTransformationService({ repo, ids: newId });
}

/**
 * True while ANY bound source is serving non-real content — drives
 * PlaceholderNotice.
 *
 * This checks the CATALOG as well as reputation, and that matters: once
 * reputation points at Supabase, the case studies are real but every price on
 * /packages and /services is still placeholder (open decisions 1 & 2). Keying the
 * notice on reputation alone would drop the label at exactly the moment the site
 * starts showing real work beside invented prices — the most misleading state
 * available. The notice retires when the catalog is real too.
 */
export function isServingPlaceholderData(): boolean {
  return reputationSource() === "placeholder" || getCatalogRepository().source === "placeholder";
}

/** Which parts of the site are still sample content. Drives the notice's wording. */
export function placeholderScope(): { reputation: boolean; catalog: boolean } {
  return {
    reputation: reputationSource() === "placeholder",
    catalog: getCatalogRepository().source === "placeholder",
  };
}
