/**
 * Workspace not-found (Phase F · Sprint F3.5). A friendly, on-brand 404 for any
 * missing workspace route or record, keeping the user inside the product.
 */

import Link from "next/link";
import { EmptyState, Button } from "@brightloop/ui";

export default function WorkspaceNotFound() {
  return (
    <div style={{ paddingTop: "var(--space-6)" }}>
      <EmptyState
        icon="search"
        title="Not found"
        body="This page or record doesn't exist, or you don't have access to it."
        action={<Button asChild variant="secondary"><Link href="/workspace">Back to dashboard</Link></Button>}
      />
    </div>
  );
}
