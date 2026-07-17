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

/** Surface tone. Living Blueprint is paper-first; `dark` paints a navy field
 *  (heroes, CTA bands) and scopes the dark token set to its subtree. */
export type SectionTone = "default" | "paper" | "dark";

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  rhythm?: SectionRhythm;
  /** Raised background, for alternating section bands. */
  inset?: boolean;
  /** Paint a self-contained surface. `dark` = navy hero field. */
  tone?: SectionTone;
  as?: ElementType;
  children: ReactNode;
}

/** Vertical section rhythm using --section-y tokens. */
export function Section({
  rhythm = "section",
  inset = false,
  tone = "default",
  as: Tag = "section",
  children,
  className,
  ...rest
}: SectionProps) {
  const toneClass =
    tone === "dark" ? styles.toneDark : tone === "paper" ? styles.tonePaper : null;
  const dataTheme = tone === "dark" ? "dark" : tone === "paper" ? "light" : undefined;
  const classes = [styles[rhythm], inset ? styles.inset : null, toneClass, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} data-theme={dataTheme} {...rest}>
      {children}
    </Tag>
  );
}
