import type { HTMLAttributes, ReactNode } from "react";
import { toneFor, type Tone } from "@brightloop/schema";
import styles from "./Badge.module.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Explicit tone. Prefer `status` so the tone derives from the schema. */
  tone?: Tone;
  /** A machine status — the tone is resolved via toneFor(status). */
  status?: string;
  dot?: boolean;
  children?: ReactNode;
}

/**
 * Badge — status pill.
 *
 * Integrity rule (handoff §02.1 / §15): status color MUST come from
 * `toneFor(status)`; the UI never invents status colors. Pass `status` and the
 * tone resolves automatically. `tone` is an escape hatch for non-status badges.
 *
 * Accessibility (§11.2): never convey status by color alone — the label text is
 * always rendered alongside the color, and `dot` is decorative only.
 */
export function Badge({ tone, status, dot = false, children, className, ...rest }: BadgeProps) {
  const resolved: Tone = tone ?? (status !== undefined ? toneFor(status) : "neutral");
  const classes = [styles.badge, styles[resolved], className].filter(Boolean).join(" ");

  return (
    <span className={classes} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {children ?? status}
    </span>
  );
}
