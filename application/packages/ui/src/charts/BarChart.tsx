"use client";

import { useMemo, useState } from "react";
import { barLayout, type PlotBox, type SeriesPoint } from "./geometry";
import styles from "./charts.module.css";

export interface BarChartProps {
  readonly data: readonly SeriesPoint[];
  readonly height?: number;
  /** Single token color for all bars, or omit to assign the categorical palette. */
  readonly color?: string;
  /** Show a legend (identity by swatch+label, not color alone). Default: palette mode. */
  readonly legend?: boolean;
  readonly format?: (value: number) => string;
  readonly label: string;
}

const WIDTH = 640;
const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

/**
 * BarChart — categorical magnitude (PX.1c). One value axis, baseline-anchored
 * rounded bars, direct value labels, hover tooltip, optional legend, and a
 * screen-reader table. Per-bar palette assigned in fixed order (never cycled past
 * 6 — a 7th+ category should be grouped upstream). Token-colored → theme-aware.
 */
export function BarChart({ data, height = 220, color, legend, format = (n) => String(n), label }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const box: PlotBox = { width: WIDTH, height, padLeft: 8, padRight: 8, padTop: 20, padBottom: 26 };
  const bars = useMemo(() => barLayout(data, box, 0.34), [data, height]);
  const colorFor = (i: number) => color ?? PALETTE[i % PALETTE.length]!;

  if (data.length === 0) return <div className={styles.empty}>No data to chart yet.</div>;

  return (
    <div className={styles.wrap}>
      <figure className={styles.figure}>
        <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
          {bars.map((b, i) => (
            <g key={b.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
              <rect
                className={`${styles.bar} ${styles.animGrow}`}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                rx={4}
                fill={colorFor(i)}
                style={{ ["--grow-origin" as string]: "bottom", opacity: hover === null || hover === i ? 1 : 0.5 }}
              />
              <text className={styles.dataLabel} x={b.x + b.width / 2} y={b.y - 6}>
                {format(b.value)}
              </text>
              <text className={styles.barLabel} x={b.x + b.width / 2} y={height - 8}>
                {b.label}
              </text>
            </g>
          ))}
        </svg>
      </figure>

      {legend && (
        <ul className={styles.legend}>
          {data.map((d, i) => (
            <li key={d.label} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: colorFor(i) }} />
              {d.label}
              <span className={styles.legendValue}>{format(d.value)}</span>
            </li>
          ))}
        </ul>
      )}

      <table className={styles.srOnly}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
