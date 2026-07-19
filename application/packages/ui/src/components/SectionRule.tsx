import type { ReactNode } from "react";
import styles from "./SectionRule.module.css";

export interface SectionRuleProps {
  /** The section ordinal, e.g. "02" — rendered as an amber §02 in mono. */
  index: string;
  /** The section label, e.g. "Diagnosis" — Space Grotesk 600. */
  label: ReactNode;
  /** Right-aligned mono meta, e.g. "5 gaps to close". */
  meta?: ReactNode;
  /** Heading level for semantics. */
  as?: "h2" | "h3";
  className?: string;
}

/**
 * SectionRule — the canonical numbered §NN section header (DS §06):
 * an amber mono §NN + a Space Grotesk 600 label + a hairline leader that fills
 * to a right-aligned mono meta. Sits 36px above its content. This is the section
 * divider used across every operational surface; heroes use SectionHeader instead.
 */
export function SectionRule({ index, label, meta, as: Tag = "h2", className }: SectionRuleProps) {
  return (
    <div className={[styles.rule, className].filter(Boolean).join(" ")}>
      <span className={styles.index} aria-hidden="true">
        §{index}
      </span>
      <Tag className={styles.label}>{label}</Tag>
      <span className={styles.leader} aria-hidden="true" />
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </div>
  );
}
