/* =============================================================================
 * Business Health Assessment — scoring (handoff §05 funnel 1).
 * Ported from onboarding-data.js ASSESSMENT.
 *
 * INTEGRITY (handoff §07 /health): the Health Score is COMPUTED from real
 * answers, never a constant. These are pure functions so the score is testable
 * and identical everywhere it's shown (funnel, portal, admin context panel).
 *
 * Questions + weights are PLACEHOLDER pending the product owner (open decision 3).
 * The compute path is real; the numbers behind it are sample until replaced.
 * ========================================================================== */

import { DISCIPLINES, type Discipline } from "@brightloop/schema";

export interface AssessmentOption {
  label: string;
  score: number; // 0–100 for this dimension
}

export interface AssessmentQuestion {
  id: string;
  /** The loop dimension this question scores. */
  dim: Discipline;
  q: string;
  options: readonly AssessmentOption[];
}

/** answers: questionId → chosen score (0–100). */
export type AssessmentAnswers = Record<string, number>;

/** Per-dimension scores, averaged across the questions that measure each. */
export type DimensionScores = Record<Discipline, number>;

/**
 * Score the assessment into per-dimension averages.
 * A dimension with no answered questions scores 0 rather than NaN.
 */
export function scoreDimensions(
  questions: readonly AssessmentQuestion[],
  answers: AssessmentAnswers,
): DimensionScores {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const d of DISCIPLINES) sums[d] = { total: 0, n: 0 };

  for (const question of questions) {
    const score = answers[question.id];
    if (typeof score !== "number") continue;
    const bucket = sums[question.dim]!;
    bucket.total += score;
    bucket.n += 1;
  }

  const out = {} as DimensionScores;
  for (const d of DISCIPLINES) {
    const bucket = sums[d]!;
    out[d] = bucket.n > 0 ? Math.round(bucket.total / bucket.n) : 0;
  }
  return out;
}

/**
 * Overall Health Score — the mean of the ANSWERED question scores.
 *
 * Averages answers, not dimensions, so a dimension with more questions is
 * weighted by how much it was actually measured. Returns null (not 0) when
 * nothing has been answered — "no score yet" is not "a score of zero".
 */
export function healthScore(
  questions: readonly AssessmentQuestion[],
  answers: AssessmentAnswers,
): number | null {
  const scores = questions
    .map((q) => answers[q.id])
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** Are all required questions answered? Gates "continue" (handoff §09.2). */
export function isAssessmentComplete(
  questions: readonly AssessmentQuestion[],
  answers: AssessmentAnswers,
): boolean {
  return questions.every((q) => typeof answers[q.id] === "number");
}

/** A qualitative band for the Health Score — for display, not a fabricated stat. */
export function healthBand(score: number | null): string {
  if (score === null) return "Not yet assessed";
  if (score >= 75) return "Strong";
  if (score >= 50) return "Developing";
  if (score >= 30) return "At risk";
  return "Needs urgent attention";
}
