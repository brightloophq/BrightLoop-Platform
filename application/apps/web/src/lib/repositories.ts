import "server-only";

import {
  createCatalogRepository,
  createReputationRepository,
  SupabaseTransformationDashboardRepository,
  SupabaseSignalsRepository,
  SupabaseTransformationRepository,
  SupabaseCoreSurfaceRepository,
  SupabaseRuntimeRepository,
  SupabaseTransformationWorkspaceRepository,
  SupabaseInitiativeRepository,
  SupabaseTransformationActivityRepository,
  SupabaseReviewRepository,
  SupabaseTaskRepository,
  SupabaseAssignmentRepository,
  SupabaseDependencyRepository,
} from "@brightloop/data";
import {
  createTransformationService,
  createCoreSurfaceService,
  createRuntimeServices,
  type CatalogRepository,
  type CoreSurfaceService,
  type DataSource,
  type ReputationRepository,
  type RuntimeServices,
  type TransformationService,
  type TransformationExecutionRepositories,
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
 * Core-surfaces adapter (Phase 1B) — Business Scan / Domains / Findings. Typed,
 * request-scoped (RLS-scoped to the caller). Never cached. Reads feed the System
 * Map / Business Scan / Activation read models; writes go via the service below.
 */
export async function getCoreSurfaceRepository(): Promise<SupabaseCoreSurfaceRepository> {
  const client = await createClient();
  return new SupabaseCoreSurfaceRepository(client);
}

/**
 * The Phase B runtime repository (runs, stages, checkpoints, artifacts, reasoning
 * jobs, provider attempts, queue, append-only events). Request-scoped and
 * RLS-scoped to the caller — never cached, never service-role. The runtime tables
 * are internal-only, so a client-role session reads and writes nothing.
 *
 * No route or server action consumes this yet; the runtime SERVICES land in
 * Sprint 13C and will own capability checks, status transitions and attribution.
 */
export async function getRuntimeRepository(): Promise<SupabaseRuntimeRepository> {
  const client = await createClient();
  return new SupabaseRuntimeRepository(client);
}

/**
 * The Phase B runtime SERVICES + coordinator (Sprint 13C), bound to the
 * request-scoped repository so every runtime write runs under the caller's RLS.
 * Never cached — it carries the session.
 *
 * No route or server action consumes this yet. The coordinator performs exactly
 * one worker turn per call and schedules nothing on its own: there is no daemon,
 * no cron and no hosted queue behind it — Postgres is the queue, and the caller
 * decides when a turn happens.
 */
export async function getRuntimeServices(): Promise<RuntimeServices> {
  const client = await createClient();
  return createRuntimeServices({ repo: new SupabaseRuntimeRepository(client), ids: newId });
}

/**
 * Phase D · Transformation Execution repositories, bound to the request-scoped
 * RLS session. Wired into the AppContext by `buildAppContext`. Never cached.
 */
export async function getExecutionRepositories(): Promise<TransformationExecutionRepositories> {
  const client = await createClient();
  return {
    workspaces: new SupabaseTransformationWorkspaceRepository(client),
    initiatives: new SupabaseInitiativeRepository(client),
    activities: new SupabaseTransformationActivityRepository(client),
    reviews: new SupabaseReviewRepository(client),
    tasks: new SupabaseTaskRepository(client),
    assignments: new SupabaseAssignmentRepository(client),
    dependencies: new SupabaseDependencyRepository(client),
  };
}

/** The core-surfaces domain service for WRITES (scan/finding/domain/activation). */
export async function getCoreSurfaceService(): Promise<CoreSurfaceService> {
  const client = await createClient();
  const repo = new SupabaseCoreSurfaceRepository(client);
  return createCoreSurfaceService({ repo, ids: newId });
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
