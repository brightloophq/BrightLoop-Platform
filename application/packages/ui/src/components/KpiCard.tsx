import { Icon } from "./Icon";
import { Sparkline } from "../charts/Sparkline";
import styles from "./KpiCard.module.css";

export type KpiTone = "positive" | "negative" | "neutral";
export type KpiStatus = "positive" | "caution" | "critical" | "info" | "neutral";

export interface KpiDelta {
  /** Formatted change, e.g. "+6.2%" or "-3". */
  readonly text: string;
  readonly direction: "up" | "down" | "flat";
  /** Whether the change is good/bad/neutral for THIS metric (lower risk is good). */
  readonly tone: KpiTone;
}

export interface KpiCardProps {
  readonly label: string;
  /** null renders an honest empty state instead of a fabricated 0. */
  readonly value: number | string | null;
  readonly suffix?: string;
  readonly icon?: string;
  readonly emphasis?: "default" | "hero";
  /** Trend vs the previous period. */
  readonly delta?: KpiDelta;
  /** Previous-period value, e.g. "vs 78 last month". */
  readonly previous?: string;
  /** Model/data confidence 0..1 → shown as a %. */
  readonly confidence?: number;
  /** Sparkline series (recent history). */
  readonly trend?: readonly number[];
  /** Status accent (left rail + sparkline color). */
  readonly status?: KpiStatus;
  /** One-line "why it matters". */
  readonly context?: string;
}

const STATUS_COLOR: Record<KpiStatus, string> = {
  positive: "var(--positive)",
  caution: "var(--caution)",
  critical: "var(--critical)",
  info: "var(--info)",
  neutral: "var(--chart-1)",
};
const DELTA_ARROW = { up: "arrow-up-right", down: "arrow-up-right", flat: "arrow-right" } as const;

/**
 * KpiCard — the executive KPI (PX.1c). Beyond a bare figure it communicates the
 * TREND: value + direction + delta vs previous + confidence + a mini sparkline +
 * a status accent + one line of context ("why care"). Token-only (theme-aware),
 * accessible (delta announced with words, arrow decorative), and a null value
 * shows an honest empty state — never a fabricated zero.
 */
export function KpiCard({
  label,
  value,
  suffix,
  icon,
  emphasis = "default",
  delta,
  previous,
  confidence,
  trend,
  status = "neutral",
  context,
}: KpiCardProps) {
  const empty = value === null;
  const accent = STATUS_COLOR[status];
  const display = typeof value === "number" ? value.toLocaleString() : value;

  return (
    <article
      className={[styles.card, emphasis === "hero" ? styles.hero : null].filter(Boolean).join(" ")}
      style={{ ["--kpi-accent" as string]: accent }}
    >
      <header className={styles.head}>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            <Icon name={icon} size={emphasis === "hero" ? 18 : 15} />
          </span>
        )}
        <span className={styles.label}>{label}</span>
        {typeof confidence === "number" && (
          <span className={styles.confidence} title="AI/data confidence">
            {Math.round(confidence * 100)}% conf
          </span>
        )}
      </header>

      {empty ? (
        <div className={styles.emptyValue}>No data yet</div>
      ) : (
        <div className={styles.valueRow}>
          <span className={styles.value}>
            {display}
            {suffix && <span className={styles.suffix}>{suffix}</span>}
          </span>
          {trend && trend.length > 1 && (
            <span className={styles.spark}>
              <Sparkline values={trend} color={accent} width={emphasis === "hero" ? 120 : 84} height={emphasis === "hero" ? 34 : 26} label={`${label} recent trend`} />
            </span>
          )}
        </div>
      )}

      <footer className={styles.foot}>
        {delta && !empty && (
          <span className={[styles.delta, styles[`delta_${delta.tone}`]].join(" ")}>
            <Icon
              name={DELTA_ARROW[delta.direction]}
              size={13}
              className={delta.direction === "down" ? styles.arrowDown : undefined}
            />
            {delta.text}
          </span>
        )}
        {previous && <span className={styles.previous}>{previous}</span>}
      </footer>

      {context && <p className={styles.context}>{context}</p>}
    </article>
  );
}
