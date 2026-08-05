"use client";

import { Alert } from "./Alert";
import { Button } from "./Button";
import styles from "./RouteError.module.css";

export interface RouteErrorProps {
  /** Re-attempt the segment render (wire the Next.js `reset` here). */
  onRetry: () => void;
  /** Heading for the alert. */
  title?: string;
  /** Plain-English body — never a raw error message, stack, or payload. */
  description?: string;
  /** Retry button label. */
  retryLabel?: string;
}

/**
 * RouteError — the ONE shared segment-error surface every shell's `error.tsx`
 * composes (admin · workspace · portal), so a data failure yields the same
 * graceful, themed, recoverable state everywhere instead of a blank or broken
 * screen. Centres itself inside whatever content area hosts it.
 *
 * Intentionally generic and safe: it surfaces only a plain-English explanation
 * and a retry — never the raw error message, stack, or any provider payload.
 * `role="alert"` + `aria-live="assertive"` so assistive tech announces the
 * failure immediately.
 */
export function RouteError({
  onRetry,
  title = "Something went wrong",
  description = "We couldn't load this page. The issue has been noted — you can try again, and if it keeps happening, contact an administrator.",
  retryLabel = "Try again",
}: RouteErrorProps) {
  return (
    <div className={styles.wrap} role="alert" aria-live="assertive">
      <Alert tone="danger" title={title}>
        {description}
      </Alert>
      <div className={styles.actions}>
        <Button variant="primary" onClick={onRetry}>
          {retryLabel}
        </Button>
      </div>
    </div>
  );
}
