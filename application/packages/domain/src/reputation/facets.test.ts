import { describe, it, expect } from "vitest";
import type { PortfolioProject } from "@brightloop/schema";
import { facetCounts, activeFilterChips, FACET_ORDER } from "./facets.js";

function project(over: Partial<PortfolioProject> = {}): PortfolioProject {
  return {
    id: "p",
    slug: "s",
    name: "N",
    client: "C",
    industry: "Agriculture",
    size: "Micro (2–10)",
    country: "Jamaica",
    year: 2025,
    services: ["Brand"],
    budget: "$5K–$10K",
    tech: ["Webflow"],
    platform: "Webflow",
    timeline: "",
    deliverablesCount: 0,
    completedDate: "2025-01-01",
    projectStatus: "",
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

const countOf = (
  counts: ReturnType<typeof facetCounts>,
  facet: "industry" | "service" | "tech" | "country",
  value: string,
) => counts[facet].find((o) => o.value === value)?.count;

describe("facetCounts() — publish gate", () => {
  it("never counts unpublished projects", () => {
    const list = [
      project({ slug: "a", industry: "Agriculture", publish: "public" }),
      project({ slug: "b", industry: "Agriculture", publish: "draft" }),
      project({ slug: "c", industry: "Agriculture", publish: "private" }),
    ];
    // A facet count must not reveal that a private project exists.
    expect(countOf(facetCounts(list), "industry", "Agriculture")).toBe(1);
  });

  it("returns zero counts rather than omitting vocabulary values", () => {
    const counts = facetCounts([project({ industry: "Agriculture" })]);
    // Controlled vocab: the option still exists, with a 0 count.
    expect(countOf(counts, "industry", "Hospitality")).toBe(0);
  });
});

describe("facetCounts() — counts against OTHER filters, not its own", () => {
  const list = [
    project({ slug: "a", industry: "Agriculture", services: ["Brand"] }),
    project({ slug: "b", industry: "Hospitality", services: ["Brand"] }),
    project({ slug: "c", industry: "Hospitality", services: ["Grow"] }),
  ];

  it("leaves its own facet open so counts answer 'what if I tick this?'", () => {
    // Filtering industry=Agriculture must NOT collapse the industry counts to
    // only Agriculture — the user still needs to see Hospitality is available.
    const counts = facetCounts(list, { industry: ["Agriculture"] });
    expect(countOf(counts, "industry", "Agriculture")).toBe(1);
    expect(countOf(counts, "industry", "Hospitality")).toBe(2);
  });

  it("applies other facets when counting", () => {
    // With service=Brand active, Hospitality should count only project b.
    const counts = facetCounts(list, { service: ["Brand"] });
    expect(countOf(counts, "industry", "Hospitality")).toBe(1);
    expect(countOf(counts, "industry", "Agriculture")).toBe(1);
  });

  it("applies the search term to counts", () => {
    const searchable = [
      project({ slug: "a", name: "Greenhouse", industry: "Agriculture" }),
      project({ slug: "b", name: "Harbor", industry: "Hospitality" }),
    ];
    const counts = facetCounts(searchable, {}, "greenhouse");
    expect(countOf(counts, "industry", "Agriculture")).toBe(1);
    expect(countOf(counts, "industry", "Hospitality")).toBe(0);
  });

  it("counts array-valued facets by membership", () => {
    const multi = [project({ services: ["Brand", "Build", "Grow"], tech: ["Webflow", "Notion"] })];
    const counts = facetCounts(multi);
    expect(countOf(counts, "service", "Brand")).toBe(1);
    expect(countOf(counts, "service", "Build")).toBe(1);
    expect(countOf(counts, "service", "Automate")).toBe(0);
    expect(countOf(counts, "tech", "Notion")).toBe(1);
  });

  it("coerces numeric year values to strings", () => {
    const counts = facetCounts([project({ year: 2026 })]);
    expect(counts.year.find((o) => o.value === "2026")?.count).toBe(1);
  });
});

describe("activeFilterChips()", () => {
  it("flattens active filters into removable chips, grouped by facet", () => {
    expect(activeFilterChips({ industry: ["Agriculture", "Hospitality"], service: ["Brand"] })).toEqual([
      { facet: "industry", value: "Agriculture" },
      { facet: "industry", value: "Hospitality" },
      { facet: "service", value: "Brand" },
    ]);
  });

  it("is empty when nothing is filtered", () => {
    expect(activeFilterChips({})).toEqual([]);
  });

  it("coerces year numbers to strings", () => {
    expect(activeFilterChips({ year: [2026] })).toEqual([{ facet: "year", value: "2026" }]);
  });
});

describe("FACET_ORDER", () => {
  it("lists every facet exactly once", () => {
    expect(new Set(FACET_ORDER).size).toBe(FACET_ORDER.length);
    expect(FACET_ORDER).toHaveLength(7);
  });
});
