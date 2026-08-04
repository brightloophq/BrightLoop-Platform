import { funnelBands, type PlotBox, type SeriesPoint } from "./geometry";
import styles from "./charts.module.css";

export interface FunnelChartProps {
  readonly data: readonly SeriesPoint[];
  readonly height?: number;
  readonly color?: string;
  readonly format?: (value: number) => string;
  readonly label: string;
}

const WIDTH = 640;

/**
 * FunnelChart — stage-to-stage conversion (PX.1c). A symmetric narrowing funnel
 * with each stage direct-labeled (name · value · % of first), so the read needs
 * no color and no hover. CSS-only hover emphasis (reduced-motion safe), a screen-
 * reader table, and token color → theme-aware. Deepening tint per stage conveys
 * progression without relying on hue.
 */
export function FunnelChart({ data, height = 240, color = "var(--chart-1)", format = (n) => String(n), label }: FunnelChartProps) {
  const box: PlotBox = { width: WIDTH, height, padLeft: 120, padRight: 120, padTop: 6, padBottom: 6 };
  const bands = funnelBands(data, box, 8);
  if (bands.length === 0) return <div className={styles.empty}>No data to chart yet.</div>;

  return (
    <div className={styles.wrap}>
      <figure className={styles.figure}>
        <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
          {bands.map((b, i) => (
            <g key={b.label}>
              <polygon
                className={styles.funnelBand}
                points={b.points}
                fill={color}
                style={{ opacity: 0.85 - i * (0.5 / Math.max(1, bands.length)) }}
              />
              <text className={styles.funnelLabel} x={10} y={b.y + b.height / 2 - 2}>
                {b.label}
              </text>
              <text className={styles.funnelValue} x={10} y={b.y + b.height / 2 + 13}>
                {format(b.value)} · {Math.round(b.percentOfFirst * 100)}%
              </text>
            </g>
          ))}
        </svg>
      </figure>

      <table className={styles.srOnly}>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Value</th>
            <th scope="col">% of first</th>
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{format(b.value)}</td>
              <td>{Math.round(b.percentOfFirst * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
