/* =============================================================================
 * AI Agents & Multi-Agent Orchestration (Phase E · Sprint E7) — schema contracts.
 *
 * Coordinated agents that pursue approved goals by ORCHESTRATING the existing
 * bounded contexts (Phase D + E1–E6) through their public application services.
 * Agents are coordinators, not independent sources of business truth: they never
 * duplicate E1–E6 intelligence, import upstream repositories, execute/deploy, or
 * reach outside via network/SDK. Additive; a new `agents` bounded context.
 *
 *   Goal → Mission → Planner → Capability Selection → Delegation → App Services →
 *   Observation → Evaluation → Approval → Completion
 * ========================================================================== */

import { z } from "zod";

/* ---- roles + lifecycles ---------------------------------------------------- */

export const agentRoleSchema = z.enum(["coordinator", "strategy", "project_management", "automation", "reporting", "knowledge", "review"]);
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const agentProfileStatusSchema = z.enum(["draft", "active", "inactive", "archived"]);
export type AgentProfileStatus = z.infer<typeof agentProfileStatusSchema>;

export const missionStatusSchema = z.enum(["draft", "queued", "planning", "running", "waiting_for_approval", "resuming", "completed", "failed", "cancelled", "timed_out", "archived"]);
export type MissionStatus = z.infer<typeof missionStatusSchema>;

export const agentRunStatusSchema = z.enum(["created", "planning", "executing", "observing", "evaluating", "paused", "completed", "failed", "cancelled", "timed_out"]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const agentTaskStatusSchema = z.enum(["pending", "ready", "claimed", "running", "waiting_for_approval", "completed", "failed", "skipped", "compensating", "compensated"]);
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;

export const agentTaskKindSchema = z.enum(["capability", "approval_gate", "terminal", "compensation"]);
export type AgentTaskKind = z.infer<typeof agentTaskKindSchema>;

export const delegationStatusSchema = z.enum(["pending", "accepted", "in_progress", "completed", "failed", "rejected"]);
export type DelegationStatus = z.infer<typeof delegationStatusSchema>;

export const agentMessageKindSchema = z.enum(["instruction", "clarification", "progress", "result", "warning", "escalation", "approval_request", "approval_response", "cancellation"]);
export type AgentMessageKind = z.infer<typeof agentMessageKindSchema>;

export const agentDecisionKindSchema = z.enum(["plan", "delegate", "invoke", "request_approval", "replan", "retry", "escalate", "complete", "cancel"]);
export type AgentDecisionKind = z.infer<typeof agentDecisionKindSchema>;

export const agentApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);
export type AgentApprovalStatus = z.infer<typeof agentApprovalStatusSchema>;

export const approvalClassSchema = z.enum(["strategy_publish", "plan_approval", "workflow_publish", "deployment_package", "external_side_effect", "high_risk", "cost_threshold", "privileged"]);
export type ApprovalClass = z.infer<typeof approvalClassSchema>;

export const evaluationVerdictSchema = z.enum(["pass", "fail"]);
export type EvaluationVerdict = z.infer<typeof evaluationVerdictSchema>;

export const failureCategorySchema = z.enum(["validation", "authorization", "approval", "capability", "timeout", "budget", "dependency", "upstream", "conflict", "unknown"]);
export type FailureCategory = z.infer<typeof failureCategorySchema>;

export const failureResolutionSchema = z.enum(["retry", "replan", "delegate", "clarify", "approve", "pause", "fail", "cancel", "compensate", "unresolved"]);
export type FailureResolution = z.infer<typeof failureResolutionSchema>;

export const agentMemoryTypeSchema = z.enum(["mission_context", "task_result", "decision_record", "user_instruction", "approval_record", "evidence_reference", "execution_checkpoint"]);
export type AgentMemoryType = z.infer<typeof agentMemoryTypeSchema>;

export const sensitivitySchema = z.enum(["public", "internal", "confidential", "restricted"]);
export type Sensitivity = z.infer<typeof sensitivitySchema>;

export const agentArtifactKindSchema = z.enum(["strategy_result", "execution_plan", "automation_workflow", "deployment_package", "report", "validation_result", "simulation_result", "citation_bundle", "approval_record", "knowledge_context"]);
export type AgentArtifactKind = z.infer<typeof agentArtifactKindSchema>;

export const agentFeedbackKindSchema = z.enum(["approval", "comment", "rejection"]);
export type AgentFeedbackKind = z.infer<typeof agentFeedbackKindSchema>;

/* ---- capability-registry classifications ----------------------------------- */

