import { describe, it, expect } from "vitest";
import { PlaceholderReputationRepository } from "./reputation.repository.js";
import { PLACEHOLDER_PROJECTS, PLACEHOLDER_TESTIMONIALS } from "./reputation.dataset.js";

const repo = new PlaceholderReputationRepository();

/* ---- The publish gate at the repository boundary ---------------------------- */

describe("PlaceholderReputationRepository — publish gate", () => {
  it("never returns the private northwind-supply project from listProjects", async () => {
    // Sanity: the fixture really is in the dataset and really is private.
    const raw = PLACEHOLDER_PROJECTS.find((p) => p.slug === "northwind-supply");
    expect(raw?.publish).toBe("private");

    const page = await repo.listProjects({ perPage: 100 });
    expect(page.items.map((p) => p.slug)).not.toContain("northwind-supply");
  });

  it("never returns an unpublished project by direct slug access", async () => {
    // An unpublished slug must be indistinguishable from a missing one.
    expect(await repo.getProjectBySlug("northwind-supply")).toBeNull();
    expect(await repo.getProjectBySlug("does-not-exist")).toBeNull();
  });

  it("cannot be coaxed into leaking a private project via filters or search", async () => {
    const bySearch = await repo.listProjects({ search: "Northwind", perPage: 100 });
    expect(bySearch.items).toHaveLength(0);

    const byIndustry = await repo.listProjects({
      filters: { industry: ["Retail & E-commerce"] },
      perPage: 100,
    });
    expect(byIndustry.items.map((p) => p.slug)).not.toContain("northwind-supply");

    const byTech = await repo.listProjects({ filters: { tech: ["Shopify Plus"] }, perPage: 100 });
    expect(byTech.items.map((p) => p.slug)).not.toContain("northwind-supply");
  });

  it("excludes unpublished projects from featured and related", async () => {
    const featured = await repo.listFeaturedProjects();
    expect(featured.map((p) => p.slug)).not.toContain("northwind-supply");

    const rel = await repo.listRelatedProjects("harbor-and-co", 10);
    expect(rel.map((p) => p.slug)).not.toContain("northwind-supply");
  });

  it("returns only published projects from every list method", async () => {
    const page = await repo.listProjects({ perPage: 100 });
    for (const p of page.items) expect(["public", "featured"]).toContain(p.publish);

    for (const p of await repo.listFeaturedProjects()) {
      expect(["public", "featured"]).toContain(p.publish);
    }
  });

  it("returns only published testimonials", async () => {
    for (const t of await repo.listTestimonials()) {
      expect(["public", "featured"]).toContain(t.publish);
    }
    for (const t of await repo.listHomeTestimonials()) {
      expect(["public", "featured"]).toContain(t.publish);
      expect(t.featuredOnHome).toBe(true);
    }
  });

  it("gates a testimonial whose parent project is unpublished", async () => {
    expect(await repo.getTestimonialForProject("northwind-supply")).toBeNull();
  });

  it("gates an unpublished testimonial even when its project is published", async () => {
    const scoped = new PlaceholderReputationRepository({
      projects: PLACEHOLDER_PROJECTS.filter((p) => p.slug === "harbor-and-co"),
      testimonials: PLACEHOLDER_TESTIMONIALS.map((t) =>
        t.id === "t_harbor" ? { ...t, publish: "draft" as const } : t,
      ),
    });
    expect(await scoped.getTestimonialForProject("harbor-and-co")).toBeNull();
  });
});

/* ---- The integrity posture of the seeded dataset --------------------------- */

describe("placeholder dataset integrity", () => {
  it("discloses NO business results on any project", async () => {
    // The seeded content must never claim a result. If this fails, someone has
    // added a fabricated metric to the placeholder data.
    for (const p of PLACEHOLDER_PROJECTS) {
      expect(p.metrics.disclosed, `${p.slug} must not disclose metrics`).toBe(false);
    }
  });

  it("is reported as placeholder, not real data", () => {
    expect(repo.source).toBe("placeholder");
  });
});

/* ---- Behaviour -------------------------------------------------------------- */

describe("PlaceholderReputationRepository — behaviour", () => {
  it("paginates with a default page size of 9", async () => {
    const page = await repo.listProjects();
    expect(page.page).toBe(1);
    expect(page.items.length).toBeLessThanOrEqual(9);
    // 6 seeded projects, 1 private → 5 public.
    expect(page.total).toBe(5);
  });

  it("returns a published project by slug", async () => {
    const p = await repo.getProjectBySlug("verdant-fields");
    expect(p?.name).toBe("Verdant Fields Co.");
  });

  it("orders home testimonials pinned-first", async () => {
    const list = await repo.listHomeTestimonials();
    expect(list[0]?.pinned).toBe(true);
  });

  it("respects a limit on featured projects", async () => {
    expect(await repo.listFeaturedProjects(2)).toHaveLength(2);
  });

  it("filters testimonials by minimum rating", async () => {
    const list = await repo.listTestimonials({ minRating: 5 });
    for (const t of list) expect(t.overall).toBeGreaterThanOrEqual(5);
    // The 4-star Verdant review is excluded.
    expect(list.map((t) => t.id)).not.toContain("t_verdant");
  });

  it("computes the aggregate over published testimonials only", async () => {
    const agg = await repo.getAggregateRating();
    expect(agg.count).toBe(PLACEHOLDER_TESTIMONIALS.length); // all 5 are published
    expect(agg.overall).toBeGreaterThan(4);
    expect(agg.overall).toBeLessThanOrEqual(5);
  });

  it("excludes the current project from its own related list", async () => {
    const rel = await repo.listRelatedProjects("verdant-fields");
    expect(rel.map((p) => p.slug)).not.toContain("verdant-fields");
  });

  it("lists only published slugs", async () => {
    const slugs = await repo.listPublishedSlugs();
    expect(slugs).not.toContain("northwind-supply");
    expect(slugs).toContain("verdant-fields");
  });
});
