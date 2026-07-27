/* =============================================================================
 * Agent evaluation scoring (Phase E · Sprint E7) — PURE.
 *
 * Deterministic scoring across the required dimensions. Privileged outcomes may
 * never be self-certified: a passing score alone does not grant human acceptance —
 * that requires the Review Agent or a human approval recorded separately. No io.
 * ========================================================================== */

import type { EvaluationVerdict } from "@brightloop/schema";

export interface EvaluationDimensions {
  correctness: number;
  completeness: number;
  evidenceQuality: number;
  policyCompliance: number;
  goalAlignment: number;
  costEfficiency: number;
  executionEfficiency: number;
  confidence: number;
}

const WEIGHTS: Record<keyof EvaluationDimensions, number> = {
  correctness: 0.2, completeness: 0.15, evidenceQuality: 0.15, policyCompliance: 0.2,
  goalAlignment: 0.15, costEfficiency: 0.05, executionEfficiency: 0.05, confidence: 0.05,
};

export interface EvaluationOutcome { score: number; verdict: EvaluationVerdict }

/**
 * Weighted score + pass/fail. Policy compliance is a gate: any policy score below
 * 60 fails regardless of the weighted total (a mission that violated policy never
 * passes on the strength of other dimensions).
 */
export function computeEvaluationScore(dims: EvaluationDimensions): EvaluationOutcome {
  const score = Math.round(
    (Object.keys(WEIGHTS) as (keyof EvaluationDimensions)[]).reduce((sum, k) => sum + dims[k] * WEIGHTS[k], 0),
  );
  const verdict: EvaluationVerdict = score >= 70 && dims.policyCompliance >= 60 ? "pass" : "fail";
  return { score, verdict };
}
