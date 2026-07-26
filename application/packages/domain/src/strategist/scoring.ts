/* =============================================================================
 * Priority + confidence scoring (Phase E · Sprint E3) — PURE.
 *
 * Priority blends seven weighted factors into 0–100 (implementation effort is
 * inverted — more effort lowers priority). Confidence is DERIVED from dimension
 * coverage + evidence, never fabricated: no evidence ⇒ low confidence, and the
 * gaps are surfaced as `missingInformation`. Deterministic; no io.
 * ========================================================================== */

import type { EffortLevel, ImpactLevel } from "@brightloop/schema";

export interface PriorityFactors {
  businessImpact: number;        // 0–100
  implementationEffort: number;  // 0–100 (higher = more effort = lower priority)
  urgency: number;
  riskReduction: number;
  customerValue: number;
  strategicAlignment: number;
  automationPotential: number;
}

export const PRIORITY_WEIGHTS = {
  businessImpact: 0.25, implementationEffort: 0.15, urgency: 0.15, riskReduction: 0.15,
  customerValue: 0.1, strategicAlignment: 0.1, automationPotential: 0.1,
} as const;

const clamp100 = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

/** Map a low/medium/high level to a 0–100 magnitude. Pure. */
export function levelToScore(level: ImpactLevel | EffortLevel): number {
  return level === "high" ? 90 : level === "medium" ? 60 : 30;
}

/** Weighted 0–100 priority; effort is inverted (100 − effort). Pure. */
export function calculatePriority(f: PriorityFactors): number {
  const w = PRIORITY_WEIGHTS;
  const score =
    f.businessImpact * w.businessImpact +
    (100 - f.implementationEffort) * w.implementationEffort +
    f.urgency * w.urgency +
    f.riskReduction * w.riskReduction +
    f.customerValue * w.customerValue +
    f.strategicAlignment * w.strategicAlignment +
    f.automationPotential * w.automationPotential;
  return clamp100(score);
}

export interface ConfidenceInput {
  requestedDimensions: readonly string[];
  coveredDimensions: readonly string[];
  /** Number of supporting evidence items (citations / retrieved chunks). */
  evidenceCount: number;
}

export interface ConfidenceResult {
  value: number;            // 0–100
  reason: string;
  missingInformation: string[];
}

/** Threshold below which clarifications should be requested. */
export const CONFIDENCE_THRESHOLD = 55;

/**
 * Derive confidence from dimension coverage (60%) + evidence density (40%).
 * Zero evidence caps confidence low. Never fabricates certainty. Pure.
 */
export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  const requested = input.requestedDimensions.length;
  const covered = new Set(input.coveredDimensions);
  const coverage = requested === 0 ? 0 : [...new Set(input.requestedDimensions)].filter((d) => covered.has(d)).length / requested;
  const evidenceFactor = requested === 0 ? 0 : Math.min(1, input.evidenceCount / (requested * 2));
  const value = input.evidenceCount === 0 ? Math.min(30, clamp100(100 * 0.6 * coverage)) : clamp100(100 * (0.6 * coverage + 0.4 * evidenceFactor));
  const missingInformation = [...new Set(input.requestedDimensions)].filter((d) => !covered.has(d));
  const reason = input.evidenceCount === 0
    ? "No supporting evidence was retrieved; confidence is capped."
    : `Coverage ${Math.round(coverage * 100)}% of requested dimensions across ${input.evidenceCount} evidence item(s).`;
  return { value, reason, missingInformation };
}
