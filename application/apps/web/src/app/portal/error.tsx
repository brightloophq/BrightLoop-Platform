"use client";

import { useEffect } from "react";
import { RouteError } from "@brightloop/ui";
import shell from "../admin/admin.module.css";

/**
 * Client-portal segment error boundary. The persistent sidebar is provided by the
 * layout; this replaces the failed page's content area (topbar + content are
 * page-owned, so we supply the padded content box here). `reset()` re-attempts the
 * render. Delegates to the shared `RouteError` primitive — no raw error, stack, or
 * provider payload is ever shown to the client.
 */
export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className={shell.content}>
      <RouteError onRetry={() => reset()} />
    </div>
  );
}
