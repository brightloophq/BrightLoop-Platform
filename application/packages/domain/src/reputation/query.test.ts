import { describe, it, expect } from "vitest";
import type { PortfolioProject, Testimonial } from "@brightloop/schema";
import {
  isPublic,
  publicProjects,
  publicTestimonials,
  featuredProjects,
  homeTestimonials,
  projectBySlug,
  testimonialForProject,
  disclosedMetrics,
  hasDisclosedMetrics,
  canShowLivePreview,
  query,
  related,
  paginate,
  aggregate,
  avgCategory,
  orderTestimonials,
} from "./query.js";

/* ---- fixtures -------------------------------------------------------------- */

function project(over: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    id: "p_x",
    slug: "x",
    name: "X",
    client: "X Co",
    industry: "Agriculture",
    size: "Micro (2–10)",
    country: "Jamaica",
    year: 2025,
    services: ["Brand"],
    budget: "$5K–$10K",
    tech: ["Webflow"],
    platform: "Webflow",
    timeline: "6 weeks",
    deliverablesCount: 10,
    completedDate: "2025-01-01",
    projectStatus: "Complete",
    publish: "public",
    featuredOnHome: false,
    awards: [],
    liveUrl: "",
    permissionLivePreview: false,
    tags: [],
    summary: "",
    challenge: "",
    approach: "",
    heroSlot: "",
    gallerySlots: [],
    media: [],
    metrics: { disclosed: false },
    testimonialId: null,
    seo: { title: "", description: "", ogImage: "" },
    ...over,
  };
}

function testimonial(over: Partial<Testimonial> = {}): Testimonial {
  return {
    id: "t_x",
    projectSlug: "x",
    author: "A",
    role: "Founder",
    company: "X Co",
    country: "Jamaica",
    date: "2025-01-01",
    publish: "public",
    pinned: false,
    featuredOnHome: false,
    avatarSlot: "",
    overall: 5,
    categories: { communication: 5, quality: 5, timeliness: 5, value: 5, professionalism: 5 },
    quote: "Q",
    media: [],
    ...over,
  };
}

/* ---- THE PUBLISH GATE ------------------------------------------------------ */

describe("publish gate — the core integrity rule", () => {
  it("treats only public and featured as public", () => {
    expect(isPublic({ publish: "public" })).toBe(true);
    expect(isPublic({ publish: "featured" })).toBe(true);
    expect(isPublic({ publish: "draft" })).toBe(false);
    expect(isPublic({ publish: "private" })).toBe(false);
  });

  it("excludes draft and private projects from the public catalogue", () => {
    const list = [
      project({ slug: "pub", publish: "public" }),
      project({ slug: "feat", publish: "featured" }),
      project({ slug: "draft", publish: "draft" }),
      project({ slug: "priv", publish: "private" }),
    ];
    expect(publicProjects(list).map((p) => p.slug)).toEqual(["pub", "feat"]);
  });

  it("excludes draft and private testimonials", () => {
    const list = [
      testimonial({ id: "a", publish: "public" }),
      testimonial({ id: "b", publish: "draft" }),
      testimonial({ id: "c", publish: "private" }),
      testimonial({ id: "d", publish: "featured" }),
    ];
    expect(publicTestimonials(list).map((t) => t.id)).toEqual(["a", "d"]);
  });

  it("cannot be bypassed by ANY filter or search combination", () => {
    const list = [
      project({ slug: "secret", publish: "draft", industry: "Agriculture", tech: ["Webflow"] }),
      project({ slug: "hidden", publish: "private", industry: "Agriculture", tech: ["Webflow"] }),
    ];
    // Filters that would match perfectly if the gate were not applied first.
    expect(query(list, { filters: { industry: ["Agriculture"] } })).toEqual([]);
    expect(query(list, { filters: { tech: ["Webflow"] } })).toEqual([]);
    expect(query(list, { search: "secret" })).toEqual([]);
    expect(query(list, { sort: "az" })).toEqual([]);
    expect(query(list)).toEqual([]);
  });

  it("featuredOnHome does NOT override the publish gate", () => {
    // A draft flagged for home must still never surface publicly.
    const list = [project({ slug: "draft-featured", publish: "draft", featuredOnHome: true })];
    expect(featuredProjects(list)).toEqual([]);
    expect(homeTestimonials([testimonial({ publish: "draft", featuredOnHome: true })])).toEqual([]);
  });

  it("excludes unpublished projects from related()", () => {
    const current = project({ slug: "current", industry: "Agriculture" });
    const list = [
      current,
      project({ slug: "draft-sibling", publish: "draft", industry: "Agriculture" }),
      project({ slug: "ok-sibling", publish: "public", industry: "Agriculture" }),
    ];
    expect(related(list, current).map((p) => p.slug)).toEqual(["ok-sibling"]);
  });

  it("excludes unpublished testimonials from the aggregate rating", () => {
    const list = [
      testimonial({ id: "a", publish: "public", overall: 4 }),
      testimonial({ id: "b", publish: "draft", overall: 1 }),
      testimonial({ id: "c", publish: "private", overall: 1 }),
    ];
    const agg = aggregate(list);
    expect(agg.count).toBe(1);
    expect(agg.overall).toBe(4); // the 1-star drafts must not drag it down
  });
});

