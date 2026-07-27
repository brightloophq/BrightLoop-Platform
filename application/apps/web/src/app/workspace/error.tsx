"use client";

/**
 * Workspace error boundary (Phase F · Sprint F3.5). Catches unexpected render/
 * data errors in any workspace page and offers a safe retry — never a stack trace.
 * The shell (layout) stays mounted; only the content region is replaced.
 */

import { useEffect } from "react";
import { EmptyState, Button } from "@brightloop/ui";

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to the console for local debugging; never render internals to the user.
    console.error("workspace error", error);
  }, [error]);

  return (
    <div style={{ paddingTop: "var(--space-6)" }}>
      <EmptyState
        icon="lock"
        title="Something went wrong"
        body="We couldn't load this view. This is usually temporary — try again, and it should recover."
        action={<Button variant="secondary" onClick={() => reset()}>Try again</Button>}
      />
    </div>
  );
}
