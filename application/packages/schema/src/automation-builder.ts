/* =============================================================================
 * AI Automation Builder (Phase E · Sprint E5) — schema contracts.
 *
 * Converts an APPROVED execution plan (E4) into automation-ready workflow
 * definitions. It GENERATES, VALIDATES, VERSIONS and PREPARES automation — it
 * does NOT execute, deploy, call engines, schedule jobs, or send anything. The
 * orchestration layer, never the runtime. Consumes Phase D / E1 / E2 / E3 / E4
 * ONLY through their application services. Additive; a new `automation-builder`
 * bounded context.
 *
 *   ExecutionIntent → AutomationPlan → WorkflowDefinition → DeploymentPackage
 * ========================================================================== */

import { z } from "zod";

/* ---- enums ----------------------------------------------------------------- */

export const executionIntentStatusSchema = z.enum(["draft", "building", "built", "published", "failed", "archived"]);
export type ExecutionIntentStatus = z.infer<typeof executionIntentStatusSchema>;

export const automationPlanStatusSchema = z.enum(["draft", "validated", "published"]);
export type AutomationPlanStatus = z.infer<typeof automationPlanStatusSchema>;

/** Immutable workflow-version lifecycle (shared by workflow + version records). */
export const workflowStatusSchema = z.enum(["draft", "published", "deprecated", "archived"]);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

/** Extensible node kinds in the workflow DAG. */
export const workflowStepKindSchema = z.enum(["trigger", "action", "condition", "branch", "loop", "subflow", "wait"]);
export type WorkflowStepKind = z.infer<typeof workflowStepKindSchema>;

/** Extensible trigger types; future integrations (slack…) are already reserved. */
export const triggerKindSchema = z.enum([
  "manual", "schedule", "webhook", "crm_event", "form_submission", "payment", "email", "file_upload", "api_event",
  "slack", "discord", "teams", "shopify", "hubspot",
]);
export type TriggerKind = z.infer<typeof triggerKindSchema>;

/** Generic action types; custom actions extend this later. */
export const actionKindSchema = z.enum([
  "send_email", "create_task", "update_crm", "http_request", "transform_data", "wait", "condition", "loop", "branch",
  "generate_ai_content", "store_record", "notification", "webhook",
]);
export type ActionKind = z.infer<typeof actionKindSchema>;

/** Workflow variable scopes. */
export const variableScopeSchema = z.enum(["workspace", "client", "strategy", "initiative", "task", "execution", "output", "environment"]);
export type VariableScope = z.infer<typeof variableScopeSchema>;

export const variableTypeSchema = z.enum(["string", "number", "boolean", "json", "date"]);
export type VariableType = z.infer<typeof variableTypeSchema>;

