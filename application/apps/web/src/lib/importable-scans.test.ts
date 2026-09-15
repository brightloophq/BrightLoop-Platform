import { describe, expect, it } from "vitest";
import { businessKeyFor, newestPerBusiness } from "./importable-scans";

const scan = (
  id: string,
  completedAt: string | null,
  websiteUrl: string | null = "https://auxion.xyz",
  businessName: string | null = null,
) => ({ id, label: businessName ?? websiteUrl ?? id, completedAt, websiteUrl, businessName });

describe("businessKeyFor", () => {
  it("prefers the operator-typed business name", () => {
    expect(businessKeyFor({ id: "a", businessName: "Auxion", websiteUrl: "https://x.test" }))
      .toBe("name:auxion");
  });

  it("treats a name as the same business regardless of case or padding", () => {
    expect(businessKeyFor({ id: "a", businessName: " Auxion ", websiteUrl: null }))
      .toBe(businessKeyFor({ id: "b", businessName: "auxion", websiteUrl: null }));
  });

  it("falls back to the host, ignoring www, scheme and path", () => {
    const bare = businessKeyFor({ id: "a", businessName: null, websiteUrl: "https://auxion.xyz" });
    expect(businessKeyFor({ id: "b", businessName: null, websiteUrl: "https://www.auxion.xyz/services" })).toBe(bare);
    expect(businessKeyFor({ id: "c", businessName: null, websiteUrl: "auxion.xyz" })).toBe(bare);
  });

  it("keeps different sites apart", () => {
    expect(businessKeyFor({ id: "a", businessName: null, websiteUrl: "https://auxion.xyz" }))
      .not.toBe(businessKeyFor({ id: "b", businessName: null, websiteUrl: "https://zeevents.com" }));
  });

  /** Collapsing two unrelated scans is worse than showing a duplicate-looking row. */
  it("keys on the scan's own id when it identifies no business", () => {
    expect(businessKeyFor({ id: "scn_1", businessName: null, websiteUrl: null })).toBe("scan:scn_1");
    expect(businessKeyFor({ id: "scn_2", businessName: null, websiteUrl: null })).toBe("scan:scn_2");
  });
});

describe("newestPerBusiness", () => {
  it("offers only the newest scan of a business", () => {
    const picked = newestPerBusiness([
      scan("older", "2026-09-14T09:00:00Z"),
      scan("newest", "2026-09-15T10:00:00Z"),
      scan("middle", "2026-09-14T18:00:00Z"),
    ]);
    expect(picked.map((s) => s.id)).toEqual(["newest"]);
  });

  /** The case a date alone could not resolve: two scans on one day. */
  it("picks the later of two scans run on the same day", () => {
    const picked = newestPerBusiness([
      scan("morning", "2026-09-14T09:00:00Z"),
      scan("evening", "2026-09-14T21:30:00Z"),
    ]);
    expect(picked.map((s) => s.id)).toEqual(["evening"]);
  });

  it("keeps one entry per business, newest business first", () => {
    const picked = newestPerBusiness([
      scan("aux-old", "2026-09-14T09:00:00Z"),
      scan("zee", "2026-09-13T09:00:00Z", "https://zeevents.com"),
      scan("aux-new", "2026-09-15T09:00:00Z"),
    ]);
    expect(picked.map((s) => s.id)).toEqual(["aux-new", "zee"]);
  });

  it("never lets an undated scan outrank a dated one", () => {
    const picked = newestPerBusiness([
      scan("undated", null),
      scan("dated", "2026-09-10T09:00:00Z"),
    ]);
    expect(picked.map((s) => s.id)).toEqual(["dated"]);
  });

  it("still offers an undated scan when it is all there is", () => {
    expect(newestPerBusiness([scan("only", null)]).map((s) => s.id)).toEqual(["only"]);
  });

  it("does not mutate what it is given", () => {
    const input = [scan("a", "2026-09-14T09:00:00Z"), scan("b", "2026-09-15T09:00:00Z")];
    const order = input.map((s) => s.id);
    newestPerBusiness(input);
    expect(input.map((s) => s.id)).toEqual(order);
  });

  it("returns nothing for nothing", () => {
    expect(newestPerBusiness([])).toEqual([]);
  });
});
