import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Eyebrow.module.css";

export interface EyebrowProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

/** Uppercase tracked label — 12px, cyan, 0.18em tracking per handoff §04.2. */
export function Eyebrow({ children, className, ...rest }: EyebrowProps) {
  return (
    <span className={[styles.eyebrow, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
