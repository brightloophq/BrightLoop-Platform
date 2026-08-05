import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { shouldAnimate } from "./tokens";

/**
 * Reduced-motion is enforced at three layers (a global CSS reset, per-component
 * @media guards, and JS via shouldAnimate/useReducedMotion). These tests assert the
 * CSS guards actually EXIST in the shipped stylesheets — so "supports reduced motion"
 * can't rot into a claim without a mechanism. They read the real files, no DOM needed.
 */
const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const reduceBlock = (source: string): string => {
  const i = source.indexOf("prefers-reduced-motion: reduce");
  return i === -1 ? "" : source.slice(i, i + 400);
};

describe("reduced-motion — JS gate", () => {
  it("shouldAnimate is false when the user prefers reduced motion", () => {
    expect(shouldAnimate(false)).toBe(true);
    expect(shouldAnimate(true)).toBe(false);
  });
});

describe("reduced-motion — global CSS reset (tokens/base.css)", () => {
  const base = css("../tokens/base.css");
  it("collapses animation AND transition duration for every element under reduce", () => {
    const block = reduceBlock(base);
    expect(block).toContain("animation-duration");
    expect(block).toContain("transition-duration");
    expect(block).toMatch(/\*,/); // applies to the universal selector
  });
});

describe("reduced-motion — per-component guards", () => {
  it("SkeletonBlock stops its pulse under reduce", () => {
    expect(css("../components/SkeletonBlock.module.css")).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*animation:\s*none/,
    );
  });

  it("MetricCard drops its hover lift under reduce (matches Card)", () => {
    const mc = reduceBlock(css("../components/MetricCard.module.css"));
    expect(mc).toContain("transform: none");
  });

  it("Card drops its hover lift under reduce", () => {
    expect(reduceBlock(css("../components/Card.module.css"))).toContain("transform: none");
  });

  it("charts gate their draw-in behind no-preference (so reduce never runs it)", () => {
    expect(css("../charts/charts.module.css")).toContain("prefers-reduced-motion: no-preference");
  });
});

describe("reduced-motion — Button loading spinner", () => {
  const btn = css("../components/Button.module.css");
  it("uses a CSS animation (so the global reset collapses it under reduce)", () => {
    expect(btn).toMatch(/\.spinner[\s\S]*animation:/);
    expect(btn).toContain("@keyframes buttonSpin");
  });
});
