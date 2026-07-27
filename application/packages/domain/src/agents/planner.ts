/* =============================================================================
 * Deterministic mission planner (Phase E · Sprint E7) — PURE.
 *
 * Turns a mission goal + available upstream references into a validated task DAG
 * that ORCHESTRATES existing contexts through capability keys. The planner is
 * deterministic; the application may optionally enrich it via the E1 Prompt Engine
 * but must validate the result before persistence. Capability selection here is
 * system-authored policy, never derived from untrusted content. No io.
 * ========================================================================== */

import { getCapability } from "./capabilities.js";
import { validateTaskGraph, type TaskNode } from "./taskgraph.js";
import type { ApprovalClass, CostCategory } from "@brightloop/schema";

export interface PlannedTask {
  key: string;
  kind: "capability" | "approval_gate" | "terminal" | "compensation";
  title: string;
  assignedRole: "coordinator" | "strategy" | "project_management" | "automation" | "reporting" | "knowledge" | "review";
  capabilityKey: string | null;
  capabilityInput: Record<string, unknown>;
  dependsOn: string[];
  parallelizable: boolean;
  optional: boolean;
  approvalGated: boolean;
  approvalClass: ApprovalClass | null;
  retryable: boolean;
  compensatesTaskKey: string | null;
  completionCriteria: string;
  expectedOutput: string;
  order: number;
}

export interface MissionPlan {
  objective: string;
  successCriteria: string[];
  constraints: string[];
  requiredCapabilities: string[];
  tasks: PlannedTask[];
  approvalGates: { taskKey: string; approvalClass: ApprovalClass }[];
  retryRules: { maxRetries: number; retryableKinds: string[] };
  estimatedCost: number;
  estimatedDurationMs: number;
  terminationConditions: string[];
}

export interface PlanMissionInput {
  goal: string;
  workspaceId: string;
  strategySessionId?: string | null;
  planningSessionId?: string | null;
  automationIntentId?: string | null;
  maxRetries?: number;
}

const COST_WEIGHT: Record<CostCategory, number> = { low: 1, medium: 3, high: 8 };

/** Classify the mission goal into an orchestration shape (keyword heuristic). */
export function classifyMission(goal: string): "reporting" | "automation" | "planning" | "strategy" | "full" {
  const g = goal.toLowerCase();
  if (/\breport|kpi|insight|forecast|metric/.test(g)) return "reporting";
  if (/\bautomat|workflow|deploy/.test(g)) return "automation";
  if (/\bplan|initiative|milestone|timeline/.test(g)) return "planning";
  if (/\bstrateg|recommendation|roadmap/.test(g)) return "strategy";
  return "full";
}

/**
 * Build the mission plan. Produces the full orchestration chain (knowledge →
 * strategy → planning → automation → reporting → review → complete), substituting
 * list-reads when a specific upstream id is not yet known. The result is
 * validated before it is returned.
 */
