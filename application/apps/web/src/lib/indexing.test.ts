import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

/* =============================================================================
 * Indexing guards.
 *
 * The site was `noindex` at the root layout for its whole life, and /portal,
 * /admin and /workspace inherited that single line rather than declaring
 * anything of their own. Turning the public site on therefore removed the only
 * thing keeping the private surfaces out of a search index — the exact class of
 * change that is invisible in review and expensive afterwards.
 *
 * These read the source, which is unusual for a unit test and deliberate here:
 * the guard being asserted is a static metadata declaration, and the failure
 * mode is somebody deleting it.
 * ========================================================================== */

const APP = join(process.cwd(), "src", "app");
const read = (...parts: string[]) => readFileSync(join(APP, ...parts), "utf8");

const NOINDEX = /robots:\s*\{\s*index:\s*false\s*,\s*follow:\s*false\s*\}/;

describe("private surfaces declare their own noindex", () => {
  it.each(["admin", "portal", "workspace"])("%s/layout.tsx", (surface) => {
    expect(read(surface, "layout.tsx")).toMatch(NOINDEX);
  });

  it.each([
    ["(auth)", "login"],
    ["(auth)", "reset-password"],
    ["(auth)", "forgot-password"],
  ])("%s/%s is not indexable", (group, route) => {
    expect(read(group, route, "page.tsx")).toMatch(NOINDEX);
  });

  it.each(["start", "legal"])("(public)/%s is not indexable", (route) => {
    expect(read("(public)", route, "page.tsx")).toMatch(NOINDEX);
  });

  it.each(["recommendation", "roadmap"])(
    "the funnel's %s step is not indexable — it renders wizard state",
    (route) => {
      expect(read("(public)", "(funnel)", route, "page.tsx")).toMatch(NOINDEX);
    },
  );
});

describe("the public site is indexable", () => {
  it("the root layout no longer suppresses the whole site", () => {
    const root = read("layout.tsx");
    expect(root).toMatch(/robots:\s*\{\s*index:\s*true\s*,\s*follow:\s*true\s*\}/);
    expect(root).not.toMatch(NOINDEX);
  });

  it("leaves the marketing pages free to be indexed", () => {
    for (const route of ["about", "careers", "contact", "packages", "resources", "services", "blog"]) {
      expect(read("(public)", route, "page.tsx")).not.toMatch(NOINDEX);
    }
    expect(read("(public)", "page.tsx")).not.toMatch(NOINDEX);
  });
});

describe("robots.txt", () => {
  it("disallows every surface that carries a noindex", () => {
    const rule = robots().rules;
    const disallow = (Array.isArray(rule) ? rule[0]! : rule).disallow as string[];
    for (const path of ["/portal", "/admin", "/workspace", "/login", "/legal/", "/start", "/recommendation", "/roadmap"]) {
      expect(disallow).toContain(path);
    }
  });

  it("still allows the public site, and points at the right sitemap", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rule.allow).toBe("/");
    expect(result.sitemap).toBe("https://auxion.xyz/sitemap.xml");
    expect(result.host).toBe("https://auxion.xyz");
  });
});
