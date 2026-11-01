import { describe, expect, it } from "vitest";
import { ARTICLES, articleBySlug, articleWordCount, articlesNewestFirst, openingParagraph, readingMinutes } from "./blog";

describe("articles", () => {
  it("publishes at least one, because an empty index is worse than no index", () => {
    expect(ARTICLES.length).toBeGreaterThan(0);
  });

  it("gives every article a unique slug", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses URL-safe slugs", () => {
    for (const article of ARTICLES) expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("dates every article with a real, parseable day", () => {
    for (const article of ARTICLES) {
      expect(article.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${article.publishedAt}T00:00:00Z`))).toBe(false);
    }
  });

  it("carries enough substance to be worth publishing", () => {
    // A "blog" of four-line posts is the thin content base a scan already
    // flags; the point of writing was to have something to say.
    for (const article of ARTICLES) expect(articleWordCount(article)).toBeGreaterThan(500);
  });

  it("summarises every article for the index and the meta description", () => {
    for (const article of ARTICLES) {
      expect(article.summary.trim().length).toBeGreaterThan(40);
      expect(article.summary.length).toBeLessThanOrEqual(300);
    }
  });

  it("starts each article with prose, not a bare heading", () => {
    for (const article of ARTICLES) expect(article.body[0]!.kind).toBe("paragraph");
  });

  it("never renders an empty block", () => {
    for (const article of ARTICLES) {
      for (const block of article.body) {
        if (block.kind === "list") expect((block.items ?? []).length).toBeGreaterThan(0);
        else expect((block.text ?? "").trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("orders the index newest first", () => {
    const dates = articlesNewestFirst().map((a) => a.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("resolves a slug, and refuses one it does not have", () => {
    expect(articleBySlug(ARTICLES[0]!.slug)?.title).toBe(ARTICLES[0]!.title);
    expect(articleBySlug("not-an-article")).toBeNull();
  });

  it("has a standfirst for every article on the index", () => {
    for (const article of ARTICLES) {
      const opening = openingParagraph(article);
      expect(opening.length).toBeGreaterThan(80);
      expect(opening).toBe(article.body[0]!.text);
    }
  });

  it("never reports a reading time of zero", () => {
    for (const article of ARTICLES) expect(readingMinutes(article)).toBeGreaterThanOrEqual(1);
  });
});
