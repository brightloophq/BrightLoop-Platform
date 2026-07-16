import type { ReactNode } from "react";
import { requireSurface } from "@/lib/auth";

/**
 * Admin command center layout — server-side surface guard.
 *
 * Only `owner`, `admin`, and `team_member` may render anything under /admin.
 * Capability-level gating (e.g. finance is owner/admin only) is enforced per
 * action in the service layer and by RLS — role at the door is not sufficient
 * on its own and is not treated as such.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSurface("admin");
  return <>{children}</>;
}
