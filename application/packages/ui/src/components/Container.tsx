import type { ElementType, HTMLAttributes, ReactNode } from "react";
import styles from "./Container.module.css";

export type ContainerWidth = "default" | "wide" | "md" | "sm" | "prose";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: ContainerWidth;
  children: ReactNode;
}

/** Centered max-width wrapper using the layout tokens. */
export function Container({ width = "default", children, className, ...rest }: ContainerProps) {
  const classes = [styles.container, styles[width], className].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export type SectionRhythm = "section" | "tight" | "hero";

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  rhythm?: SectionRhythm;
  /** Raised background, for alternating section bands. */
  inset?: boolean;
  as?: ElementType;
  children: ReactNode;
}

/** Vertical section rhythm using --section-y tokens. */
export function Section({
  rhythm = "section",
  inset = false,
  as: Tag = "section",
  children,
  className,
  ...rest
}: SectionProps) {
  const classes = [styles[rhythm], inset ? styles.inset : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