/* ---- THE METRIC DISCLOSURE GATE -------------------------------------------- */

describe("metric disclosure gate — never fabricate results", () => {
  it("returns nothing when metrics are undisclosed, even if values exist", () => {
    const p = project({ metrics: { disclosed: false, leadsGenerated: 500, revenueGrowth: 40 } });
    expect(disclosedMetrics(p)).toEqual([]);
    expect(hasDisclosedMetrics(p)).toBe(false);
  });

  it("returns nothing when disclosed but no values supplied", () => {
    // This is the default state of every seeded project.
    const p = project({ metrics: { disclosed: true } });
    expect(disclosedMetrics(p)).toEqual([]);
    expect(hasDisclosedMetrics(p)).toBe(false);
  });

  it("returns only the metrics that were actually supplied", () => {
    const p = project({
      metrics: { disclosed: true, leadsGenerated: 120, timeSaved: "6 hrs/week" },
    });
    const out = disclosedMetrics(p);
    expect(out.map((m) => m.key)).toEqual(["leadsGenerated", "timeSaved"]);
    expect(out[0]?.value).toBe(120);
    expect(out[0]?.label).toBe("Leads Generated");
    expect(out[1]?.value).toBe("6 hrs/week");
  });

  it("treats empty string as absent but keeps a legitimate zero", () => {
    const p = project({ metrics: { disclosed: true, seoLift: "", leadsGenerated: 0 } });
    const out = disclosedMetrics(p);
    expect(out.map((m) => m.key)).toEqual(["leadsGenerated"]);
    expect(out[0]?.value).toBe(0);
  });

  it("gates live-site CTAs on permission AND a real url", () => {
    expect(canShowLivePreview(project({ permissionLivePreview: true, liveUrl: "https://a.co" }))).toBe(
      true,
    );
    // permission but no url
    expect(canShowLivePreview(project({ permissionLivePreview: true, liveUrl: "" }))).toBe(false);
    expect(canShowLivePreview(project({ permissionLivePreview: true, liveUrl: "   " }))).toBe(false);
    // url but no permission
    expect(
      canShowLivePreview(project({ permissionLivePreview: false, liveUrl: "https://a.co" })),
    ).toBe(false);
  });
});

/* ---- search / filter / sort ------------------------------------------------ */

describe("query() — filter semantics", () => {
  const list = [
    project({ slug: "a", industry: "Agriculture", services: ["Brand"], tech: ["Webflow"], year: 2026 }),
    project({ slug: "b", industry: "Hospitality", services: ["Build", "Grow"], tech: ["Shopify"], year: 2025 }),
    project({ slug: "c", industry: "Agriculture", services: ["Grow"], tech: ["Notion"], year: 2024 }),
  ];

  it("ORs within a facet", () => {
    const out = query(list, { filters: { industry: ["Agriculture", "Hospitality"] } });
    expect(out).toHaveLength(3);
  });

  it("ANDs across facets", () => {
    const out = query(list, { filters: { industry: ["Agriculture"], service: ["Grow"] } });
    expect(out.map((p) => p.slug)).toEqual(["c"]);
  });

  it("matches a project if ANY of its services/tech match the facet", () => {
    expect(query(list, { filters: { service: ["Build"] } }).map((p) => p.slug)).toEqual(["b"]);
  });

  it("coerces year filters to numbers", () => {
    expect(query(list, { filters: { year: ["2026"] } }).map((p) => p.slug)).toEqual(["a"]);
  });

  it("ignores empty facet arrays", () => {
    expect(query(list, { filters: { industry: [] } })).toHaveLength(3);
  });
});

