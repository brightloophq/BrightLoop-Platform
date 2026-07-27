/* =============================================================================
 * Workflow validation (Phase E · Sprint E5) — PURE.
 *
 * Checks a workflow definition is internally consistent and safe to PREPARE for
 * deployment (never to execute): no cycles, a trigger + an action present, every
 * variable reference resolves, every integration is bound, no dead branches, no
 * unreachable nodes, no duplicate step keys, and at least one output. Pure; no io.
 * ========================================================================== */

import type {
  ActionDefinition, ConditionDefinition, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowStep,
} from "@brightloop/schema";
import { hasWorkflowCycle, reachableFrom, terminalKeys, type GraphNode } from "./graph.js";

export interface WorkflowValidationInput {
  entryStepKey: string | null;
  steps: readonly WorkflowStep[];
  triggers: readonly TriggerDefinition[];
  actions: readonly ActionDefinition[];
  conditions: readonly ConditionDefinition[];
  variables: readonly VariableDefinition[];
  integrations: readonly IntegrationBinding[];
}

export interface WorkflowValidationResult { ok: boolean; issues: string[]; warnings: string[] }

const REF = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
function variableRefs(text: string): string[] {
  const out: string[] = [];
  let mch: RegExpExecArray | null;
  while ((mch = REF.exec(text)) !== null) out.push(mch[1]!);
  return out;
}

/** Validate a workflow graph. Returns every issue (empty ⇒ valid). Pure. */
export function validateWorkflow(input: WorkflowValidationInput): WorkflowValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const nodes: GraphNode[] = input.steps.map((s) => ({ key: s.key, nextStepKeys: s.nextStepKeys, onErrorStepKey: s.onErrorStepKey }));
  const stepKeys = new Set(input.steps.map((s) => s.key));
  const variableKeys = new Set(input.variables.map((v) => v.key));
  const integrationIds = new Set(input.integrations.map((b) => b.id));

  // duplicate ids (step keys must be unique within a workflow)
  const seenKeys = new Set<string>();
  for (const s of input.steps) { if (seenKeys.has(s.key)) issues.push(`Duplicate step key "${s.key}"`); seenKeys.add(s.key); }

  // cycles
  if (hasWorkflowCycle(nodes)) issues.push("Workflow contains a cycle");

  // missing triggers / actions
  if (input.triggers.length === 0 || !input.steps.some((s) => s.kind === "trigger")) issues.push("Workflow has no trigger");
  if (input.actions.length === 0 || !input.steps.some((s) => s.kind === "action")) issues.push("Workflow has no action");

  // edges must resolve; dead branches (condition targets pointing nowhere)
  for (const s of input.steps) {
    for (const next of s.nextStepKeys) if (!stepKeys.has(next)) issues.push(`Step "${s.key}" points to an unknown step "${next}"`);
    if (s.onErrorStepKey !== null && !stepKeys.has(s.onErrorStepKey)) issues.push(`Step "${s.key}" error path points to an unknown step "${s.onErrorStepKey}"`);
    if ((s.kind === "condition" || s.kind === "branch") && s.nextStepKeys.length === 0) issues.push(`Branch step "${s.key}" has no outgoing path (dead branch)`);
  }
  for (const c of input.conditions) {
    if (c.trueStepKey !== null && !stepKeys.has(c.trueStepKey)) issues.push(`Condition "${c.name}" true-path points to an unknown step`);
    if (c.falseStepKey !== null && !stepKeys.has(c.falseStepKey)) issues.push(`Condition "${c.name}" false-path points to an unknown step`);
  }

  // invalid variables — every {{ref}} in a condition or action config must resolve
  const refs = new Set<string>();
  for (const c of input.conditions) for (const r of variableRefs(c.expression)) refs.add(r);
  for (const a of input.actions) for (const r of variableRefs(JSON.stringify(a.config ?? {}))) refs.add(r);
  for (const r of refs) if (!variableKeys.has(r)) issues.push(`Undefined variable reference "${r}"`);
  const dupVar = new Set<string>();
  for (const v of input.variables) { if (dupVar.has(v.key)) issues.push(`Duplicate variable "${v.key}"`); dupVar.add(v.key); }

  // unbound integrations
  for (const b of input.integrations) if (!b.bound) issues.push(`Integration "${b.name}" is not bound`);
  for (const a of input.actions) if (a.integrationBindingId !== null && !integrationIds.has(a.integrationBindingId)) issues.push(`Action "${a.name}" references an unknown integration`);

  // unreachable nodes
  if (input.entryStepKey === null) issues.push("Workflow has no entry step");
  else if (!stepKeys.has(input.entryStepKey)) issues.push("Workflow entry step does not exist");
  else {
    const reachable = reachableFrom(nodes, input.entryStepKey);
    for (const s of input.steps) if (!reachable.has(s.key)) issues.push(`Unreachable step "${s.key}"`);
  }

  // missing outputs — a terminal node + at least one output-scoped variable
  if (terminalKeys(nodes).length === 0) issues.push("Workflow has no terminal (output) step");
  if (!input.variables.some((v) => v.scope === "output")) warnings.push("Workflow declares no output variable");

  return { ok: issues.length === 0, issues: [...new Set(issues)], warnings: [...new Set(warnings)] };
}
