"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { extent, innerBox, niceTicks, seriesPoints, linePath, areaPath, type PlotBox, type SeriesPoint } from "./geometry";
import styles from "./charts.module.css";

export interface TrendChartProps {
  readonly data: readonly SeriesPoint[];
  readonly variant?: "line" | "area";
  readonly color?: string;
  readonly height?: number;
  readonly seriesName?: string;
  readonly format?: (value: number) => string;
  /** Accessible chart title (also the table caption). */
  readonly label: string;
}

const WIDTH = 640; // viewBox units; scales responsively via CSS width:100%

/**
 * TrendChart — single-series line/area over time (PX.1c). One value axis, thin
 * mark, recessive grid, sparse x-labels, a hover crosshair + tooltip, a draw-in
 * animation (reduced-motion safe), and a screen-reader table so identity/value is
 * never conveyed by the plot alone. Token-colored → themes automatically.
 */
export function TrendChart({
  data,
  variant = "area",
  color = "var(--chart-1)",
  height = 220,
  seriesName,
  format = (n) => String(n),
  label,
}: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const box: PlotBox = { width: WIDTH, height, padLeft: 44, padRight: 12, padTop: 12, padBottom: 26 };
  const geom = useMemo(() => {
    const values = data.map((d) => d.value);
    const dom = extent(values);
    const ticks = niceTicks(dom.min, dom.max, 4);
    const domPadded = { min: Math.min(dom.min, ticks[0]!), max: Math.max(dom.max, ticks[ticks.length - 1]!) };
    const pts = seriesPoints(values, box, domPadded);
    const ib = innerBox(box);
    const yFor = (v: number) => ib.y1 - ((v - domPadded.min) / (domPadded.max - domPadded.min || 1)) * ib.h;
    return { pts, ticks, ib, yFor, line: linePath(pts), area: areaPath(pts, ib.y1) };
  }, [data, height]);

  if (data.length < 2) {
    return <div className={styles.empty}>Not enough data to chart yet.</div>;
  }

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width; // 0..1 across the plot
    const i = Math.round(fx * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const hoverPt = hover !== null ? geom.pts[hover] : null;
  const xLabelEvery = Math.ceil(data.length / 6);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <figure className={styles.figure}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={label}
          preserveAspectRatio="none"
        >
          {/* y grid + labels */}
          {geom.ticks.map((t) => {
            const y = geom.yFor(t);
            return (
              <g key={t}>
                <line className={styles.grid} x1={geom.ib.x0} y1={y} x2={geom.ib.x1} y2={y} />
                <text className={styles.axisLabel} x={geom.ib.x0 - 8} y={y + 3} textAnchor="end">
                  {format(t)}
                </text>
              </g>
            );
          })}
          {/* x labels (sparse) */}
          {data.map((d, i) =>
            i % xLabelEvery === 0 || i === data.length - 1 ? (
              <text key={i} className={styles.axisLabel} x={geom.pts[i]!.x} y={height - 8} textAnchor="middle">
                {d.label}
              </text>
            ) : null,
          )}
          {variant === "area" && <path d={geom.area} fill={color} className={styles.area} />}
          <path
            d={geom.line}
            className={`${styles.line} ${styles.animLine}`}
            stroke={color}
            pathLength={1}
            style={{ ["--dash" as string]: "1" }}
          />
          {/* hover crosshair + point */}
          {hoverPt && (
            <>
              <line className={styles.crosshair} x1={hoverPt.x} y1={geom.ib.y0} x2={hoverPt.x} y2={geom.ib.y1} />
              <circle cx={hoverPt.x} cy={hoverPt.y} r={4} fill={color} className={styles.point} />
            </>
          )}
          {/* hit area */}
          <rect
            className={styles.hitband}
            x={geom.ib.x0}
            y={geom.ib.y0}
            width={geom.ib.w}
            height={geom.ib.h}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      </figure>

      {hoverPt && hover !== null && (
        <div
          className={styles.tooltip}
          style={{ left: `${(hoverPt.x / WIDTH) * 100}%`, top: `${(hoverPt.y / height) * 100}%` }}
        >
          <div className={styles.tooltipLabel}>{data[hover]!.label}</div>
          <div className={styles.tooltipRow}>
            <span className={styles.swatch} style={{ background: color }} />
            <span>{seriesName ?? label}</span>
            <span className={styles.tooltipValue}>{format(data[hover]!.value)}</span>
          </div>
        </div>
      )}

      <table className={styles.srOnly}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">{seriesName ?? "Value"}</th>
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
