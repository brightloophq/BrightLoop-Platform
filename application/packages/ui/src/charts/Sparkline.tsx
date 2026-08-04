import { sparkline } from "./geometry";
import styles from "./charts.module.css";

export interface SparklineProps {
  readonly values: readonly number[];
  readonly width?: number;
  readonly height?: number;
  /** Token color (default the brand chart-1). Pass e.g. "var(--positive)". */
  readonly color?: string;
  /** Fill the area under the line. */
  readonly area?: boolean;
  /** Accessible summary; falls back to a generic trend description. */
  readonly label?: string;
}

/**
 * Sparkline — a compact, axis-less trend line for KPI cards (PX.1c). Pure SVG,
 * token-colored (themes automatically), no interactivity. Decorative by role but
 * carries an aria-label so the trend is announced.
 */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--chart-1)",
  area = true,
  label,
}: SparklineProps) {
  if (values.length < 2) return null;
  const { line, area: areaFill, points } = sparkline(values, width, height);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const dir = last > first ? "up" : last < first ? "down" : "flat";
  const aria = label ?? `Trend ${dir}, from ${first} to ${last}`;
  const end = points[points.length - 1]!;
  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={aria}
      style={{ width, height }}
    >
      {area && <path d={areaFill} fill={color} className={styles.area} />}
      <path d={line} className={styles.line} stroke={color} />
      <circle cx={end.x} cy={end.y} r={2.5} fill={color} className={styles.point} />
    </svg>
  );
}
