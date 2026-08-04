/* =============================================================================
 * Chart geometry — pure, framework-free SVG math (PX.1c).
 *
 * No React, no DOM, no clock, no randomness — every function is deterministic and
 * unit-testable (like `systemMapGeometry`). The chart components render the shapes
 * these produce; colors come from tokens, never from here. All charts share ONE
 * value axis (never dual-axis) per the data-viz method.
 * ========================================================================== */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A single data point in a series: an x label + a numeric value. */
export interface SeriesPoint {
  readonly label: string;
  readonly value: number;
}

/** Inclusive numeric extent of a list, padded so a flat line isn't degenerate. */
export function extent(values: readonly number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = values[0]!;
  let max = values[0]!;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) {
    // Flat series: open a symmetric window so it renders mid-height.
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    return { min: min - pad, max: max + pad };
  }
  return { min, max };
}

/** Linear map from [d0,d1] to [r0,r1]. Returns a pure mapping function. */
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const dd = d1 - d0;
  if (dd === 0) return () => (r0 + r1) / 2;
  const m = (r1 - r0) / dd;
  return (v: number) => r0 + (v - d0) * m;
}

/** "Nice" rounded tick values covering [min,max] with ~count intervals. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) {
    // Guard floating-point dust so ticks are clean numbers.
    ticks.push(Math.round(t / step) * step);
  }
  return ticks;
}

export interface PlotBox {
  readonly width: number;
  readonly height: number;
  readonly padLeft: number;
  readonly padRight: number;
  readonly padTop: number;
  readonly padBottom: number;
}

/** The inner drawing rectangle inside the padding. */
export function innerBox(b: PlotBox): { x0: number; x1: number; y0: number; y1: number; w: number; h: number } {
  const x0 = b.padLeft;
  const x1 = b.width - b.padRight;
  const y0 = b.padTop;
  const y1 = b.height - b.padBottom;
  return { x0, x1, y0, y1, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

/** Screen-space points for a value series across a plot box (y inverted). */
export function seriesPoints(values: readonly number[], box: PlotBox, domain?: { min: number; max: number }): Point[] {
  const { x0, x1, y0, y1 } = innerBox(box);
  const dom = domain ?? extent(values);
  const sx = values.length <= 1 ? () => (x0 + x1) / 2 : scaleLinear(0, values.length - 1, x0, x1);
  const sy = scaleLinear(dom.min, dom.max, y1, y0); // inverted: min at bottom
  return values.map((v, i) => ({ x: sx(i), y: sy(v) }));
}

/** SVG path `d` for a polyline through points. Empty string for <2 points. */
export function linePath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)},${round(p.y)}`).join(" ");
}

/** SVG path `d` for a filled area under a line down to `baselineY`. */
export function areaPath(points: readonly Point[], baselineY: number): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const top = points.map((p) => `L${round(p.x)},${round(p.y)}`).join(" ");
  return `M${round(first.x)},${round(baselineY)} ${top} L${round(last.x)},${round(baselineY)} Z`;
}

/** Sparkline geometry: points + line path + area path in a tiny box. */
export function sparkline(
  values: readonly number[],
  width: number,
  height: number,
  pad = 2,
): { points: Point[]; line: string; area: string } {
  const box: PlotBox = { width, height, padLeft: pad, padRight: pad, padTop: pad, padBottom: pad };
  const points = seriesPoints(values, box);
  return { points, line: linePath(points), area: areaPath(points, height - pad) };
}

export interface Bar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly value: number;
  readonly label: string;
}

/** Vertical bar layout with a fractional gap between bars. Baseline = 0 or min. */
export function barLayout(data: readonly SeriesPoint[], box: PlotBox, gap = 0.3): Bar[] {
  const { x0, y0, y1, w } = innerBox(box);
  const values = data.map((d) => d.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const sy = scaleLinear(min, max, y1, y0);
  const base = sy(0);
  const slot = data.length > 0 ? w / data.length : w;
  const bw = slot * (1 - gap);
  return data.map((d, i) => {
    const cx = x0 + slot * i + slot / 2;
    const vy = sy(d.value);
    return {
      x: round(cx - bw / 2),
      y: round(Math.min(vy, base)),
      width: round(bw),
      height: round(Math.abs(base - vy)),
      value: d.value,
      label: d.label,
    };
  });
}

export interface DonutSegment {
  readonly path: string;
  readonly value: number;
  readonly label: string;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly percent: number;
}

/** Donut/pie segments. Angles in radians, 0 at top, clockwise. `gap` in radians. */
export function donutSegments(
  data: readonly SeriesPoint[],
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  gap = 0.02,
): DonutSegment[] {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  if (total <= 0) return [];
  let angle = 0;
  const out: DonutSegment[] = [];
  for (const d of data) {
    const frac = Math.max(0, d.value) / total;
    const sweep = frac * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = angle + sweep - gap / 2;
    if (a1 > a0) {
      out.push({
        path: arcPath(cx, cy, rOuter, rInner, a0, a1),
        value: d.value,
        label: d.label,
        startAngle: a0,
        endAngle: a1,
        percent: frac,
      });
    }
    angle += sweep;
  }
  return out;
}

/** SVG path for a donut segment (annular sector). */
export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const p = (r: number, a: number): Point => ({ x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) });
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const o0 = p(rOuter, a0);
  const o1 = p(rOuter, a1);
  const i1 = p(rInner, a1);
  const i0 = p(rInner, a0);
  return [
    `M${round(o0.x)},${round(o0.y)}`,
    `A${round(rOuter)},${round(rOuter)} 0 ${large} 1 ${round(o1.x)},${round(o1.y)}`,
    `L${round(i1.x)},${round(i1.y)}`,
    `A${round(rInner)},${round(rInner)} 0 ${large} 0 ${round(i0.x)},${round(i0.y)}`,
    "Z",
  ].join(" ");
}

export interface FunnelBand {
  readonly label: string;
  readonly value: number;
  readonly points: string; // polygon points
  readonly y: number;
  readonly height: number;
  readonly topWidth: number;
  readonly bottomWidth: number;
  readonly percentOfFirst: number;
}

/** Symmetric funnel: each stage a trapezoid narrowing to the next value. */
export function funnelBands(data: readonly SeriesPoint[], box: PlotBox, gap = 6): FunnelBand[] {
  const { x0, x1, y0, w, h } = innerBox(box);
  if (data.length === 0) return [];
  const max = Math.max(1, ...data.map((d) => d.value));
  const cx = (x0 + x1) / 2;
  const bandH = (h - gap * (data.length - 1)) / data.length;
  const widthFor = (v: number) => (Math.max(0, v) / max) * w;
  return data.map((d, i) => {
    const yTop = y0 + i * (bandH + gap);
    const topW = widthFor(d.value);
    const next = data[i + 1];
    const botW = widthFor(next ? next.value : d.value);
    const tl = cx - topW / 2;
    const tr = cx + topW / 2;
    const bl = cx - botW / 2;
    const br = cx + botW / 2;
    const yBot = yTop + bandH;
    return {
      label: d.label,
      value: d.value,
      points: `${round(tl)},${round(yTop)} ${round(tr)},${round(yTop)} ${round(br)},${round(yBot)} ${round(bl)},${round(yBot)}`,
      y: round(yTop),
      height: round(bandH),
      topWidth: round(topW),
      bottomWidth: round(botW),
      percentOfFirst: data[0]!.value > 0 ? d.value / data[0]!.value : 0,
    };
  });
}

/** Round to 2dp so path strings are stable + compact (deterministic across runs). */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
