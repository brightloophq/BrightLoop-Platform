"use client";

import { useId, useState, type ReactNode } from "react";
import styles from "./Accordion.module.css";

export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  /** Item id open on first render. */
  defaultOpenId?: string;
  /** Allow more than one panel open at a time. */
  multiple?: boolean;
}

/**
 * Accordion — disclosure list (FAQ, module deliverables).
 *
 * Accessibility: the trigger is a real <button> with aria-expanded and
 * aria-controls; the panel is hidden from the a11y tree when closed.
 *
 * The disclosure affordance is drawn in CSS from two hairlines (a plus that
 * loses its upright when open) rather than an imported chevron. A disclosure
 * with no affordance at all would be worse UI, so the mark stays — but it is
 * part of this component, built from the same rule primitive as every other
 * divider in the system, not a glyph from an icon set.
 */
export function Accordion({ items, defaultOpenId, multiple = false }: AccordionProps) {
  const baseId = useId();
  const [open, setOpen] = useState<string[]>(defaultOpenId ? [defaultOpenId] : []);

  const toggle = (id: string) => {
    setOpen((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      return multiple ? [...current, id] : [id];
    });
  };

  return (
    <div className={styles.list}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        const panelId = `${baseId}-${item.id}-panel`;
        const triggerId = `${baseId}-${item.id}-trigger`;

        return (
          <div key={item.id} className={styles.item}>
            <h3>
              <button
                id={triggerId}
                type="button"
                className={styles.trigger}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
              >
                {item.title}
                <span
                  aria-hidden="true"
                  className={[styles.disclosure, isOpen ? styles.open : null].filter(Boolean).join(" ")}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              className={styles.panel}
              hidden={!isOpen}
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