/** Abstract integration providers — NEVER a concrete engine (n8n/zapier/make). */
export const integrationProviderSchema = z.enum(["email", "crm", "http", "storage", "ai", "notification", "payment", "calendar", "custom"]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

/** Deployment targets — provider abstraction; the builder never binds directly. */
export const deploymentTargetSchema = z.enum(["n8n", "zapier", "make", "temporal", "custom"]);
export type DeploymentTarget = z.infer<typeof deploymentTargetSchema>;

export const deploymentStatusSchema = z.enum(["draft", "ready"]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

export const automationFeedbackKindSchema = z.enum(["approval", "comment", "rejection"]);
export type AutomationFeedbackKind = z.infer<typeof automationFeedbackKindSchema>;

/* ---- execution intent (versioned root) ------------------------------------- */

export const executionIntentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** The E4 planning session whose APPROVED plan seeds this intent (the seam). */
  planningSessionId: z.string(),
  executionPlanId: z.string().nullable().default(null),
  title: z.string().min(1).max(300),
  objective: z.string().default(""),
  status: executionIntentStatusSchema.default("draft"),
  requestedByUserId: z.string(),
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  promptId: z.string().nullable().default(null),
  generationDurationMs: z.number().int().min(0).default(0),
  validationDurationMs: z.number().int().min(0).default(0),
  simulationDurationMs: z.number().int().min(0).default(0),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  currency: z.string().default("USD"),
  /** Workflow-complexity observability. */
  stepCount: z.number().int().min(0).default(0),
  branchCount: z.number().int().min(0).default(0),
  variableCount: z.number().int().min(0).default(0),
  estimatedRuntimeMs: z.number().int().min(0).default(0),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExecutionIntent = z.infer<typeof executionIntentSchema>;

/* ---- automation plan (append-only, one per intent) ------------------------- */

export const automationPlanSchema = z.object({
  id: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  summary: z.string().default(""),
  workflowCount: z.number().int().min(0).default(0),
  stepCount: z.number().int().min(0).default(0),
  triggerCount: z.number().int().min(0).default(0),
  actionCount: z.number().int().min(0).default(0),
  variableCount: z.number().int().min(0).default(0),
  integrationCount: z.number().int().min(0).default(0),
  status: automationPlanStatusSchema.default("draft"),
  createdAt: z.string(),
});
export type AutomationPlan = z.infer<typeof automationPlanSchema>;

/* ---- workflow definition (append-only; the DAG root) ----------------------- */

export const workflowDefinitionSchema = z.object({
  id: z.string(),
  automationPlanId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(300),
  description: z.string().default(""),
  status: workflowStatusSchema.default("draft"),
  /** The step KEY of the DAG entry node (a trigger). */
  entryStepKey: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

/* ---- workflow step (append-only; a DAG node) ------------------------------- */

export const workflowStepSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** Stable key, unique within the workflow (edges reference keys, not ids). */
  key: z.string().min(1).max(120),
  kind: workflowStepKindSchema,
  name: z.string().min(1).max(300),
  /** Successor step keys (the DAG edges out of this node). */
  nextStepKeys: z.array(z.string()).default([]),
  /** For condition/branch nodes: the boolean expression over variables. */
  conditionExpression: z.string().nullable().default(null),
  /** Error path (a step key) taken if this node fails. */
  onErrorStepKey: z.string().nullable().default(null),
  retryMax: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(0).default(0),
  /** Optional link to a trigger / action / condition definition. */
  refId: z.string().nullable().default(null),
  estimatedRuntimeMs: z.number().int().min(0).default(0),
  order: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

/* ---- trigger / action / condition / variable definitions (append-only) ----- */

export const triggerDefinitionSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: triggerKindSchema,
  name: z.string().min(1).max(300),
  /** Generic, non-sensitive config (schedule cadence, webhook path shape, …). */
  config: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type TriggerDefinition = z.infer<typeof triggerDefinitionSchema>;

export const actionDefinitionSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: actionKindSchema,
  name: z.string().min(1).max(300),
  config: z.record(z.unknown()).default({}),
  /** The integration this action runs through (abstract, never a concrete engine). */
  integrationBindingId: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;

export const conditionDefinitionSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(300),
  expression: z.string(),
  trueStepKey: z.string().nullable().default(null),
  falseStepKey: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ConditionDefinition = z.infer<typeof conditionDefinitionSchema>;

export const variableDefinitionSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  key: z.string().min(1).max(120),
  scope: variableScopeSchema,
  type: variableTypeSchema,
  defaultValue: z.string().nullable().default(null),
  required: z.boolean().default(false),
  createdAt: z.string(),
});
export type VariableDefinition = z.infer<typeof variableDefinitionSchema>;

/* ---- integration binding (append-only) ------------------------------------- */

export const integrationBindingSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  provider: integrationProviderSchema,
  name: z.string().min(1).max(300),
  /** e.g. "send", "upsert", "request" — the abstract capability required. */
  capability: z.string().default(""),
  config: z.record(z.unknown()).default({}),
  /** Whether a deployment adapter has resolved this binding. */
  bound: z.boolean().default(false),
  createdAt: z.string(),
});
export type IntegrationBinding = z.infer<typeof integrationBindingSchema>;

/* ---- deployment package (append-only) -------------------------------------- */

export const deploymentPackageSchema = z.object({
  id: z.string(),
  executionIntentId: z.string(),
  workflowDefinitionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  target: deploymentTargetSchema,
  format: z.string().default("json"),
  /** The abstract deployment descriptor. NEVER executed / sent by this layer. */
  payload: z.record(z.unknown()).default({}),
  checksum: z.string().default(""),
  status: deploymentStatusSchema.default("draft"),
  createdAt: z.string(),
});
export type DeploymentPackage = z.infer<typeof deploymentPackageSchema>;

/* ---- automation version (append-only; immutable snapshots) ----------------- */

export const automationVersionSchema = z.object({
  id: z.string(),
  workflowDefinitionId: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  version: z.number().int().positive(),
  status: workflowStatusSchema.default("draft"),
  /** Immutable full-graph snapshot at this version. */
  snapshot: z.record(z.unknown()).default({}),
  note: z.string().default(""),
  createdAt: z.string(),
});
export type AutomationVersion = z.infer<typeof automationVersionSchema>;

/* ---- automation feedback (append-only) ------------------------------------- */

export const automationFeedbackSchema = z.object({
  id: z.string(),
  executionIntentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: automationFeedbackKindSchema,
  rating: z.number().int().min(1).max(5).nullable().default(null),
  comment: z.string().nullable().default(null),
  subjectUserId: z.string(),
  createdAt: z.string(),
});
export type AutomationFeedback = z.infer<typeof automationFeedbackSchema>;