export const sideEffectClassSchema = z.enum(["read", "write", "external"]);
export type SideEffectClass = z.infer<typeof sideEffectClassSchema>;

export const capabilityApprovalClassSchema = z.enum(["none", "required"]);
export type CapabilityApprovalClass = z.infer<typeof capabilityApprovalClassSchema>;

export const retryClassSchema = z.enum(["none", "idempotent_retry", "at_least_once"]);
export type RetryClass = z.infer<typeof retryClassSchema>;

export const idempotencyClassSchema = z.enum(["idempotent", "non_idempotent"]);
export type IdempotencyClass = z.infer<typeof idempotencyClassSchema>;

export const costCategorySchema = z.enum(["low", "medium", "high"]);
export type CostCategory = z.infer<typeof costCategorySchema>;

/** Classification of a text segment for prompt-injection defense. */
export const instructionClassSchema = z.enum(["system_policy", "mission_instruction", "user_instruction", "retrieved_evidence", "external_content", "agent_message"]);
export type InstructionClass = z.infer<typeof instructionClassSchema>;

/* ---- capability definition (registry row) ---------------------------------- */

export const capabilityDefinitionSchema = z.object({
  key: z.string().min(1).max(120),
  owningContext: z.string(),
  service: z.string(),
  requiredPermission: z.string(),
  sideEffect: sideEffectClassSchema,
  approval: capabilityApprovalClassSchema.default("none"),
  retry: retryClassSchema.default("idempotent_retry"),
  idempotency: idempotencyClassSchema.default("idempotent"),
  timeoutMs: z.number().int().min(0).default(30_000),
  costCategory: costCategorySchema.default("low"),
  description: z.string().default(""),
  createdAt: z.string(),
});
export type CapabilityDefinition = z.infer<typeof capabilityDefinitionSchema>;

/* ---- agent profile (versioned) --------------------------------------------- */

export const agentProfileSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  name: z.string().min(1).max(200),
  role: agentRoleSchema,
  purpose: z.string().default(""),
  allowedCapabilities: z.array(z.string()).default([]),
  prohibitedCapabilities: z.array(z.string()).default([]),
  inputContract: z.record(z.unknown()).default({}),
  outputContract: z.record(z.unknown()).default({}),
  escalationPolicy: z.string().default(""),
  approvalRequirements: z.array(approvalClassSchema).default([]),
  maxRetries: z.number().int().min(0).default(2),
  maxDelegationDepth: z.number().int().min(0).default(3),
  status: agentProfileStatusSchema.default("draft"),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

/* ---- guardrail / budget limits (embedded in mission) ----------------------- */

export const missionLimitsSchema = z.object({
  maxRuns: z.number().int().min(1).default(20),
  maxTasks: z.number().int().min(1).default(50),
  maxRetries: z.number().int().min(0).default(3),
  maxDurationMs: z.number().int().min(0).default(3_600_000),
  maxTokens: z.number().int().min(0).default(500_000),
  maxCost: z.number().min(0).default(25),
  maxDelegationDepth: z.number().int().min(0).default(3),
  allowedCapabilities: z.array(z.string()).default([]),
  prohibitedCapabilities: z.array(z.string()).default([]),
  requiredApprovalClasses: z.array(approvalClassSchema).default([]),
});
export type MissionLimits = z.infer<typeof missionLimitsSchema>;

/* ---- agent mission (versioned root; plan immutable after start) ------------- */

export const agentMissionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  coordinatorProfileId: z.string(),
  title: z.string().min(1).max(300),
  goal: z.string().default(""),
  status: missionStatusSchema.default("draft"),
  requestedByUserId: z.string(),
  /** Optional upstream references the mission may consume (never mutated). */
  strategySessionId: z.string().nullable().default(null),
  planningSessionId: z.string().nullable().default(null),
  automationIntentId: z.string().nullable().default(null),
  limits: missionLimitsSchema,
  /** The immutable plan snapshot, set once at planning; empty until planned. */
  planHash: z.string().default(""),
  planLocked: z.boolean().default(false),
  /** The checkpoint a resume would restore from (mutable pointer). */
  resumableCheckpointId: z.string().nullable().default(null),
  correlationId: z.string(),
  /** Observability. */
  provider: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
  planningDurationMs: z.number().int().min(0).default(0),
  durationMs: z.number().int().min(0).default(0),
  runCount: z.number().int().min(0).default(0),
  taskCount: z.number().int().min(0).default(0),
  delegationCount: z.number().int().min(0).default(0),
  retryCount: z.number().int().min(0).default(0),
  checkpointCount: z.number().int().min(0).default(0),
  approvalWaitMs: z.number().int().min(0).default(0),
  capabilityCalls: z.number().int().min(0).default(0),
  failedCapabilityCalls: z.number().int().min(0).default(0),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  progress: z.number().int().min(0).max(100).default(0),
  terminationReason: z.string().default(""),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentMission = z.infer<typeof agentMissionSchema>;

