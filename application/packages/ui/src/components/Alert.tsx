import type { ReactNode } from "react";
import styles from "./Alert.module.css";

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * The tone word replaces what used to be a pictogram. It is deliberately TEXT:
 * it satisfies WCAG 1.4.1 (severity is never carried by colour alone) for
 * sighted and assistive users with the same characters, which an icon could only
 * do via an aria-label nobody could see.
 */
const TONE_WORD: Record<AlertTone, string> = {
  info: "Note",
  success: "Done",
  warning: "Caution",
  danger: "Error",
  neutral: "Status",
};

/**
 * Alert — a persistent inline condition (dunning, holds, honest empty states).
 *
 * Accessibility: danger/warning alerts announce via role="alert"; informational
 * ones do not steal focus. Tone is always paired with text, never colour alone.
 */
export function Alert({ tone = "info", title, children, className }: AlertProps) {
  const assertive = tone === "danger" || tone === "warning";
  return (
    <div
      className={[styles.alert, styles[tone], className].filter(Boolean).join(" ")}
      role={assertive ? "alert" : undefined}
    >
      <span className={styles.tone}>{TONE_WORD[tone]}</span>
      <div>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