describe("query() — search", () => {
  const list = [
    project({ slug: "a", name: "Greenhouse", summary: "urban farming", tags: ["farm-to-table"] }),
    project({ slug: "b", name: "Harbor", client: "Harbor & Co", tech: ["Shopify"] }),
  ];

  it("is case-insensitive substring across the composed haystack", () => {
    expect(query(list, { search: "GREENHOUSE" }).map((p) => p.slug)).toEqual(["a"]);
    expect(query(list, { search: "urban" }).map((p) => p.slug)).toEqual(["a"]);
    expect(query(list, { search: "farm-to-table" }).map((p) => p.slug)).toEqual(["a"]);
    expect(query(list, { search: "shopify" }).map((p) => p.slug)).toEqual(["b"]);
  });

  it("treats a blank query as no search filter", () => {
    expect(query(list, { search: "   " })).toHaveLength(2);
  });

  it("returns empty on no match (drives the EmptyState)", () => {
    expect(query(list, { search: "zzzz" })).toEqual([]);
  });
});

describe("sortProjects via query()", () => {
  const list = [
    project({ slug: "old-featured", publish: "featured", name: "Zeta", completedDate: "2023-01-01" }),
    project({ slug: "new-public", publish: "public", name: "Alpha", completedDate: "2026-01-01" }),
  ];

  it("featured: publish rank first, then recency", () => {
    expect(query(list, { sort: "featured" }).map((p) => p.slug)).toEqual([
      "old-featured",
      "new-public",
    ]);
  });

  it("recent: newest completedDate first", () => {
    expect(query(list, { sort: "recent" }).map((p) => p.slug)).toEqual(["new-public", "old-featured"]);
  });

  it("az: by name", () => {
    expect(query(list, { sort: "az" }).map((p) => p.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("defaults to featured", () => {
    expect(query(list).map((p) => p.slug)).toEqual(["old-featured", "new-public"]);
  });
});

/* ---- pagination ------------------------------------------------------------ */

describe("paginate()", () => {
  const list = Array.from({ length: 20 }, (_, i) => i);

  it("defaults to 9 per page", () => {
    const p = paginate(list);
    expect(p).toMatchObject({ page: 1, pages: 3, total: 20 });
    expect(p.items).toHaveLength(9);
  });

  it("clamps the page into range", () => {
    expect(paginate(list, 99).page).toBe(3);
    expect(paginate(list, -5).page).toBe(1);
  });

  it("handles an empty list without dividing by zero", () => {
    expect(paginate([], 1)).toEqual({ page: 1, pages: 1, total: 0, items: [] });
  });

  it("returns the correct slice", () => {
    expect(paginate(list, 3, 9).items).toEqual([18, 19]);
  });
});

/* ---- ratings --------------------------------------------------------------- */

describe("aggregate()", () => {
  it("returns count 0 with no published reviews (never a fake 0-star score)", () => {
    const agg = aggregate([testimonial({ publish: "draft" })]);
    expect(agg.count).toBe(0);
    expect(agg.overall).toBe(0);
  });

  it("averages overall and each category over published reviews", () => {
    const list = [
      testimonial({
        id: "a",
        overall: 5,
        categories: { communication: 5, quality: 5, timeliness: 5, value: 5, professionalism: 5 },
      }),
      testimonial({
        id: "b",
        overall: 3,
        categories: { communication: 3, quality: 3, timeliness: 3, value: 3, professionalism: 3 },
      }),
    ];
    const agg = aggregate(list);
    expect(agg.count).toBe(2);
    expect(agg.overall).toBe(4);
    expect(agg.cats["communication"]).toBe(4);
  });
});

describe("avgCategory()", () => {
  it("averages the five category ratings", () => {
    const t = testimonial({
      categories: { communication: 5, quality: 5, timeliness: 4, value: 5, professionalism: 5 },
    });
    expect(avgCategory(t)).toBeCloseTo(4.8);
  });
});

describe("orderTestimonials()", () => {
  it("puts pinned first, then most recent", () => {
    const list = [
      testimonial({ id: "recent", date: "2026-01-01" }),
      testimonial({ id: "pinned-old", pinned: true, date: "2020-01-01" }),
      testimonial({ id: "older", date: "2024-01-01" }),
    ];
    expect(orderTestimonials(list).map((t) => t.id)).toEqual(["pinned-old", "recent", "older"]);
  });
});

/* ---- lookups --------------------------------------------------------------- */

describe("lookups", () => {
  it("finds a project by slug and returns null when absent", () => {
    const list = [project({ slug: "a" })];
    expect(projectBySlug(list, "a")?.slug).toBe("a");
    expect(projectBySlug(list, "nope")).toBeNull();
  });

  it("links a testimonial to its project, tolerating a null testimonialId", () => {
    const ts = [testimonial({ id: "t_1" })];
    expect(testimonialForProject(ts, project({ testimonialId: "t_1" }))?.id).toBe("t_1");
    expect(testimonialForProject(ts, project({ testimonialId: null }))).toBeNull();
    expect(testimonialForProject(ts, null)).toBeNull();
  });
});
