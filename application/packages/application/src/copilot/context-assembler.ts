/* =============================================================================
 * Copilot context engine (Phase F · Sprint F2).
 *
 * Automatically assembles the conversation context from EXISTING read models —
 * workspace health, missions, reports, approvals, strategy/plan/automation
 * presence — so the user never repeats context. Every read is permission-scoped
 * by RLS + the caller's capabilities (a denied read simply contributes nothing).
 * Consumes application services ONLY.
 * ========================================================================== */

import { hasCapability } from "@brightloop/schema";
import type { CopilotConversation } from "@brightloop/schema";
import { getAgentOpsDashboard, listAgentMissions } from "../agents/agent-read.js";
import { listExecutionIntents } from "../automation-builder/builder-read.js";
import { listPlanningSessions } from "../project-manager/planner-read.js";
import { getWorkspaceHealth, listExecutiveReports } from "../reporting/reporting-read.js";
import { listStrategyHistory } from "../strategist/strategy-read.js";
import { getRuntimeOpsDashboard } from "../execution-runtime/runtime-read.js";
// F5 billing — read models ONLY (no connector/provider import → copilot boundary intact).
import { getBillingOverview } from "../billing/billing-read.js";
import type { AppContext } from "../context.js";
import type { ConversationContextDTO } from "./dto.js";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

/** The capabilities the Copilot surfaces actions for — listed for the UI. */
const SUGGESTABLE_PERMISSIONS = ["report.generate", "planning.run", "automation.generate", "strategy.run"];

/** Assemble the full conversation context. Permission- and RLS-scoped. */
export async function assembleConversationContext(ctx: AppContext, conversation: CopilotConversation): Promise<ConversationContextDTO> {
  const wid = conversation.workspaceId;
  const permissions = SUGGESTABLE_PERMISSIONS.filter((p) => hasCapability(ctx.actor.role, p));

  const [health, ops, missions, reports, intents, plans, strategies, runtimeOps, billing] = await Promise.all([
    safe(() => getWorkspaceHealth(ctx, wid), { health: null, confidence: null, reportId: null, period: null }),
    safe(() => getAgentOpsDashboard(ctx, wid), { activeMissions: 0, waitingApprovals: 0, failedMissions: 0, completedMissions: 0, totalMissions: 0 }),
    safe(() => listAgentMissions(ctx, wid), []),
    safe(() => listExecutiveReports(ctx, wid), []),
    safe(() => listExecutionIntents(ctx, wid), []),
    safe(() => listPlanningSessions(ctx, wid), []),
    safe(() => listStrategyHistory(ctx, wid), []),
    safe(() => getRuntimeOpsDashboard(ctx, wid), { runtimes: 0, healthyRuntimes: 0, activeDeployments: 0, failedDeployments: 0, awaitingApproval: 0, runningExecutions: 0, failedExecutions: 0 }),
    safe(() => getBillingOverview(ctx, wid), { account: null, subscription: null, entitlements: null, usage: null }),
  ]);
  const active = missions.find((m) => m.status === "running" || m.status === "planning" || m.status === "resuming");
  // The first meter at/over 80% utilization, if any — a plain billing usage alert.
  const meterOver = billing.usage?.meters.find((m) => m.utilization >= 0.8) ?? null;
  const billingUsageAlert = meterOver
    ? `${meterOver.meter.replace(/_/g, " ")} at ${Math.round(meterOver.utilization * 100)}% of limit`
    : null;

  return {
    workspaceId: wid,
    workspaceTitle: null,
    panel: conversation.panel,
    health: health.health,
    activeMissions: ops.activeMissions,
    waitingApprovals: ops.waitingApprovals,
    reportCount: reports.length,
    automationCount: intents.length,
    hasStrategy: strategies.length > 0,
    hasPlan: plans.some((p) => p.status === "approved") || plans.length > 0,
    hasAutomation: intents.length > 0,
    activeMissionId: active?.id ?? null,
    permissions,
    activeDeployments: runtimeOps.activeDeployments,
    failedDeployments: runtimeOps.failedDeployments,
    awaitingDeploymentApproval: runtimeOps.awaitingApproval,
    runtimesHealthy: runtimeOps.runtimes === 0 || runtimeOps.healthyRuntimes === runtimeOps.runtimes,
    billingTier: billing.subscription?.tier ?? null,
    billingStatus: billing.subscription?.status ?? null,
    billingUsageAlert,
  };
}
