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
  it("declares the full gold ramp the identity is sampled from", () => {
    for (const step of ["--gold-950", "--gold-800", "--gold-700", "--gold-500",
                        "--gold-300", "--gold-200", "--gold-100", "--gold-050"]) {
      expect(colors, `missing ${step}`).toContain(`${step}:`);
    }
  });
  it("resolves --signal to gold in BOTH themes (light --gold-500, dark --gold-200)", () => {
    expect(colors).toMatch(/--signal:\s*var\(--gold-500\)/);
    expect(colors).toMatch(/--signal:\s*var\(--gold-200\)/);
    expect(colors).toMatch(/--gold-500:\s*#8A6218/i);
    expect(colors).toMatch(/--gold-200:\s*#D9BB72/i);
  });
  it("resolves the neutral canvas in BOTH themes (light #F5F2EA, dark #050505)", () => {
    expect(colors).toMatch(/--bg:\s*#F5F2EA/i);
    expect(colors).toMatch(/--bg:\s*#050505/i);
  });
  it("declares the metallic gradient set", () => {
    for (const g of ["--grad-gold", "--grad-metal", "--grad-gold-soft", "--grad-sheen", "--grad-signal"]) {
      expect(colors, `missing ${g}`).toContain(`${g}:`);
    }
  });
  it("has fully removed the retired BrightLoop primitive scales", () => {
    // Not merely re-pointed — deleted, with every consumer migrated to a canon
    // token. A reintroduced --bl-*/--navy-*/--blue-*/--cyan-*/--slate-* scale is
    // a regression, because those names outlive whatever value they point at.
    for (const scale of ["--bl-blue", "--bl-cyan", "--bl-navy", "--bl-white",
                         "--navy-900", "--blue-500", "--cyan-500", "--slate-600"]) {
      expect(colors, `${scale} is back`).not.toContain(`${scale}:`);
    }
    for (const retired of ["#1B54E4", "#5B83EF", "#152238", "#0E1626", "#69707C"]) {
      expect(colors, `${retired} still present`).not.toContain(retired);
    }
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
  it("contains no retired BrightLoop blue hex anywhere in @brightloop/ui", () => {
    const blues = /#(1B54E4|5B83EF|2A4A86|17274D|152238|0E1626)\b/i;
    const offenders = cssFiles.filter((f) => blues.test(readFileSync(f, "utf8")));
    expect(offenders, `blue in: ${offenders.join(", ")}`).toEqual([]);
  });
  it("uses no 'Sora' font anywhere in @brightloop/ui", () => {
    const offenders = cssFiles.filter((f) => /\bSora\b/i.test(readFileSync(f, "utf8")));
    expect(offenders, `Sora in: ${offenders.join(", ")}`).toEqual([]);
  });
});
