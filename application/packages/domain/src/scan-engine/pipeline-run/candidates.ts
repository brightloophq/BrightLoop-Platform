/* =============================================================================
 * Recommendation-candidate construction (Sprint 8 §8 · AIS-001 §08) — PURE.
 *
 * A candidate exists ONLY because a validated finding requires it — never authored
 * free-hand (AIS-001 §08 "Born from findings"). This sprint builds the STRUCTURE:
 * linkage, tier, impact, dependencies, risks, limitations, review gate.
 *
 * DEFERRED (explicitly not implemented here): final recommendation mathematics
 * (ROI, risk-adjusted priority, portfolio ranking) and any pricing. `effort` is a
 * declared placeholder pending the cost model, and every candidate is flagged
 * `reviewRequired` so nothing reaches a client unreviewed (AIS-001 §14).
 * ========================================================================== */

import {
  pipelineRecommendationCandidateSchema,
  type PipelineFinding,
  type PipelineRecommendationCandidate,
  type RecommendationTier,
} from "@brightloop/schema";

/** Effort is not yet modelled — the cost model is a later phase. */
export const UNMODELLED_EFFORT = 50;
export const EFFORT_LIMITATION = "Effort is not yet modelled (cost model deferred); treat as unranked.";

/**
 * Deterministic tier assignment from severity + impact/effort. This is CATEGORY
 * assignment, not the final ranking mathematics (deferred). Pure.
 */
export function deriveTier(finding: PipelineFinding, impact: number, effort: number): RecommendationTier {
  if (finding.severity === "critical") return "critical_risk";
  if (impact >= 60 && effort <= UNMODELLED_EFFORT) return "quick_win";
  if (impact >= 60) return "strategic_win";
  return "medium_win";
}

export interface BuildCandidatesOptions {
  pipelineRunId: string;
  idFor: (finding: PipelineFinding, index: number) => string;
  /** Optional per-finding effort once a cost model exists; defaults to unmodelled. */
  effortFor?: (finding: PipelineFinding, index: number) => number;
  /** Graph-query derived prerequisites among moves. */
  dependenciesFor?: (finding: PipelineFinding, index: number) => string[];
  risksFor?: (finding: PipelineFinding, index: number) => string[];
  expectedOutcomeFor?: (finding: PipelineFinding, index: number) => string;
  /** Additional target dimensions surfaced by graph traversal (opportunity propagation). */
  targetDomainsFor?: (finding: PipelineFinding, index: number) => PipelineFinding["domain"][];
}

/**
 * Build one candidate per finding, inheriting the finding's evidence, confidence,
 * and limitations. Order follows the input order — deterministic.
 */
export function buildRecommendationCandidates(findings: readonly PipelineFinding[], opts: BuildCandidatesOptions): PipelineRecommendationCandidate[] {
  return findings.map((finding, index) => {
    const effort = opts.effortFor?.(finding, index) ?? UNMODELLED_EFFORT;
    const impact = finding.priority; // impact inherits the finding's computed priority
    const limitations = [...finding.limitations];
    if (opts.effortFor === undefined) limitations.push(EFFORT_LIMITATION);
    return pipelineRecommendationCandidateSchema.parse({
      id: opts.idFor(finding, index),
      pipelineRunId: opts.pipelineRunId,
      findingIds: [finding.id],
      evidenceIds: finding.evidenceIds,
      targetDomains: opts.targetDomainsFor?.(finding, index) ?? [finding.domain],
      tier: deriveTier(finding, impact, effort),
      impact,
      effort,
      confidence: finding.confidence, // inherited, never raised
      dependencies: opts.dependenciesFor?.(finding, index) ?? [],
      risks: opts.risksFor?.(finding, index) ?? [],
      expectedOutcome: opts.expectedOutcomeFor?.(finding, index) ?? `Improve ${finding.domain} by resolving: ${finding.title}`,
      limitations,
      reviewRequired: true, // human approval gate — always
    });
  });
}
