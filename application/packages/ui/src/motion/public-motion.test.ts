import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EASE, OFFSET_Y } from "./tokens";
import {
  PUBLIC_PRESET,
  PUBLIC_DURATION,
  PUBLIC_OFFSET,
  PUBLIC_STAGGER,
  MARQUEE,
  PARALLAX,
  HERO_SEQUENCE,
  JOURNEY_STAGES,
} from "./public.config";

/**
 * PX.1h public motion layer. These are PURE invariants (no gsap, no DOM) plus
 * CSS-content assertions for the reduced-motion guards — the same house style as
 * motion.test.ts / reduced-motion.test.ts. They lock the intent: the public
 * vocabulary is editorial (bigger/slower than the operational app), derives from
 * the shared easings, tells the canonical four-discipline story, and every new
 * looping/marquee surface is genuinely reduced-motion safe.
 */
const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("public motion — editorial vocabulary", () => {
  it("is deliberately larger/slower than the operational app (agency vs product)", () => {
    // Editorial travel exceeds the app's subtle 12px operational offset.
    expect(PUBLIC_OFFSET.reveal).toBeGreaterThan(OFFSET_Y);
    expect(PUBLIC_OFFSET.hero).toBeGreaterThan(PUBLIC_OFFSET.reveal);
    // Arrivals have presence but never drag.
    expect(PUBLIC_DURATION.reveal).toBeGreaterThan(0.4);
    expect(PUBLIC_DURATION.hero).toBeLessThanOrEqual(1.2);
    expect(PUBLIC_STAGGER.tight).toBeLessThan(PUBLIC_STAGGER.loose);
  });

  it("derives every public preset easing from the shared EASE curves", () => {
    const eases = new Set<string>(Object.values(EASE));
    for (const spec of Object.values(PUBLIC_PRESET)) {
      expect(eases.has(spec.ease)).toBe(true);
      expect(spec.duration).toBeGreaterThan(0);
    }
  });

  it("tunes the marquee + parallax to calm, positive values", () => {
    expect(MARQUEE.speedPxPerSec).toBeGreaterThan(0);
    expect(MARQUEE.speedPxPerSec).toBeLessThan(120); // a confident drift, not a frantic ticker
    expect(PARALLAX.subtle).toBeGreaterThan(0);
    expect(PARALLAX.subtle).toBeLessThanOrEqual(PARALLAX.base);
  });
});

describe("public motion — hero entrance choreography", () => {
  it("starts at the eyebrow, masks the headline, and activates the loop last", () => {
    expect(HERO_SEQUENCE[0]?.key).toBe("eyebrow");
    expect(HERO_SEQUENCE.find((s) => s.key === "title")?.kind).toBe("mask");
    const keys = HERO_SEQUENCE.map((s) => s.key);
    // The loop object activates after the copy (ring → nodes → core, in order).
    expect(keys.indexOf("loopRing")).toBeGreaterThan(keys.indexOf("sub"));
    expect(keys.indexOf("loopCore")).toBeGreaterThan(keys.indexOf("loopNode"));
    expect(keys.indexOf("loopNode")).toBeGreaterThan(keys.indexOf("loopRing"));
  });

  it("overlaps steps into one connected sequence (no isolated pop-ins)", () => {
    for (const step of HERO_SEQUENCE.slice(1)) {
      expect(step.overlap).toBeLessThanOrEqual(0);
    }
    expect(HERO_SEQUENCE[0]?.overlap).toBe(0);
  });
});

describe("public motion — the transformation journey is the canonical story", () => {
  it("is exactly Brand → Build → Automate → Grow, numbered in order", () => {
    expect(JOURNEY_STAGES.map((s) => s.discipline)).toEqual(["Brand", "Build", "Automate", "Grow"]);
    expect(JOURNEY_STAGES.map((s) => s.n)).toEqual(["01", "02", "03", "04"]);
    for (const stage of JOURNEY_STAGES) {
      expect(stage.title.length).toBeGreaterThan(0);
      expect(stage.body.length).toBeGreaterThan(0);
    }
  });
});

describe("public motion — reduced-motion guard (CSS)", () => {
  it("the marquee does not move under reduced motion, and loops transform-only", () => {
    const marquee = css("../components/Marquee.module.css");
    expect(marquee).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation:\s*none/);
    // The loop is transform-only (compositor-friendly), never left/top.
    expect(marquee).toContain("translate3d");
  });
});
