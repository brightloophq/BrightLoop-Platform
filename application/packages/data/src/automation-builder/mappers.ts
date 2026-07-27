/* =============================================================================
 * AI Automation Builder — row ↔ domain mappers (Phase E · Sprint E5). Jsonb
 * fields (config, payload, snapshot, nextStepKeys) collapse defensively. The
 * type-safe boundary.
 * ========================================================================== */

import type {
  ActionDefinition, AutomationFeedback, AutomationPlan, AutomationVersion, ConditionDefinition, DeploymentPackage,
  ExecutionIntent, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowDefinition, WorkflowStep,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const nint = (v: unknown): number | null => (v === null || v === undefined ? null : int(v));
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function intentRow(i: ExecutionIntent): Record<string, unknown> {
  return { id: i.id, workspace_id: i.workspaceId, client_id: i.clientId, planning_session_id: i.planningSessionId, execution_plan_id: i.executionPlanId, title: i.title, objective: i.objective, status: i.status, requested_by_user_id: i.requestedByUserId, provider: i.provider, model: i.model, prompt_id: i.promptId, generation_duration_ms: i.generationDurationMs, validation_duration_ms: i.validationDurationMs, simulation_duration_ms: i.simulationDurationMs, token_total: i.tokenTotal, cost: i.cost, currency: i.currency, step_count: i.stepCount, branch_count: i.branchCount, variable_count: i.variableCount, estimated_runtime_ms: i.estimatedRuntimeMs, version: i.version, created_at: i.createdAt, updated_at: i.updatedAt };
}
export function toIntent(r: Record<string, unknown>): ExecutionIntent {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), planningSessionId: String(r["planning_session_id"]), executionPlanId: nstr(r["execution_plan_id"]), title: String(r["title"]), objective: String(r["objective"] ?? ""), status: r["status"] as ExecutionIntent["status"], requestedByUserId: String(r["requested_by_user_id"]), provider: nstr(r["provider"]), model: nstr(r["model"]), promptId: nstr(r["prompt_id"]), generationDurationMs: int(r["generation_duration_ms"]), validationDurationMs: int(r["validation_duration_ms"]), simulationDurationMs: int(r["simulation_duration_ms"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), currency: String(r["currency"] ?? "USD"), stepCount: int(r["step_count"]), branchCount: int(r["branch_count"]), variableCount: int(r["variable_count"]), estimatedRuntimeMs: int(r["estimated_runtime_ms"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function planRow(p: AutomationPlan): Record<string, unknown> {
  return { id: p.id, execution_intent_id: p.executionIntentId, workspace_id: p.workspaceId, client_id: p.clientId, summary: p.summary, workflow_count: p.workflowCount, step_count: p.stepCount, trigger_count: p.triggerCount, action_count: p.actionCount, variable_count: p.variableCount, integration_count: p.integrationCount, status: p.status, created_at: p.createdAt };
}
export function toPlan(r: Record<string, unknown>): AutomationPlan {
  return { id: String(r["id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), summary: String(r["summary"] ?? ""), workflowCount: int(r["workflow_count"]), stepCount: int(r["step_count"]), triggerCount: int(r["trigger_count"]), actionCount: int(r["action_count"]), variableCount: int(r["variable_count"]), integrationCount: int(r["integration_count"]), status: r["status"] as AutomationPlan["status"], createdAt: String(r["created_at"]) };
}

export function workflowRow(w: WorkflowDefinition): Record<string, unknown> {
  return { id: w.id, automation_plan_id: w.automationPlanId, execution_intent_id: w.executionIntentId, workspace_id: w.workspaceId, client_id: w.clientId, name: w.name, description: w.description, status: w.status, entry_step_key: w.entryStepKey, version: w.version, created_at: w.createdAt };
}
export function toWorkflow(r: Record<string, unknown>): WorkflowDefinition {
  return { id: String(r["id"]), automationPlanId: String(r["automation_plan_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), description: String(r["description"] ?? ""), status: r["status"] as WorkflowDefinition["status"], entryStepKey: nstr(r["entry_step_key"]), version: int(r["version"], 1), createdAt: String(r["created_at"]) };
}

export function stepRow(s: WorkflowStep): Record<string, unknown> {
  return { id: s.id, workflow_definition_id: s.workflowDefinitionId, execution_intent_id: s.executionIntentId, workspace_id: s.workspaceId, client_id: s.clientId, key: s.key, kind: s.kind, name: s.name, next_step_keys: s.nextStepKeys, condition_expression: s.conditionExpression, on_error_step_key: s.onErrorStepKey, retry_max: s.retryMax, timeout_ms: s.timeoutMs, ref_id: s.refId, estimated_runtime_ms: s.estimatedRuntimeMs, order_index: s.order, created_at: s.createdAt };
}
export function toStep(r: Record<string, unknown>): WorkflowStep {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), key: String(r["key"]), kind: r["kind"] as WorkflowStep["kind"], name: String(r["name"]), nextStepKeys: strArr(r["next_step_keys"]), conditionExpression: nstr(r["condition_expression"]), onErrorStepKey: nstr(r["on_error_step_key"]), retryMax: int(r["retry_max"]), timeoutMs: int(r["timeout_ms"]), refId: nstr(r["ref_id"]), estimatedRuntimeMs: int(r["estimated_runtime_ms"]), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function triggerRow(t: TriggerDefinition): Record<string, unknown> {
  return { id: t.id, workflow_definition_id: t.workflowDefinitionId, execution_intent_id: t.executionIntentId, workspace_id: t.workspaceId, client_id: t.clientId, kind: t.kind, name: t.name, config: t.config, created_at: t.createdAt };
}
export function toTrigger(r: Record<string, unknown>): TriggerDefinition {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as TriggerDefinition["kind"], name: String(r["name"]), config: obj(r["config"]), createdAt: String(r["created_at"]) };
}

export function actionRow(a: ActionDefinition): Record<string, unknown> {
  return { id: a.id, workflow_definition_id: a.workflowDefinitionId, execution_intent_id: a.executionIntentId, workspace_id: a.workspaceId, client_id: a.clientId, kind: a.kind, name: a.name, config: a.config, integration_binding_id: a.integrationBindingId, created_at: a.createdAt };
}
export function toAction(r: Record<string, unknown>): ActionDefinition {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as ActionDefinition["kind"], name: String(r["name"]), config: obj(r["config"]), integrationBindingId: nstr(r["integration_binding_id"]), createdAt: String(r["created_at"]) };
}

export function conditionRow(c: ConditionDefinition): Record<string, unknown> {
  return { id: c.id, workflow_definition_id: c.workflowDefinitionId, execution_intent_id: c.executionIntentId, workspace_id: c.workspaceId, client_id: c.clientId, name: c.name, expression: c.expression, true_step_key: c.trueStepKey, false_step_key: c.falseStepKey, created_at: c.createdAt };
}
export function toCondition(r: Record<string, unknown>): ConditionDefinition {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), name: String(r["name"]), expression: String(r["expression"] ?? ""), trueStepKey: nstr(r["true_step_key"]), falseStepKey: nstr(r["false_step_key"]), createdAt: String(r["created_at"]) };
}

export function variableRow(v: VariableDefinition): Record<string, unknown> {
  return { id: v.id, workflow_definition_id: v.workflowDefinitionId, execution_intent_id: v.executionIntentId, workspace_id: v.workspaceId, client_id: v.clientId, key: v.key, scope: v.scope, type: v.type, default_value: v.defaultValue, required: v.required, created_at: v.createdAt };
}
export function toVariable(r: Record<string, unknown>): VariableDefinition {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), key: String(r["key"]), scope: r["scope"] as VariableDefinition["scope"], type: r["type"] as VariableDefinition["type"], defaultValue: nstr(r["default_value"]), required: r["required"] === true, createdAt: String(r["created_at"]) };
}

export function bindingRow(b: IntegrationBinding): Record<string, unknown> {
  return { id: b.id, workflow_definition_id: b.workflowDefinitionId, execution_intent_id: b.executionIntentId, workspace_id: b.workspaceId, client_id: b.clientId, provider: b.provider, name: b.name, capability: b.capability, config: b.config, bound: b.bound, created_at: b.createdAt };
}
export function toBinding(r: Record<string, unknown>): IntegrationBinding {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), provider: r["provider"] as IntegrationBinding["provider"], name: String(r["name"]), capability: String(r["capability"] ?? ""), config: obj(r["config"]), bound: r["bound"] === true, createdAt: String(r["created_at"]) };
}

export function deploymentRow(d: DeploymentPackage): Record<string, unknown> {
  return { id: d.id, execution_intent_id: d.executionIntentId, workflow_definition_id: d.workflowDefinitionId, workspace_id: d.workspaceId, client_id: d.clientId, target: d.target, format: d.format, payload: d.payload, checksum: d.checksum, status: d.status, created_at: d.createdAt };
}
export function toDeployment(r: Record<string, unknown>): DeploymentPackage {
  return { id: String(r["id"]), executionIntentId: String(r["execution_intent_id"]), workflowDefinitionId: String(r["workflow_definition_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), target: r["target"] as DeploymentPackage["target"], format: String(r["format"] ?? "json"), payload: obj(r["payload"]), checksum: String(r["checksum"] ?? ""), status: r["status"] as DeploymentPackage["status"], createdAt: String(r["created_at"]) };
}

export function versionRow(v: AutomationVersion): Record<string, unknown> {
  return { id: v.id, workflow_definition_id: v.workflowDefinitionId, execution_intent_id: v.executionIntentId, workspace_id: v.workspaceId, client_id: v.clientId, version: v.version, status: v.status, snapshot: v.snapshot, note: v.note, created_at: v.createdAt };
}
export function toVersion(r: Record<string, unknown>): AutomationVersion {
  return { id: String(r["id"]), workflowDefinitionId: String(r["workflow_definition_id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), version: int(r["version"], 1), status: r["status"] as AutomationVersion["status"], snapshot: obj(r["snapshot"]), note: String(r["note"] ?? ""), createdAt: String(r["created_at"]) };
}

export function feedbackRow(f: AutomationFeedback): Record<string, unknown> {
  return { id: f.id, execution_intent_id: f.executionIntentId, workspace_id: f.workspaceId, client_id: f.clientId, kind: f.kind, rating: f.rating, comment: f.comment, subject_user_id: f.subjectUserId, created_at: f.createdAt };
}
export function toFeedback(r: Record<string, unknown>): AutomationFeedback {
  return { id: String(r["id"]), executionIntentId: String(r["execution_intent_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as AutomationFeedback["kind"], rating: nint(r["rating"]), comment: nstr(r["comment"]), subjectUserId: String(r["subject_user_id"]), createdAt: String(r["created_at"]) };
}