export function planMission(input: PlanMissionInput): MissionPlan {
  const ws = input.workspaceId;
  const tasks: PlannedTask[] = [];
  let order = 0;
  const add = (t: Omit<PlannedTask, "order">) => { tasks.push({ ...t, order: order++ }); };

  add({ key: "knowledge", kind: "capability", title: "Assemble knowledge context", assignedRole: "knowledge", capabilityKey: "knowledge.retrieve_context", capabilityInput: { workspaceId: ws }, dependsOn: [], parallelizable: false, optional: false, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Knowledge context retrieved with provenance", expectedOutput: "knowledge_context" });

  add(input.strategySessionId
    ? { key: "strategy", kind: "capability", title: "Read approved strategy", assignedRole: "strategy", capabilityKey: "strategy.get_result", capabilityInput: { sessionId: input.strategySessionId }, dependsOn: ["knowledge"], parallelizable: false, optional: false, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Strategy result retrieved", expectedOutput: "strategy_result" }
    : { key: "strategy", kind: "capability", title: "Survey strategy history", assignedRole: "strategy", capabilityKey: "strategy.list_history", capabilityInput: { workspaceId: ws }, dependsOn: ["knowledge"], parallelizable: false, optional: true, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Strategy history surveyed", expectedOutput: "strategy_history" });

  add(input.planningSessionId
    ? { key: "planning", kind: "capability", title: "Read execution plan", assignedRole: "project_management", capabilityKey: "planning.get_execution_plan", capabilityInput: { sessionId: input.planningSessionId }, dependsOn: ["strategy"], parallelizable: false, optional: false, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Execution plan retrieved", expectedOutput: "execution_plan" }
    : { key: "planning", kind: "capability", title: "Survey planning sessions", assignedRole: "project_management", capabilityKey: "planning.list_sessions", capabilityInput: { workspaceId: ws }, dependsOn: ["strategy"], parallelizable: false, optional: true, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Planning sessions surveyed", expectedOutput: "planning_sessions" });

  add({ key: "automation", kind: "capability", title: "Survey automation intents", assignedRole: "automation", capabilityKey: "automation.list_intents", capabilityInput: { workspaceId: ws }, dependsOn: ["planning"], parallelizable: true, optional: true, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Automation intents surveyed", expectedOutput: "automation_intents" });

  add({ key: "report", kind: "capability", title: "Generate executive report", assignedRole: "reporting", capabilityKey: "reporting.generate_report", capabilityInput: { workspaceId: ws, kind: "executive_summary", title: `Agent report: ${input.goal.slice(0, 120)}` }, dependsOn: ["planning", "automation"], parallelizable: false, optional: false, approvalGated: false, approvalClass: null, retryable: true, compensatesTaskKey: null, completionCriteria: "Executive report generated with metrics + insights", expectedOutput: "report" });

  add({ key: "review", kind: "approval_gate", title: "Human review + approval", assignedRole: "review", capabilityKey: null, capabilityInput: {}, dependsOn: ["report"], parallelizable: false, optional: false, approvalGated: true, approvalClass: "plan_approval", retryable: false, compensatesTaskKey: null, completionCriteria: "Human approval recorded", expectedOutput: "" });

  add({ key: "complete", kind: "terminal", title: "Complete mission", assignedRole: "coordinator", capabilityKey: null, capabilityInput: {}, dependsOn: ["review"], parallelizable: false, optional: false, approvalGated: false, approvalClass: null, retryable: false, compensatesTaskKey: null, completionCriteria: "All success criteria satisfied", expectedOutput: "mission_outcome" });

  const requiredCapabilities = [...new Set(tasks.map((t) => t.capabilityKey).filter((k): k is string => k !== null))];
  const estimatedCost = requiredCapabilities.reduce((sum, k) => sum + (COST_WEIGHT[getCapability(k)?.costCategory ?? "low"]), 0);
  const estimatedDurationMs = requiredCapabilities.reduce((sum, k) => sum + (getCapability(k)?.timeoutMs ?? 0), 0);

  const plan: MissionPlan = {
    objective: input.goal,
    successCriteria: ["All required capabilities invoked successfully", "Report generated with grounded evidence", "Required approvals recorded", "Mission evaluated as pass"],
    constraints: ["Consume upstream contexts only via capabilities", "No external side effects", "Stay within mission budgets"],
    requiredCapabilities,
    tasks,
    approvalGates: tasks.filter((t) => t.approvalGated && t.approvalClass !== null).map((t) => ({ taskKey: t.key, approvalClass: t.approvalClass! })),
    retryRules: { maxRetries: input.maxRetries ?? 3, retryableKinds: ["capability"] },
    estimatedCost,
    estimatedDurationMs,
    terminationConditions: ["all tasks completed", "hard budget/limit reached", "approval rejected", "unrecoverable failure", "cancelled"],
  };
  return plan;
}

/** Validate a mission plan's task graph (thin wrapper over the graph validator). */
export function validateMissionPlan(plan: MissionPlan): { ok: boolean; issues: string[] } {
  const nodes: TaskNode[] = plan.tasks.map((t) => ({ key: t.key, kind: t.kind, capabilityKey: t.capabilityKey, dependsOn: t.dependsOn, parallelizable: t.parallelizable, optional: t.optional, approvalGated: t.approvalGated, completionCriteria: t.completionCriteria, expectedOutput: t.expectedOutput, compensatesTaskKey: t.compensatesTaskKey }));
  return validateTaskGraph(nodes);
}
