/* =============================================================================
 * Execution-intent lifecycle + automation builders (Phase E · Sprint E5) — PURE.
 *
 *   draft → building → built → published ; building → failed ; * → archived
 * Every automation record (plan, workflow, steps, triggers, actions, conditions,
 * variables, integration bindings, deployment packages, versions, feedback) is
 * built here and is immutable once produced. The application persists them and
 * PREPARES deployment packages — it never executes, deploys, or calls an engine.
 * ========================================================================== */

import type {
  ActionDefinition, ActionKind, AutomationFeedback, AutomationFeedbackKind, AutomationPlan, AutomationVersion,
  ConditionDefinition, DeploymentPackage, DeploymentTarget, ExecutionIntent, ExecutionIntentStatus,
  IntegrationBinding, IntegrationProvider, TriggerDefinition, TriggerKind, VariableDefinition, VariableScope,
  VariableType, WorkflowDefinition, WorkflowStatus, WorkflowStep, WorkflowStepKind,
} from "@brightloop/schema";

export const INTENT_TRANSITIONS: Record<ExecutionIntentStatus, readonly ExecutionIntentStatus[]> = {
  draft: ["building", "archived"],
  building: ["built", "failed"],
  built: ["published", "building", "archived"],
  published: ["building", "archived"],
  failed: ["building", "archived"],
  archived: [],
};
export function canTransitionIntent(from: ExecutionIntentStatus, to: ExecutionIntentStatus): boolean {
  return INTENT_TRANSITIONS[from].includes(to);
}

export interface BuildExecutionIntentInput {
  id: string; workspaceId: string; clientId: string | null; planningSessionId: string; executionPlanId: string | null;
  title: string; objective?: string; requestedByUserId: string; now: string;
}
export function buildExecutionIntent(i: BuildExecutionIntentInput): ExecutionIntent {
  return {
    id: i.id, workspaceId: i.workspaceId, clientId: i.clientId, planningSessionId: i.planningSessionId, executionPlanId: i.executionPlanId,
    title: i.title.slice(0, 300), objective: i.objective ?? "", status: "draft", requestedByUserId: i.requestedByUserId,
    provider: null, model: null, promptId: null, generationDurationMs: 0, validationDurationMs: 0, simulationDurationMs: 0,
    tokenTotal: 0, cost: 0, currency: "USD", stepCount: 0, branchCount: 0, variableCount: 0, estimatedRuntimeMs: 0,
    version: 1, createdAt: i.now, updatedAt: i.now,
  };
}

export interface BuildAutomationPlanInput {
  id: string; executionIntentId: string; workspaceId: string; clientId: string | null; summary: string;
  workflowCount: number; stepCount: number; triggerCount: number; actionCount: number; variableCount: number; integrationCount: number; now: string;
}
export function buildAutomationPlan(p: BuildAutomationPlanInput): AutomationPlan {
  return { id: p.id, executionIntentId: p.executionIntentId, workspaceId: p.workspaceId, clientId: p.clientId, summary: p.summary, workflowCount: p.workflowCount, stepCount: p.stepCount, triggerCount: p.triggerCount, actionCount: p.actionCount, variableCount: p.variableCount, integrationCount: p.integrationCount, status: "draft", createdAt: p.now };
}

export interface BuildWorkflowDefinitionInput {
  id: string; automationPlanId: string; executionIntentId: string; workspaceId: string; clientId: string | null;
  name: string; description?: string; entryStepKey?: string | null; version?: number; now: string;
}
export function buildWorkflowDefinition(w: BuildWorkflowDefinitionInput): WorkflowDefinition {
  return { id: w.id, automationPlanId: w.automationPlanId, executionIntentId: w.executionIntentId, workspaceId: w.workspaceId, clientId: w.clientId, name: w.name.slice(0, 300), description: w.description ?? "", status: "draft", entryStepKey: w.entryStepKey ?? null, version: w.version ?? 1, createdAt: w.now };
}

export interface BuildWorkflowStepInput {
  id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null;
  key: string; kind: WorkflowStepKind; name: string; nextStepKeys?: readonly string[]; conditionExpression?: string | null;
  onErrorStepKey?: string | null; retryMax?: number; timeoutMs?: number; refId?: string | null; estimatedRuntimeMs?: number; order: number; now: string;
}
export function buildWorkflowStep(s: BuildWorkflowStepInput): WorkflowStep {
  return {
    id: s.id, workflowDefinitionId: s.workflowDefinitionId, executionIntentId: s.executionIntentId, workspaceId: s.workspaceId, clientId: s.clientId,
    key: s.key.slice(0, 120), kind: s.kind, name: s.name.slice(0, 300), nextStepKeys: [...(s.nextStepKeys ?? [])], conditionExpression: s.conditionExpression ?? null,
    onErrorStepKey: s.onErrorStepKey ?? null, retryMax: s.retryMax ?? 0, timeoutMs: s.timeoutMs ?? 0, refId: s.refId ?? null,
    estimatedRuntimeMs: s.estimatedRuntimeMs ?? 0, order: s.order, createdAt: s.now,
  };
}

