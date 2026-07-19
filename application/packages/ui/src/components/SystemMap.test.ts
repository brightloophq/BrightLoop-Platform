import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { systemMapGeometry } from "./SystemMap.js";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "./SystemMap.module.css"), "utf8");

describe("systemMapGeometry (pure layout)", () => {
  it("places the first node at the top (12 o'clock)", () => {
    const p = systemMapGeometry(7)[0]!;
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(17, 5); // cy 50 - r 33
  });
  it("returns one point per node, all on the ring radius", () => {
    const pts = systemMapGeometry(7);
    expect(pts).toHaveLength(7);
    for (const p of pts) {
      const d = Math.hypot(p.x - 50, p.y - 50);
      expect(d).toBeCloseTo(33, 3);
    }
  });
  it("is deterministic and handles the empty case", () => {
    expect(systemMapGeometry(7)).toEqual(systemMapGeometry(7));
    expect(systemMapGeometry(0)).toEqual([]);
  });
});

describe("SystemMap styling is token-only + reduced-motion aware", () => {
  it("uses --signal for lit nodes / gauge and --line for planned", () => {
    expect(css).toMatch(/stroke:\s*var\(--signal\)/);
    expect(css).toMatch(/fill:\s*var\(--signal-tint\)/);
    expect(css).toMatch(/stroke:\s*var\(--line\)/);
  });
  it("hardcodes no hex/rgb colors (theme parity)", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(css).not.toMatch(/rgba?\(/);
  });
  it("disables the core pulse under prefers-reduced-motion", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/animation:\s*none/);
  });
});
