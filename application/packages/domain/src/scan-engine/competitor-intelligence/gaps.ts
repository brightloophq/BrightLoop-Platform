/* =============================================================================
 * Competitive gap analysis (Sprint 10 §9 · AIS-005 §07) — PURE.
 *
 * Each dimension becomes a sized, evidence-linked gap against the evidenced set's
 * own distribution — never an aspirational target.
 *
 * HARD RULE: when the client value or the competitor set is unavailable, the gap
 * type is `unknown` with NULL scores. Unavailable never becomes zero, and an
 * unknown gap never becomes a parity claim.
 * ========================================================================== */

import {
  COMPETITOR_FORMULA_VERSION,
  competitiveGapSchema,
  type BenchmarkDimension,
  type CompetitiveGap,
  type EngineCompetitorBenchmark,
  type GapSeverity,
  type GapType,
  type IndexDimension,
  type OpportunityType,
} from "@brightloop/schema";
import { median } from "./normalize.js";
import { clientBenchmark, competitorBenchmarks, comparisonConfidence } from "./benchmarks.js";

/** Points within which client and set are treated as at parity. */
export const PARITY_BAND = 5;

/** Which Index dimensions each benchmark dimension informs. */
export const DIMENSION_DOMAINS: Record<BenchmarkDimension, IndexDimension[]> = {
  website_performance: ["digital_presence"],
  mobile_experience: ["digital_presence", "customer_experience"],
  seo_visibility: ["marketing", "digital_presence"],
  content_activity: ["marketing", "brand"],
  reviews_reputation: ["brand", "customer_experience"],
  conversion_experience: ["sales", "customer_experience"],
  trust_signals: ["brand", "risk"],
  social_presence: ["marketing", "brand"],
  response_options: ["customer_experience", "operations"],
  automation_maturity: ["automation", "operations"],
  technology_indicators: ["automation", "digital_presence"],
  pricing_position: ["sales", "growth"],
  accessibility: ["digital_presence", "risk"],
  security_posture: ["risk"],
  brand_consistency: ["brand"],
};

/** Severity from the absolute deficit. Pure. */
export function deriveGapSeverity(type: GapType, absoluteGap: number | null): GapSeverity {
  if (type === "unknown" || absoluteGap === null) return "none";
  if (type !== "deficit") return "none";
  const g = Math.abs(absoluteGap);
  if (g >= 40) return "critical";
  if (g >= 25) return "high";
  if (g >= 12) return "moderate";
  return "low";
}

/** Opportunity type from gap shape. Pure. */
export function deriveOpportunityType(type: GapType, absoluteGap: number | null): OpportunityType {
  if (type === "unknown" || absoluteGap === null) return "none";
  if (type === "advantage") return "differentiation";
  if (type === "parity") return "defensive";
  return Math.abs(absoluteGap) <= 15 ? "quick_close" : "structural";
}

export interface GapInput {
  idFor: (dimension: BenchmarkDimension) => string;
  dimensions: readonly BenchmarkDimension[];
  benchmarks: readonly EngineCompetitorBenchmark[];
}

/**
 * Build one gap per dimension. Uses the competitor set's median as the benchmark
 * and its best available score as the leader. Deterministic.
 */
export function analyzeGaps(input: GapInput): CompetitiveGap[] {
  return input.dimensions.map((dimension) => {
    const client = clientBenchmark(input.benchmarks, dimension);
    const rivals = competitorBenchmarks(input.benchmarks, dimension).filter((b) => b.available && b.normalizedScore !== null);
    const limitations: string[] = [];

    const clientScore = client !== null && client.available ? client.normalizedScore : null;
    const rivalScores = rivals.map((r) => r.normalizedScore);
    const setMedian = median(rivalScores);
    const leader = rivalScores.length === 0 ? null : Math.max(...rivalScores.filter((v): v is number => v !== null));

    // ---- unknown: either side unavailable. NEVER zero, never parity.
    if (clientScore === null || setMedian === null) {
      if (clientScore === null) limitations.push("Client value unavailable for this dimension — gap reported unknown, not zero.");
      if (setMedian === null) limitations.push("No evidenced competitor value for this dimension — gap reported unknown, not zero.");
      return competitiveGapSchema.parse({
        id: input.idFor(dimension),
        dimension,
        currentScore: clientScore,
        competitorMedian: setMedian,
        leaderScore: leader,
        absoluteGap: null,
        relativeGap: null,
        type: "unknown" satisfies GapType,
        severity: "none",
        affectedDomains: DIMENSION_DOMAINS[dimension],
        evidenceIds: [...(client?.evidenceIds ?? []), ...rivals.flatMap((r) => r.evidenceIds)],
        confidence: 0,
        limitations,
        opportunityType: "none",
        reviewRequired: true,
        formulaVersion: COMPETITOR_FORMULA_VERSION,
      });
    }

    const absoluteGap = clientScore - setMedian;
    const relativeGap = setMedian === 0 ? null : absoluteGap / setMedian;
    const type: GapType = Math.abs(absoluteGap) <= PARITY_BAND ? "parity" : absoluteGap < 0 ? "deficit" : "advantage";

    // confidence is capped by the weaker side of the comparison
    const weakestRival = rivals.reduce((acc, r) => (r.confidence.value < acc.confidence.value ? r : acc), rivals[0]!);
    const confidence = comparisonConfidence(client!.confidence.value, client!.evidenceState, weakestRival.confidence.value, weakestRival.evidenceState);
    if (rivals.length < 3) limitations.push(`Only ${rivals.length} evidenced competitor value(s); the median is thin.`);

    return competitiveGapSchema.parse({
      id: input.idFor(dimension),
      dimension,
      currentScore: clientScore,
      competitorMedian: setMedian,
      leaderScore: leader,
      absoluteGap,
      relativeGap,
      type,
      severity: deriveGapSeverity(type, absoluteGap),
      affectedDomains: DIMENSION_DOMAINS[dimension],
      evidenceIds: [...client!.evidenceIds, ...rivals.flatMap((r) => r.evidenceIds)],
      confidence,
      limitations,
      opportunityType: deriveOpportunityType(type, absoluteGap),
      reviewRequired: confidence < 50 || rivals.length < 3,
      formulaVersion: COMPETITOR_FORMULA_VERSION,
    });
  });
}

/** Gaps ordered by severity then magnitude then dimension — total + stable. Pure. */
const SEVERITY_RANK: Record<GapSeverity, number> = { critical: 0, high: 1, moderate: 2, low: 3, none: 4 };
export function orderGaps(gaps: readonly CompetitiveGap[]): CompetitiveGap[] {
  return [...gaps].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    const am = Math.abs(a.absoluteGap ?? 0);
    const bm = Math.abs(b.absoluteGap ?? 0);
    if (am !== bm) return bm - am;
    return a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0;
  });
}
