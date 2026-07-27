/* =============================================================================
 * AI Automation Builder — REPOSITORY PORTS (Phase E · Sprint E5).
 *
 * Persistence contracts; Supabase adapters live in `@brightloop/data`. The
 * execution intent is versioned (optimistic concurrency); the automation plan +
 * all definition records (workflow/steps/triggers/actions/conditions/variables/
 * integration bindings/deployment packages/versions) + feedback are append-only.
 * The builder consumes Phase D / E1-E4 ONLY via their application services, so no
 * plan/AI/knowledge/execution ports appear here. RLS is the tenant boundary.
 * ========================================================================== */

import type {
  ActionDefinition, AutomationFeedback, AutomationPlan, AutomationVersion, ConditionDefinition, DeploymentPackage,
  ExecutionIntent, IntegrationBinding, TriggerDefinition, VariableDefinition, WorkflowDefinition, WorkflowStep,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface ExecutionIntentRepository {
  create(intent: ExecutionIntent): Promise<RuntimeResult<ExecutionIntent>>;
  getById(id: string): Promise<RuntimeResult<ExecutionIntent | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<ExecutionIntent[]>>;
  save(next: ExecutionIntent, expectedVersion: number): Promise<RuntimeResult<ExecutionIntent>>;
}

export interface AutomationPlanRepository {
  append(plan: AutomationPlan): Promise<RuntimeResult<AutomationPlan>>;
  getByIntent(executionIntentId: string): Promise<RuntimeResult<AutomationPlan | null>>;
  save(next: AutomationPlan): Promise<RuntimeResult<AutomationPlan>>;
}

export interface WorkflowDefinitionRepository {
  append(workflow: WorkflowDefinition): Promise<RuntimeResult<WorkflowDefinition>>;
  getById(id: string): Promise<RuntimeResult<WorkflowDefinition | null>>;
  listByIntent(executionIntentId: string): Promise<RuntimeResult<WorkflowDefinition[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<WorkflowDefinition[]>>;
  save(next: WorkflowDefinition): Promise<RuntimeResult<WorkflowDefinition>>;
}

export interface WorkflowStepRepository {
  appendMany(rows: readonly WorkflowStep[]): Promise<RuntimeResult<WorkflowStep[]>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<WorkflowStep[]>>;
}

export interface TriggerDefinitionRepository {
  appendMany(rows: readonly TriggerDefinition[]): Promise<RuntimeResult<TriggerDefinition[]>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<TriggerDefinition[]>>;
}

export interface ActionDefinitionRepository {
  appendMany(rows: readonly ActionDefinition[]): Promise<RuntimeResult<ActionDefinition[]>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<ActionDefinition[]>>;
}

export interface ConditionDefinitionRepository {
  appendMany(rows: readonly ConditionDefinition[]): Promise<RuntimeResult<ConditionDefinition[]>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<ConditionDefinition[]>>;
}

export interface VariableDefinitionRepository {
  appendMany(rows: readonly VariableDefinition[]): Promise<RuntimeResult<VariableDefinition[]>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<VariableDefinition[]>>;
}

export interface IntegrationBindingRepository {
  appendMany(rows: readonly IntegrationBinding[]): Promise<RuntimeResult<IntegrationBinding[]>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<IntegrationBinding[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<IntegrationBinding[]>>;
}

export interface DeploymentPackageRepository {
  append(row: DeploymentPackage): Promise<RuntimeResult<DeploymentPackage>>;
  listByIntent(executionIntentId: string): Promise<RuntimeResult<DeploymentPackage[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<DeploymentPackage[]>>;
}

export interface AutomationVersionRepository {
  append(row: AutomationVersion): Promise<RuntimeResult<AutomationVersion>>;
  listByWorkflow(workflowDefinitionId: string): Promise<RuntimeResult<AutomationVersion[]>>;
}

export interface AutomationFeedbackRepository {
  append(row: AutomationFeedback): Promise<RuntimeResult<AutomationFeedback>>;
  listByIntent(executionIntentId: string): Promise<RuntimeResult<AutomationFeedback[]>>;
}

/** The ports the Automation Builder application use-cases are wired with. */
export interface AutomationBuilderRepositories {
  intents: ExecutionIntentRepository;
  plans: AutomationPlanRepository;
  workflows: WorkflowDefinitionRepository;
  steps: WorkflowStepRepository;
  triggers: TriggerDefinitionRepository;
  actions: ActionDefinitionRepository;
  conditions: ConditionDefinitionRepository;
  variables: VariableDefinitionRepository;
  integrations: IntegrationBindingRepository;
  deployments: DeploymentPackageRepository;
  versions: AutomationVersionRepository;
  feedback: AutomationFeedbackRepository;
}
