/* =============================================================================
 * AI Automation Builder read models (Phase E · Sprint E5).
 *
 * Read-only projections: automation dashboard, workflow library, execution
 * intents, deployment queue, validation/simulation surfaces, version history.
 * Load-then-authorize; DTOs only. (Validation/simulation RESULTS are produced by
 * the read-shaped use-cases in builder-usecases.ts.)
 * ========================================================================== */

import { authorize, requireAutomationBuilder, AUTOMATION_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toActionDefinitionDTO, toAutomationFeedbackDTO, toAutomationPlanDTO, toAutomationVersionDTO, toConditionDefinitionDTO,
  toDeploymentPackageDTO, toExecutionIntentDTO, toIntegrationBindingDTO, toTriggerDefinitionDTO, toVariableDefinitionDTO,
  toWorkflowDefinitionDTO, toWorkflowStepDTO, type AutomationDashboardDTO, type AutomationFeedbackDTO,
  type AutomationVersionDTO, type DeploymentPackageDTO, type ExecutionIntentDTO, type WorkflowDefinitionDTO,
  type WorkflowDetailDTO,
} from "./dto.js";

async function loadIntent(ctx: AppContext, intentId: string) {
  const ab = requireAutomationBuilder(ctx);
  const intent = unwrap(await ab.intents.getById(intentId));
  if (intent === null) throw new NotFoundError("execution intent");
  authorize(ctx.actor, AUTOMATION_READ_CAP, intent.clientId);
  return { ab, intent };
}

async function loadWorkflow(ctx: AppContext, workflowId: string) {
  const ab = requireAutomationBuilder(ctx);
  const workflow = unwrap(await ab.workflows.getById(workflowId));
  if (workflow === null) throw new NotFoundError("workflow definition");
  authorize(ctx.actor, AUTOMATION_READ_CAP, workflow.clientId);
  return { ab, workflow };
}

/** Execution Intents — every intent in a workspace, newest first. */
export async function listExecutionIntents(ctx: AppContext, rawWorkspaceId: unknown): Promise<ExecutionIntentDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ab = requireAutomationBuilder(ctx);
  authorize(ctx.actor, AUTOMATION_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await ab.intents.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toExecutionIntentDTO);
}

/** Automation Dashboard — an intent with its plan + workflow/deployment counts. */
export async function getAutomationDashboard(ctx: AppContext, rawIntentId: unknown): Promise<AutomationDashboardDTO> {
  const intentId = requireId(rawIntentId, "intentId");
  const { ab, intent } = await loadIntent(ctx, intentId);
  const [plan, workflows, deployments] = await Promise.all([
    ab.plans.getByIntent(intentId).then(unwrap), ab.workflows.listByIntent(intentId).then(unwrap), ab.deployments.listByIntent(intentId).then(unwrap),
  ]);
  return { intent: toExecutionIntentDTO(intent), plan: plan ? toAutomationPlanDTO(plan) : null, workflowCount: workflows.length, deploymentCount: deployments.length };
}

/** Workflow Library — the workflows produced for an intent. */
export async function listWorkflows(ctx: AppContext, rawIntentId: unknown): Promise<WorkflowDefinitionDTO[]> {
  const intentId = requireId(rawIntentId, "intentId");
  const { ab } = await loadIntent(ctx, intentId);
  return unwrap(await ab.workflows.listByIntent(intentId)).map(toWorkflowDefinitionDTO);
}

/** Workflow Library (workspace) — every workflow in a workspace. */
export async function listWorkspaceWorkflows(ctx: AppContext, rawWorkspaceId: unknown): Promise<WorkflowDefinitionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ab = requireAutomationBuilder(ctx);
  authorize(ctx.actor, AUTOMATION_READ_CAP, ctx.actor.clientId);
  return unwrap(await ab.workflows.listByWorkspace(workspaceId)).map(toWorkflowDefinitionDTO);
}

/** The full structured workflow (steps + definitions + variables + bindings). */
export async function getWorkflowDetail(ctx: AppContext, rawWorkflowId: unknown): Promise<WorkflowDetailDTO> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab, workflow } = await loadWorkflow(ctx, workflowId);
  const [steps, triggers, actions, conditions, variables, integrations] = await Promise.all([
    ab.steps.listByWorkflow(workflowId).then(unwrap), ab.triggers.listByWorkflow(workflowId).then(unwrap),
    ab.actions.listByWorkflow(workflowId).then(unwrap), ab.conditions.listByWorkflow(workflowId).then(unwrap),
    ab.variables.listByWorkflow(workflowId).then(unwrap), ab.integrations.listByWorkflow(workflowId).then(unwrap),
  ]);
  return {
    workflow: toWorkflowDefinitionDTO(workflow),
    steps: [...steps].sort((a, b) => a.order - b.order).map(toWorkflowStepDTO),
    triggers: triggers.map(toTriggerDefinitionDTO), actions: actions.map(toActionDefinitionDTO),
    conditions: conditions.map(toConditionDefinitionDTO), variables: variables.map(toVariableDefinitionDTO), integrations: integrations.map(toIntegrationBindingDTO),
  };
}

/** Deployment Queue — the prepared deployment packages in a workspace. */
export async function getDeploymentQueue(ctx: AppContext, rawWorkspaceId: unknown): Promise<DeploymentPackageDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const ab = requireAutomationBuilder(ctx);
  authorize(ctx.actor, AUTOMATION_READ_CAP, ctx.actor.clientId);
  return [...unwrap(await ab.deployments.listByWorkspace(workspaceId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toDeploymentPackageDTO);
}

/** Version History — immutable versions of a workflow, newest first. */
export async function getVersionHistory(ctx: AppContext, rawWorkflowId: unknown): Promise<AutomationVersionDTO[]> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab } = await loadWorkflow(ctx, workflowId);
  return [...unwrap(await ab.versions.listByWorkflow(workflowId))].sort((a, b) => b.version - a.version).map(toAutomationVersionDTO);
}

export async function listAutomationFeedback(ctx: AppContext, rawIntentId: unknown): Promise<AutomationFeedbackDTO[]> {
  const intentId = requireId(rawIntentId, "intentId");
  const { ab } = await loadIntent(ctx, intentId);
  return [...unwrap(await ab.feedback.listByIntent(intentId))].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toAutomationFeedbackDTO);
}
