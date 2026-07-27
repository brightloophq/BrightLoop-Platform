/* =============================================================================
 * Copilot capability routing (Phase F · Sprint F2) — PURE.
 *
 * Maps a detected intent to a capability KEY in the E7 Capability Registry. The
 * registry is the single authority: the Copilot never invents capability names
 * and never bypasses it. `read` routes answer from a read capability, `action`
 * routes run a write capability (subject to permission + approval), and `answer`
 * routes compose from already-assembled context (no capability call). No io.
 * ========================================================================== */

import type { CopilotIntent } from "@brightloop/schema";
import { getCapability, isKnownCapability, capabilityRequiresApproval, capabilityApprovalClass } from "../agents/index.js";

export interface CapabilityRoute {
  intent: CopilotIntent;
  capabilityKey: string | null;
  mode: "read" | "action" | "answer";
}

export interface RouteContext { hasStrategy: boolean; hasPlan: boolean; hasAutomation: boolean }

/** Choose the registry capability (if any) that best serves an intent. */
export function routeIntentToCapability(intent: CopilotIntent, ctx: RouteContext): CapabilityRoute {
  switch (intent) {
    case "reporting": return { intent, capabilityKey: "reporting.generate_report", mode: "action" };
    case "planning": return ctx.hasPlan ? { intent, capabilityKey: "planning.get_execution_plan", mode: "read" } : { intent, capabilityKey: "planning.generate_plan", mode: "action" };
    case "automation": return ctx.hasAutomation ? { intent, capabilityKey: "automation.simulate_workflow", mode: "read" } : { intent, capabilityKey: "automation.build_workflow", mode: "action" };
    case "summary": return { intent, capabilityKey: "execution.get_workspace_state", mode: "read" };
    case "analysis": return ctx.hasStrategy ? { intent, capabilityKey: "strategy.get_result", mode: "read" } : { intent, capabilityKey: "execution.get_workspace_state", mode: "read" };
    // Answered from already-assembled context / read models — no capability call.
    case "question": case "explanation": case "approval": case "search":
    case "navigation": case "clarification": case "escalation": case "command":
    default: return { intent, capabilityKey: null, mode: "answer" };
  }
}

export interface CapabilityGate { known: boolean; requiredPermission: string | null; requiresApproval: boolean; approvalClass: string | null; sideEffect: string | null }

/** The registry facts the application enforces before invoking a capability. */
export function capabilityGate(capabilityKey: string | null): CapabilityGate {
  if (capabilityKey === null) return { known: true, requiredPermission: null, requiresApproval: false, approvalClass: null, sideEffect: null };
  const spec = getCapability(capabilityKey);
  if (spec === undefined || !isKnownCapability(capabilityKey)) return { known: false, requiredPermission: null, requiresApproval: false, approvalClass: null, sideEffect: null };
  return {
    known: true,
    requiredPermission: spec.requiredPermission,
    requiresApproval: capabilityRequiresApproval(capabilityKey),
    approvalClass: capabilityApprovalClass(capabilityKey),
    sideEffect: spec.sideEffect,
  };
}
