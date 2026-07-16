import type { ElementType, HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation/lift. Use for cards that are links. */
  interactive?: boolean;
  /** Removes padding — for cards whose child manages its own spacing. */
  flush?: boolean;
  as?: ElementType;
  children: ReactNode;
}

export function Card({
  interactive = false,
  flush = false,
  as: Tag = "div",
  children,
  className,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    interactive ? styles.interactive : null,
    flush ? styles.flush : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
