import { describe, it, expect } from "vitest";
import {
  extent,
  scaleLinear,
  niceTicks,
  innerBox,
  seriesPoints,
  linePath,
  areaPath,
  sparkline,
  barLayout,
  donutSegments,
  funnelBands,
  type PlotBox,
} from "./geometry";

const BOX: PlotBox = { width: 100, height: 50, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 };

describe("extent", () => {
  it("returns min/max", () => {
    expect(extent([3, 1, 4, 1, 5])).toEqual({ min: 1, max: 5 });
  });
  it("opens a window for a flat series (no zero span)", () => {
    const e = extent([7, 7, 7]);
    expect(e.min).toBeLessThan(7);
    expect(e.max).toBeGreaterThan(7);
  });
  it("handles empty", () => {
    expect(extent([])).toEqual({ min: 0, max: 1 });
  });
});

describe("scaleLinear", () => {
  it("maps domain to range linearly", () => {
    const s = scaleLinear(0, 10, 0, 100);
    expect(s(0)).toBe(0);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(100);
  });
  it("degenerate domain maps to range midpoint", () => {
    expect(scaleLinear(5, 5, 0, 100)(5)).toBe(50);
  });
});

describe("niceTicks", () => {
  it("produces rounded ticks covering the range", () => {
    const t = niceTicks(0, 100, 4);
    expect(t[0]).toBeGreaterThanOrEqual(0);
    expect(t[t.length - 1]).toBeLessThanOrEqual(100);
    expect(t.length).toBeGreaterThan(1);
  });
  it("single value degenerates safely", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe("seriesPoints", () => {
  it("inverts y (min at bottom) and spreads x", () => {
    const pts = seriesPoints([0, 10], BOX);
    expect(pts[0]!.x).toBe(0);
    expect(pts[1]!.x).toBe(100);
    expect(pts[0]!.y).toBeGreaterThan(pts[1]!.y); // 0 lower on screen than 10
  });
  it("centers a single point", () => {
    const pts = seriesPoints([5], BOX);
    expect(pts[0]!.x).toBe(50);
  });
});

describe("linePath / areaPath", () => {
  it("linePath starts with M and uses L", () => {
    const d = linePath([{ x: 0, y: 0 }, { x: 10, y: 5 }]);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d).toContain("L10,5");
  });
  it("areaPath is closed (Z) and rides the baseline", () => {
    const d = areaPath([{ x: 0, y: 10 }, { x: 10, y: 5 }], 50);
    expect(d.startsWith("M0,50")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).toContain("L10,50");
  });
  it("empty inputs give empty strings", () => {
    expect(linePath([])).toBe("");
    expect(areaPath([], 10)).toBe("");
  });
});

describe("sparkline", () => {
  it("returns a line and closed area within the box", () => {
    const s = sparkline([1, 3, 2, 5], 60, 20);
    expect(s.points).toHaveLength(4);
    expect(s.line.startsWith("M")).toBe(true);
    expect(s.area.trim().endsWith("Z")).toBe(true);
  });
});

describe("barLayout", () => {
  it("lays out one bar per datum within the box, baseline-anchored", () => {
    const bars = barLayout([{ label: "a", value: 10 }, { label: "b", value: 20 }], BOX);
    expect(bars).toHaveLength(2);
    for (const b of bars) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(100.01);
      expect(b.height).toBeGreaterThanOrEqual(0);
    }
    // taller value → taller bar
    expect(bars[1]!.height).toBeGreaterThan(bars[0]!.height);
  });
});

describe("donutSegments", () => {
  it("emits one segment per positive value summing to full circle (minus gaps)", () => {
    const segs = donutSegments(
      [{ label: "a", value: 1 }, { label: "b", value: 1 }, { label: "c", value: 2 }],
      50, 50, 40, 24, 0,
    );
    expect(segs).toHaveLength(3);
    const totalSweep = segs.reduce((s, seg) => s + (seg.endAngle - seg.startAngle), 0);
    expect(totalSweep).toBeCloseTo(Math.PI * 2, 5);
    expect(segs[2]!.percent).toBeCloseTo(0.5, 5);
    for (const seg of segs) expect(seg.path).toContain("A"); // arc command present
  });
  it("returns nothing when total is zero", () => {
    expect(donutSegments([{ label: "a", value: 0 }], 50, 50, 40, 24)).toHaveLength(0);
  });
});

describe("funnelBands", () => {
  it("produces a narrowing, top-anchored funnel", () => {
    const bands = funnelBands(
      [{ label: "Leads", value: 100 }, { label: "Qualified", value: 60 }, { label: "Won", value: 20 }],
      BOX,
    );
    expect(bands).toHaveLength(3);
    expect(bands[0]!.percentOfFirst).toBe(1);
    expect(bands[2]!.percentOfFirst).toBeCloseTo(0.2, 5);
    // each stage's top width >= its bottom width (narrowing)
    for (const b of bands) expect(b.topWidth).toBeGreaterThanOrEqual(b.bottomWidth);
    // stages descend
    expect(bands[1]!.y).toBeGreaterThan(bands[0]!.y);
  });
});

describe("innerBox", () => {
  it("subtracts padding", () => {
    const ib = innerBox({ width: 100, height: 50, padLeft: 10, padRight: 5, padTop: 4, padBottom: 6 });
    expect(ib.x0).toBe(10);
    expect(ib.x1).toBe(95);
    expect(ib.w).toBe(85);
    expect(ib.h).toBe(40);
  });
});
