/* =============================================================================
 * Proposal strategy (Sprint 11 §2 · AIS-004 §01 "derivation beats persuasion") — PURE.
 *
 * Every strategy statement must trace to a finding, a recommendation, or competitor
 * evidence. An untraceable statement is REJECTED (recorded in `rejectedStatements`
 * with its reason) rather than published — no unsupported sales claims.
 *
 * Workstreams are derived from the selected recommendations, never authored.
 * ========================================================================== */

import {
  PROPOSAL_MODEL_VERSION,
  proposalStrategySchema,
  type DurationBand,
  type EffortBand,
  type EngineRecommendation,
  type PipelineFinding,
  type ProposalStrategy,
  type ProposalWorkstream,
  type StrategyStatement,
} from "@brightloop/schema";

/** Effort band from a 0–100 effort score. Pure. */
export function effortBandFor(effort: number): EffortBand {
  if (effort <= 15) return "xs";
  if (effort <= 35) return "s";
  if (effort <= 60) return "m";
  if (effort <= 80) return "l";
  return "xl";
}

/** Duration band from a recommendation's time horizon. Pure. */
export function durationBandFor(horizon: EngineRecommendation["timeHorizon"]): DurationBand {
  switch (horizon) {
    case "days": return "days";
    case "weeks": return "weeks";
    case "quarter": return "quarter";
    case "quarter_plus": return "multi_quarter";
  }
}

export interface StatementSources {
  findingIds?: string[];
  recommendationIds?: string[];
  competitorEvidenceIds?: string[];
  evidenceIds?: string[];
  confidence?: number;
}

/**
 * Build a strategy statement. `supported` is true only when at least one traceable
 * source backs it — the caller must drop unsupported statements. Pure.
 */
export function buildStatement(statement: string, sources: StatementSources): StrategyStatement {
  const findingIds = sources.findingIds ?? [];
  const recommendationIds = sources.recommendationIds ?? [];
  const competitorEvidenceIds = sources.competitorEvidenceIds ?? [];
  const evidenceIds = sources.evidenceIds ?? [];
  const supported = findingIds.length > 0 || recommendationIds.length > 0 || competitorEvidenceIds.length > 0;
  return {
    statement: statement.slice(0, 2000),
    findingIds,
    recommendationIds,
    competitorEvidenceIds,
    evidenceIds,
    confidence: Math.max(0, Math.min(100, Math.round(sources.confidence ?? 0))),
    supported,
  };
}

/** True when a statement may appear in a client-facing proposal. Pure. */
export function isPublishable(statement: StrategyStatement): boolean {
  return statement.supported;
}

export interface BuildStrategyInput {
  id: string;
  proposalRequestId: string;
  recommendations: readonly EngineRecommendation[];
  findings?: readonly PipelineFinding[];
  competitorEvidenceIds?: string[];
  /** Caller-supplied narrative framing; facts still come from the sources. */
  coreProblem?: string;
  desiredFutureState?: string;
  transformationThesis?: string;
  deliveryApproach?: string;
  sequencingRationale?: string;
  constraints?: string[];
  workstreamIdFor: (rec: EngineRecommendation, index: number) => string;
}

/**
 * Build the strategy. One workstream per selected recommendation (AIS-004:
 * deliverables map one-to-one from approved moves). Unsupported statements are
 * dropped into `rejectedStatements`. Deterministic.
 */
export function buildProposalStrategy(input: BuildStrategyInput): ProposalStrategy {
  const recs = [...input.recommendations].sort((a, b) => (a.id < b.id ? -1 : 1));
  const findingIds = [...new Set(recs.flatMap((r) => r.findingIds))].sort();
  const recIds = recs.map((r) => r.id);
  const evidenceIds = [...new Set(recs.flatMap((r) => r.evidenceIds))].sort();
  const competitorEvidenceIds = input.competitorEvidenceIds ?? [];
  const meanConfidence = recs.length === 0 ? 0 : Math.round(recs.reduce((a, r) => a + r.confidence.value, 0) / recs.length);

  const sources = { findingIds, recommendationIds: recIds, competitorEvidenceIds, evidenceIds, confidence: meanConfidence };

  const core = buildStatement(input.coreProblem ?? `${findingIds.length} validated finding(s) require intervention.`, sources);
  const future = buildStatement(input.desiredFutureState ?? `Close the evidenced gaps across ${new Set(recs.flatMap((r) => r.affectedDomains)).size} dimension(s).`, sources);
  const thesis = buildStatement(input.transformationThesis ?? `Sequence ${recs.length} evidence-linked move(s) by dependency and priority.`, sources);

  const rejected: { statement: string; reason: string }[] = [];
  for (const [label, s] of [["coreProblem", core], ["desiredFutureState", future], ["transformationThesis", thesis]] as const) {
    if (!isPublishable(s)) rejected.push({ statement: `${label}: ${s.statement}`, reason: "no traceable finding, recommendation, or competitor evidence" });
  }

  const workstreams: ProposalWorkstream[] = recs.map((rec, index) => ({
    id: input.workstreamIdFor(rec, index),
    title: rec.title,
    objective: rec.proposedAction,
    recommendationIds: [rec.id],
    affectedDomains: rec.affectedDomains,
    effortBand: effortBandFor(rec.effort),
    durationBand: durationBandFor(rec.timeHorizon),
    dependencies: rec.dependencies,
    tier: rec.tier,
    confidence: rec.confidence.value,
  }));

  const outcomes = recs
    .map((r) => buildStatement(r.expectedOutcomes[0] ?? `Improve ${r.affectedDomains[0] ?? "the business"}.`, { recommendationIds: [r.id], findingIds: r.findingIds, evidenceIds: r.evidenceIds, confidence: r.confidence.value }))
    .filter(isPublishable);

  const limitations = [...new Set(recs.flatMap((r) => r.limitations))].sort();
  if (competitorEvidenceIds.length === 0) limitations.push("No competitor evidence supplied; the strategy rests on internal findings only.");

  // coverage: share of recommendations that carry both a finding and evidence
  const traced = recs.filter((r) => r.findingIds.length > 0 && r.evidenceIds.length > 0).length;
  const evidenceCoverage = recs.length === 0 ? 0 : traced / recs.length;

  return proposalStrategySchema.parse({
    id: input.id,
    proposalRequestId: input.proposalRequestId,
    coreProblem: core,
    desiredFutureState: future,
    transformationThesis: thesis,
    workstreams,
    deliveryApproach: input.deliveryApproach ?? "Phased delivery cut along the recommendation dependency order.",
    sequencingRationale: input.sequencingRationale ?? "Prerequisites precede dependents; each phase delivers standalone value.",
    dependencies: [...new Set(recs.flatMap((r) => r.dependencies))].sort(),
    constraints: input.constraints ?? [...new Set(recs.flatMap((r) => r.constraints))].sort(),
    expectedOutcomes: outcomes,
    confidence: meanConfidence,
    evidenceCoverage,
    rejectedStatements: rejected,
    limitations,
    reviewRequired: true,
    modelVersion: PROPOSAL_MODEL_VERSION,
  });
}
