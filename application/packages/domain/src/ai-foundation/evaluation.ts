/* =============================================================================
 * Evaluation hooks (Phase E · Sprint E1) — PURE.
 *
 * A minimal, provider-agnostic evaluation record builder + a structured-output
 * validity check. Real evaluators (LLM-as-judge, rubric scorers) plug in later;
 * E1 provides the append-only record shape and the JSON-validity primitive.
 * ========================================================================== */

import type { EvaluationOutcome, EvaluationResult } from "@brightloop/schema";

export interface BuildEvaluationInput {
  id: string; executionId: string; workspaceId: string; clientId: string | null;
  evaluator: string; outcome: EvaluationOutcome; score?: number | null; notes?: string | null; now: string;
}
export function buildEvaluation(input: BuildEvaluationInput): EvaluationResult {
  return {
    id: input.id, executionId: input.executionId, workspaceId: input.workspaceId, clientId: input.clientId,
    evaluator: input.evaluator, outcome: input.outcome,
    score: input.score ?? null, notes: input.notes ?? null, at: input.now,
  };
}

/** Is `content` parseable JSON? The structured-output validity primitive. Pure. */
export function isValidJson(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

/** Parse structured output, returning the value or null on malformed JSON. Pure. */
export function parseStructured<T = unknown>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
