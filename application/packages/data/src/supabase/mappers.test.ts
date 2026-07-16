import { describe, it, expect } from "vitest";
import type { Tables } from "@brightloop/db";
import { toPortfolioProject, toTestimonial } from "./mappers.js";

function projectRow(over: Partial<Tables<"portfolio_projects">> = {}): Tables<"portfolio_projects"> {
  return {
    id: "p_x",
    slug: "x",
    name: "X",
    client: "X Co",
    industry: "Agriculture",
    size: "Micro",
    country: "Jamaica",
    year: 2026,
    services: ["Brand"],
    budget: "$5K–$10K",
    tech: ["Webflow"],
    platform: "Webflow",
    timeline: "7 weeks",
    deliverables_count: 14,
    completed_date: "2026-05-18",
    project_status: "Live",
    publish: "public",
    featured_on_home: false,
    awards: [],
    live_url: "",
    permission_live_preview: false,
    tags: [],
    summary: "",
    challenge: "",
    approach: "",
    hero_slot: "",
    gallery_slots: [],
    media: [],
    metrics: { disclosed: false },
    testimonial_id: null,
    seo: {},
    order: 0,
    scheduled_publish_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as Tables<"portfolio_projects">;
}

describe("toPortfolioProject — snake_case → camelCase", () => {
  it("maps every renamed column", () => {
    const p = toPortfolioProject(
      projectRow({
        deliverables_count: 19,
        featured_on_home: true,
        live_url: "https://a.co",
        permission_live_preview: true,
        hero_slot: "hero-1",
        gallery_slots: ["g1", "g2"],
        testimonial_id: "t_1",
        completed_date: "2025-11-02",
        project_status: "Complete",
      }),
    );
    expect(p.deliverablesCount).toBe(19);
    expect(p.featuredOnHome).toBe(true);
    expect(p.liveUrl).toBe("https://a.co");
    expect(p.permissionLivePreview).toBe(true);
    expect(p.heroSlot).toBe("hero-1");
    expect(p.gallerySlots).toEqual(["g1", "g2"]);
    expect(p.testimonialId).toBe("t_1");
    expect(p.completedDate).toBe("2025-11-02");
    expect(p.projectStatus).toBe("Complete");
  });

  it("maps null completed_date to an empty string, not 'null'", () => {
    expect(toPortfolioProject(projectRow({ completed_date: null })).completedDate).toBe("");
  });
});

/* ---- THE INTEGRITY-CRITICAL PART -------------------------------------------- */

describe("metrics mapping — unknown must never read as disclosed", () => {
  it("defaults disclosed to false when metrics is null", () => {
    expect(toPortfolioProject(projectRow({ metrics: null })).metrics).toEqual({ disclosed: false });
  });

  it("defaults disclosed to false when metrics is malformed", () => {
    // A blob we cannot parse is NOT "the client approved these numbers".
    expect(toPortfolioProject(projectRow({ metrics: "garbage" })).metrics.disclosed).toBe(false);
    expect(toPortfolioProject(projectRow({ metrics: 42 })).metrics.disclosed).toBe(false);
    expect(toPortfolioProject(projectRow({ metrics: [] })).metrics.disclosed).toBe(false);
  });

  it("defaults disclosed to false when the key is absent", () => {
    expect(toPortfolioProject(projectRow({ metrics: { leadsGenerated: 500 } })).metrics.disclosed).toBe(
      false,
    );
  });

  it("treats any non-true value as NOT disclosed", () => {
    // "true", 1, "yes" must not be coerced into a disclosure.
    for (const v of ["true", 1, "yes", {}] as unknown[]) {
      expect(
        toPortfolioProject(projectRow({ metrics: { disclosed: v } as never })).metrics.disclosed,
        `disclosed: ${JSON.stringify(v)}`,
      ).toBe(false);
    }
  });

  it("honours a genuine disclosure with real values", () => {
    const m = toPortfolioProject(
      projectRow({ metrics: { disclosed: true, leadsGenerated: 120, timeSaved: "6 hrs/week" } }),
    ).metrics;
    expect(m).toEqual({ disclosed: true, leadsGenerated: 120, timeSaved: "6 hrs/week" });
  });

  it("drops metric values of the wrong type rather than coercing them", () => {
    const m = toPortfolioProject(
      projectRow({ metrics: { disclosed: true, leadsGenerated: "lots", revenueGrowth: 40 } }),
    ).metrics;
    expect(m.leadsGenerated).toBeUndefined();
    expect(m.revenueGrowth).toBe(40);
  });
});

describe("defensive jsonb coercion — a bad row must not 500 a public page", () => {
  it("collapses malformed arrays to []", () => {
    const p = toPortfolioProject(
      projectRow({ services: "Brand", tech: null, tags: 42, gallery_slots: {} } as never),
    );
    expect(p.services).toEqual([]);
    expect(p.tech).toEqual([]);
    expect(p.tags).toEqual([]);
    expect(p.gallerySlots).toEqual([]);
  });

  it("keeps only string entries in string arrays", () => {
    expect(toPortfolioProject(projectRow({ services: ["Brand", 1, null, "Grow"] as never })).services).toEqual(
      ["Brand", "Grow"],
    );
  });

  it("drops media entries missing kind or label", () => {
    const p = toPortfolioProject(
      projectRow({
        media: [
          { kind: "image", label: "Ok", slot: "s1" },
          { kind: "image" },
          { label: "no kind" },
          "nonsense",
          null,
        ] as never,
      }),
    );
    expect(p.media).toEqual([{ kind: "image", label: "Ok", slot: "s1" }]);
  });

  it("fills missing seo fields with empty strings", () => {
    expect(toPortfolioProject(projectRow({ seo: null })).seo).toEqual({
      title: "",
      description: "",
      ogImage: "",
    });
  });
});

describe("toTestimonial", () => {
  const row = {
    id: "t_x",
    project_slug: "x",
    author: "A",
    role: "Founder",
    company: "X Co",
    country: "Jamaica",
    date: "2026-05-24",
    publish: "featured",
    pinned: true,
    featured_on_home: true,
    avatar_slot: "av-1",
    overall: 5,
    categories: { communication: 5, quality: 5, timeliness: 4, value: 5, professionalism: 5 },
    quote: "Q",
    media: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as Tables<"testimonials">;

  it("maps renamed columns", () => {
    const t = toTestimonial(row);
    expect(t.projectSlug).toBe("x");
    expect(t.featuredOnHome).toBe(true);
    expect(t.avatarSlot).toBe("av-1");
    expect(t.pinned).toBe(true);
    expect(t.publish).toBe("featured");
  });

  it("maps a null project_slug to empty string", () => {
    expect(toTestimonial({ ...row, project_slug: null }).projectSlug).toBe("");
  });

  it("fills missing category ratings with 0 rather than undefined", () => {
    // avgCategory()/aggregate() do arithmetic on these — undefined would produce NaN.
    const t = toTestimonial({ ...row, categories: { communication: 5 } as never });
    expect(t.categories).toEqual({
      communication: 5,
      quality: 0,
      timeliness: 0,
      value: 0,
      professionalism: 0,
    });
    expect(Number.isNaN(t.categories.quality)).toBe(false);
  });

  it("survives a malformed categories blob", () => {
    expect(toTestimonial({ ...row, categories: null }).categories.communication).toBe(0);
  });
});
