import { beforeEach, describe, expect, it, vi } from "vitest";

const listPublishedSlugs = vi.fn();

vi.mock("@/lib/repositories", () => ({
  getReputationRepository: async () => ({ listPublishedSlugs }),
}));

const { default: sitemap } = await import("./sitemap");

const urls = async () => (await sitemap()).map((entry) => entry.url);

describe("sitemap", () => {
  beforeEach(() => {
    listPublishedSlugs.mockReset();
  });

  it("lists the static routes plus every published project", async () => {
    listPublishedSlugs.mockResolvedValue(["verdant-fields"]);
    const result = await urls();
    expect(result).toContain("https://auxion.xyz/");
    expect(result).toContain("https://auxion.xyz/blog");
    expect(result).toContain("https://auxion.xyz/portfolio/verdant-fields");
  });

  it("SURVIVES a failed database read instead of losing the whole file", async () => {
    // An unguarded await here made sitemap.xml a 500 on any database hiccup,
    // taking the two dozen routes that need no database with it.
    listPublishedSlugs.mockRejectedValue(new Error("portfolio_projects query failed"));
    const result = await urls();
    expect(result).toContain("https://auxion.xyz/");
    expect(result).toContain("https://auxion.xyz/services/brand");
    expect(result.some((u) => u.includes("/portfolio/"))).toBe(false);
  });

  it("lists every published article", async () => {
    listPublishedSlugs.mockResolvedValue([]);
    const result = await urls();
    const { ARTICLES } = await import("@/lib/blog");
    for (const article of ARTICLES) {
      expect(result).toContain(`https://auxion.xyz/blog/${article.slug}`);
    }
  });

  it("never lists a page that carries its own noindex", async () => {
    listPublishedSlugs.mockResolvedValue([]);
    const result = await urls();
    for (const path of ["/legal", "/legal/privacy", "/start", "/recommendation", "/roadmap", "/login"]) {
      expect(result).not.toContain(`https://auxion.xyz${path}`);
    }
  });

  it("emits only auxion.xyz URLs", async () => {
    listPublishedSlugs.mockResolvedValue(["verdant-fields"]);
    for (const url of await urls()) expect(url.startsWith("https://auxion.xyz/")).toBe(true);
  });
});
