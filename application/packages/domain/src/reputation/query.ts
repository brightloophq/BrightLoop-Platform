/* =============================================================================
 * Reputation query logic — pure functions, ported from reputation-data.js.
 *
 * These are the semantics the repository layer MUST apply. They are pure so the
 * publish gate and the metric-disclosure gate are unit-testable in isolation and
 * identical no matter which persistence backs them (placeholder today, Supabase
 * once provisioned, with RLS enforcing the same gate at the database).
 *
 * Nothing in here reaches for a data source. Callers pass the rows in.
 * ========================================================================== */

import {
  isPublicPublish,
  PUBLISH_RANK,
  METRIC_DEFS,
  RATING_CATEGORIES,
  type PortfolioProject,
  type Testimonial,
  type MetricKey,
} from "@brightloop/schema";

/* ---- The publish gate ------------------------------------------------------ */

/**
 * THE integrity gate. Only `public` and `featured` items may ever be served
 * publicly. Applied in the query layer (here) AND at the database (RLS) — a
 * crafted request must not be able to return a draft or private row.
 */
export function isPublic(item: { publish: PortfolioProject["publish"] }): boolean {
  return isPublicPublish(item.publish);
}

export function publicProjects(projects: readonly PortfolioProject[]): PortfolioProject[] {
  return projects.filter(isPublic);
}

export function publicTestimonials(testimonials: readonly Testimonial[]): Testimonial[] {
  return testimonials.filter(isPublic);
}

/** Featured items for the homepage — still publish-gated. */
export function featuredProjects(projects: readonly PortfolioProject[]): PortfolioProject[] {
  return projects.filter((p) => isPublic(p) && (p.publish === "featured" || p.featuredOnHome));
}

/** Homepage testimonials — publish-gated AND explicitly flagged for home. */
export function homeTestimonials(testimonials: readonly Testimonial[]): Testimonial[] {
  return testimonials.filter((t) => isPublic(t) && t.featuredOnHome);
}

export function projectBySlug(
  projects: readonly PortfolioProject[],
  slug: string,
): PortfolioProject | null {
  return projects.find((p) => p.slug === slug) ?? null;
}

export function testimonialForProject(
  testimonials: readonly Testimonial[],
  project: PortfolioProject | null,
): Testimonial | null {
  if (!project?.testimonialId) return null;
  return testimonials.find((t) => t.id === project.testimonialId) ?? null;
}

/* ---- The metric-disclosure gate -------------------------------------------- */

export interface DisclosedMetric {
  key: MetricKey;
  label: string;
  icon: string;
  unit: string;
  value: string | number;
}

/**
 * THE second integrity gate. Returns result metrics ONLY when the client has
 * approved disclosure AND a real value exists.
 *
 * An empty array means the UI must show the honest "results kept private at the
 * client's request" state — it must NOT render zeros, dashes, or invented
 * numbers. There is no code path here that can produce a value that was not
 * supplied.
 */
export function disclosedMetrics(project: PortfolioProject): DisclosedMetric[] {
  if (!project.metrics.disclosed) return [];

  const out: DisclosedMetric[] = [];
  for (const def of METRIC_DEFS) {
    const value = (project.metrics as Record<string, unknown>)[def.key];
    // Absent, null, or empty is NOT a result. Zero is a legitimate value.
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    out.push({ key: def.key, label: def.label, icon: def.icon, unit: def.unit, value });
  }
  return out;
}

/** Are there any disclosed results to show? */
export function hasDisclosedMetrics(project: PortfolioProject): boolean {
  return disclosedMetrics(project).length > 0;
}

/**
 * Live-site CTAs appear only with explicit client permission AND a real URL.
 */
export function canShowLivePreview(project: PortfolioProject): boolean {
  return project.permissionLivePreview && project.liveUrl.trim().length > 0;
}

/* ---- Search / filter / sort ------------------------------------------------ */

export type SortOrder = "featured" | "recent" | "az";

export interface PortfolioFilters {
  industry?: readonly string[];
  size?: readonly string[];
  service?: readonly string[];
  country?: readonly string[];
  year?: readonly (string | number)[];
  budget?: readonly string[];
  tech?: readonly string[];
}

export interface QueryOptions {
  filters?: PortfolioFilters;
  search?: string;
  sort?: SortOrder;
}

