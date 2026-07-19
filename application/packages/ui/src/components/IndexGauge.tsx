import type { ReactNode } from "react";
import styles from "./IndexGauge.module.css";

export interface IndexGaugeProps {
  /** Mono label, e.g. "Baseline Index" / "System Index". */
  label: string;
  /** The composite Index value shown large. */
  value: number;
  /** Target tick position on the 0–100 track. */
  target: number;
  /** Optional baseline tick (Activation / Console show where the System started). */
  baseline?: number;
  /** Short mono note on the label line, e.g. "58 below target" / "+37 from baseline". */
  note?: ReactNode;
  /** Supporting sentence under the gauge. */
  caption?: ReactNode;
  className?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * IndexGauge — the linear companion to the System Map's radial arc (DS §06 /
 * screens 01–03). A large Index number beside a 0–100 track that fills to the
 * value, with an amber target tick (and an optional baseline tick). Mono labels,
 * one amber accent. Pure/presentational — the value is passed in.
 */
export function IndexGauge({ label, value, target, baseline, note, caption, className }: IndexGaugeProps) {
  const fill = clamp(value);
  const targetPos = clamp(target);
  return (
    <div className={[styles.gauge, className].filter(Boolean).join(" ")}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </div>
      <div className={styles.body}>
        <span className={styles.value}>{value}</span>
        <div className={styles.trackWrap}>
          <div
            className={styles.track}
            role="meter"
            aria-valuenow={value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} ${value} of 100, target ${target}`}
          >
            <div className={styles.fill} style={{ width: `${fill}%` }} />
            {baseline != null ? (
              <span className={styles.baselineTick} style={{ left: `${clamp(baseline)}%` }} aria-hidden="true" />
            ) : null}
            <span className={styles.targetTick} style={{ left: `${targetPos}%` }} aria-hidden="true" />
          </div>
          <div className={styles.scale}>
            {baseline != null ? <span>Baseline {baseline}</span> : <span>0</span>}
            <span className={styles.scaleTarget}>Target {target}</span>
            <span>100</span>
          </div>
        </div>
      </div>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
    </div>
  );
}
