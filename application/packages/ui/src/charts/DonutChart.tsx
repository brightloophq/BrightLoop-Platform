"use client";

import { useMemo, useState } from "react";
import { donutSegments, type SeriesPoint } from "./geometry";
import styles from "./charts.module.css";

export interface DonutChartProps {
  readonly data: readonly SeriesPoint[];
  readonly size?: number;
  readonly thickness?: number;
  readonly centerLabel?: string;
  readonly format?: (value: number) => string;
  readonly label: string;
}

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

/**
 * DonutChart — part-to-whole (PX.1c). Fixed-order palette (never cycled), 2px
 * surface gaps between segments, a center total, an always-present legend
 * (identity by swatch+label+value, never color alone), hover emphasis, and a
 * screen-reader table. Token-colored → theme-aware.
 */
export function DonutChart({ data, size = 200, thickness = 26, centerLabel, format = (n) => String(n), label }: DonutChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter - thickness;
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const segs = useMemo(() => donutSegments(data, cx, cy, rOuter, rInner, 0.03), [data, size, thickness]);

  if (total <= 0) return <div className={styles.empty}>No data to chart yet.</div>;

  return (
    <div className={styles.wrap} style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
      <figure className={styles.figure} style={{ width: size, flex: "none" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={styles.svg} style={{ width: size, height: size }}>
          {segs.map((seg, i) => (
            <path
              key={seg.label}
              d={seg.path}
              fill={PALETTE[i % PALETTE.length]}
              className={styles.animFade}
              style={{ opacity: hover === null || hover === i ? 1 : 0.45 }}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
          <text className={styles.donutTotal} x={cx} y={cy + 2} style={{ fontSize: size * 0.16 }}>
            {hover !== null ? format(data[hover]!.value) : format(total)}
          </text>
          <text className={styles.donutCaption} x={cx} y={cy + size * 0.13}>
            {hover !== null ? data[hover]!.label : centerLabel ?? "Total"}
          </text>
        </svg>
      </figure>

      <ul className={styles.legend} style={{ marginTop: 0, flexDirection: "column", gap: "var(--space-2)" }}>
        {data.map((d, i) => (
          <li
            key={d.label}
            className={styles.legendItem}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span className={styles.swatch} style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.label}
            <span className={styles.legendValue}>{format(d.value)}</span>
          </li>
        ))}
      </ul>

      <table className={styles.srOnly}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Segment</th>
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