/** Composed haystack for substring search (name, client, industry, summary, services, tags, tech). */
function haystack(p: PortfolioProject): string {
  return [p.name, p.client, p.industry, p.summary, ...p.services, ...p.tags, ...p.tech]
    .join(" ")
    .toLowerCase();
}

/**
 * Filter + search + sort over the PUBLIC catalogue.
 *
 * Semantics (handoff §10.2): within a facet = OR, across facets = AND.
 * Search is case-insensitive substring. The list is publish-gated first, so no
 * filter combination can surface a draft/private project.
 */
export function query(
  projects: readonly PortfolioProject[],
  { filters = {}, search = "", sort = "featured" }: QueryOptions = {},
): PortfolioProject[] {
  let list = publicProjects(projects);

  const has = (values?: readonly unknown[]): boolean => Array.isArray(values) && values.length > 0;

  if (has(filters.industry)) list = list.filter((p) => filters.industry!.includes(p.industry));
  if (has(filters.size)) list = list.filter((p) => filters.size!.includes(p.size));
  if (has(filters.service))
    list = list.filter((p) => p.services.some((s) => filters.service!.includes(s)));
  if (has(filters.country)) list = list.filter((p) => filters.country!.includes(p.country));
  if (has(filters.year)) {
    const years = filters.year!.map(Number);
    list = list.filter((p) => years.includes(p.year));
  }
  if (has(filters.budget)) list = list.filter((p) => filters.budget!.includes(p.budget));
  if (has(filters.tech)) list = list.filter((p) => p.tech.some((t) => filters.tech!.includes(t)));

  const q = search.trim().toLowerCase();
  if (q) list = list.filter((p) => haystack(p).includes(q));

  return sortProjects(list, sort);
}

export function sortProjects(
  list: readonly PortfolioProject[],
  sort: SortOrder,
): PortfolioProject[] {
  const byRecent = (a: PortfolioProject, b: PortfolioProject) =>
    new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime();

  const out = [...list];
  if (sort === "recent") return out.sort(byRecent);
  if (sort === "az") return out.sort((a, b) => a.name.localeCompare(b.name));
  // featured: publish rank first, then most recent
  return out.sort((a, b) => PUBLISH_RANK[a.publish] - PUBLISH_RANK[b.publish] || byRecent(a, b));
}

/** "You may also like" — score by shared industry, service overlap, size. */
export function related(
  projects: readonly PortfolioProject[],
  project: PortfolioProject | null,
  limit = 3,
): PortfolioProject[] {
  if (!project) return [];
  return publicProjects(projects)
    .filter((p) => p.slug !== project.slug)
    .map((p) => {
      let score = 0;
      if (p.industry === project.industry) score += 3;
      score += p.services.filter((s) => project.services.includes(s)).length;
      if (p.size === project.size) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

/* ---- Pagination ------------------------------------------------------------ */

export interface Page<T> {
  page: number;
  pages: number;
  total: number;
  items: T[];
}

/** Paginate any list. Page is clamped into range. Default 9/page (portfolio grid). */
export function paginate<T>(list: readonly T[], page = 1, perPage = 9): Page<T> {
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, pages, total: list.length, items: list.slice((p - 1) * perPage, p * perPage) };
}

/* ---- Ratings --------------------------------------------------------------- */

export interface AggregateRating {
  count: number;
  overall: number;
  cats: Record<string, number>;
}

/** Average of a testimonial's five category ratings. */
export function avgCategory(t: Testimonial): number {
  const values = Object.values(t.categories);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : t.overall;
}

/**
 * Aggregate rating across PUBLIC testimonials only.
 *
 * Returns count: 0 with zeroed averages when nothing is published — callers must
 * treat count === 0 as "no rating to show" rather than rendering a 0-star score.
 */
export function aggregate(testimonials: readonly Testimonial[]): AggregateRating {
  const list = publicTestimonials(testimonials);
  if (list.length === 0) {
    const cats: Record<string, number> = {};
    for (const k of RATING_CATEGORIES) cats[k] = 0;
    return { count: 0, overall: 0, cats };
  }

  const n = list.length;
  const overall = list.reduce((s, t) => s + t.overall, 0) / n;
  const cats: Record<string, number> = {};
  for (const k of RATING_CATEGORIES) {
    cats[k] = list.reduce((s, t) => s + (t.categories[k] ?? 0), 0) / n;
  }
  return { count: n, overall, cats };
}

/** Pinned testimonials first, then most recent. */
export function orderTestimonials(list: readonly Testimonial[]): Testimonial[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
