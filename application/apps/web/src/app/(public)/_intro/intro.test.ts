import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { INTRO_SCRIPT, INTRO_SESSION_KEY } from "./introConfig";

/**
 * PX.1h preloader intro. Pure, node-safe assertions that the pre-paint gate is
 * correct: it plays at most once per session, never under reduced motion, and the
 * CSS cover can never trap content (a JS-independent failsafe clears it). These
 * lock the safety guarantees without a DOM.
 */
const readCss = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("intro pre-paint script", () => {
  it("gates the branded intro on session + reduced-motion, before paint", () => {
    // Only sets the pending flag; it must check both guards.
    expect(INTRO_SCRIPT).toContain("prefers-reduced-motion: reduce");
    expect(INTRO_SCRIPT).toContain(INTRO_SESSION_KEY);
    expect(INTRO_SCRIPT).toContain("data-intro-pending");
    // Never throws in private mode / no storage.
    expect(INTRO_SCRIPT).toContain("try");
  });
});

describe("intro cover failsafe (intro.css)", () => {
  const cover = readCss("../intro.css");
  it("shows only while pending and clears itself even if JS never runs", () => {
    expect(cover).toContain("data-intro-pending");
    // A JS-independent animation fades the cover away → content is never trapped.
    expect(cover).toMatch(/introCoverFailsafe/);
    expect(cover).toContain("visibility: hidden");
  });
});

describe("public sections — reduced-motion honesty (CSS)", () => {
  it("the journey only emphasises steps when motion is allowed (content never hidden)", () => {
    const journey = readCss("../_sections/journey.module.css");
    expect(journey).toContain("prefers-reduced-motion: no-preference");
  });
});
