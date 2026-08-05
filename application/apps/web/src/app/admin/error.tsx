"use client";

import { useEffect } from "react";
import { Alert, Button } from "@brightloop/ui";
import shell from "./admin.module.css";
import styles from "./error.module.css";

/**
 * Admin segment error boundary. Catches errors thrown by any admin page render so a
 * data failure yields a graceful, themed, recoverable state instead of a blank or
 * broken screen. `reset()` re-attempts the segment render.
 *
 * Intentionally generic and safe: it never surfaces the raw error message, stack, or
 * any provider payload to the user — only a plain-English explanation and a retry.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the browser console for local debugging; no PII, no user-facing leak.
    console.error("Admin route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className={shell.content}>
      <div className={styles.wrap} role="alert" aria-live="assertive">
        <Alert tone="danger" title="Something went wrong">
          We couldn&apos;t load this page. The issue has been noted — you can try again,
          and if it keeps happening, contact an administrator.
        </Alert>
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => reset()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
