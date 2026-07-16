/* =============================================================================
 * SupabaseReputationRepository — the production implementation of the port.
 *
 * ██ THE PUBLISH GATE IS ENFORCED TWICE ██
 *   1. DATABASE (the real boundary): RLS on portfolio_projects/testimonials
 *      returns only publish ∈ {public, featured} to anon/authenticated. Proven
 *      against the live DB: a crafted `?publish=eq.draft` returns []. This
 *      repository CANNOT receive an unpublished row, whatever it asks for.
 *   2. THIS LAYER: results still pass through the same pure functions the
 *      placeholder repository uses (`query`, `featuredProjects`, `aggregate` …),
 *      which re-apply `isPublic()`. Belt and braces — and it means the two
 *      implementations cannot drift in behaviour, because they share the logic.
 *
 * ██ WHY FETCH-THEN-FILTER RATHER THAN SQL FILTERS ██
 *   Filtering happens in the domain's pure functions rather than PostgREST.
 *   That is a deliberate, temporary choice:
 *     * it guarantees IDENTICAL semantics to the placeholder repo (OR within a
 *       facet, AND across facets, the composed-haystack search) — semantics that
 *       are covered by 91 domain tests. Re-expressing them in PostgREST `or=`
 *       filters would be a second implementation to keep in sync, and a subtle
 *       difference there is exactly how a draft leaks;
 *     * the publish gate is applied by RLS *before* rows arrive, so the fetched
 *       set is already only published rows.
 *   Handoff §10.2 says to move to server-side pagination + indexed filters "when
 *   the dataset grows". At that point, port the facet filters to SQL and keep
 *   the pure functions as the test oracle. This is fine for tens of projects;
 *   it is not fine for thousands.
 *
 * ██ CLIENT LIFETIME ██
 *   The SupabaseClient is injected per request and NEVER cached across requests
 *   — it carries the caller's session cookies. A module-level singleton would
 *   serve one user's session to another.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@brightloop/db";
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
import { toPortfolioProject, toTestimonial } from "./mappers.js";

export type BrightLoopSupabaseClient = SupabaseClient<Database>;

export class SupabaseReputationRepository implements ReputationRepository {
  readonly source: DataSource = "supabase";

  constructor(private readonly client: BrightLoopSupabaseClient) {}

  /**
   * All rows RLS is willing to hand us. Because the publish policy only exposes
   * public|featured to anon/authenticated, this is already publish-gated at the
   * database — we do not (and cannot) ask for drafts.
   */
  private async allProjects(): Promise<PortfolioProject[]> {
    const { data, error } = await this.client
      .from("portfolio_projects")
      .select("*")
      .order("order", { ascending: true });

    // Fail loudly. A silent [] would render "no published projects yet" and look
    // like an empty CMS rather than a broken database.
    if (error) throw new Error(`portfolio_projects query failed: ${error.message}`);
    return (data ?? []).map(toPortfolioProject);
  }

  private async allTestimonials(): Promise<Testimonial[]> {
    const { data, error } = await this.client.from("testimonials").select("*");
    if (error) throw new Error(`testimonials query failed: ${error.message}`);
    return (data ?? []).map(toTestimonial);
  }

  async listProjects(q: PortfolioQuery = {}): Promise<Page<PortfolioProject>> {
    const { page = 1, perPage = 9, ...options } = q;
    const list = query(await this.allProjects(), options);
    return paginate(list, page, perPage);
  }

  async getProjectBySlug(slug: string): Promise<PortfolioProject | null> {
    const { data, error } = await this.client
      .from("portfolio_projects")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(`portfolio_projects lookup failed: ${error.message}`);
    if (!data) return null;

    const project = toPortfolioProject(data);
    // RLS already excluded unpublished rows; re-assert so an unpublished slug is
    // indistinguishable from a missing one even if a policy were ever loosened.
    return isPublic(project) ? project : null;
  }

  async listFeaturedProjects(limit?: number): Promise<PortfolioProject[]> {
    const list = featuredProjects(await this.allProjects());
    return typeof limit === "number" ? list.slice(0, limit) : list;
  }

  async listRelatedProjects(slug: string, limit = 3): Promise<PortfolioProject[]> {
    const projects = await this.allProjects();
    const current = projectBySlug(projects, slug);
    return related(projects, current && isPublic(current) ? current : null, limit);
  }

  async listTestimonials(options: { minRating?: number } = {}): Promise<Testimonial[]> {
    let list = await this.allTestimonials();
    if (typeof options.minRating === "number") {
      const min = options.minRating;
      list = list.filter((t) => t.overall >= min);
    }
    return orderTestimonials(list.filter(isPublic));
  }

  async listHomeTestimonials(limit?: number): Promise<Testimonial[]> {
    const list = orderTestimonials(homeTestimonials(await this.allTestimonials()));
    return typeof limit === "number" ? list.slice(0, limit) : list;
  }

  async getTestimonialForProject(slug: string): Promise<Testimonial | null> {
    const project = await this.getProjectBySlug(slug);
    if (!project) return null;
    const found = testimonialForProject(await this.allTestimonials(), project);
    return found && isPublic(found) ? found : null;
  }

  async getAggregateRating(): Promise<AggregateRating> {
    return aggregate(await this.allTestimonials());
  }

  async getFacetCounts(filters: PortfolioFilters = {}, search = ""): Promise<FacetCounts> {
    return facetCounts(await this.allProjects(), filters, search);
  }

  async listPublishedSlugs(): Promise<string[]> {
    return publicProjects(await this.allProjects()).map((p) => p.slug);
  }
}
