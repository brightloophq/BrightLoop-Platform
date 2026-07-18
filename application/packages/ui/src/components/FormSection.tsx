import type { ReactNode } from "react";
import styles from "./FormSection.module.css";

export interface FormSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A titled group of form fields (semantic `<fieldset>` + `<legend>`). Gives every
 * form the same rhythm and a screen-reader-friendly grouping. Reused by every
 * create/edit surface across the command center.
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <fieldset className={[styles.section, className].filter(Boolean).join(" ")}>
      <legend className={styles.legend}>{title}</legend>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}
