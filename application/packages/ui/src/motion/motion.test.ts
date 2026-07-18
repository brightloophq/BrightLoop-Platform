import { describe, it, expect } from "vitest";
import { DURATION, EASE, STAGGER, OFFSET_Y, shouldAnimate } from "./tokens";
import { DASHBOARD_SEQUENCE, sequenceOrder } from "./sequence";
import { PRESET } from "./presets.config";

describe("motion tokens", () => {
  it("exposes short, positive, premium durations (fast < base < slow)", () => {
    expect(DURATION.fast).toBeGreaterThan(0);
    expect(DURATION.fast).toBeLessThan(DURATION.base);
    expect(DURATION.base).toBeLessThan(DURATION.slow);
    // Nothing "flashy": the longest coordinated step stays well under a second.
    expect(DURATION.slow).toBeLessThanOrEqual(0.5);
  });

  it("provides easing and stagger vocabularies and a small offset", () => {
    expect(EASE.out).toMatch(/power/);
    expect(STAGGER.tight).toBeLessThan(STAGGER.loose);
    expect(OFFSET_Y).toBeGreaterThan(0);
    expect(OFFSET_Y).toBeLessThanOrEqual(24); // subtle, transform-only travel
  });

  it("shouldAnimate honours prefers-reduced-motion", () => {
    expect(shouldAnimate(false)).toBe(true);
    expect(shouldAnimate(true)).toBe(false); // reduced motion → no animation
  });
});

describe("dashboard entrance sequence", () => {
  it("reveals groups in the required order", () => {
    expect(sequenceOrder()).toEqual([
      "header",
      "metric",
      "pipeline",
      "attention",
      "activity",
    ]);
  });

  it("starts the header at time 0 and overlaps subsequent steps", () => {
    expect(DASHBOARD_SEQUENCE[0]?.step).toBe("header");
    expect(DASHBOARD_SEQUENCE[0]?.overlap).toBe(0);
    // every later step overlaps the previous (negative) to stay quick + connected
    for (const step of DASHBOARD_SEQUENCE.slice(1)) {
      expect(step.overlap).toBeLessThanOrEqual(0);
    }
  });
});

describe("motion presets", () => {
  const NAMES = [
    "dashboardEntrance",
    "metricReveal",
    "pipelineReveal",
    "drawerOpen",
    "drawerClose",
    "pageTransition",
    "modalEnter",
    "modalExit",
    "toastEnter",
    "toastExit",
  ] as const;

  it("defines the full preset catalogue", () => {
    for (const name of NAMES) expect(PRESET[name]).toBeDefined();
  });

  it("derives every preset timing from the shared tokens (no stray values)", () => {
    const durations = new Set<number>(Object.values(DURATION));
    const eases = new Set<string>(Object.values(EASE));
    for (const name of NAMES) {
      expect(durations.has(PRESET[name].duration)).toBe(true);
      expect(eases.has(PRESET[name].ease)).toBe(true);
    }
  });

  it("keeps exits quick and staggers within the token vocabulary", () => {
    expect(PRESET.modalExit.duration).toBe(DURATION.fast);
    expect(PRESET.toastExit.duration).toBe(DURATION.fast);
    const staggers = new Set<number>(Object.values(STAGGER));
    expect(staggers.has(PRESET.metricReveal.stagger!)).toBe(true);
    expect(PRESET.pageTransition.offset).toBe(OFFSET_Y);
  });
});
