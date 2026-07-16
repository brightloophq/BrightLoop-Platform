import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Tag.module.css";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  accent?: boolean;
  children: ReactNode;
}

/** Small metadata chip — tech, tags, facets. Not a status badge (use Badge). */
export function Tag({ accent = false, children, className, ...rest }: TagProps) {
  return (
    <span
      className={[styles.tag, accent ? styles.accent : null, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}
