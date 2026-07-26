/* =============================================================================
 * AI Automation Builder use-cases (Phase E · Sprint E5).
 *
 * Converts an APPROVED execution plan (E4) into automation-ready workflow
 * definitions. It GENERATES, VALIDATES, SIMULATES (dry-run), VERSIONS and
 * PREPARES deployment packages. It NEVER executes a workflow, calls an engine,
 * deploys, schedules, or sends anything — the orchestration layer only.
 *
 *   ExecutionIntent → AutomationPlan → WorkflowDefinition (DAG) → Validation →
 *   Versioning → DeploymentPackage (prepared, never deployed).
 * ========================================================================== */

import {
  buildActionDefinition, buildAutomationFeedback, buildAutomationPlan, buildAutomationVersion, buildDeploymentPackage,
  buildExecutionIntent, buildIntegrationBinding, buildTriggerDefinition, buildVariableDefinition, buildWorkflowDefinition,
  buildWorkflowStep, canTransitionIntent, deploymentChecksum, simulateWorkflow as domainSimulate,
  validateWorkflow as domainValidate,
} from "@brightloop/domain";
import type {
  ActionDefinition, AutomationFeedbackKind, DeploymentTarget, IntegrationBinding, TriggerDefinition,
  VariableDefinition, WorkflowStep,
} from "@brightloop/schema";
import { getExecutionPlanResult } from "../project-manager/planner-read.js";
import {
  authorize, requireAutomationBuilder, AUTOMATION_DEPLOY_CAP, AUTOMATION_FEEDBACK_CAP, AUTOMATION_GENERATE_CAP,
  AUTOMATION_PUBLISH_CAP, AUTOMATION_READ_CAP, AUTOMATION_WRITE_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import {
  toActionDefinitionDTO, toAutomationFeedbackDTO, toAutomationPlanDTO, toAutomationVersionDTO, toConditionDefinitionDTO,
  toDeploymentPackageDTO, toExecutionIntentDTO, toIntegrationBindingDTO, toTriggerDefinitionDTO, toVariableDefinitionDTO,
  toWorkflowDefinitionDTO, toWorkflowStepDTO, type AutomationFeedbackDTO, type AutomationPlanDTO,
  type AutomationVersionDTO, type DeploymentPackageDTO, type ExecutionIntentDTO, type SimulationResultDTO,
  type WorkflowDetailDTO, type WorkflowValidationDTO,
} from "./dto.js";

/* ---- helpers --------------------------------------------------------------- */

async function loadIntent(ctx: AppContext, intentId: string, cap: string) {
  const ab = requireAutomationBuilder(ctx);
  const intent = unwrap(await ab.intents.getById(intentId));
  if (intent === null) throw new NotFoundError("execution intent");
  authorize(ctx.actor, cap, intent.clientId);
  return { ab, intent };
}

async function loadWorkflow(ctx: AppContext, workflowId: string, cap: string) {
  const ab = requireAutomationBuilder(ctx);
  const workflow = unwrap(await ab.workflows.getById(workflowId));
  if (workflow === null) throw new NotFoundError("workflow definition");
  authorize(ctx.actor, cap, workflow.clientId);
  return { ab, workflow };
}

/** Load a workflow's full graph (steps + definitions + variables + bindings). */
async function loadWorkflowGraph(ctx: AppContext, workflowId: string) {
  const ab = requireAutomationBuilder(ctx);
  const [steps, triggers, actions, conditions, variables, integrations] = await Promise.all([
    ab.steps.listByWorkflow(workflowId).then(unwrap), ab.triggers.listByWorkflow(workflowId).then(unwrap),
    ab.actions.listByWorkflow(workflowId).then(unwrap), ab.conditions.listByWorkflow(workflowId).then(unwrap),
    ab.variables.listByWorkflow(workflowId).then(unwrap), ab.integrations.listByWorkflow(workflowId).then(unwrap),
  ]);
  return { steps, triggers, actions, conditions, variables, integrations };
}

/* ---- execution intent ------------------------------------------------------ */

export interface CreateExecutionIntentInput { planningSessionId: string; title: string; objective?: string; }

/**
 * The entry abstraction. An intent may only be created from an APPROVED execution
 * plan (consumed via E4's application service) — no workflow exists without one.
 */
export async function createExecutionIntent(ctx: AppContext, rawWorkspaceId: unknown, input: CreateExecutionIntentInput): Promise<ExecutionIntentDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const planningSessionId = requireId(input.planningSessionId, "planningSessionId");
  const title = requireString(input.title, "title").trim();
  if (title === "") throw new ValidationError("An automation title is required");
  const ab = requireAutomationBuilder(ctx);
  authorize(ctx.actor, AUTOMATION_WRITE_CAP, ctx.actor.clientId);

  // Consume E4 ONLY via its read service; require an APPROVED plan.
  const result = await getExecutionPlanResult(ctx, planningSessionId);
  if (result.session.status !== "approved" || result.plan === null || result.plan.status !== "approved") {
    throw new ConflictError("An execution intent requires an APPROVED execution plan");
  }
  const intent = buildExecutionIntent({ id: ctx.ids("intent"), workspaceId, clientId: ctx.actor.clientId, planningSessionId, executionPlanId: result.plan.id, title, objective: input.objective ?? result.plan.summary, requestedByUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await ab.intents.create(intent));
  return toExecutionIntentDTO(intent);
}

/* ---- automation plan + workflow build -------------------------------------- */

async function ensureAutomationPlan(ctx: AppContext, intentId: string) {
  const ab = requireAutomationBuilder(ctx);
  const existing = unwrap(await ab.plans.getByIntent(intentId));
  if (existing !== null) return existing;
  const intent = unwrap(await ab.intents.getById(intentId));
  if (intent === null) throw new NotFoundError("execution intent");
  const plan = buildAutomationPlan({ id: ctx.ids("aplan"), executionIntentId: intentId, workspaceId: intent.workspaceId, clientId: intent.clientId, summary: `Automation for "${intent.title}"`, workflowCount: 0, stepCount: 0, triggerCount: 0, actionCount: 0, variableCount: 0, integrationCount: 0, now: ctx.clock() });
  return unwrap(await ab.plans.append(plan));
}

/** Create (or return) the AutomationPlan for an intent and move it to `building`. */
export async function generateAutomationPlan(ctx: AppContext, rawIntentId: unknown): Promise<AutomationPlanDTO> {
  const intentId = requireId(rawIntentId, "intentId");
  const { ab, intent } = await loadIntent(ctx, intentId, AUTOMATION_GENERATE_CAP);
  const plan = await ensureAutomationPlan(ctx, intentId);
  if (canTransitionIntent(intent.status, "building")) unwrap(await ab.intents.save({ ...intent, status: "building", updatedAt: ctx.clock(), version: intent.version + 1 }, intent.version));
  return toAutomationPlanDTO(plan);
}

/**
 * Build the workflow DAG from the approved plan: a manual trigger, one action per
 * planned task, edges mirroring the task dependency graph, typed variables, and a
 * bound integration. Idempotent (returns the existing workflow if already built).
 */
export async function buildWorkflow(ctx: AppContext, rawIntentId: unknown): Promise<WorkflowDetailDTO> {
  const intentId = requireId(rawIntentId, "intentId");
  const { ab, intent } = await loadIntent(ctx, intentId, AUTOMATION_GENERATE_CAP);
  const existingWorkflows = unwrap(await ab.workflows.listByIntent(intentId));
  if (existingWorkflows.length > 0) return workflowDetail(ctx, existingWorkflows[0]!.id);

  const plan = await ensureAutomationPlan(ctx, intentId);
  const result = await getExecutionPlanResult(ctx, intent.planningSessionId);
  const tasks = result.tasks;
  if (tasks.length === 0) throw new ValidationError("The approved plan has no tasks to automate");

  const wsId = intent.workspaceId;
  const cid = intent.clientId;
  const now = ctx.clock();
  const workflow = buildWorkflowDefinition({ id: ctx.ids("wf"), automationPlanId: plan.id, executionIntentId: intentId, workspaceId: wsId, clientId: cid, name: `${intent.title} — workflow`, description: intent.objective, entryStepKey: "trigger", version: 1, now });
  const wfId = workflow.id;

  // One bound integration abstraction (never a concrete engine).
  const integration: IntegrationBinding = buildIntegrationBinding({ id: ctx.ids("bind"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, provider: "custom", name: "Execution engine", capability: "create_task", bound: true, now });

  // Task key map + edges (dependency task → dependent task).
  const keyByTask = new Map(tasks.map((t, i) => [t.id, `task_${i}`]));
  const successors = new Map<string, string[]>();
  for (const t of tasks) {
    for (const dep of t.dependencyTaskIds) {
      const from = keyByTask.get(dep);
      const to = keyByTask.get(t.id);
      if (from && to) successors.set(from, [...(successors.get(from) ?? []), to]);
    }
  }
  const roots = tasks.filter((t) => t.dependencyTaskIds.every((d) => !keyByTask.has(d))).map((t) => keyByTask.get(t.id)!);

  const steps: WorkflowStep[] = [];
  const actions: ActionDefinition[] = [];
  let order = 0;
  steps.push(buildWorkflowStep({ id: ctx.ids("step"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, key: "trigger", kind: "trigger", name: "Manual start", nextStepKeys: roots.length > 0 ? roots : [keyByTask.get(tasks[0]!.id)!], refId: null, estimatedRuntimeMs: 0, order: order++, now }));
  for (const t of tasks) {
    const key = keyByTask.get(t.id)!;
    const act = buildActionDefinition({ id: ctx.ids("act"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, kind: "create_task", name: t.title.slice(0, 200), config: { title: t.title, priority: t.priority }, integrationBindingId: integration.id, now });
    actions.push(act);
    steps.push(buildWorkflowStep({ id: ctx.ids("step"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, key, kind: "action", name: t.title.slice(0, 200), nextStepKeys: successors.get(key) ?? [], refId: act.id, retryMax: 1, timeoutMs: 60_000, estimatedRuntimeMs: 1000 * Math.max(1, t.estimatedDurationDays), order: order++, now }));
  }

  const trigger: TriggerDefinition = buildTriggerDefinition({ id: ctx.ids("trg"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, kind: "manual", name: "Manual start", config: {}, now });
  const variables: VariableDefinition[] = [
    buildVariableDefinition({ id: ctx.ids("var"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, key: "workspace_id", scope: "workspace", type: "string", defaultValue: wsId, required: true, now }),
    buildVariableDefinition({ id: ctx.ids("var"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, key: "execution_plan_id", scope: "execution", type: "string", defaultValue: intent.executionPlanId, required: false, now }),
    buildVariableDefinition({ id: ctx.ids("var"), workflowDefinitionId: wfId, executionIntentId: intentId, workspaceId: wsId, clientId: cid, key: "workflow_result", scope: "output", type: "json", defaultValue: null, required: false, now }),
  ];

  // Persist (workflow → definitions → steps). Append-only.
  unwrap(await ab.workflows.append(workflow));
  unwrap(await ab.integrations.appendMany([integration]));
  unwrap(await ab.triggers.appendMany([trigger]));
  unwrap(await ab.actions.appendMany(actions));
  unwrap(await ab.variables.appendMany(variables));
  unwrap(await ab.steps.appendMany(steps));

  // Update plan counts + intent observability.
  unwrap(await ab.plans.save({ ...plan, summary: plan.summary, workflowCount: 1, stepCount: steps.length, triggerCount: 1, actionCount: actions.length, variableCount: variables.length, integrationCount: 1, status: "draft" }));
  const branchCount = steps.filter((s) => s.kind === "condition" || s.kind === "branch").length;
  const estimatedRuntimeMs = steps.reduce((sum, s) => sum + s.estimatedRuntimeMs, 0);
  const current = unwrap(await ab.intents.getById(intentId));
  if (current !== null) {
    const status = canTransitionIntent(current.status, "building") ? "building" : current.status;
    unwrap(await ab.intents.save({ ...current, status, stepCount: steps.length, branchCount, variableCount: variables.length, estimatedRuntimeMs, updatedAt: ctx.clock(), version: current.version + 1 }, current.version));
  }
  return workflowDetail(ctx, wfId);
}

async function workflowDetail(ctx: AppContext, workflowId: string): Promise<WorkflowDetailDTO> {
  const ab = requireAutomationBuilder(ctx);
  const workflow = unwrap(await ab.workflows.getById(workflowId));
  if (workflow === null) throw new NotFoundError("workflow definition");
  const g = await loadWorkflowGraph(ctx, workflowId);
  return {
    workflow: toWorkflowDefinitionDTO(workflow),
    steps: [...g.steps].sort((a, b) => a.order - b.order).map(toWorkflowStepDTO),
    triggers: g.triggers.map(toTriggerDefinitionDTO),
    actions: g.actions.map(toActionDefinitionDTO),
    conditions: g.conditions.map(toConditionDefinitionDTO),
    variables: g.variables.map(toVariableDefinitionDTO),
    integrations: g.integrations.map(toIntegrationBindingDTO),
  };
}

/* ---- validation + simulation ----------------------------------------------- */

export async function validateWorkflow(ctx: AppContext, rawWorkflowId: unknown): Promise<WorkflowValidationDTO> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab, workflow } = await loadWorkflow(ctx, workflowId, AUTOMATION_READ_CAP);
  const g = await loadWorkflowGraph(ctx, workflowId);
  const started = ctx.clock();
  const result = domainValidate({ entryStepKey: workflow.entryStepKey, ...g });
  // Record validation-duration observability on the intent (best-effort).
  const intent = unwrap(await ab.intents.getById(workflow.executionIntentId));
  if (intent !== null) unwrap(await ab.intents.save({ ...intent, validationDurationMs: Math.max(0, Date.parse(ctx.clock()) - Date.parse(started)), updatedAt: ctx.clock(), version: intent.version + 1 }, intent.version));
  return { ok: result.ok, issues: result.issues, warnings: result.warnings };
}

export async function simulateWorkflow(ctx: AppContext, rawWorkflowId: unknown): Promise<SimulationResultDTO> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab, workflow } = await loadWorkflow(ctx, workflowId, AUTOMATION_READ_CAP);
  const g = await loadWorkflowGraph(ctx, workflowId);
  const started = ctx.clock();
  const sim = domainSimulate({ entryStepKey: workflow.entryStepKey, steps: g.steps, conditions: g.conditions, variables: g.variables });
  const intent = unwrap(await ab.intents.getById(workflow.executionIntentId));
  if (intent !== null) unwrap(await ab.intents.save({ ...intent, simulationDurationMs: Math.max(0, Date.parse(ctx.clock()) - Date.parse(started)), updatedAt: ctx.clock(), version: intent.version + 1 }, intent.version));
  return { ok: sim.ok, executionOrder: sim.executionOrder, branchDecisions: sim.branchDecisions, expectedOutputs: sim.expectedOutputs, warnings: sim.warnings, estimatedRuntimeMs: sim.estimatedRuntimeMs };
}

/* ---- versioning: publish + rollback ---------------------------------------- */

/** Publish a workflow: it must validate cleanly. Snapshots an immutable version. */
export async function publishWorkflow(ctx: AppContext, rawWorkflowId: unknown): Promise<AutomationVersionDTO> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab, workflow } = await loadWorkflow(ctx, workflowId, AUTOMATION_PUBLISH_CAP);
  const g = await loadWorkflowGraph(ctx, workflowId);
  const validation = domainValidate({ entryStepKey: workflow.entryStepKey, ...g });
  if (!validation.ok) throw new ValidationError(`Cannot publish an invalid workflow: ${validation.issues.join("; ")}`);

  const priorVersions = unwrap(await ab.versions.listByWorkflow(workflowId));
  const nextVersion = priorVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  const snapshot = { workflow: toWorkflowDefinitionDTO({ ...workflow, version: nextVersion }), steps: g.steps.map(toWorkflowStepDTO), triggers: g.triggers.map(toTriggerDefinitionDTO), actions: g.actions.map(toActionDefinitionDTO), conditions: g.conditions.map(toConditionDefinitionDTO), variables: g.variables.map(toVariableDefinitionDTO), integrations: g.integrations.map(toIntegrationBindingDTO) };
  const version = buildAutomationVersion({ id: ctx.ids("ver"), workflowDefinitionId: workflowId, executionIntentId: workflow.executionIntentId, workspaceId: workflow.workspaceId, clientId: workflow.clientId, version: nextVersion, status: "published", snapshot: snapshot as unknown as Record<string, unknown>, note: `Published v${nextVersion}`, now: ctx.clock() });
  unwrap(await ab.versions.append(version));
  unwrap(await ab.workflows.save({ ...workflow, status: "published", version: nextVersion }));

  // Move the intent to `published` (best-effort; a plan may have several workflows).
  const intent = unwrap(await ab.intents.getById(workflow.executionIntentId));
  if (intent !== null && canTransitionIntent(intent.status, "published")) unwrap(await ab.intents.save({ ...intent, status: "published", updatedAt: ctx.clock(), version: intent.version + 1 }, intent.version));
  return toAutomationVersionDTO(version);
}

export interface RollbackWorkflowInput { toVersion: number; }

/** Roll back to an earlier immutable version by snapshotting it as a new version. */
export async function rollbackWorkflow(ctx: AppContext, rawWorkflowId: unknown, input: RollbackWorkflowInput): Promise<AutomationVersionDTO> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab, workflow } = await loadWorkflow(ctx, workflowId, AUTOMATION_PUBLISH_CAP);
  const versions = unwrap(await ab.versions.listByWorkflow(workflowId));
  const target = versions.find((v) => v.version === input.toVersion);
  if (target === undefined) throw new NotFoundError("workflow version");
  const nextVersion = versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
  const version = buildAutomationVersion({ id: ctx.ids("ver"), workflowDefinitionId: workflowId, executionIntentId: workflow.executionIntentId, workspaceId: workflow.workspaceId, clientId: workflow.clientId, version: nextVersion, status: "published", snapshot: target.snapshot, note: `Rolled back to v${input.toVersion}`, now: ctx.clock() });
  unwrap(await ab.versions.append(version));
  unwrap(await ab.workflows.save({ ...workflow, status: "published", version: nextVersion }));
  return toAutomationVersionDTO(version);
}

