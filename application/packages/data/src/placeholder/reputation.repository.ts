/* =============================================================================
 * PlaceholderReputationRepository — implements the ReputationRepository port
 * over the clearly-labelled placeholder dataset.
 *
 * This exists so Sprint 1 is not blocked on Supabase provisioning. It applies
 * EXACTLY the same publish gate and metric-disclosure rules that
 * SupabaseReputationRepository will, because both delegate to the same pure
 * functions in @brightloop/domain. Swapping the binding changes no consumer.
 * ========================================================================== */

import type { PortfolioProject, Testimonial } from "@brightloop/schema";
import {
  aggregate,
  facetCounts,
  featuredProjects,
  homeTestimonials,
  isPublic,
  orderTestimonials,
  paginate,
  projectBySlug,
  publicProjects,
  publicTestimonials,
  query,
  related,
  testimonialForProject,
  type AggregateRating,
  type DataSource,
  type FacetCounts,
  type Page,
  type PortfolioFilters,
  type PortfolioQuery,
  type ReputationRepository,
} from "@brightloop/domain";
import { PLACEHOLDER_PROJECTS, PLACEHOLDER_TESTIMONIALS } from "./reputation.dataset.js";

export interface PlaceholderReputationOptions {
  projects?: readonly PortfolioProject[];
  testimonials?: readonly Testimonial[];
}

export class PlaceholderReputationRepository implements ReputationRepository {
  readonly source: DataSource = "placeholder";

  private readonly projects: readonly PortfolioProject[];
  private readonly testimonials: readonly Testimonial[];

  constructor(options: PlaceholderReputationOptions = {}) {
    this.projects = options.projects ?? PLACEHOLDER_PROJECTS;
    this.testimonials = options.testimonials ?? PLACEHOLDER_TESTIMONIALS;
  }

  async listProjects(q: PortfolioQuery = {}): Promise<Page<PortfolioProject>> {
    const { page = 1, perPage = 9, ...options } = q;
    // query() publish-gates before filtering — a draft cannot be surfaced.
    const list = query(this.projects, options);
    return paginate(list, page, perPage);
  }

  async getProjectBySlug(slug: string): Promise<PortfolioProject | null> {
    const found = projectBySlug(this.projects, slug);
    // Publish gate applies to direct slug access too — an unpublished slug is
    // indistinguishable from a missing one.
    if (!found || !isPublic(found)) return null;
    return found;
  }

  async listFeaturedProjects(limit?: number): Promise<PortfolioProject[]> {
    const list = featuredProjects(this.projects);
    return typeof limit === "number" ? list.slice(0, limit) : list;
  }

  async listRelatedProjects(slug: string, limit = 3): Promise<PortfolioProject[]> {
    const current = await this.getProjectBySlug(slug);
    return related(this.projects, current, limit);
  }

  async listTestimonials(options: { minRating?: number } = {}): Promise<Testimonial[]> {
    let list = publicTestimonials(this.testimonials);
    if (typeof options.minRating === "number") {
      const min = options.minRating;
      list = list.filter((t) => t.overall >= min);
    }
    return orderTestimonials(list);
  }

  async listHomeTestimonials(limit?: number): Promise<Testimonial[]> {
    const list = orderTestimonials(homeTestimonials(this.testimonials));
    return typeof limit === "number" ? list.slice(0, limit) : list;
  }

  async getTestimonialForProject(slug: string): Promise<Testimonial | null> {
    const project = await this.getProjectBySlug(slug);
    const found = testimonialForProject(this.testimonials, project);
    // A published project may link an unpublished testimonial — gate it too.
    if (!found || !isPublic(found)) return null;
    return found;
  }

  async getAggregateRating(): Promise<AggregateRating> {
    return aggregate(this.testimonials);
  }

  async getFacetCounts(filters: PortfolioFilters = {}, search = ""): Promise<FacetCounts> {
    return facetCounts(this.projects, filters, search);
  }

  /** Published project slugs — for sitemap + static generation. */
  async listPublishedSlugs(): Promise<string[]> {
    return publicProjects(this.projects).map((p) => p.slug);
  }
}
