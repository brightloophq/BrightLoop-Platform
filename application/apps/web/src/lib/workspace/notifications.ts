/**
 * Workspace Experience — notification derivation (Phase F · Sprint F1).
 *
 * PURE. The in-app notification center is DERIVED from existing read-model data
 * (mission statuses, pending approvals, ready reports, failures) — there is no
 * new notifications backend and no duplicated business logic. Unit tested.
 * No React, no io.
 */

export type NotificationKind =
  | "mission_completed" | "approval_required" | "report_ready" | "automation_generated"
  | "strategy_updated" | "failure" | "warning";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface WorkspaceNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
  severity: NotificationSeverity;
  at: string;
}

export interface NotificationInputs {
  missions?: readonly { id: string; title: string; status: string; updatedAt: string }[];
  approvals?: readonly { id: string; taskKey: string; missionId: string; requestedAt: string }[];
  reports?: readonly { id: string; title: string; status: string; updatedAt: string }[];
  automations?: readonly { id: string; title: string; status: string; createdAt: string }[];
  failures?: readonly { id: string; missionId: string; category: string; cause: string; createdAt: string }[];
}

const SEVERITY: Record<NotificationKind, NotificationSeverity> = {
  mission_completed: "success", approval_required: "warning", report_ready: "info",
  automation_generated: "info", strategy_updated: "info", failure: "critical", warning: "warning",
};

/** Build the notification list from read-model data, newest first. */
export function deriveNotifications(inputs: NotificationInputs): WorkspaceNotification[] {
  const out: WorkspaceNotification[] = [];
  const push = (kind: NotificationKind, id: string, title: string, detail: string, href: string, at: string) =>
    out.push({ id: `${kind}:${id}`, kind, title, detail, href, severity: SEVERITY[kind], at });

  for (const m of inputs.missions ?? []) if (m.status === "completed") push("mission_completed", m.id, "Mission completed", m.title, `/workspace/missions/${m.id}`, m.updatedAt);
  for (const a of inputs.approvals ?? []) push("approval_required", a.id, "Approval required", `Task "${a.taskKey}" is waiting for your decision`, `/workspace/approvals`, a.requestedAt);
  for (const r of inputs.reports ?? []) if (r.status === "generated" || r.status === "published") push("report_ready", r.id, "Report ready", r.title, `/workspace/reports`, r.updatedAt);
  for (const au of inputs.automations ?? []) if (au.status === "built" || au.status === "published") push("automation_generated", au.id, "Automation generated", au.title, `/workspace/automations`, au.createdAt);
  for (const f of inputs.failures ?? []) push("failure", f.id, "Attention needed", `${f.category}: ${f.cause}`, `/workspace/missions/${f.missionId}`, f.createdAt);

  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Unread count = approvals + failures + completed missions (the actionable set). */
export function actionableCount(notifications: readonly WorkspaceNotification[]): number {
  return notifications.filter((n) => n.severity === "warning" || n.severity === "critical" || n.kind === "mission_completed").length;
}
