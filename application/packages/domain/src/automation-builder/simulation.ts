/* =============================================================================
 * Workflow dry-run simulation (Phase E · Sprint E5) — PURE.
 *
 * Walks the DAG WITHOUT executing anything: no HTTP, no engine, no side effects.
 * Returns the execution order, the branch decisions a run WOULD take, the outputs
 * it WOULD produce, warnings, and an estimated runtime. Deterministic. No io.
 * ========================================================================== */

import type { ConditionDefinition, VariableDefinition, WorkflowStep } from "@brightloop/schema";
import { reachableFrom, topologicalOrder, type GraphNode } from "./graph.js";

export interface SimulationInput {
  entryStepKey: string | null;
  steps: readonly WorkflowStep[];
  conditions: readonly ConditionDefinition[];
  variables: readonly VariableDefinition[];
}

export interface BranchDecision { stepKey: string; taken: string; reason: string }
export interface ExpectedOutput { key: string; scope: string; type: string }

export interface SimulationResult {
  ok: boolean;
  executionOrder: string[];
  branchDecisions: BranchDecision[];
  expectedOutputs: ExpectedOutput[];
  warnings: string[];
  estimatedRuntimeMs: number;
}

/** Simulate a workflow's execution (dry-run). Never performs real work. Pure. */
export function simulateWorkflow(input: SimulationInput): SimulationResult {
  const warnings: string[] = [];
  const nodes: GraphNode[] = input.steps.map((s) => ({ key: s.key, nextStepKeys: s.nextStepKeys, onErrorStepKey: s.onErrorStepKey }));
  const byKey = new Map(input.steps.map((s) => [s.key, s]));

  const order = topologicalOrder(nodes, input.entryStepKey);
  const executionOrder = order ?? [];
  if (order === null) warnings.push("Workflow could not be linearized (cycle); execution order is empty");
  if (input.entryStepKey === null) warnings.push("No entry step; nothing would run");

  // Branch decisions: at each condition/branch node a run deterministically takes
  // the first successor (its "true" path) — this dry-run assumes conditions pass.
  const branchDecisions: BranchDecision[] = [];
  for (const key of executionOrder) {
    const step = byKey.get(key);
    if (!step || (step.kind !== "condition" && step.kind !== "branch")) continue;
    const cond = input.conditions.find((c) => c.trueStepKey !== null || c.falseStepKey !== null);
    const taken = step.nextStepKeys[0] ?? cond?.trueStepKey ?? null;
    if (taken === null) { warnings.push(`Branch "${key}" has no path to take`); continue; }
    branchDecisions.push({ stepKey: key, taken, reason: "condition assumed true (dry-run)" });
  }

  // Estimated runtime: sum of per-step estimates over the reachable steps.
  const reachable = reachableFrom(nodes, input.entryStepKey);
  const estimatedRuntimeMs = input.steps.filter((s) => reachable.has(s.key)).reduce((sum, s) => sum + s.estimatedRuntimeMs, 0);

  const expectedOutputs: ExpectedOutput[] = input.variables.filter((v) => v.scope === "output").map((v) => ({ key: v.key, scope: v.scope, type: v.type }));
  if (expectedOutputs.length === 0) warnings.push("No output variables; the workflow produces no declared output");

  return { ok: order !== null && input.entryStepKey !== null, executionOrder, branchDecisions, expectedOutputs, warnings: [...new Set(warnings)], estimatedRuntimeMs };
}