/* ---- agent run (versioned; auditable transitions) -------------------------- */

export const agentRunSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  agentProfileId: z.string(),
  role: agentRoleSchema,
  status: agentRunStatusSchema.default("created"),
  delegationDepth: z.number().int().min(0).default(0),
  parentRunId: z.string().nullable().default(null),
  correlationId: z.string(),
  traceId: z.string(),
  startedAt: z.string().nullable().default(null),
  endedAt: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

/* ---- agent task (versioned + claimable) ------------------------------------ */

export const agentTaskSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  key: z.string().min(1).max(120),
  kind: agentTaskKindSchema,
  title: z.string().min(1).max(300),
  assignedRole: agentRoleSchema,
  /** The capability this task invokes (a registry key), if kind = capability. */
  capabilityKey: z.string().nullable().default(null),
  capabilityInput: z.record(z.unknown()).default({}),
  dependsOn: z.array(z.string()).default([]),
  parallelizable: z.boolean().default(false),
  optional: z.boolean().default(false),
  approvalGated: z.boolean().default(false),
  approvalClass: approvalClassSchema.nullable().default(null),
  retryable: z.boolean().default(true),
  compensatesTaskKey: z.string().nullable().default(null),
  completionCriteria: z.string().default(""),
  expectedOutput: z.string().default(""),
  status: agentTaskStatusSchema.default("pending"),
  retryCount: z.number().int().min(0).default(0),
  resultArtifactId: z.string().nullable().default(null),
  order: z.number().int().min(0).default(0),
  /** Optimistic task claiming (no worker service — semantics only). */
  claimedBy: z.string().nullable().default(null),
  claimedAt: z.string().nullable().default(null),
  leaseExpiresAt: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AgentTask = z.infer<typeof agentTaskSchema>;

/* ---- agent delegation (append-only, explicit) ------------------------------ */

export const agentDelegationSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  parentRunId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  delegatingRole: agentRoleSchema,
  receivingRole: agentRoleSchema,
  taskKey: z.string(),
  expectedOutput: z.string().default(""),
  constraints: z.string().default(""),
  deadline: z.string().nullable().default(null),
  depth: z.number().int().min(0).default(1),
  status: delegationStatusSchema.default("pending"),
  resultArtifactId: z.string().nullable().default(null),
  failureReason: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type AgentDelegation = z.infer<typeof agentDelegationSchema>;

/* ---- agent message (append-only) ------------------------------------------- */

export const agentMessageSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  runId: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: agentMessageKindSchema,
  senderRole: agentRoleSchema.nullable().default(null),
  senderUserId: z.string().nullable().default(null),
  receiverRole: agentRoleSchema.nullable().default(null),
  receiverUserId: z.string().nullable().default(null),
  correlationId: z.string(),
  parentMessageId: z.string().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type AgentMessage = z.infer<typeof agentMessageSchema>;

/* ---- agent observation (append-only) --------------------------------------- */

export const agentObservationSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  runId: z.string().nullable().default(null),
  taskKey: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  capabilityKey: z.string().nullable().default(null),
  summary: z.string().default(""),
  data: z.record(z.unknown()).default({}),
  provenance: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type AgentObservation = z.infer<typeof agentObservationSchema>;

/* ---- agent decision (append-only) ------------------------------------------ */

export const agentDecisionSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  runId: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: agentDecisionKindSchema,
  rationale: z.string().default(""),
  taskKey: z.string().nullable().default(null),
  data: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type AgentDecision = z.infer<typeof agentDecisionSchema>;

/* ---- agent tool call (append-only; the gateway audit record) --------------- */

export const agentToolCallSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  runId: z.string().nullable().default(null),
  taskKey: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  capabilityKey: z.string(),
  requiredPermission: z.string(),
  sideEffect: sideEffectClassSchema,
  input: z.record(z.unknown()).default({}),
  outputRef: z.string().nullable().default(null),
  ok: z.boolean(),
  durationMs: z.number().int().min(0).default(0),
  tokenTotal: z.number().int().min(0).default(0),
  cost: z.number().min(0).default(0),
  idempotencyKey: z.string(),
  correlationId: z.string(),
  errorCode: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type AgentToolCall = z.infer<typeof agentToolCallSchema>;

