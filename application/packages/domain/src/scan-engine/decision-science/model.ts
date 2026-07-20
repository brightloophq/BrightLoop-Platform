/* =============================================================================
 * Recommendation model (Sprint 9 §1 · AIS-003 §07 · AIS-001 §08) — PURE.
 *
 * Builds canonical recommendations from Sprint-8 `PipelineRecommendationCandidate`
 * + the findings behind them. A recommendation is DERIVED, never authored: it may
 * not exist without linked findings AND evidence, and it inherits the finding's
 * confidence, evidence state, limitations, contradiction status, and provenance.
 * ========================================================================== */

import {
  engineRecommendationSchema,
  type PipelineFinding,
  type PipelineRecommendationCandidate,
  type EngineRecommendation,
  type ReviewCycle,
  type SuccessMetric,
  type TimeHorizon,
} from "@brightloop/schema";

/** Effort → time horizon (AIS-003 §07: "from effort and dependencies"). Pure. */
export function deriveTimeHorizon(effort: number, dependencyCount: number): TimeHorizon {
  const load = effort + dependencyCount * 10;
  if (load <= 20) return "days";
  if (load <= 45) return "weeks";
  if (load <= 75) return "quarter";
  return "quarter_plus";
}

/** Probability of success from confidence + evidence state. Never invented. Pure. */
export function deriveProbabilityOfSuccess(confidenceValue: number, evidenceState: EngineRecommendation["evidenceState"]): number {
  const stateCap: Record<EngineRecommendation["evidenceState"], number> = { observed: 0.95, estimated: 0.8, inferred: 0.6, unavailable: 0.3 };
  return Math.min(stateCap[evidenceState], Math.round((confidenceValue / 100) * 100) / 100);
}

/** Implementation risk rises with effort and falls with confidence. Pure. */
export function deriveImplementationRisk(effort: number, confidenceValue: number): number {
  return Math.max(0, Math.min(100, Math.round(effort * 0.6 + (100 - confidenceValue) * 0.4)));
}

export interface BuildRecommendationsOptions {
  scanId: string;
  clientId: string | null;
  idFor: (candidate: PipelineRecommendationCandidate, index: number) => string;
  /** Urgency 0–100; defaults to the finding severity mapping. */
  urgencyFor?: (finding: PipelineFinding, candidate: PipelineRecommendationCandidate) => number;
  /** Strategic alignment 0–100; defaults to a neutral, declared 50. */
  strategicAlignmentFor?: (finding: PipelineFinding, candidate: PipelineRecommendationCandidate) => number;
  problemStatementFor?: (finding: PipelineFinding) => string;
  proposedActionFor?: (candidate: PipelineRecommendationCandidate, finding: PipelineFinding) => string;
  successMetricsFor?: (finding: PipelineFinding) => SuccessMetric[];
  reviewCycleFor?: (finding: PipelineFinding) => ReviewCycle;
  ownerRoleFor?: (finding: PipelineFinding) => string | null;
  constraintsFor?: (candidate: PipelineRecommendationCandidate) => string[];
}

const SEVERITY_URGENCY: Record<PipelineFinding["severity"], number> = { critical: 95, high: 75, moderate: 50, low: 25 };
/** Neutral alignment when the engagement has stated no goals — declared, not assumed. */
export const DEFAULT_ALIGNMENT = 50;
export const ALIGNMENT_LIMITATION = "Strategic alignment not supplied; neutral policy default applied.";

/**
 * Build recommendations from candidates. A candidate whose finding is missing, or
 * that carries no evidence, is DROPPED (returned in `rejected`) — never coerced.
 */
export function buildRecommendations(
  candidates: readonly PipelineRecommendationCandidate[],
  findings: readonly PipelineFinding[],
  opts: BuildRecommendationsOptions,
): { recommendations: EngineRecommendation[]; rejected: { candidateId: string; reason: string }[] } {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const recommendations: EngineRecommendation[] = [];
  const rejected: { candidateId: string; reason: string }[] = [];

  candidates.forEach((c, index) => {
    const finding = c.findingIds.map((id) => byId.get(id)).find((f): f is PipelineFinding => f !== undefined);
    if (finding === undefined) {
      rejected.push({ candidateId: c.id, reason: "no linked finding resolved" });
      return;
    }
    if (c.evidenceIds.length === 0) {
      rejected.push({ candidateId: c.id, reason: "no linked evidence" });
      return;
    }

    const limitations = [...c.limitations];
    if (opts.strategicAlignmentFor === undefined) limitations.push(ALIGNMENT_LIMITATION);

    recommendations.push(
      engineRecommendationSchema.parse({
        id: opts.idFor(c, index),
        scanId: opts.scanId,
        clientId: opts.clientId,
        title: finding.title.slice(0, 200),
        problemStatement: opts.problemStatementFor?.(finding) ?? finding.businessImpact,
        proposedAction: opts.proposedActionFor?.(c, finding) ?? c.expectedOutcome,
        findingIds: c.findingIds,
        evidenceIds: c.evidenceIds,
        graphNodeIds: finding.graphNodeIds,
        affectedDomains: c.targetDomains,
        tier: c.tier,
        impact: c.impact,
        effort: c.effort,
        urgency: opts.urgencyFor?.(finding, c) ?? SEVERITY_URGENCY[finding.severity],
        strategicAlignment: opts.strategicAlignmentFor?.(finding, c) ?? DEFAULT_ALIGNMENT,
        confidence: c.confidence,
        implementationRisk: deriveImplementationRisk(c.effort, c.confidence.value),
        probabilityOfSuccess: deriveProbabilityOfSuccess(c.confidence.value, finding.evidenceState),
        timeHorizon: deriveTimeHorizon(c.effort, c.dependencies.length),
        dependencies: c.dependencies,
        constraints: opts.constraintsFor?.(c) ?? [],
        expectedOutcomes: [c.expectedOutcome],
        successMetrics: opts.successMetricsFor?.(finding) ?? [],
        reviewCycle: opts.reviewCycleFor?.(finding) ?? "on_rescan",
        ownerRole: opts.ownerRoleFor?.(finding) ?? null,
        evidenceState: finding.evidenceState,
        limitations,
        contradictionStatus: finding.contradictionStatus,
        provenance: finding.provenance,
        reviewRequired: true,
      }),
    );
  });

  return { recommendations, rejected };
}
