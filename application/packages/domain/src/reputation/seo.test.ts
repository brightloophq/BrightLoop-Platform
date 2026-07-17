import { describe, it, expect } from "vitest";
import type { PortfolioProject, Testimonial } from "@brightloop/schema";
import { canonicalUrl, schemaFor, aggregateSchema, SITE_ORIGIN } from "./seo.js";

function project(over: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    id: "p_x",
    slug: "new-greenhouse",
    name: "The New Greenhouse",
    client: "The New Greenhouse",
    industry: "Agriculture",
    size: "Micro (2–10)",
    country: "Jamaica",
    year: 2026,
    services: ["Brand"],
    budget: "$5K–$10K",
    tech: ["Webflow"],
    platform: "Webflow",
    timeline: "7 weeks",
    deliverablesCount: 14,
    completedDate: "2026-05-18",
    projectStatus: "Live",
    publish: "featured",
    featuredOnHome: true,
    awards: [],
    liveUrl: "",
    permissionLivePreview: false,
    tags: ["local", "identity"],
    summary: "",
    challenge: "",
    approach: "",
    heroSlot: "",
    gallerySlots: [],
    media: [],
    metrics: { disclosed: false },
    testimonialId: "t_x",
    seo: { title: "", description: "", ogImage: "" },
    ...over,
  };
}

function testimonial(over: Partial<Testimonial> = {}): Testimonial {
  return {
    id: "t_x",
    projectSlug: "new-greenhouse",
    author: "Kemar Bailey",
    role: "Founder",
    company: "The New Greenhouse",
    country: "Jamaica",
    date: "2026-05-24",
    publish: "public",
    pinned: false,
    featuredOnHome: false,
    avatarSlot: "",
    overall: 5,
    categories: { communication: 5, quality: 5, timeliness: 5, value: 5, professionalism: 5 },
    quote: "They understood what we were building.",
    media: [],
    ...over,
  };
}

describe("canonicalUrl()", () => {
  it("builds portfolio, case-study and testimonials URLs", () => {
    expect(canonicalUrl("portfolio", "new-greenhouse")).toBe(
      "https://brightloop.co/portfolio/new-greenhouse",
    );
    expect(canonicalUrl("case", "new-greenhouse")).toBe(
      "https://brightloop.co/case-studies/new-greenhouse",
    );
    expect(canonicalUrl("testimonials")).toBe("https://brightloop.co/testimonials");
  });

  it("accepts an origin override so previews don't emit prod canonicals", () => {
    expect(canonicalUrl("portfolio", "x", "https://staging.example.com")).toBe(
      "https://staging.example.com/portfolio/x",
    );
  });

  it("defaults to the production origin", () => {
    expect(SITE_ORIGIN).toBe("https://brightloop.co");
  });
});

/* ---- THE INTEGRITY RULE FOR STRUCTURED DATA -------------------------------- */

describe("schemaFor() — never emits schema for unpublished content", () => {
  it("returns null for a draft project", () => {
    expect(schemaFor(project({ publish: "draft" }))).toBeNull();
  });

  it("returns null for a private project", () => {
    expect(schemaFor(project({ publish: "private" }))).toBeNull();
  });

  it("returns null even when a caller passes a published testimonial with a private project", () => {
    // Fail-closed: the function does not trust the caller to have gated.
    expect(schemaFor(project({ publish: "private" }), testimonial({ publish: "featured" }))).toBeNull();
  });

  it("builds CreativeWork for a published project", () => {
    const schema = schemaFor(project({ publish: "public" }));
    expect(schema).toMatchObject({
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      name: "The New Greenhouse — Case Study",
      about: "Agriculture",
      creator: { "@type": "Organization", name: "Auxion" },
      dateCreated: "2026-05-18",
      keywords: "local, identity",
      url: "https://brightloop.co/portfolio/new-greenhouse",
    });
  });

  it("canonical in schema always points at /portfolio/:slug, never /case-studies", () => {
    // /case-studies/:slug is a view of the same record — one canonical.
    expect(schemaFor(project())?.url).toBe("https://brightloop.co/portfolio/new-greenhouse");
  });
});

describe("schemaFor() — nested Review", () => {
  it("attaches a Review from a published testimonial", () => {
    const schema = schemaFor(project(), testimonial({ publish: "public", overall: 5 }));
    expect(schema?.review).toMatchObject({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: 5, bestRating: 5 },
      author: { "@type": "Person", name: "Kemar Bailey" },
      reviewBody: "They understood what we were building.",
    });
  });

  it("REFUSES to attach a rating from a draft testimonial", () => {
    // A published project may link an unpublished review. Emitting its rating
    // would put an unapproved star rating into search results.
    const schema = schemaFor(project(), testimonial({ publish: "draft" }));
    expect(schema).not.toBeNull();
    expect(schema?.review).toBeUndefined();
  });

  it("REFUSES to attach a rating from a private testimonial", () => {
    expect(schemaFor(project(), testimonial({ publish: "private" }))?.review).toBeUndefined();
  });

  it("omits review when no testimonial is linked", () => {
    expect(schemaFor(project({ testimonialId: null }), null)?.review).toBeUndefined();
  });
});

describe("aggregateSchema() — never asserts a rating we don't have", () => {
  it("returns null when there are no published reviews", () => {
    // reviewCount: 0 would be a claim, not an absence.
    expect(aggregateSchema({ count: 0, overall: 0 })).toBeNull();
  });

  it("returns null for a negative count", () => {
    expect(aggregateSchema({ count: -1, overall: 5 })).toBeNull();
  });

  it("builds Organization + AggregateRating from real published reviews", () => {
    expect(aggregateSchema({ count: 5, overall: 4.8 })).toMatchObject({
      "@type": "Organization",
      name: "Auxion",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: 4.8,
        reviewCount: 5,
        bestRating: 5,
        worstRating: 1,
      },
    });
  });

  it("rounds to one decimal rather than implying false precision", () => {
    expect(aggregateSchema({ count: 3, overall: 4.6666666 })?.aggregateRating.ratingValue).toBe(4.7);
  });
});
