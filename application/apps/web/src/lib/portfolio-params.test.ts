import { describe, it, expect } from "vitest";
import {
  parseFilters,
  parseSearch,
  parseSort,
  parsePage,
  parsePortfolioParams,
  buildPortfolioQuery,
  portfolioHref,
  toggleFacetValue,
  clearAllFilters,
  DEFAULT_SORT,
} from "./portfolio-params";

describe("parseFilters() — validates against the controlled vocabulary", () => {
  it("parses a comma-separated facet", () => {
    expect(parseFilters({ industry: "Agriculture,Hospitality" })).toEqual({
      industry: ["Agriculture", "Hospitality"],
    });
  });

  it("DISCARDS values not in the vocabulary (a crafted URL cannot inject a filter)", () => {
    expect(parseFilters({ industry: "Agriculture,Atlantis" })).toEqual({
      industry: ["Agriculture"],
    });
    expect(parseFilters({ industry: "Atlantis" })).toEqual({});
  });

  it("ignores unknown facet names entirely", () => {
    expect(parseFilters({ publish: "private", secret: "yes" })).toEqual({});
  });

  it("de-duplicates repeated values", () => {
    expect(parseFilters({ service: "Brand,Brand,Grow" })).toEqual({ service: ["Brand", "Grow"] });
  });

  it("trims whitespace and drops empties", () => {
    expect(parseFilters({ service: " Brand , , Grow " })).toEqual({ service: ["Brand", "Grow"] });
  });

  it("handles repeated query keys by taking the first", () => {
    expect(parseFilters({ industry: ["Agriculture", "Hospitality"] })).toEqual({
      industry: ["Agriculture"],
    });
  });

  it("parses numeric year values against the vocab", () => {
    expect(parseFilters({ year: "2026,2025" })).toEqual({ year: ["2026", "2025"] });
    expect(parseFilters({ year: "1999" })).toEqual({});
  });

  it("returns empty for no params", () => {
    expect(parseFilters({})).toEqual({});
  });
});

describe("parseSearch()", () => {
  it("reads q", () => {
    expect(parseSearch({ q: "greenhouse" })).toBe("greenhouse");
  });

  it("defaults to empty", () => {
    expect(parseSearch({})).toBe("");
  });

  it("caps absurd lengths", () => {
    expect(parseSearch({ q: "x".repeat(500) })).toHaveLength(100);
  });
});

describe("parseSort()", () => {
  it("accepts the known orders", () => {
    expect(parseSort({ sort: "recent" })).toBe("recent");
    expect(parseSort({ sort: "az" })).toBe("az");
    expect(parseSort({ sort: "featured" })).toBe("featured");
  });

  it("falls back to the default for anything else", () => {
    expect(parseSort({ sort: "; DROP TABLE" })).toBe(DEFAULT_SORT);
    expect(parseSort({})).toBe(DEFAULT_SORT);
  });
});

describe("parsePage()", () => {
  it("parses a positive page", () => {
    expect(parsePage({ page: "3" })).toBe(3);
  });

  it("guards zero, negatives and nonsense", () => {
    expect(parsePage({ page: "0" })).toBe(1);
    expect(parsePage({ page: "-5" })).toBe(1);
    expect(parsePage({ page: "banana" })).toBe(1);
    expect(parsePage({})).toBe(1);
  });
});

describe("buildPortfolioQuery() — round-trips and omits defaults", () => {
  it("omits defaults for a clean canonical URL", () => {
    expect(buildPortfolioQuery({ sort: "featured", page: 1, search: "", filters: {} })).toBe("");
    expect(portfolioHref({})).toBe("/portfolio");
  });

  it("serializes filters, search, sort and page", () => {
    const qs = buildPortfolioQuery({
      filters: { industry: ["Agriculture", "Hospitality"], service: ["Brand"] },
      search: "farm",
      sort: "recent",
      page: 2,
    });
    expect(qs).toContain("industry=Agriculture%2CHospitality");
    expect(qs).toContain("service=Brand");
    expect(qs).toContain("q=farm");
    expect(qs).toContain("sort=recent");
    expect(qs).toContain("page=2");
  });

  it("round-trips through parse", () => {
    const state = {
      filters: { industry: ["Agriculture"], tech: ["Webflow", "Notion"] },
      search: "farm",
      sort: "az" as const,
      page: 3,
    };
    const qs = buildPortfolioQuery(state);
    const params = Object.fromEntries(new URLSearchParams(qs.slice(1)));
    expect(parsePortfolioParams(params)).toEqual(state);
  });
});

describe("toggleFacetValue()", () => {
  const base = { filters: {}, search: "", sort: DEFAULT_SORT, page: 3 };

  it("adds a value and resets to page 1", () => {
    const next = toggleFacetValue(base, "industry", "Agriculture");
    expect(next.filters.industry).toEqual(["Agriculture"]);
    // Otherwise you land on page 3 of a 1-page result and see an empty grid.
    expect(next.page).toBe(1);
  });

  it("removes an already-selected value", () => {
    const state = { ...base, filters: { industry: ["Agriculture", "Hospitality"] } };
    expect(toggleFacetValue(state, "industry", "Agriculture").filters.industry).toEqual([
      "Hospitality",
    ]);
  });

  it("deletes the facet key entirely when the last value is removed", () => {
    const state = { ...base, filters: { industry: ["Agriculture"] } };
    const next = toggleFacetValue(state, "industry", "Agriculture");
    expect(next.filters).toEqual({});
    expect(buildPortfolioQuery(next)).toBe("");
  });

  it("does not mutate the input state", () => {
    const state = { ...base, filters: { industry: ["Agriculture"] } };
    toggleFacetValue(state, "industry", "Hospitality");
    expect(state.filters.industry).toEqual(["Agriculture"]);
  });
});

describe("clearAllFilters()", () => {
  it("clears filters and search, resets page, keeps sort", () => {
    const next = clearAllFilters({
      filters: { industry: ["Agriculture"] },
      search: "farm",
      sort: "az",
      page: 4,
    });
    expect(next).toEqual({ filters: {}, search: "", sort: "az", page: 1 });
  });
});
