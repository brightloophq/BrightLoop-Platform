/* =============================================================================
 * Execution Runtime & Deployment Engine (Phase F · Sprint F3) — schema contracts.
 *
 * The production execution layer. It takes an APPROVED, finalized E5 deployment
 * package and governs it into a runtime deployment that can be deployed, monitored,
 * retried, paused, rolled back, reconciled and audited against an external runtime
 * (n8n first). AUXION REMAINS THE SYSTEM OF RECORD — the external runtime is never
 * authoritative for definitions, versions, approvals, intent, audit, policy,
 * retries, rollback, ownership, or status. Additive; a new `execution-runtime`
 * bounded context. It consumes upstream contexts ONLY through their public
 * application services; it never stores raw secrets (only references).
 * ========================================================================== */

import { z } from "zod";

/* ---- providers, environments, runtime lifecycle ---------------------------- */

/** Runtime providers are modeled independently of any concrete integration. */
export const runtimeProviderSchema = z.enum(["n8n"]);
export type RuntimeProvider = z.infer<typeof runtimeProviderSchema>;

export const runtimeEnvironmentSchema = z.enum(["development", "staging", "production"]);
export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;

export const runtimeStatusSchema = z.enum([
  "pending_configuration", "validating", "healthy", "degraded", "unavailable", "disabled", "revoked",
]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;

export const runtimeHealthLevelSchema = z.enum(["healthy", "degraded", "unavailable", "unauthorized", "unknown"]);
export type RuntimeHealthLevel = z.infer<typeof runtimeHealthLevelSchema>;

/** A credential REFERENCE only ever records validation posture, never a secret. */
export const credentialValidationStateSchema = z.enum(["unverified", "valid", "invalid", "expired", "revoked"]);
export type CredentialValidationState = z.infer<typeof credentialValidationStateSchema>;

/* ---- deployment lifecycle -------------------------------------------------- */

export const runtimeDeploymentStatusSchema = z.enum([
  "draft", "validating", "awaiting_approval", "queued", "deploying", "deployed", "activating",
  "active", "paused", "degraded", "failed", "rolling_back", "rolled_back", "superseded", "cancelled",
]);
export type RuntimeDeploymentStatus = z.infer<typeof runtimeDeploymentStatusSchema>;

export const activationStateSchema = z.enum(["inactive", "active", "paused"]);
export type ActivationState = z.infer<typeof activationStateSchema>;

/** A provider-changing operation (each maps to an idempotency-keyed attempt). */
export const deploymentOperationSchema = z.enum([
  "deploy", "update", "activate", "deactivate", "pause", "resume", "rollback", "cancel", "reconcile", "delete",
]);
export type DeploymentOperation = z.infer<typeof deploymentOperationSchema>;

export const attemptStatusSchema = z.enum(["pending", "succeeded", "failed"]);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;

/* ---- execution monitoring -------------------------------------------------- */

export const runtimeExecutionStatusSchema = z.enum([
  "discovered", "queued", "running", "waiting", "succeeded", "failed", "cancelled", "unknown",
]);
export type RuntimeExecutionStatus = z.infer<typeof runtimeExecutionStatusSchema>;

/** Normalized, provider-neutral failure taxonomy. */
export const runtimeFailureCategorySchema = z.enum([
  "authentication", "authorization", "validation", "unsupported", "conflict", "timeout", "throttled",
  "provider_unavailable", "network", "stale_version", "approval_missing", "approval_expired",
  "package_mismatch", "secret_unavailable", "execution_failed", "unknown",
]);
export type RuntimeFailureCategory = z.infer<typeof runtimeFailureCategorySchema>;

/* ---- reconciliation / drift / webhooks / rollback / logs ------------------- */

export const driftClassSchema = z.enum([
  "no_drift", "metadata_drift", "configuration_drift", "destructive_drift", "missing_provider_workflow",
]);
export type DriftClass = z.infer<typeof driftClassSchema>;

export const reconciliationKindSchema = z.enum(["webhook", "polling", "manual"]);
export type ReconciliationKind = z.infer<typeof reconciliationKindSchema>;

export const webhookReceiptStatusSchema = z.enum(["received", "processed", "rejected", "duplicate"]);
export type WebhookReceiptStatus = z.infer<typeof webhookReceiptStatusSchema>;

export const rollbackStatusSchema = z.enum(["requested", "approved", "executing", "completed", "failed"]);
export type RollbackStatus = z.infer<typeof rollbackStatusSchema>;

export const logSeveritySchema = z.enum(["debug", "info", "warn", "error", "critical"]);
export type LogSeverity = z.infer<typeof logSeveritySchema>;

/* ---- runtime registration (versioned root) --------------------------------- */

export const runtimeRegistrationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  provider: runtimeProviderSchema,
  displayName: z.string().min(1).max(200),
  environment: runtimeEnvironmentSchema,
  /** A reference to the base URL (config/secret ref), never an inline secret value. */
  baseUrlRef: z.string(),
  /** FK to the credential REFERENCE (no secret material lives here). */
  credentialReferenceId: z.string().nullable().default(null),
  status: runtimeStatusSchema.default("pending_configuration"),
  providerVersion: z.string().nullable().default(null),
  /** Discovered provider capabilities (operation names), cached from discovery. */
  supportedCapabilities: z.array(z.string()).default([]),
  healthState: runtimeHealthLevelSchema.default("unknown"),
  lastHealthCheckAt: z.string().nullable().default(null),
  createdByUserId: z.string(),
  correlationId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RuntimeRegistration = z.infer<typeof runtimeRegistrationSchema>;

/* ---- capability snapshot (append-only) ------------------------------------- */

export const runtimeCapabilitySnapshotSchema = z.object({
  id: z.string(),
  runtimeRegistrationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  provider: runtimeProviderSchema,
  /** Discovered operation names + whether the configured edition supports each. */
  capabilities: z.array(z.object({ operation: z.string(), supported: z.boolean() })).default([]),
  providerVersion: z.string().nullable().default(null),
  discoveredAt: z.string(),
  createdAt: z.string(),
});
export type RuntimeCapabilitySnapshot = z.infer<typeof runtimeCapabilitySnapshotSchema>;

/* ---- health snapshot (append-only) ----------------------------------------- */

export const runtimeHealthSnapshotSchema = z.object({
  id: z.string(),
  runtimeRegistrationId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  level: runtimeHealthLevelSchema,
  latencyMs: z.number().int().min(0).default(0),
  providerVersion: z.string().nullable().default(null),
  /** SANITIZED detail only (never response bodies/secrets). */
  detail: z.record(z.unknown()).default({}),
  checkedAt: z.string(),
  createdAt: z.string(),
});
export type RuntimeHealthSnapshot = z.infer<typeof runtimeHealthSnapshotSchema>;

/* ---- runtime policy (versioned root, tenant-scoped) ------------------------ */

export const runtimePolicySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  environment: runtimeEnvironmentSchema,
  provider: runtimeProviderSchema,
  requiresApproval: z.boolean().default(true),
  /** Production: the approval must bind the EXACT package hash. */
  exactHashApproval: z.boolean().default(false),
  rollbackRequired: z.boolean().default(false),
  healthCheckRequired: z.boolean().default(false),
  autoActivate: z.boolean().default(false),
  maxRetries: z.number().int().min(0).max(20).default(3),
  maxExecutionMs: z.number().int().min(0).default(3_600_000),
  /** Roles permitted to deploy in this environment (in addition to the permission gate). */
  allowedDeployerRoles: z.array(z.string()).default([]),
  createdByUserId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RuntimePolicy = z.infer<typeof runtimePolicySchema>;

/* ---- credential reference (mutable root; INTERNAL-only mutation) ------------ */

export const runtimeCredentialReferenceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  runtimeRegistrationId: z.string().nullable().default(null),
  provider: runtimeProviderSchema,
  /** Opaque pointer into the RuntimeSecretStore — NEVER the secret itself. */
  secretRef: z.string(),
  secretVersion: z.string().default("1"),
  /** Non-sensitive metadata only (e.g. key name, scopes). */
  metadata: z.record(z.unknown()).default({}),
  validationState: credentialValidationStateSchema.default("unverified"),
  rotatedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RuntimeCredentialReference = z.infer<typeof runtimeCredentialReferenceSchema>;

/* ---- deployment (versioned root; immutable DEFINITION, mutable lifecycle) --- */

export const runtimeDeploymentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  runtimeRegistrationId: z.string(),
  provider: runtimeProviderSchema,
  /** Immutable deployment DEFINITION (set at create, never changed after deploy). */
  deploymentPackageId: z.string(),
  packageHash: z.string(),
  workflowDefinitionId: z.string(),
  /** Monotonic version per (package, runtime); a new deploy makes a new row. */
  deploymentVersion: z.number().int().positive().default(1),
  targetEnvironment: runtimeEnvironmentSchema,
  /** Deterministic hash of the translated provider workflow (drift baseline). */
  translatedWorkflowHash: z.string().default(""),
  externalWorkflowId: z.string().nullable().default(null),
  externalWorkflowVersion: z.string().nullable().default(null),
  approvalReferenceId: z.string().nullable().default(null),
  approvedByUserId: z.string().nullable().default(null),
  approvalExpiresAt: z.string().nullable().default(null),
  previousDeploymentId: z.string().nullable().default(null),
  rollbackSourceDeploymentId: z.string().nullable().default(null),
  /** Mutable lifecycle (optimistic concurrency via `version`). */
  status: runtimeDeploymentStatusSchema.default("draft"),
  activationState: activationStateSchema.default("inactive"),
  requestedByUserId: z.string(),
  deployedByUserId: z.string().nullable().default(null),
  deployedAt: z.string().nullable().default(null),
  correlationId: z.string(),
  traceId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RuntimeDeployment = z.infer<typeof runtimeDeploymentSchema>;

/* ---- deployment attempt (append-only; one per provider-changing operation) -- */

export const runtimeDeploymentAttemptSchema = z.object({
  id: z.string(),
  deploymentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  operation: deploymentOperationSchema,
  idempotencyKey: z.string(),
  attemptNumber: z.number().int().min(1).default(1),
  status: attemptStatusSchema.default("pending"),
  failureCategory: runtimeFailureCategorySchema.nullable().default(null),
  /** A SAFE provider code (never a response body/secret). */
  providerCode: z.string().nullable().default(null),
  startedAt: z.string(),
  finishedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type RuntimeDeploymentAttempt = z.infer<typeof runtimeDeploymentAttemptSchema>;

/* ---- deployment event (append-only; lifecycle timeline + audit) ------------ */

export const runtimeDeploymentEventSchema = z.object({
  id: z.string(),
  deploymentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  operation: deploymentOperationSchema.nullable().default(null),
  fromStatus: runtimeDeploymentStatusSchema.nullable().default(null),
  toStatus: runtimeDeploymentStatusSchema.nullable().default(null),
  actorUserId: z.string().nullable().default(null),
  reason: z.string().default(""),
  correlationId: z.string(),
  createdAt: z.string(),
});
export type RuntimeDeploymentEvent = z.infer<typeof runtimeDeploymentEventSchema>;

/* ---- deployment/runtime/execution log (append-only; SANITIZED) ------------- */

export const runtimeDeploymentLogSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  runtimeRegistrationId: z.string().nullable().default(null),
  deploymentId: z.string().nullable().default(null),
  executionId: z.string().nullable().default(null),
  provider: runtimeProviderSchema,
  operation: z.string(),
  severity: logSeveritySchema.default("info"),
  message: z.string().default(""),
  /** SANITIZED metadata only (auth headers/keys/tokens/bodies are redacted). */
  metadata: z.record(z.unknown()).default({}),
  correlationId: z.string(),
  traceId: z.string(),
  createdAt: z.string(),
});
export type RuntimeDeploymentLog = z.infer<typeof runtimeDeploymentLogSchema>;

/* ---- runtime execution (versioned root; status mutates) -------------------- */

export const runtimeExecutionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  deploymentId: z.string(),
  runtimeRegistrationId: z.string(),
  externalExecutionId: z.string(),
  externalWorkflowId: z.string().nullable().default(null),
  status: runtimeExecutionStatusSchema.default("discovered"),
  triggerType: z.string().nullable().default(null),
  retryNumber: z.number().int().min(0).default(0),
  startedAt: z.string().nullable().default(null),
  stoppedAt: z.string().nullable().default(null),
  durationMs: z.number().int().min(0).default(0),
  failureCategory: runtimeFailureCategorySchema.nullable().default(null),
  errorSummary: z.string().default(""),
  lastNode: z.string().nullable().default(null),
  correlationId: z.string(),
  traceId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RuntimeExecution = z.infer<typeof runtimeExecutionSchema>;

/* ---- execution attempt (append-only; retries) ------------------------------ */

export const runtimeExecutionAttemptSchema = z.object({
  id: z.string(),
  runtimeExecutionId: z.string(),
  deploymentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  attemptNumber: z.number().int().min(1).default(1),
  status: runtimeExecutionStatusSchema.default("queued"),
  failureCategory: runtimeFailureCategorySchema.nullable().default(null),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type RuntimeExecutionAttempt = z.infer<typeof runtimeExecutionAttemptSchema>;

/* ---- execution failure (append-only) --------------------------------------- */

export const runtimeExecutionFailureSchema = z.object({
  id: z.string(),
  runtimeExecutionId: z.string(),
  deploymentId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  category: runtimeFailureCategorySchema,
  retryable: z.boolean().default(false),
  message: z.string().default(""),
  providerCode: z.string().nullable().default(null),
  lastNode: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type RuntimeExecutionFailure = z.infer<typeof runtimeExecutionFailureSchema>;

/* ---- rollback request (versioned root) ------------------------------------- */

export const runtimeRollbackRequestSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  sourceDeploymentId: z.string(),
  targetDeploymentId: z.string(),
  reason: z.string().min(1).max(1000),
  requestedByUserId: z.string(),
  approvalReferenceId: z.string().nullable().default(null),
  status: rollbackStatusSchema.default("requested"),
  resultDeploymentId: z.string().nullable().default(null),
  correlationId: z.string(),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RuntimeRollbackRequest = z.infer<typeof runtimeRollbackRequestSchema>;

/* ---- webhook receipt (append-only; idempotent ingestion) ------------------- */

export const runtimeWebhookReceiptSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  runtimeRegistrationId: z.string(),
  provider: runtimeProviderSchema,
  externalEventId: z.string(),
  idempotencyKey: z.string(),
  signatureValid: z.boolean().default(false),
  status: webhookReceiptStatusSchema.default("received"),
  receivedAt: z.string(),
  processedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type RuntimeWebhookReceipt = z.infer<typeof runtimeWebhookReceiptSchema>;

/* ---- reconciliation result (append-only) ----------------------------------- */

export const runtimeReconciliationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  runtimeRegistrationId: z.string(),
  deploymentId: z.string().nullable().default(null),
  kind: reconciliationKindSchema,
  driftClass: driftClassSchema.default("no_drift"),
  expectedHash: z.string().default(""),
  providerHash: z.string().default(""),
  detail: z.string().default(""),
  createdAt: z.string(),
});
export type RuntimeReconciliation = z.infer<typeof runtimeReconciliationSchema>;
