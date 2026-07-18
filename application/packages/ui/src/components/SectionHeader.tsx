import type { ReactNode } from "react";
import styles from "./SectionHeader.module.css";

export interface SectionHeaderProps {
  title: ReactNode;
  /** Uppercase eyebrow above the title. */
  kicker?: ReactNode;
  /** One-line supporting description. */
  hint?: ReactNode;
  /** Right-aligned actions. */
  action?: ReactNode;
  /** Heading level for semantics. */
  as?: "h1" | "h2" | "h3";
  /** Visual scale — a page title vs a section title. */
  size?: "page" | "section";
  className?: string;
}

/**
 * The one way Auxion titles a region — page titles and section titles alike.
 * A consistent kicker → title → hint stack gives every module the same
 * information hierarchy, which is what makes screens feel like one product.
 */
export function SectionHeader({
  title,
  kicker,
  hint,
  action,
  as: Tag = "h2",
  size = "section",
  className,
}: SectionHeaderProps) {
  return (
    <div className={[styles.header, className].filter(Boolean).join(" ")}>
      <div className={styles.text}>
        {kicker ? <span className={styles.kicker}>{kicker}</span> : null}
        <Tag className={[styles.title, size === "page" ? styles.page : styles.section].join(" ")}>
          {title}
        </Tag>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
