/* =============================================================================
 * Copilot suggested actions (Phase F · Sprint F2) — PURE.
 *
 * Derives permission-aware next actions from the assembled context + intent. The
 * enablement predicate (`roleHas`) is injected by the application from the SAME
 * capability matrix that guards everything else — the Copilot never invents its
 * own authorization. Actions that would need a human approval are marked, not
 * silently run. No io.
 * ========================================================================== */

import type { CopilotActionKind, CopilotIntent } from "@brightloop/schema";
import { capabilityRequiresApproval, getCapability } from "../agents/index.js";

export interface SuggestionContext {
  hasApprovals: boolean;
  hasStrategy: boolean;
  hasPlan: boolean;
  reportCount: number;
  hasAutomation: boolean;
  hasActiveMission: boolean;
  activeMissionId: string | null;
}

export interface DerivedAction {
  kind: CopilotActionKind;
  label: string;
  capabilityKey: string | null;
  requiredPermission: string | null;
  enabled: boolean;
  requiresApproval: boolean;
  href: string;
}

/** Role-check predicate the application supplies (e.g. `may(actor, perm)`). */
export type RoleHas = (permission: string) => boolean;

function fromCapability(kind: CopilotActionKind, label: string, capabilityKey: string, href: string, roleHas: RoleHas): DerivedAction {
  const spec = getCapability(capabilityKey);
  const perm = spec?.requiredPermission ?? null;
  return { kind, label, capabilityKey, requiredPermission: perm, enabled: perm === null ? true : roleHas(perm), requiresApproval: capabilityRequiresApproval(capabilityKey), href };
}
function navAction(kind: CopilotActionKind, label: string, href: string): DerivedAction {
  return { kind, label, capabilityKey: null, requiredPermission: null, enabled: true, requiresApproval: false, href };
}

/** Derive the suggested actions for an intent + context. Always permission-aware. */
export function deriveSuggestedActions(intent: CopilotIntent, ctx: SuggestionContext, roleHas: RoleHas): DerivedAction[] {
  const out: DerivedAction[] = [];
  const seen = new Set<string>();
  const add = (a: DerivedAction) => { if (!seen.has(a.kind)) { seen.add(a.kind); out.push(a); } };

  // Always surface an approval review when something is waiting.
  if (ctx.hasApprovals) add(navAction("review_approvals", "Review pending approvals", "/workspace/approvals"));

  switch (intent) {
    case "reporting":
      add(fromCapability("generate_report", "Generate an executive report", "reporting.generate_report", "/workspace/reports?generate=1", roleHas));
      if (ctx.reportCount >= 2) add(navAction("compare_reports", "Compare recent reports", "/workspace/reports"));
      break;
    case "planning":
      add(ctx.hasPlan ? navAction("view_timeline", "View the execution timeline", "/workspace/projects") : fromCapability("explain_kpi", "Generate an execution plan", "planning.generate_plan", "/workspace/ai-team?mission=1", roleHas));
      break;
    case "automation":
      add(fromCapability("generate_workflow", "Generate an automation workflow", "automation.build_workflow", "/workspace/automations", roleHas));
      break;
    case "analysis":
      add(navAction("analyze_risks", "Analyze risks", "/workspace/reports"));
      if (ctx.hasStrategy) add(fromCapability("create_strategy", "Refresh the strategy", "strategy.run_analysis", "/workspace/ai-team", roleHas));
      break;
    default:
      break;
  }

  if (ctx.hasActiveMission && ctx.activeMissionId) add(navAction("continue_mission", "Continue the active mission", `/workspace/missions/${ctx.activeMissionId}`));
  if (ctx.reportCount > 0 && intent !== "reporting") add(navAction("explain_kpi", "Explain a KPI", "/workspace/reports"));
  return out.slice(0, 5);
}
