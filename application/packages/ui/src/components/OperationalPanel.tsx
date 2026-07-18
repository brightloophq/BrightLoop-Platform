import type { ReactNode } from "react";
import styles from "./OperationalPanel.module.css";

export interface OperationalPanelProps {
  children: ReactNode;
  /** Emphasis: `anchor` is the primary operational surface (the loop). */
  tone?: "default" | "anchor";
  /** Remove inner padding when the child manages its own. */
  flush?: boolean;
  className?: string;
}

/**
 * A framed operational surface — the container that turns a cluster of data into
 * a defined "panel" of the operational canvas (feed panels, the transformation
 * anchor). Its border + raise give Auxion its layered, instrument-panel depth
 * rather than cards floating on a flat page. Token-only, reusable everywhere.
 */
export function OperationalPanel({ children, tone = "default", flush = false, className }: OperationalPanelProps) {
  return (
    <section
      className={[
        styles.panel,
        tone === "anchor" ? styles.anchor : null,
        flush ? styles.flush : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}