/* ---- deployment package (PREPARED, never deployed) ------------------------- */

export interface GenerateDeploymentPackageInput { target?: DeploymentTarget; }

/**
 * Prepare an abstract deployment descriptor for a PUBLISHED workflow. This layer
 * NEVER deploys, calls an engine, or sends anything — it only produces a package.
 */
export async function generateDeploymentPackage(ctx: AppContext, rawWorkflowId: unknown, input: GenerateDeploymentPackageInput = {}): Promise<DeploymentPackageDTO> {
  const workflowId = requireId(rawWorkflowId, "workflowId");
  const { ab, workflow } = await loadWorkflow(ctx, workflowId, AUTOMATION_DEPLOY_CAP);
  if (workflow.status !== "published") throw new ConflictError("Only a published workflow can be prepared for deployment");
  const target: DeploymentTarget = input.target ?? "n8n";
  const g = await loadWorkflowGraph(ctx, workflowId);
  // The payload is a provider-agnostic descriptor; a deployment ADAPTER (future)
  // translates it per target. No engine-specific calls happen here.
  const payload = {
    schemaVersion: "auxion.automation.v1", target, workflow: toWorkflowDefinitionDTO(workflow),
    nodes: [...g.steps].sort((a, b) => a.order - b.order).map((s) => ({ key: s.key, kind: s.kind, next: s.nextStepKeys, refId: s.refId })),
    triggers: g.triggers.map((t) => ({ kind: t.kind, name: t.name })),
    actions: g.actions.map((a) => ({ kind: a.kind, name: a.name })),
    variables: g.variables.map((v) => ({ key: v.key, scope: v.scope, type: v.type })),
    integrations: g.integrations.map((b) => ({ provider: b.provider, capability: b.capability })),
  };
  const checksum = deploymentChecksum(JSON.stringify(payload));
  const pkg = buildDeploymentPackage({ id: ctx.ids("dep"), executionIntentId: workflow.executionIntentId, workflowDefinitionId: workflowId, workspaceId: workflow.workspaceId, clientId: workflow.clientId, target, format: "json", payload: payload as unknown as Record<string, unknown>, checksum, now: ctx.clock() });
  const stored = { ...pkg, status: "ready" as const };
  unwrap(await ab.deployments.append(stored));
  return toDeploymentPackageDTO(stored);
}

/* ---- feedback -------------------------------------------------------------- */

export interface SubmitAutomationFeedbackInput { kind: AutomationFeedbackKind; rating?: number | null; comment?: string | null; }

export async function submitAutomationFeedback(ctx: AppContext, rawIntentId: unknown, input: SubmitAutomationFeedbackInput): Promise<AutomationFeedbackDTO> {
  const intentId = requireId(rawIntentId, "intentId");
  const { ab, intent } = await loadIntent(ctx, intentId, AUTOMATION_FEEDBACK_CAP);
  const feedback = buildAutomationFeedback(ctx.ids("afb"), intentId, intent.workspaceId, intent.clientId, input.kind, input.rating ?? null, input.comment ?? null, ctx.actor.userId, ctx.clock());
  unwrap(await ab.feedback.append(feedback));
  return toAutomationFeedbackDTO(feedback);
}
