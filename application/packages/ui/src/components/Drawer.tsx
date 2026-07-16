"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "left" | "right";
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Drawer — slide-in overlay.
 *
 * Accessibility (handoff §01.4): traps focus while open, closes on Escape and
 * scrim click, and restores focus to whatever opened it. Body scroll is locked
 * so the page behind doesn't move under the overlay.
 */
export function Drawer({ open, onClose, title, side = "right", children, footer }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    onClose();
    restoreRef.current?.focus();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    // Remember the trigger so focus can go back to it on close.
    restoreRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    panel?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <>
      <button className={styles.scrim} aria-label={`Close ${title}`} onClick={close} />
      <div
        ref={panelRef}
        className={[styles.drawer, styles[side]].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} aria-label={`Close ${title}`} onClick={close}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </>
  );
}