/* ---- agent checkpoint (append-only durable snapshot) ----------------------- */

export const agentCheckpointSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  label: z.string().default(""),
  missionStatus: missionStatusSchema,
  stateHash: z.string(),
  snapshot: z.record(z.unknown()).default({}),
  sequence: z.number().int().min(0).default(0),
  createdAt: z.string(),
});
export type AgentCheckpoint = z.infer<typeof agentCheckpointSchema>;

/* ---- agent approval (versioned status; payload immutable) ------------------- */

export const agentApprovalSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  taskKey: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  approvalClass: approvalClassSchema,
  status: agentApprovalStatusSchema.default("pending"),
  /** The IMMUTABLE payload the approver is asked to approve. */
  payload: z.record(z.unknown()).default({}),
  payloadHash: z.string(),
  requestedByRole: agentRoleSchema,
  /** The specific user assigned to approve (client approvals must be assigned). */
  assignedApproverUserId: z.string().nullable().default(null),
  decidedByUserId: z.string().nullable().default(null),
  decisionReason: z.string().nullable().default(null),
  requestedAt: z.string(),
  decidedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type AgentApproval = z.infer<typeof agentApprovalSchema>;

/* ---- agent evaluation (append-only) ---------------------------------------- */

export const agentEvaluationSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  /** Either a task (by key) or the whole mission. */
  targetKind: z.enum(["task", "mission"]),
  targetKey: z.string(),
  evaluatorRole: agentRoleSchema,
  correctness: z.number().int().min(0).max(100).default(0),
  completeness: z.number().int().min(0).max(100).default(0),
  evidenceQuality: z.number().int().min(0).max(100).default(0),
  policyCompliance: z.number().int().min(0).max(100).default(0),
  goalAlignment: z.number().int().min(0).max(100).default(0),
  costEfficiency: z.number().int().min(0).max(100).default(0),
  executionEfficiency: z.number().int().min(0).max(100).default(0),
  confidence: z.number().int().min(0).max(100).default(0),
  humanAccepted: z.boolean().nullable().default(null),
  score: z.number().int().min(0).max(100).default(0),
  verdict: evaluationVerdictSchema,
  rationale: z.string().default(""),
  evidence: z.array(z.string()).default([]),
  requiredRemediation: z.string().default(""),
  createdAt: z.string(),
});
export type AgentEvaluation = z.infer<typeof agentEvaluationSchema>;

/* ---- agent memory (append-only; bounded, TTL, sensitivity) ----------------- */

export const agentMemorySchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  type: agentMemoryTypeSchema,
  key: z.string().min(1).max(200),
  value: z.string().default(""),
  sensitivity: sensitivitySchema.default("internal"),
  sourceRef: z.string().nullable().default(null),
  ttlSeconds: z.number().int().min(0).nullable().default(null),
  redacted: z.boolean().default(false),
  createdAt: z.string(),
});
export type AgentMemory = z.infer<typeof agentMemorySchema>;

/* ---- agent artifact (append-only; references, not duplicates) -------------- */

export const agentArtifactSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: agentArtifactKindSchema,
  /** Stable reference into the OWNING context (never a copied payload). */
  refContext: z.string(),
  refId: z.string(),
  title: z.string().default(""),
  /** A minimal snapshot kept only for auditability (never the full payload). */
  snapshot: z.record(z.unknown()).default({}),
  citations: z.array(z.string()).default([]),
  producedByRole: agentRoleSchema,
  taskKey: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type AgentArtifact = z.infer<typeof agentArtifactSchema>;

/* ---- agent failure (append-only) ------------------------------------------- */

export const agentFailureSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  runId: z.string().nullable().default(null),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  category: failureCategorySchema,
  stage: z.string().default(""),
  cause: z.string().default(""),
  retryable: z.boolean().default(false),
  retryCount: z.number().int().min(0).default(0),
  affectedTaskKey: z.string().nullable().default(null),
  affectedCapability: z.string().nullable().default(null),
  resolution: failureResolutionSchema.default("unresolved"),
  createdAt: z.string(),
});
export type AgentFailure = z.infer<typeof agentFailureSchema>;

/* ---- agent feedback (append-only) ------------------------------------------ */

export const agentFeedbackSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  kind: agentFeedbackKindSchema,
  rating: z.number().int().min(1).max(5).nullable().default(null),
  comment: z.string().nullable().default(null),
  subjectUserId: z.string(),
  createdAt: z.string(),
});
export type AgentFeedback = z.infer<typeof agentFeedbackSchema>;
