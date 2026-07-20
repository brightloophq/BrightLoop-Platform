/* =============================================================================
 * AI Provider Execution Layer — CONTRACTS (PDF 27 §06 · AIS-001 §13 · AIS-002 A03/A05).
 *
 * How a routed reasoning job is EXECUTED through a provider adapter while every
 * guarantee holds: evidence grounding, structured output, cost/token budgets,
 * retries + ordered fallback (AIS-001 §13: fallback "without changing outputs"),
 * provenance, cancellation, and deterministic behaviour. Data SHAPES only — the
 * runtime plumbing is pure domain code
 * (@brightloop/domain/scan-engine/execution/*). NO vendor SDK, no live model call,
 * no hidden chain-of-thought — provider output is untrusted until validated.
 * ========================================================================== */

import { z } from "zod";
import { providerCapabilitySchema, tokenEstimateSchema } from "./provider-registry.js";
import { validationResultSchema, evidenceCitationSchema, modelMetadataSchema, reasoningFailureKindSchema, reasoningResultProvenanceSchema } from "./reasoning.js";

export const EXECUTION_SCHEMA_VERSION = "1.0";

/* ---- status + finish reason ----------------------------------------------- */
/** Terminal outcome of an execution. `rejected` = provider returned, output failed validation. */
export const executionStatusSchema = z.enum([
  "succeeded",
  "rejected",
  "failed",
  "timed_out",
  "cancelled",
  "budget_exhausted",
  "deadline_exceeded",
]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

/** Why the provider stopped generating (provider-reported, normalized). */
export const finishReasonSchema = z.enum(["stop", "length", "content_filter", "timeout", "cancelled", "error"]);
export type FinishReason = z.infer<typeof finishReasonSchema>;

export const cancellationSourceSchema = z.enum(["user", "system", "deadline", "timeout"]);
export type CancellationSource = z.infer<typeof cancellationSourceSchema>;

/* ---- 3 · execution request (built from a routed reasoning job) ------------- */
export const executionRequestSchema = z.object({
  jobId: z.string(),
  traceId: z.string(),
  providerId: z.string(), // the selected provider this request targets (opaque id)
  systemPolicy: z.string().max(4000), // policy/system framing — NOT a chain-of-thought prompt
  taskObjective: z.string().max(2000),
  businessContext: z.record(z.string(), z.unknown()).default({}),
  evidenceRefs: z.array(z.string()).default([]),
  graphSnapshotRef: z.string().nullable().default(null),
  allowedClaims: z.array(z.string()).default([]),
  prohibitedClaims: z.array(z.string()).default([]),
  outputSchemaId: z.string(),
  tokenBudget: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
  costCeiling: z.number().nonnegative(),
  latencyCeilingMs: z.number().int().positive(),
  deadline: z.string().nullable().default(null),
});
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

/* ---- 7 · usage + cost accounting ------------------------------------------ */
export const executionUsageSchema = z.object({
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  actualInputTokens: z.number().int().nonnegative().nullable().default(null),
  actualOutputTokens: z.number().int().nonnegative().nullable().default(null),
  /** true when the provider returned no usage and we fell back to the estimate. */
  estimated: z.boolean(),
});
export type ExecutionUsage = z.infer<typeof executionUsageSchema>;

export const executionCostAccountingSchema = z.object({
  estimatedCost: z.number().nonnegative(),
  actualCost: z.number().nonnegative().nullable().default(null),
  stageSpend: z.number().nonnegative(), // cost attributed to this execution/stage
  jobSpend: z.number().nonnegative(), // cumulative spend across the job incl. this stage
  remainingBudget: z.number(), // costCeiling − jobSpend (may be negative on overrun)
  softWarning: z.boolean(),
  hardCeiling: z.number().nonnegative(),
});
export type ExecutionCostAccounting = z.infer<typeof executionCostAccountingSchema>;

/* ---- 4 · execution response (one canonical normalized result) ------------- */
export const executionResponseSchema = z.object({
  jobId: z.string(),
  traceId: z.string(),
  providerId: z.string(),
  status: executionStatusSchema,
  output: z.unknown().nullable().default(null), // validated structured output (null when rejected/failed)
  validation: validationResultSchema,
  citations: z.array(evidenceCitationSchema).default([]),
  model: modelMetadataSchema.nullable().default(null),
  usage: executionUsageSchema,
  cost: executionCostAccountingSchema,
  latencyMs: z.number().int().nonnegative(),
  finishReason: finishReasonSchema.nullable().default(null),
  warnings: z.array(z.string()).default([]),
  retryable: z.boolean().default(false),
  /** A REFERENCE to the raw provider response (id/pointer) — never the raw content. */
  rawResponseRef: z.string().nullable().default(null),
});
export type ExecutionResponse = z.infer<typeof executionResponseSchema>;

/* ---- 6 · attempt history -------------------------------------------------- */
export const executionAttemptSchema = z.object({
  providerId: z.string(),
  attempt: z.number().int().nonnegative(),
  status: executionStatusSchema,
  failureKind: reasoningFailureKindSchema.nullable().default(null),
  latencyMs: z.number().int().nonnegative(),
  at: z.string(),
});
export type ExecutionAttempt = z.infer<typeof executionAttemptSchema>;

/* ---- 9 · execution events (runtime-safe; no persistence this sprint) ------- */
export const executionEventTypeSchema = z.enum([
  "provider.execution_started",
  "provider.execution_succeeded",
  "provider.execution_failed",
  "provider.execution_timed_out",
  "provider.execution_cancelled",
  "provider.fallback_started",
  "provider.output_rejected",
  "provider.budget_warning",
  "provider.budget_exhausted",
]);
export type ExecutionEventType = z.infer<typeof executionEventTypeSchema>;

export const executionEventSchema = z.object({
  type: executionEventTypeSchema,
  jobId: z.string(),
  providerId: z.string().nullable().default(null),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type ExecutionEvent = z.infer<typeof executionEventSchema>;

/* ---- the orchestrator's aggregate outcome --------------------------------- */
export const executionOutcomeSchema = z.object({
  jobId: z.string(),
  finalStatus: executionStatusSchema,
  response: executionResponseSchema.nullable().default(null), // the accepted response, if any
  attempts: z.array(executionAttemptSchema).default([]),
  events: z.array(executionEventSchema).default([]),
  provenance: reasoningResultProvenanceSchema.nullable().default(null),
});
export type ExecutionOutcome = z.infer<typeof executionOutcomeSchema>;

/* ---- token estimate re-export (shared with the registry cost model) ------- */
export { tokenEstimateSchema, providerCapabilitySchema };
