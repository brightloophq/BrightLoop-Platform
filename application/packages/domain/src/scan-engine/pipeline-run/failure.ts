/* =============================================================================
 * Pipeline failure model (Sprint 8 §5 · AIS-001 §11 Fail Safely) — PURE.
 *
 * Every stage failure produces a STRUCTURED failure object — kind, stage, detail,
 * timestamp, retryability, and the ids of any preserved failed artifacts. There is
 * no silent fallthrough: a stage either produces its artifact or a failure.
 * ========================================================================== */

import { pipelineFailureSchema, type PipelineFailure, type PipelineFailureKind, type PipelineRunStage, type ReasoningFailureKind } from "@brightloop/schema";

/** Kinds a retry could plausibly clear; the rest are terminal for the run. */
const RETRYABLE: ReadonlySet<PipelineFailureKind> = new Set(["provider_execution_failure", "timeout", "grounding_rejection"]);

export function isRetryablePipelineFailure(kind: PipelineFailureKind): boolean {
  return RETRYABLE.has(kind);
}

export interface FailureInput {
  kind: PipelineFailureKind;
  stage: PipelineRunStage | null;
  detail: string;
  now: string;
  artifactIds?: string[];
}

/** Build a structured pipeline failure. Pure. */
export function pipelineFailure(input: FailureInput): PipelineFailure {
  return pipelineFailureSchema.parse({
    kind: input.kind,
    stage: input.stage,
    detail: input.detail,
    at: input.now,
    retryable: isRetryablePipelineFailure(input.kind),
    artifactIds: input.artifactIds ?? [],
  });
}

/** Map an execution-layer failure kind (Sprint 6/7) onto a pipeline failure kind. Pure. */
export function fromExecutionFailure(kind: ReasoningFailureKind): PipelineFailureKind {
  switch (kind) {
    case "budget_exhausted":
      return "budget_exhaustion";
    case "timeout":
      return "timeout";
    case "cancelled":
      return "cancellation";
    case "validation":
      return "grounding_rejection";
    default:
      return "provider_execution_failure";
  }
}

/** A blocked dependency failure names the artifact kinds that were missing. Pure. */
export function blockedDependency(stage: PipelineRunStage, missing: readonly string[], now: string): PipelineFailure {
  return pipelineFailure({ kind: "blocked_dependency", stage, detail: `missing required artifact(s): ${missing.join(", ")}`, now });
}
