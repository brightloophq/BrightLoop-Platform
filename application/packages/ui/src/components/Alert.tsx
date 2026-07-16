import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Alert.module.css";

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  icon?: string;
  children: ReactNode;
  className?: string;
}

const DEFAULT_ICON: Record<AlertTone, string> = {
  info: "sparkles",
  success: "check-circle",
  warning: "lightbulb",
  danger: "x",
  neutral: "lock",
};

/**
 * Alert — a persistent inline condition (dunning, holds, honest empty states).
 *
 * Accessibility: danger/warning alerts announce via role="alert"; informational
 * ones do not steal focus. Tone is always paired with text, never colour alone.
 */
export function Alert({ tone = "info", title, icon, children, className }: AlertProps) {
  const assertive = tone === "danger" || tone === "warning";
  return (
    <div
      className={[styles.alert, styles[tone], className].filter(Boolean).join(" ")}
      role={assertive ? "alert" : undefined}
    >
      <Icon name={icon ?? DEFAULT_ICON[tone]} size={17} className={styles.icon} />
      <div>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
