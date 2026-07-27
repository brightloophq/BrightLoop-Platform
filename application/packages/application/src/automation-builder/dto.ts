/* =============================================================================
 * AI Automation Builder DTOs (Phase E · Sprint E5) — the outward boundary.
 * ========================================================================== */

import type {
  ActionDefinition, AutomationFeedback, AutomationPlan, AutomationVersion, ConditionDefinition, DeploymentPackage,
  ExecutionIntent, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowDefinition, WorkflowStep,
} from "@brightloop/schema";

export interface ExecutionIntentDTO {
  id: string; planningSessionId: string; executionPlanId: string | null; title: string; objective: string;
  status: ExecutionIntent["status"]; stepCount: number; branchCount: number; variableCount: number; estimatedRuntimeMs: number;
  provider: string | null; model: string | null; generationDurationMs: number; validationDurationMs: number; simulationDurationMs: number;
  tokenTotal: number; cost: number; currency: string; version: number; createdAt: string; updatedAt: string;
}
export const toExecutionIntentDTO = (i: ExecutionIntent): ExecutionIntentDTO => ({ id: i.id, planningSessionId: i.planningSessionId, executionPlanId: i.executionPlanId, title: i.title, objective: i.objective, status: i.status, stepCount: i.stepCount, branchCount: i.branchCount, variableCount: i.variableCount, estimatedRuntimeMs: i.estimatedRuntimeMs, provider: i.provider, model: i.model, generationDurationMs: i.generationDurationMs, validationDurationMs: i.validationDurationMs, simulationDurationMs: i.simulationDurationMs, tokenTotal: i.tokenTotal, cost: i.cost, currency: i.currency, version: i.version, createdAt: i.createdAt, updatedAt: i.updatedAt });

export interface AutomationPlanDTO { id: string; executionIntentId: string; summary: string; workflowCount: number; stepCount: number; triggerCount: number; actionCount: number; variableCount: number; integrationCount: number; status: AutomationPlan["status"]; }
export const toAutomationPlanDTO = (p: AutomationPlan): AutomationPlanDTO => ({ id: p.id, executionIntentId: p.executionIntentId, summary: p.summary, workflowCount: p.workflowCount, stepCount: p.stepCount, triggerCount: p.triggerCount, actionCount: p.actionCount, variableCount: p.variableCount, integrationCount: p.integrationCount, status: p.status });

export interface WorkflowDefinitionDTO { id: string; automationPlanId: string; name: string; description: string; status: WorkflowDefinition["status"]; entryStepKey: string | null; version: number; }
export const toWorkflowDefinitionDTO = (w: WorkflowDefinition): WorkflowDefinitionDTO => ({ id: w.id, automationPlanId: w.automationPlanId, name: w.name, description: w.description, status: w.status, entryStepKey: w.entryStepKey, version: w.version });

export interface WorkflowStepDTO { id: string; key: string; kind: WorkflowStep["kind"]; name: string; nextStepKeys: string[]; conditionExpression: string | null; onErrorStepKey: string | null; retryMax: number; timeoutMs: number; estimatedRuntimeMs: number; order: number; }
export const toWorkflowStepDTO = (s: WorkflowStep): WorkflowStepDTO => ({ id: s.id, key: s.key, kind: s.kind, name: s.name, nextStepKeys: s.nextStepKeys, conditionExpression: s.conditionExpression, onErrorStepKey: s.onErrorStepKey, retryMax: s.retryMax, timeoutMs: s.timeoutMs, estimatedRuntimeMs: s.estimatedRuntimeMs, order: s.order });

export interface TriggerDefinitionDTO { id: string; kind: TriggerDefinition["kind"]; name: string; }
export const toTriggerDefinitionDTO = (t: TriggerDefinition): TriggerDefinitionDTO => ({ id: t.id, kind: t.kind, name: t.name });

export interface ActionDefinitionDTO { id: string; kind: ActionDefinition["kind"]; name: string; integrationBindingId: string | null; }
export const toActionDefinitionDTO = (a: ActionDefinition): ActionDefinitionDTO => ({ id: a.id, kind: a.kind, name: a.name, integrationBindingId: a.integrationBindingId });

export interface ConditionDefinitionDTO { id: string; name: string; expression: string; trueStepKey: string | null; falseStepKey: string | null; }
export const toConditionDefinitionDTO = (c: ConditionDefinition): ConditionDefinitionDTO => ({ id: c.id, name: c.name, expression: c.expression, trueStepKey: c.trueStepKey, falseStepKey: c.falseStepKey });

export interface VariableDefinitionDTO { id: string; key: string; scope: VariableDefinition["scope"]; type: VariableDefinition["type"]; defaultValue: string | null; required: boolean; }
export const toVariableDefinitionDTO = (v: VariableDefinition): VariableDefinitionDTO => ({ id: v.id, key: v.key, scope: v.scope, type: v.type, defaultValue: v.defaultValue, required: v.required });

export interface IntegrationBindingDTO { id: string; provider: IntegrationBinding["provider"]; name: string; capability: string; bound: boolean; }
export const toIntegrationBindingDTO = (b: IntegrationBinding): IntegrationBindingDTO => ({ id: b.id, provider: b.provider, name: b.name, capability: b.capability, bound: b.bound });

export interface DeploymentPackageDTO { id: string; workflowDefinitionId: string; target: DeploymentPackage["target"]; format: string; checksum: string; status: DeploymentPackage["status"]; payload: Record<string, unknown>; createdAt: string; }
export const toDeploymentPackageDTO = (d: DeploymentPackage): DeploymentPackageDTO => ({ id: d.id, workflowDefinitionId: d.workflowDefinitionId, target: d.target, format: d.format, checksum: d.checksum, status: d.status, payload: d.payload, createdAt: d.createdAt });

export interface AutomationVersionDTO { id: string; workflowDefinitionId: string; version: number; status: AutomationVersion["status"]; note: string; createdAt: string; }
export const toAutomationVersionDTO = (v: AutomationVersion): AutomationVersionDTO => ({ id: v.id, workflowDefinitionId: v.workflowDefinitionId, version: v.version, status: v.status, note: v.note, createdAt: v.createdAt });

export interface AutomationFeedbackDTO { id: string; kind: AutomationFeedback["kind"]; rating: number | null; comment: string | null; subjectUserId: string; createdAt: string; }
export const toAutomationFeedbackDTO = (f: AutomationFeedback): AutomationFeedbackDTO => ({ id: f.id, kind: f.kind, rating: f.rating, comment: f.comment, subjectUserId: f.subjectUserId, createdAt: f.createdAt });

export interface WorkflowValidationDTO { ok: boolean; issues: string[]; warnings: string[]; }
export interface SimulationResultDTO { ok: boolean; executionOrder: string[]; branchDecisions: { stepKey: string; taken: string; reason: string }[]; expectedOutputs: { key: string; scope: string; type: string }[]; warnings: string[]; estimatedRuntimeMs: number; }

/** The complete structured workflow (steps + definitions + variables + bindings). */
export interface WorkflowDetailDTO {
  workflow: WorkflowDefinitionDTO;
  steps: WorkflowStepDTO[];
  triggers: TriggerDefinitionDTO[];
  actions: ActionDefinitionDTO[];
  conditions: ConditionDefinitionDTO[];
  variables: VariableDefinitionDTO[];
  integrations: IntegrationBindingDTO[];
}

export interface AutomationDashboardDTO { intent: ExecutionIntentDTO; plan: AutomationPlanDTO | null; workflowCount: number; deploymentCount: number; }
