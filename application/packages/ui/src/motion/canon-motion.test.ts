/* Canonical Auxion motion values (Phase 0). The three named curves map to the
 * canon durations (DNA §05); legacy names remain as compatible aliases. */
import { describe, it, expect } from "vitest";
import { DURATION, EASE } from "./tokens.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const layoutCss = readFileSync(join(here, "../tokens/layout.css"), "utf8");

describe("canonical motion durations (seconds, GSAP unit)", () => {
  it("precise = 240ms, orchestrate = 440ms, enter = 640ms", () => {
    expect(DURATION.precise).toBeCloseTo(0.24, 3);
    expect(DURATION.orchestrate).toBeCloseTo(0.44, 3);
    expect(DURATION.enter).toBeCloseTo(0.64, 3);
  });
  it("retains legacy duration aliases (no API removed)", () => {
    expect(DURATION.fast).toBeDefined();
    expect(DURATION.base).toBeDefined();
    expect(DURATION.slow).toBeDefined();
  });
});

describe("canonical easing curves", () => {
  it("exposes precise / orchestrate / enter", () => {
    expect(EASE.precise).toBeTruthy();
    expect(EASE.orchestrate).toBeTruthy();
    expect(EASE.enter).toBeTruthy();
  });
  it("retains legacy out / inOut aliases", () => {
    expect(EASE.out).toBeTruthy();
    expect(EASE.inOut).toBeTruthy();
  });
});

describe("canonical CSS motion tokens (layout.css)", () => {
  it("declares the three named cubic-bezier curves", () => {
    expect(layoutCss).toMatch(/--ease-precise:\s*cubic-bezier\(0\.2, ?0\.8, ?0\.2, ?1\)/);
    expect(layoutCss).toMatch(/--ease-orchestrate:\s*cubic-bezier\(0\.65, ?0, ?0\.35, ?1\)/);
    expect(layoutCss).toMatch(/--ease-enter:\s*cubic-bezier\(0\.16, ?1, ?0\.3, ?1\)/);
  });
  it("declares canon durations 240/440/640", () => {
    expect(layoutCss).toMatch(/--dur-precise:\s*240ms/);
    expect(layoutCss).toMatch(/--dur-orchestrate:\s*440ms/);
    expect(layoutCss).toMatch(/--dur-enter:\s*640ms/);
  });
});
