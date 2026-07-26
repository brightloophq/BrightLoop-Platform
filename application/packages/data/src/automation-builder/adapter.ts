/* =============================================================================
 * Supabase AI Automation Builder repositories (Phase E · Sprint E5).
 *
 * Twelve adapters (untyped-cast pattern; mappers are the boundary). The execution
 * intent is versioned (optimistic concurrency); the automation plan carries a
 * mutable status, the workflow definition a mutable status + version; all
 * definition records + versions + feedback are append-only.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type ActionDefinitionRepository, type AutomationFeedbackRepository, type AutomationPlanRepository,
  type AutomationVersionRepository, type ConditionDefinitionRepository, type DeploymentPackageRepository,
  type ExecutionIntentRepository, type IntegrationBindingRepository, type RuntimeResult, type TriggerDefinitionRepository,
  type VariableDefinitionRepository, type WorkflowDefinitionRepository, type WorkflowStepRepository,
} from "@brightloop/domain";
import type {
  ActionDefinition, AutomationFeedback, AutomationPlan, AutomationVersion, ConditionDefinition, DeploymentPackage,
  ExecutionIntent, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowDefinition, WorkflowStep,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const INTENT = "execution_intent";
const PLAN = "automation_plan";
const WF = "workflow_definition";
const STEP = "workflow_step";
const TRG = "trigger_definition";
const ACT = "action_definition";
const COND = "condition_definition";
const VAR = "variable_definition";
const BIND = "integration_binding";
const DEP = "deployment_package";
const VER = "automation_version";
const FB = "automation_feedback";

function appendMany<T>(db: SupabaseClient, table: string, toRow: (t: T) => Record<string, unknown>, toDomain: (r: Record<string, unknown>) => T, ctx: string) {
  return async (rows: readonly T[]): Promise<RuntimeResult<T[]>> => {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await db.from(table).insert(rows.map(toRow)).select("*");
    if (error) return mapDatabaseError(error, `${ctx}.appendMany`);
    return ok("created", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}
function listByCol<T>(db: SupabaseClient, table: string, col: string, toDomain: (r: Record<string, unknown>) => T, ctx: string, orderCol?: string) {
  return async (value: string): Promise<RuntimeResult<T[]>> => {
    let q = db.from(table).select("*").eq(col, value);
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) return mapDatabaseError(error, `${ctx}.listByCol`);
    return ok("found", (data ?? []).map((r) => toDomain(r as Record<string, unknown>)));
  };
}

export class SupabaseExecutionIntentRepository implements ExecutionIntentRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(i: ExecutionIntent): Promise<RuntimeResult<ExecutionIntent>> {
    const { data, error } = await this.db.from(INTENT).insert(m.intentRow(i)).select("*").single();
    if (error) return mapDatabaseError(error, "executionIntent.create");
    return ok("created", m.toIntent(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<ExecutionIntent | null>> {
    const { data, error } = await this.db.from(INTENT).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "executionIntent.getById");
    return ok("found", data ? m.toIntent(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<ExecutionIntent[]>> {
    const { data, error } = await this.db.from(INTENT).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "executionIntent.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toIntent(r as Record<string, unknown>)));
  }
  async save(next: ExecutionIntent, expectedVersion: number): Promise<RuntimeResult<ExecutionIntent>> {
    const { data, error } = await this.db.from(INTENT).update({ status: next.status, provider: next.provider, model: next.model, generation_duration_ms: next.generationDurationMs, validation_duration_ms: next.validationDurationMs, simulation_duration_ms: next.simulationDurationMs, token_total: next.tokenTotal, cost: next.cost, step_count: next.stepCount, branch_count: next.branchCount, variable_count: next.variableCount, estimated_runtime_ms: next.estimatedRuntimeMs, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "executionIntent.save");
    if (data === null) return err("conflict", "executionIntent.save: version mismatch");
    return ok("updated", m.toIntent(data as Record<string, unknown>));
  }
}

export class SupabaseAutomationPlanRepository implements AutomationPlanRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(p: AutomationPlan): Promise<RuntimeResult<AutomationPlan>> {
    const { data, error } = await this.db.from(PLAN).insert(m.planRow(p)).select("*").single();
    if (error) return mapDatabaseError(error, "automationPlan.append");
    return ok("created", m.toPlan(data as Record<string, unknown>));
  }
  async getByIntent(executionIntentId: string): Promise<RuntimeResult<AutomationPlan | null>> {
    const { data, error } = await this.db.from(PLAN).select("*").eq("execution_intent_id", executionIntentId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "automationPlan.getByIntent");
    return ok("found", data ? m.toPlan(data as Record<string, unknown>) : null);
  }
  async save(next: AutomationPlan): Promise<RuntimeResult<AutomationPlan>> {
    const { data, error } = await this.db.from(PLAN).update({ summary: next.summary, workflow_count: next.workflowCount, step_count: next.stepCount, trigger_count: next.triggerCount, action_count: next.actionCount, variable_count: next.variableCount, integration_count: next.integrationCount, status: next.status }).eq("id", next.id).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "automationPlan.save");
    if (data === null) return err("conflict", "automationPlan.save: not found");
    return ok("updated", m.toPlan(data as Record<string, unknown>));
  }
}

export class SupabaseWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(w: WorkflowDefinition): Promise<RuntimeResult<WorkflowDefinition>> {
    const { data, error } = await this.db.from(WF).insert(m.workflowRow(w)).select("*").single();
    if (error) return mapDatabaseError(error, "workflowDefinition.append");
    return ok("created", m.toWorkflow(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<WorkflowDefinition | null>> {
    const { data, error } = await this.db.from(WF).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "workflowDefinition.getById");
    return ok("found", data ? m.toWorkflow(data as Record<string, unknown>) : null);
  }
  async listByIntent(executionIntentId: string): Promise<RuntimeResult<WorkflowDefinition[]>> {
    const { data, error } = await this.db.from(WF).select("*").eq("execution_intent_id", executionIntentId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "workflowDefinition.listByIntent");
    return ok("found", (data ?? []).map((r) => m.toWorkflow(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<WorkflowDefinition[]>> {
    const { data, error } = await this.db.from(WF).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "workflowDefinition.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toWorkflow(r as Record<string, unknown>)));
  }
  async save(next: WorkflowDefinition): Promise<RuntimeResult<WorkflowDefinition>> {
    const { data, error } = await this.db.from(WF).update({ status: next.status, version: next.version, entry_step_key: next.entryStepKey }).eq("id", next.id).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "workflowDefinition.save");
    if (data === null) return err("conflict", "workflowDefinition.save: not found");
    return ok("updated", m.toWorkflow(data as Record<string, unknown>));
  }
}

export class SupabaseWorkflowStepRepository implements WorkflowStepRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly WorkflowStep[]) { return appendMany<WorkflowStep>(this.db, STEP, m.stepRow, m.toStep, "workflowStep")(rows); }
  listByWorkflow(id: string) { return listByCol<WorkflowStep>(this.db, STEP, "workflow_definition_id", m.toStep, "workflowStep", "order_index")(id); }
}
export class SupabaseTriggerDefinitionRepository implements TriggerDefinitionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly TriggerDefinition[]) { return appendMany<TriggerDefinition>(this.db, TRG, m.triggerRow, m.toTrigger, "triggerDefinition")(rows); }
  listByWorkflow(id: string) { return listByCol<TriggerDefinition>(this.db, TRG, "workflow_definition_id", m.toTrigger, "triggerDefinition")(id); }
}
export class SupabaseActionDefinitionRepository implements ActionDefinitionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly ActionDefinition[]) { return appendMany<ActionDefinition>(this.db, ACT, m.actionRow, m.toAction, "actionDefinition")(rows); }
  listByWorkflow(id: string) { return listByCol<ActionDefinition>(this.db, ACT, "workflow_definition_id", m.toAction, "actionDefinition")(id); }
}
export class SupabaseConditionDefinitionRepository implements ConditionDefinitionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly ConditionDefinition[]) { return appendMany<ConditionDefinition>(this.db, COND, m.conditionRow, m.toCondition, "conditionDefinition")(rows); }
  listByWorkflow(id: string) { return listByCol<ConditionDefinition>(this.db, COND, "workflow_definition_id", m.toCondition, "conditionDefinition")(id); }
}
export class SupabaseVariableDefinitionRepository implements VariableDefinitionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly VariableDefinition[]) { return appendMany<VariableDefinition>(this.db, VAR, m.variableRow, m.toVariable, "variableDefinition")(rows); }
  listByWorkflow(id: string) { return listByCol<VariableDefinition>(this.db, VAR, "workflow_definition_id", m.toVariable, "variableDefinition")(id); }
}
export class SupabaseIntegrationBindingRepository implements IntegrationBindingRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  appendMany(rows: readonly IntegrationBinding[]) { return appendMany<IntegrationBinding>(this.db, BIND, m.bindingRow, m.toBinding, "integrationBinding")(rows); }
  listByWorkflow(id: string) { return listByCol<IntegrationBinding>(this.db, BIND, "workflow_definition_id", m.toBinding, "integrationBinding")(id); }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<IntegrationBinding[]>> {
    const { data, error } = await this.db.from(BIND).select("*").eq("workspace_id", workspaceId);
    if (error) return mapDatabaseError(error, "integrationBinding.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toBinding(r as Record<string, unknown>)));
  }
}

export class SupabaseDeploymentPackageRepository implements DeploymentPackageRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(d: DeploymentPackage): Promise<RuntimeResult<DeploymentPackage>> {
    const { data, error } = await this.db.from(DEP).insert(m.deploymentRow(d)).select("*").single();
    if (error) return mapDatabaseError(error, "deploymentPackage.append");
    return ok("created", m.toDeployment(data as Record<string, unknown>));
  }
  listByIntent(id: string) { return listByCol<DeploymentPackage>(this.db, DEP, "execution_intent_id", m.toDeployment, "deploymentPackage")(id); }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<DeploymentPackage[]>> {
    const { data, error } = await this.db.from(DEP).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "deploymentPackage.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toDeployment(r as Record<string, unknown>)));
  }
}

export class SupabaseAutomationVersionRepository implements AutomationVersionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(v: AutomationVersion): Promise<RuntimeResult<AutomationVersion>> {
    const { data, error } = await this.db.from(VER).insert(m.versionRow(v)).select("*").single();
    if (error) return mapDatabaseError(error, "automationVersion.append");
    return ok("created", m.toVersion(data as Record<string, unknown>));
  }
  listByWorkflow(id: string) { return listByCol<AutomationVersion>(this.db, VER, "workflow_definition_id", m.toVersion, "automationVersion", "version")(id); }
}

export class SupabaseAutomationFeedbackRepository implements AutomationFeedbackRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(f: AutomationFeedback): Promise<RuntimeResult<AutomationFeedback>> {
    const { data, error } = await this.db.from(FB).insert(m.feedbackRow(f)).select("*").single();
    if (error) return mapDatabaseError(error, "automationFeedback.append");
    return ok("created", m.toFeedback(data as Record<string, unknown>));
  }
  async listByIntent(executionIntentId: string): Promise<RuntimeResult<AutomationFeedback[]>> {
    const { data, error } = await this.db.from(FB).select("*").eq("execution_intent_id", executionIntentId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "automationFeedback.listByIntent");
    return ok("found", (data ?? []).map((r) => m.toFeedback(r as Record<string, unknown>)));
  }
}
