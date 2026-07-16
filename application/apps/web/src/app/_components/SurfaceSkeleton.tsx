import type { ReactNode } from "react";
import { Badge, Button } from "@brightloop/ui";
import styles from "./SurfaceSkeleton.module.css";

export interface SurfaceSkeletonProps {
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Machine statuses rendered as badges — proves the schema→tone binding. */
  statuses?: readonly string[];
  note?: ReactNode;
}

/**
 * Sprint 0 placeholder shell.
 *
 * This is scaffolding, NOT design work: it exists to prove that routing, the
 * surface guards, the token pipeline, and the schema→UI binding are wired
 * end-to-end. The real layouts (nav, sidebar, mega-menu, etc.) arrive with the
 * sprint that owns each surface.
 */
export function SurfaceSkeleton({
  eyebrow,
  title,
  children,
  statuses = [],
  note,
}: SurfaceSkeletonProps) {
  return (
    <main className={styles.wrap}>
      <div className={styles.panel}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.body}>{children}</div>

        {statuses.length > 0 ? (
          <div className={styles.meta}>
            {statuses.map((status) => (
              // Tone is resolved from toneFor(status) inside Badge — the call
              // site never picks a status color.
              <Badge key={status} status={status} dot />
            ))}
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button variant="primary" size="md">
            Primary
          </Button>
          <Button variant="secondary" size="md">
            Secondary
          </Button>
          <Button variant="ghost" size="md" disabled>
            Disabled
          </Button>
        </div>

        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
    </main>
  );
}
