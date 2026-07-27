import "server-only";

/**
 * Workspace Experience — server data access (Phase F · Sprint F1).
 *
 * THE ONLY place the client product UI reaches data. It goes through the exact
 * same seam as every other surface: `buildAppContext()` → existing public read
 * models (`@brightloop/application`). No business logic, no validation, no new
 * queries live here — the UI stays thin and RLS scopes everything to the caller's
 * own org (a `null` context means unauthenticated). The client's transformation
 * workspaces (their "projects") are read RLS-scoped exactly as the legacy portal
 * reads its own rows.
 */

import { buildAppContext } from "./runtime-api";
import { createClient } from "./supabase/server";
import {
  getAgentOpsDashboard, getApprovalQueue, getMissionDetail, getWorkspaceHealth, listAgentMissions,
  listAgentProfiles, listExecutionIntents, listExecutiveReports, listPlanningSessions, listStrategyHistory,
  type AgentMissionDTO, type AgentProfileDTO, type ExecutionIntentDTO, type ExecutiveReportDTO,
} from "@brightloop/application";
import type { NotificationInputs } from "./workspace/notifications";

export interface WorkspaceRef { id: string; title: string; status: string }

/** The client's transformation workspaces (their projects), newest first. RLS-scoped. */
export async function resolveWorkspaces(): Promise<WorkspaceRef[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("transformation_workspace").select("id, title, status").order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title ?? "Project"), status: String(r.status ?? "active") }));
}

export interface WorkspaceDashboardData {
  workspace: WorkspaceRef | null;
  workspaces: WorkspaceRef[];
  health: { health: number | null; confidence: number | null; period: string | null };
  ops: { activeMissions: number; waitingApprovals: number; completedMissions: number; totalMissions: number };
  missions: AgentMissionDTO[];
  reports: ExecutiveReportDTO[];
  intents: ExecutionIntentDTO[];
  counts: { strategies: number; plans: number; reports: number; automations: number };
}

/** Everything the client dashboard needs, from existing read models. Null = unauthenticated. */
export async function loadWorkspaceDashboard(): Promise<WorkspaceDashboardData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaces = await resolveWorkspaces();
  const workspace = workspaces[0] ?? null;
  if (workspace === null) {
    return { workspace: null, workspaces, health: { health: null, confidence: null, period: null }, ops: { activeMissions: 0, waitingApprovals: 0, completedMissions: 0, totalMissions: 0 }, missions: [], reports: [], intents: [], counts: { strategies: 0, plans: 0, reports: 0, automations: 0 } };
  }
  const wid = workspace.id;
  const [health, ops, missions, reports, intents, plans, strategies] = await Promise.all([
    getWorkspaceHealth(ctx, wid), getAgentOpsDashboard(ctx, wid), listAgentMissions(ctx, wid),
    listExecutiveReports(ctx, wid), listExecutionIntents(ctx, wid), listPlanningSessions(ctx, wid), listStrategyHistory(ctx, wid),
  ]);
  return {
    workspace, workspaces,
    health: { health: health.health, confidence: health.confidence, period: health.period },
    ops, missions, reports, intents,
    counts: { strategies: strategies.length, plans: plans.length, reports: reports.length, automations: intents.length },
  };
}

/** The notification-center inputs, derived from the same read models. Null = unauthenticated. */
export async function loadNotificationInputs(): Promise<NotificationInputs> {
  const ctx = await buildAppContext();
  if (ctx === null) return {};
  const workspaces = await resolveWorkspaces();
  const wid = workspaces[0]?.id;
  if (wid === undefined) return {};
  const [missions, reports, intents] = await Promise.all([listAgentMissions(ctx, wid), listExecutiveReports(ctx, wid), listExecutionIntents(ctx, wid)]);
  const approvals = missions.filter((m) => m.status === "waiting_for_approval").map((m) => ({ id: m.id, taskKey: "review", missionId: m.id, requestedAt: m.updatedAt }));
  return {
    missions: missions.map((m) => ({ id: m.id, title: m.title, status: m.status, updatedAt: m.updatedAt })),
    approvals,
    reports: reports.map((r) => ({ id: r.id, title: r.title, status: r.status, updatedAt: r.updatedAt })),
    automations: intents.map((i) => ({ id: i.id, title: i.title, status: i.status, createdAt: i.createdAt })),
  };
}

export interface ProjectsData { workspaces: WorkspaceRef[] }
export async function loadProjects(): Promise<ProjectsData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  return { workspaces: await resolveWorkspaces() };
}

export interface AiTeamData { profiles: AgentProfileDTO[]; ops: { activeMissions: number; waitingApprovals: number; totalMissions: number }; missions: AgentMissionDTO[] }
export async function loadAiTeam(): Promise<AiTeamData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const wid = (await resolveWorkspaces())[0]?.id;
  if (wid === undefined) return { profiles: [], ops: { activeMissions: 0, waitingApprovals: 0, totalMissions: 0 }, missions: [] };
  const [profiles, ops, missions] = await Promise.all([listAgentProfiles(ctx, wid), getAgentOpsDashboard(ctx, wid), listAgentMissions(ctx, wid)]);
  return { profiles, ops, missions };
}

export async function loadReports(): Promise<{ reports: ExecutiveReportDTO[] } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const wid = (await resolveWorkspaces())[0]?.id;
  return { reports: wid === undefined ? [] : await listExecutiveReports(ctx, wid) };
}

export async function loadAutomations(): Promise<{ intents: ExecutionIntentDTO[] } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const wid = (await resolveWorkspaces())[0]?.id;
  return { intents: wid === undefined ? [] : await listExecutionIntents(ctx, wid) };
}

export interface ApprovalRow { missionId: string; missionTitle: string; taskKey: string; approvalClass: string; requestedAt: string }
export async function loadApprovals(): Promise<{ approvals: ApprovalRow[] } | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const wid = (await resolveWorkspaces())[0]?.id;
  if (wid === undefined) return { approvals: [] };
  const missions = await listAgentMissions(ctx, wid);
  const waiting = missions.filter((m) => m.status === "waiting_for_approval");
  const queues = await Promise.all(waiting.map(async (m) => ({ m, q: await getApprovalQueue(ctx, m.id) })));
  const approvals = queues.flatMap(({ m, q }) => q.map((a) => ({ missionId: m.id, missionTitle: m.title, taskKey: a.taskKey, approvalClass: a.approvalClass, requestedAt: a.requestedAt })));
  return { approvals };
}

export async function loadMission(missionId: string): Promise<Awaited<ReturnType<typeof getMissionDetail>> | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  try { return await getMissionDetail(ctx, missionId); } catch { return null; }
}
