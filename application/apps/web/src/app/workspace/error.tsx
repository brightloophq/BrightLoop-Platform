"use client";

import { useEffect } from "react";
import { RouteError } from "@brightloop/ui";

/**
 * Workspace segment error boundary. The persistent shell (sidebar · topbar ·
 * command palette) is provided by the layout and survives; this only replaces the
 * failed page's content with a graceful, recoverable state. `reset()` re-attempts
 * the render. Delegates to the shared `RouteError` primitive so every shell fails
 * identically, and never leaks the raw error, stack, or provider payload.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Workspace route error", error.digest ?? error.message);
  }, [error]);

  return <RouteError onRetry={() => reset()} />;
}
