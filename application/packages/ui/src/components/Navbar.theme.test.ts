import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * PX.1g follow-up: the public Navbar must expose the existing Theme Runtime
 * (Light / Dark / System) so the landing page has a visible, keyboard- and
 * screen-reader-accessible theme control — on desktop AND mobile — while reusing
 * the single shared `ThemeToggle` (no second theme implementation or provider).
 *
 * House style: assert against the shipped source/CSS in a node env (no rendering).
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("public Navbar exposes the shared Theme Runtime", () => {
  const tsx = read("./Navbar.tsx");
  const css = read("./Navbar.module.css");

  it("imports the shared ThemeToggle (reuse, not a new implementation)", () => {
    expect(tsx).toMatch(/import \{ ThemeToggle \} from "\.\.\/theme\/ThemeToggle"/);
  });

  it("does NOT introduce a second theme provider/runtime", () => {
    expect(tsx).not.toContain("ThemeProvider");
    expect(tsx).not.toContain("ThemeScript");
  });

  it("renders the toggle twice: compact on desktop, segmented in the mobile drawer", () => {
    expect((tsx.match(/<ThemeToggle\b/g) ?? []).length).toBe(2);
    expect(tsx).toContain('<ThemeToggle variant="compact" label="Theme" />');
    expect(tsx).toContain('<ThemeToggle variant="segmented" label="Theme" />');
  });

  it("places the desktop toggle in the actions group and the mobile toggle in the drawer", () => {
    expect(tsx).toContain("styles.desktopTheme");
    expect(tsx).toContain("styles.drawerTheme");
    // The drawer toggle sits in a labelled Appearance group.
    expect(tsx).toContain("Appearance");
  });

  it("hides the desktop toggle below 1024px (mobile uses the drawer control)", () => {
    // The desktop-only theme wrapper must be in the same hide rule as the desktop CTA.
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 1023px)"));
    expect(mobileBlock).toContain(".desktopTheme");
    expect(mobileBlock).toContain("display: none");
    expect(css).toMatch(/\.drawerTheme\s*\{/);
  });

  it("uses tokens only in the added Navbar chrome (no hardcoded colors)", () => {
    // The theme wrappers are layout-only; no color literals introduced.
    for (const cls of [".desktopTheme", ".drawerTheme"]) {
      const block = css.slice(css.indexOf(cls), css.indexOf(cls) + 200);
      expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(block).not.toMatch(/rgba?\(/);
    }
  });
});
