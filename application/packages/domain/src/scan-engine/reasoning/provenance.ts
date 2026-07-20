/* =============================================================================
 * Result provenance (Sprint 6 §09 · AIS-001 §08/§09 Traceable) — PURE.
 *
 * Assembles the full, inspectable provenance record for a reasoning result: job,
 * stage, chosen provider + model metadata, routing decision, token + cost
 * estimate, source evidence ids, graph-snapshot checksum, schema version, and
 * validation status. Everything needed to reproduce the result — no hidden state.
 * ========================================================================== */

import {
  reasoningResultProvenanceSchema,
  REASONING_SCHEMA_VERSION,
  type ReasoningJob,
  type SelectionResult,
  type ModelMetadata,
  type ReasoningResultProvenance,
} from "@brightloop/schema";

export interface BuildResultProvenanceInput {
  job: ReasoningJob;
  selection: SelectionResult | null;
  model?: ModelMetadata | null;
  startedAt: string;
  completedAt?: string | null;
  validationStatus: ReasoningResultProvenance["validationStatus"];
}

/**
 * Build a validated provenance record from a job + its routing selection. The
 * routing decision is the selected provider id (or "no_provider" when nothing was
 * eligible); the cost/token estimates and source evidence ids are carried through
 * from the selection and the job's input references. Pure.
 */
export function buildResultProvenance(input: BuildResultProvenanceInput): ReasoningResultProvenance {
  const { job, selection } = input;
  return reasoningResultProvenanceSchema.parse({
    jobId: job.id,
    stage: job.stage,
    providerId: selection?.selected ?? null,
    model: input.model ?? null,
    routingDecision: selection ? (selection.selected ?? "no_provider") : null,
    tokenEstimate: { inputTokens: job.budget.inputTokens, outputTokens: job.budget.outputTokens },
    costEstimate: selection?.estimatedCost ?? 0,
    sourceEvidenceIds: job.inputRefs.evidenceIds,
    graphSnapshotChecksum: job.inputRefs.graphSnapshotChecksum,
    schemaVersion: REASONING_SCHEMA_VERSION,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? null,
    validationStatus: input.validationStatus,
  });
}