export interface BuildTriggerDefinitionInput { id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null; kind: TriggerKind; name: string; config?: Record<string, unknown>; now: string; }
export function buildTriggerDefinition(t: BuildTriggerDefinitionInput): TriggerDefinition {
  return { id: t.id, workflowDefinitionId: t.workflowDefinitionId, executionIntentId: t.executionIntentId, workspaceId: t.workspaceId, clientId: t.clientId, kind: t.kind, name: t.name.slice(0, 300), config: t.config ?? {}, createdAt: t.now };
}

export interface BuildActionDefinitionInput { id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null; kind: ActionKind; name: string; config?: Record<string, unknown>; integrationBindingId?: string | null; now: string; }
export function buildActionDefinition(a: BuildActionDefinitionInput): ActionDefinition {
  return { id: a.id, workflowDefinitionId: a.workflowDefinitionId, executionIntentId: a.executionIntentId, workspaceId: a.workspaceId, clientId: a.clientId, kind: a.kind, name: a.name.slice(0, 300), config: a.config ?? {}, integrationBindingId: a.integrationBindingId ?? null, createdAt: a.now };
}

export interface BuildConditionDefinitionInput { id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null; name: string; expression: string; trueStepKey?: string | null; falseStepKey?: string | null; now: string; }
export function buildConditionDefinition(c: BuildConditionDefinitionInput): ConditionDefinition {
  return { id: c.id, workflowDefinitionId: c.workflowDefinitionId, executionIntentId: c.executionIntentId, workspaceId: c.workspaceId, clientId: c.clientId, name: c.name.slice(0, 300), expression: c.expression, trueStepKey: c.trueStepKey ?? null, falseStepKey: c.falseStepKey ?? null, createdAt: c.now };
}

export interface BuildVariableDefinitionInput { id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null; key: string; scope: VariableScope; type: VariableType; defaultValue?: string | null; required?: boolean; now: string; }
export function buildVariableDefinition(v: BuildVariableDefinitionInput): VariableDefinition {
  return { id: v.id, workflowDefinitionId: v.workflowDefinitionId, executionIntentId: v.executionIntentId, workspaceId: v.workspaceId, clientId: v.clientId, key: v.key.slice(0, 120), scope: v.scope, type: v.type, defaultValue: v.defaultValue ?? null, required: v.required ?? false, createdAt: v.now };
}

export interface BuildIntegrationBindingInput { id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null; provider: IntegrationProvider; name: string; capability?: string; config?: Record<string, unknown>; bound?: boolean; now: string; }
export function buildIntegrationBinding(b: BuildIntegrationBindingInput): IntegrationBinding {
  return { id: b.id, workflowDefinitionId: b.workflowDefinitionId, executionIntentId: b.executionIntentId, workspaceId: b.workspaceId, clientId: b.clientId, provider: b.provider, name: b.name.slice(0, 300), capability: b.capability ?? "", config: b.config ?? {}, bound: b.bound ?? false, createdAt: b.now };
}

export interface BuildDeploymentPackageInput { id: string; executionIntentId: string; workflowDefinitionId: string; workspaceId: string; clientId: string | null; target: DeploymentTarget; format?: string; payload?: Record<string, unknown>; checksum: string; now: string; }
export function buildDeploymentPackage(d: BuildDeploymentPackageInput): DeploymentPackage {
  return { id: d.id, executionIntentId: d.executionIntentId, workflowDefinitionId: d.workflowDefinitionId, workspaceId: d.workspaceId, clientId: d.clientId, target: d.target, format: d.format ?? "json", payload: d.payload ?? {}, checksum: d.checksum, status: "draft", createdAt: d.now };
}

export interface BuildAutomationVersionInput { id: string; workflowDefinitionId: string; executionIntentId: string; workspaceId: string; clientId: string | null; version: number; status?: WorkflowStatus; snapshot?: Record<string, unknown>; note?: string; now: string; }
export function buildAutomationVersion(v: BuildAutomationVersionInput): AutomationVersion {
  return { id: v.id, workflowDefinitionId: v.workflowDefinitionId, executionIntentId: v.executionIntentId, workspaceId: v.workspaceId, clientId: v.clientId, version: v.version, status: v.status ?? "draft", snapshot: v.snapshot ?? {}, note: v.note ?? "", createdAt: v.now };
}

export function buildAutomationFeedback(id: string, executionIntentId: string, workspaceId: string, clientId: string | null, kind: AutomationFeedbackKind, rating: number | null, comment: string | null, subjectUserId: string, now: string): AutomationFeedback {
  return { id, executionIntentId, workspaceId, clientId, kind, rating, comment, subjectUserId, createdAt: now };
}

/** A stable checksum for a deployment payload — deterministic, no crypto/io. */
export function deploymentChecksum(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
