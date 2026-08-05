import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Theme correctness: overlays and status tints must reference semantic tokens, not
 * raw rgba() literals, so Light/Dark/System stay consistent. These tests lock the
 * PX.1f token hygiene in place — a regression that reintroduces a hardcoded color
 * fails here, in a node environment, without rendering.
 */
const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("scrim overlay is a single semantic token", () => {
  it("effects.css defines --scrim", () => {
    expect(css("./effects.css")).toMatch(/--scrim:\s*rgba\(/);
  });

  it("Drawer and Navbar reference var(--scrim), never a raw scrim rgba", () => {
    for (const file of ["../components/Drawer.module.css", "../components/Navbar.module.css"]) {
      const source = css(file);
      expect(source).toContain("var(--scrim)");
      expect(source).not.toMatch(/rgba\(\s*6,\s*10,\s*19/);
    }
  });
});

describe("status tints use tokens (color-mix), not hardcoded rgba", () => {
  it("Alert success/warning/danger tints are tokenized like its info tint", () => {
    const alert = css("../components/Alert.module.css");
    // color-mix over the semantic token — one occurrence per success/warning/danger
    // background + border, plus the pre-existing info tint.
    expect((alert.match(/color-mix\(in srgb, var\(--(info|success|warning|danger)\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(alert).not.toMatch(/rgba\(\s*22,\s*179,\s*100/); // old success literal
    expect(alert).not.toMatch(/rgba\(\s*239,\s*68,\s*68/); // old danger literal
  });

  it("PlaceholderNotice amber tint is tokenized", () => {
    const notice = css("../components/PlaceholderNotice.module.css");
    expect(notice).toContain("color-mix(in srgb, var(--warning)");
    expect(notice).not.toMatch(/rgba\(\s*245,\s*165,\s*36/);
  });
});
