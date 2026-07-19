/* Canonical Auxion design-system guardrails (Phase 0). These read the token /
 * component CSS as text and assert the canon is present and that no non-canonical
 * (legacy BrightLoop) visual color or font leaks back into the shared UI. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, ".."); // packages/ui/src
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

function walkCss(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkCss(p));
    else if (p.endsWith(".css")) out.push(p);
  }
  return out;
}

const colors = read("./colors.css");
const typography = read("./typography.css");
const base = read("./base.css");
const badge = read("../components/Badge.module.css");

const CANON_TOKENS = [
  "--bg", "--surface", "--surface-2", "--ink", "--ink-2", "--ink-3",
  "--signal", "--signal-tint", "--positive", "--caution", "--critical", "--info",
  "--line", "--line-strong", "--action-bg", "--action-fg", "--on-signal",
];

describe("canonical design tokens", () => {
  it("defines every canonical semantic token", () => {
    for (const t of CANON_TOKENS) {
      expect(colors, `missing ${t}`).toContain(`${t}:`);
    }
  });
  it("resolves --signal amber in BOTH themes (light #B4571A, dark #E8912F)", () => {
    expect(colors).toMatch(/--signal:\s*#B4571A/i);
    expect(colors).toMatch(/--signal:\s*#E8912F/i);
  });
  it("resolves the neutral canvas in BOTH themes (light #F3F1EC, dark #0B0C0F)", () => {
    expect(colors).toMatch(/--bg:\s*#F3F1EC/i);
    expect(colors).toMatch(/--bg:\s*#0B0C0F/i);
  });
  it("retains deprecated compatibility aliases, clearly marked", () => {
    expect(colors).toMatch(/@deprecated/i);
    expect(colors).toContain("--surface-card:"); // still resolves
  });
});

describe("canonical typography", () => {
  it("uses Space Grotesk for display and never Sora", () => {
    expect(typography).toMatch(/space-grotesk/i);
    expect(typography.toLowerCase()).not.toContain("sora");
  });
  it("keeps IBM Plex Sans (body) and Mono (data)", () => {
    expect(typography).toMatch(/IBM Plex Sans/i);
    expect(typography).toMatch(/IBM Plex Mono/i);
  });
  it("uses clamp() fluid scaling for the display tier (DS §01)", () => {
    expect(typography).toMatch(/--fs-display:\s*clamp\(/);
    expect(typography).toMatch(/--fs-h1:\s*clamp\(/);
  });
});

describe("canonical motion (keyframes + reduce-motion)", () => {
  it("declares the aux keyframes", () => {
    for (const k of ["auxRise", "auxPulse", "auxBlink"]) {
      expect(base).toContain(`@keyframes ${k}`);
    }
  });
  it("collapses motion under prefers-reduced-motion", () => {
    expect(base).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe("Badge is the canonical neutral pill", () => {
  it("uses a neutral --surface-2 fill + --line border + mono text", () => {
    expect(badge).toMatch(/background:\s*var\(--surface-2\)/);
    expect(badge).toMatch(/border:\s*1px solid var\(--line\)/);
    expect(badge).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(badge).toContain(".dot");
  });
  it("colors only the dot + text per canon tone (no colored fill behind text)", () => {
    expect(badge).toMatch(/\.success\s*{\s*color:\s*var\(--positive\)/);
    expect(badge).toMatch(/\.danger\s*{\s*color:\s*var\(--critical\)/);
  });
  it("has NO hardcoded status hex (the removed BrightLoop palette)", () => {
    expect(badge).not.toMatch(/#4ade80|#fbbf24|#f87171/i);
    expect(badge).not.toMatch(/34,\s*211,\s*238/); // legacy teal
  });
});

describe("safeguard: no non-canonical color leaks in shared UI", () => {
  const cssFiles = walkCss(uiSrc);
  it("finds CSS to guard", () => {
    expect(cssFiles.length).toBeGreaterThan(5);
  });
  it("contains no legacy teal rgba(34, 211, 238) anywhere in @brightloop/ui", () => {
    const offenders = cssFiles.filter((f) => /34,\s*211,\s*238/.test(readFileSync(f, "utf8")));
    expect(offenders, `teal in: ${offenders.join(", ")}`).toEqual([]);
  });
  it("uses no 'Sora' font anywhere in @brightloop/ui", () => {
    const offenders = cssFiles.filter((f) => /\bSora\b/i.test(readFileSync(f, "utf8")));
    expect(offenders, `Sora in: ${offenders.join(", ")}`).toEqual([]);
  });
});
