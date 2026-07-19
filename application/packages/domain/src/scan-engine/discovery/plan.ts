/* =============================================================================
 * Crawl plan (PDF 27 §04) — PURE, deterministic.
 *
 * Generates the canonical set of crawl targets (homepage, about, contact,
 * services, pricing, blog, legal, careers, resources) plus any custom paths,
 * each with a priority + depth, capped by maxPages. No fetching. Deterministic:
 * identical input yields an identical, stably-ordered plan.
 * ========================================================================== */

import { crawlPlanSchema, type CrawlTarget, type CrawlPlan, type CrawlPathKind } from "@brightloop/schema";

/** The canonical path templates, homepage first. */
export const CANONICAL_PATHS: readonly Omit<CrawlTarget, "depth">[] = [
  { kind: "homepage", path: "/", priority: 0 },
  { kind: "about", path: "/about", priority: 1 },
  { kind: "contact", path: "/contact", priority: 1 },
  { kind: "services", path: "/services", priority: 2 },
  { kind: "pricing", path: "/pricing", priority: 2 },
  { kind: "blog", path: "/blog", priority: 3 },
  { kind: "resources", path: "/resources", priority: 3 },
  { kind: "careers", path: "/careers", priority: 4 },
  { kind: "legal", path: "/legal", priority: 4 },
] as const;

export interface PlanOptions {
  maxPages?: number;
  maxDepth?: number;
  perHostLimit?: number;
  customPaths?: string[];
}

const norm = (p: string) => (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "") || "/";

/** Generate a deterministic crawl plan for a canonical root. */
export function generatePlan(root: string, options: PlanOptions = {}): CrawlPlan {
  const maxPages = options.maxPages ?? 50;
  const maxDepth = options.maxDepth ?? 2;
  const perHostLimit = options.perHostLimit ?? 30;

  const canonical: CrawlTarget[] = CANONICAL_PATHS.map((t) => ({ ...t, depth: t.kind === "homepage" ? 0 : 1 }));
  const seenPaths = new Set(canonical.map((t) => t.path));
  const custom: CrawlTarget[] = [];
  for (const raw of options.customPaths ?? []) {
    const path = norm(raw);
    if (seenPaths.has(path)) continue; // de-dupe against canonical + earlier custom
    seenPaths.add(path);
    custom.push({ kind: "custom" as CrawlPathKind, path, priority: 5, depth: 1 });
  }

  const targets = [...canonical, ...custom]
    .filter((t) => t.depth <= maxDepth)
    .sort((a, b) => a.priority - b.priority || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, maxPages);

  return crawlPlanSchema.parse({ root, targets, maxPages, maxDepth, perHostLimit });
}
