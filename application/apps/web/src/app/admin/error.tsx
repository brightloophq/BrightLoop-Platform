"use client";

import { useEffect } from "react";
import { RouteError } from "@brightloop/ui";
import shell from "./admin.module.css";

/**
 * Admin segment error boundary. Catches errors thrown by any admin page render so a
 * data failure yields a graceful, themed, recoverable state instead of a blank or
 * broken screen. `reset()` re-attempts the segment render.
 *
 * Chrome (sidebar) is provided by the persistent layout; this only replaces the
 * failed page's content area. Rendering delegates to the shared `RouteError`
 * primitive so admin · workspace · portal fail identically.
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
      <RouteError onRetry={() => reset()} />
    </div>
  );
}
