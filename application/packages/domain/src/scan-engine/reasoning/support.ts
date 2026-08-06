/* =============================================================================
 * Evidence-validation support taxonomy (PDF 27 §07/§10) — PURE, no AI.
 *
 * Grades a validated claim against the evidence that backs it. This is the
 * deterministic sibling of `grounding.ts`: grounding answers the BINARY question
 * "may this claim pass at all?", and `classifyClaimSupport` answers the GRADED
 * question "how strongly does the evidence support it, and what confidence does
 * that evidence justify?".
 *
 *   grounded claim (no rejections)  → supported / partially_supported / weak_support
 *   rejected claim                  → unsupported (no/over-asserted evidence)
 *                                     contradicted (evidence actively undermines it)
 *
 * Every output is a pure function of the cited evidence facts + the grounding
 * rejections — no clock, no I/O, no invention. Confidence is RECALCULATED from
 * evidence quality (state ceiling × freshness × source coverage) and is only ever
 * lowered relative to what the provider advised, never raised. A claim with no
 * evidence, or an assertion beyond its evidence, resolves to confidence 0.
 * ========================================================================== */

import type { EvidenceState, EvidenceSupportAssessment, EvidenceSupportLevel, FreshnessBand, GroundingRejection, GroundingRejectionReason } from "@brightloop/schema";
import type { EvidenceFacts } from "./grounding.js";

/** The maximum certainty (0–100) each evidence state can justify (mirrors grounding). */
const STATE_CEILING: Record<EvidenceState, number> = { observed: 100, estimated: 70, inferred: 50, unavailable: 0 };
/** How much freshness discounts the evidence-derived confidence. */
const FRESHNESS_FACTOR: Record<FreshnessBand, number> = { fresh: 1, recent: 0.9, stale: 0.6, expired: 0.3 };

/** Rejection reasons that mean the evidence ACTIVELY undermines the claim. */
const CONTRADICTING_REASONS: ReadonlySet<GroundingRejectionReason> = new Set(["references_unavailable_source"]);
/** Rejection reasons that mean the claim ASSERTS BEYOND its evidence (no support). */
const UNSUPPORTED_REASONS: ReadonlySet<GroundingRejectionReason> = new Set([
  "no_evidence",
  "malformed_citation",
  "fabricated_metric",
  "fabricated_competitor",
  "unsupported_causal_claim",
  "prohibited_sensitive_claim",
]);

export interface SupportInput {
  /** Facts for the claim's cited evidence ids that EXIST in the bundle. */
  citedFacts: EvidenceFacts[];
  /** The grounding rejections for this claim ([] when fully grounded). */
  rejections: GroundingRejection[];
  /** The provider's advisory confidence (0–100); the recalculation never exceeds it. */
  providerConfidence: number;
  /** True when a bundle-level conflict touches this claim's evidence. */
  conflicted?: boolean;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));
const uniqSorted = (codes: string[]): string[] => [...new Set(codes)].sort();

/** The evidence-derived confidence ceiling — the SAME rule grounding enforces. */
function evidenceCeiling(facts: EvidenceFacts[]): number {
  if (facts.length === 0) return 0;
  return Math.min(Math.max(...facts.map((f) => STATE_CEILING[f.state])), Math.max(...facts.map((f) => f.confidenceValue)));
}

/**
 * Grade a claim's support and recalculate its confidence from evidence quality.
 *
 * Ordered most-severe first: contradiction → unsupported → graded support. The
 * result is deterministic for a given input and carries stable reason codes that
 * the operator UI renders as the "why this confidence" explanation.
 */
export function classifyClaimSupport(input: SupportInput): EvidenceSupportAssessment {
  const reasons = new Set(input.rejections.map((r) => r.reason));
  const codes: string[] = [];

  // 1 · CONTRADICTED — the evidence record undermines the claim.
  const contradicted = input.conflicted === true || [...reasons].some((r) => CONTRADICTING_REASONS.has(r));
  if (contradicted) {
    if (input.conflicted === true) codes.push("evidence_conflict");
    if (reasons.has("references_unavailable_source")) codes.push("rests_on_unavailable_source");
    return { level: "contradicted", confidence: 0, reasonCodes: uniqSorted(codes) };
  }

  // 2 · UNSUPPORTED — no valid evidence, or an assertion beyond the evidence.
  const noEvidence = input.citedFacts.length === 0 || reasons.has("no_evidence");
  const overAsserted = [...reasons].some((r) => UNSUPPORTED_REASONS.has(r));
  if (noEvidence || overAsserted) {
    if (noEvidence) codes.push("no_evidence");
    for (const r of reasons) if (UNSUPPORTED_REASONS.has(r) && r !== "no_evidence") codes.push(r);
    return { level: "unsupported", confidence: 0, reasonCodes: uniqSorted(codes) };
  }

  // 3 · GRADED SUPPORT — recalculate confidence, then grade by evidence strength.
  const facts = input.citedFacts;
  const observed = facts.filter((f) => f.state === "observed");
  const staleAll = facts.every((f) => f.freshnessBand === "stale" || f.freshnessBand === "expired");
  const ceiling = evidenceCeiling(facts);
  const freshness = Math.max(...facts.map((f) => FRESHNESS_FACTOR[f.freshnessBand]));

  // Coverage: multiple observed sources corroborate; a single/weak source discounts.
  const coverage = observed.length >= 2 ? 1 : observed.length === 1 ? 0.85 : facts.some((f) => f.state === "estimated") ? 0.65 : 0.45;
  const evidenceScore = ceiling * freshness * coverage;
  // Never inflate past the provider's own confidence; fall back to evidence when it advised nothing.
  const confidence = clamp(input.providerConfidence > 0 ? Math.min(input.providerConfidence, evidenceScore) : evidenceScore);

  // Descriptor codes — the confidence explanation.
  codes.push(observed.length >= 2 ? "multi_source" : facts.length >= 2 ? "multiple_sources" : "single_source");
  if (observed.length > 0) codes.push("observed_evidence");
  else if (facts.some((f) => f.state === "estimated")) codes.push("estimated_evidence");
  else codes.push("inferred_evidence");
  if (staleAll) codes.push("stale_evidence");
  if (confidence >= 75) codes.push("high_confidence");
  else if (confidence < 40) codes.push("low_confidence");
  else codes.push("moderate_confidence");

  // A SOFT grounding defect (missing limitations, over-certainty, stale evidence)
  // is not a hard rejection but still keeps a claim off the top grades — cap at
  // weak_support and name the defect. Hard rejections already returned above.
  const softDefect = input.rejections.length > 0;
  if (softDefect) for (const r of reasons) codes.push(r);

  const strong = (observed.length >= 2 && !staleAll && confidence >= 60) || (observed.length >= 1 && !staleAll && confidence >= 75);
  const weak = observed.length === 0 || staleAll || confidence < 40;

  let level: EvidenceSupportLevel;
  if (softDefect || weak) level = "weak_support";
  else if (strong) level = "supported";
  else level = "partially_supported";

  return { level, confidence, reasonCodes: uniqSorted(codes) };
}
