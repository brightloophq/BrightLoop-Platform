/* =============================================================================
 * Execution request construction (Sprint 7 §3) — PURE.
 *
 * Builds the canonical `ExecutionRequest` from a routed reasoning job + its
 * structured reasoning input (policy, objective, claims, output schema) bound to a
 * selected provider + trace id. Carries budgets, deadline, and grounding policy —
 * and DELIBERATELY no hidden chain-of-thought field.
 * ========================================================================== */

import { executionRequestSchema, type ExecutionRequest, type ReasoningInput, type ReasoningJob } from "@brightloop/schema";

export interface BuildExecutionRequestInput {
  job: ReasoningJob;
  policy: ReasoningInput; // §3 reasoning input — objective, claims, output schema, business context
  providerId: string; // selected provider (opaque)
  traceId: string;
  systemPolicy?: string; // system framing; defaults to the joined policy rules
}

/** Deterministic union of two id lists, preserving first-seen order. */
function unionIds(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...a, ...b]) {
    if (id !== "" && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Assemble a validated execution request. Budgets/deadline/refs come from the job;
 * objective/claims/output-schema/business-context come from the reasoning input;
 * the request targets one opaque provider. Pure.
 */
export function buildExecutionRequest(input: BuildExecutionRequestInput): ExecutionRequest {
  const { job, policy } = input;
  return executionRequestSchema.parse({
    jobId: job.id,
    traceId: input.traceId,
    providerId: input.providerId,
    systemPolicy: input.systemPolicy ?? policy.policyRules.join("\n"),
    taskObjective: policy.taskObjective,
    businessContext: policy.businessContext,
    evidenceRefs: unionIds(job.inputRefs.evidenceIds, policy.evidenceRefs),
    graphSnapshotRef: job.inputRefs.graphSnapshotChecksum,
    allowedClaims: policy.allowedClaims,
    prohibitedClaims: policy.prohibitedClaims,
    outputSchemaId: policy.outputSchemaId,
    tokenBudget: { inputTokens: job.budget.inputTokens, outputTokens: job.budget.outputTokens },
    costCeiling: job.budget.costCeiling,
    latencyCeilingMs: job.budget.latencyCeilingMs,
    deadline: job.deadline,
  });
}
