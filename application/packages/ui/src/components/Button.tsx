import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "gradient";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  block?: boolean;
  loading?: boolean;
  /**
   * Render the single child element with the button's styling instead of a
   * <button>. Use for links that look like buttons (e.g. wrapping next/link),
   * which keeps the anchor semantics screen readers and middle-click expect —
   * rather than nesting an <a> inside a <button>.
   */
  asChild?: boolean;
}

/**
 * Button — prop surface per handoff §04.6 component inventory.
 *
 * Note: submit is disabled only while `loading` (submitting), never merely
 * because a form is invalid — per handoff §09.1, let submit surface errors.
 */
export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  block = false,
  loading = false,
  asChild = false,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    block ? styles.block : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (asChild && isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    return cloneElement(children, {
      className: [classes, children.props.className].filter(Boolean).join(" "),
      children: (
        <>
          {leftIcon}
          {children.props.children}
          {rightIcon}
        </>
      ),
    });
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
