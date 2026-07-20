/* =============================================================================
 * Execution response normalization (Sprint 7 §4) — PURE.
 *
 * Collapses a provider's raw output + the validation verdict + accounting into the
 * ONE canonical `ExecutionResponse`, schema-validated. The raw provider content is
 * referenced (`rawResponseRef`), never embedded — only the validated structured
 * output crosses the boundary.
 * ========================================================================== */

import { executionResponseSchema, type ExecutionResponse, type ExecutionStatus, type ExecutionUsage, type ExecutionCostAccounting, type ValidationResult, type EvidenceCitation, type ModelMetadata, type FinishReason } from "@brightloop/schema";

export interface NormalizeResponseInput {
  jobId: string;
  traceId: string;
  providerId: string;
  status: ExecutionStatus;
  output: unknown; // included only when status === "succeeded"
  validation: ValidationResult;
  citations: EvidenceCitation[];
  model: ModelMetadata | null;
  usage: ExecutionUsage;
  cost: ExecutionCostAccounting;
  latencyMs: number;
  finishReason: FinishReason | null;
  warnings: string[];
  retryable: boolean;
  rawResponseRef: string | null;
}

/** Build the canonical, schema-validated execution response. Output is dropped unless succeeded. Pure. */
export function normalizeExecutionResponse(input: NormalizeResponseInput): ExecutionResponse {
  return executionResponseSchema.parse({
    jobId: input.jobId,
    traceId: input.traceId,
    providerId: input.providerId,
    status: input.status,
    output: input.status === "succeeded" ? (input.output ?? null) : null,
    validation: input.validation,
    citations: input.citations,
    model: input.model,
    usage: input.usage,
    cost: input.cost,
    latencyMs: input.latencyMs,
    finishReason: input.finishReason,
    warnings: input.warnings,
    retryable: input.retryable,
    rawResponseRef: input.rawResponseRef,
  });
}
