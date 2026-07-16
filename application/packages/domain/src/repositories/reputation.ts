/* =============================================================================
 * ReputationRepository — the PORT (interface) for reputation persistence.
 *
 * The UI depends on this interface, never on a concrete implementation. Today
 * it is backed by a clearly-labelled placeholder dataset; once Supabase is
 * provisioned a SupabaseReputationRepository implements the same port and the
 * application architecture does not change — only the factory binding does.
 *
 * CONTRACT — every implementation MUST guarantee:
 *   1. Every method returns ONLY publish ∈ {public, featured} rows. A draft or
 *      private row must never leave this layer. (RLS enforces the same gate at
 *      the database; this is defence in depth, not a substitute.)
 *   2. Result metrics are surfaced only via disclosedMetrics(), which honours
 *      `metrics.disclosed`.
 * ========================================================================== */

import type { PortfolioProject, Testimonial } from "@brightloop/schema";
import type { AggregateRating, Page, PortfolioFilters, QueryOptions } from "../reputation/query.js";
import type { FacetCounts } from "../reputation/facets.js";

export interface PortfolioQuery extends QueryOptions {
  page?: number;
  perPage?: number;
}

export interface ReputationRepository {
  /** Which backend is serving this data — drives the placeholder-content notice. */
  readonly source: DataSource;

  /** Publish-gated, filtered, sorted, paginated portfolio projects. */
  listProjects(query?: PortfolioQuery): Promise<Page<PortfolioProject>>;

  /** A single published project by slug. Returns null for unpublished/missing. */
  getProjectBySlug(slug: string): Promise<PortfolioProject | null>;

  /** Published projects flagged featured / featuredOnHome. */
  listFeaturedProjects(limit?: number): Promise<PortfolioProject[]>;

  /** Published projects related to the given one, scored by similarity. */
  listRelatedProjects(slug: string, limit?: number): Promise<PortfolioProject[]>;

  /** Published testimonials, pinned first. */
  listTestimonials(options?: { minRating?: number }): Promise<Testimonial[]>;

  /** Published testimonials flagged for the homepage. */
  listHomeTestimonials(limit?: number): Promise<Testimonial[]>;

  /** The published testimonial linked to a project, if any. */
  getTestimonialForProject(slug: string): Promise<Testimonial | null>;

  /** Aggregate rating computed over published testimonials only. */
  getAggregateRating(): Promise<AggregateRating>;

  /**
   * Facet counts for the filter rail, computed over published projects only and
   * against the supplied search + other filters.
   */
  getFacetCounts(filters?: PortfolioFilters, search?: string): Promise<FacetCounts>;

  /**
   * Slugs of published projects — for sitemap + static generation.
   * MUST exclude draft/private, or an unpublished project leaks via the sitemap.
   */
  listPublishedSlugs(): Promise<string[]>;
}

/** Which persistence is bound. `placeholder` means the content is NOT real. */
export type DataSource = "placeholder" | "supabase";
