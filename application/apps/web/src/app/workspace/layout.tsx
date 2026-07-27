/**
 * Workspace Experience layout (Phase F · Sprint F1). Server component: it is the
 * second of the three authorization checks (middleware → THIS → RLS) via
 * `requireSurface("workspace")`, then hydrates the premium client shell with
 * notifications + workspaces derived from existing read models. No business logic.
 */

import { requireSurface } from "@/lib/auth";
import { loadNotificationInputs, resolveWorkspaces } from "@/lib/workspace-data";
import { deriveNotifications } from "@/lib/workspace/notifications";
import { WorkspaceShell } from "./WorkspaceShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireSurface("workspace");
  const [workspaces, notifInputs] = await Promise.all([resolveWorkspaces(), loadNotificationInputs()]);
  const notifications = deriveNotifications(notifInputs);
  const approvalsCount = (notifInputs.approvals ?? []).length;
  return (
    <WorkspaceShell workspaces={workspaces} notifications={notifications} approvalsCount={approvalsCount}>
      {children}
    </WorkspaceShell>
  );
}
