/* =============================================================================
 * Report adapter (Phase C · Sprint C6) — PURE.
 *
 * Projects a `ProspectIntelligenceResult` (C5) onto the artifact ENVELOPES the
 * runtime already persists and the C4 scanner already knows how to read:
 * `findings`, `recommendation_candidates`, and `internal_intelligence_report`.
 *
 * It is a projection, not a computation: every value here already exists on the
 * assessment, carrying its own evidence ids, confidence and limitations. The
 * adapter re-keys them into the report sections the scanner expects and copies
 * nothing it was not given — an unevidenced field stays absent, and no score,
 * price or promise is introduced.
 * ========================================================================== */

import type { ProspectIntelligenceResult } from "@brightloop/schema";

/** The `findings` artifact envelope: strengths + weaknesses, evidence-linked. */
export function toFindingsEnvelope(result: ProspectIntelligenceResult): Record<string, unknown> {
  const project = (f: ProspectIntelligenceResult["strengths"][number]) => ({
    id: f.id,
    kind: f.kind,
    category: f.category,
    title: f.title,
    description: f.description,
    observedScore: f.observedScore,
    evidenceIds: f.evidenceIds,
    confidence: f.confidence.value,
    limitations: f.limitations,
  });
  return {
    kind: "findings",
    scanId: result.scanId,
    strengths: result.strengths.map(project),
    weaknesses: result.weaknesses.map(project),
    total: result.strengths.length + result.weaknesses.length,
  };
}

/** The `recommendation_candidates` artifact envelope — inputs only, never ranked. */
export function toRecommendationEnvelope(result: ProspectIntelligenceResult): Record<string, unknown> {
  return {
    kind: "recommendation_candidates",
    scanId: result.scanId,
    candidates: result.recommendationInputs.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      problemStatement: r.problemStatement,
      proposedAction: r.proposedAction,
      affectedDimensions: r.affectedDimensions,
      impact: r.impact,
      effort: r.effort,
      evidenceIds: r.evidenceIds,
      opportunityIds: r.opportunityIds,
      riskIds: r.riskIds,
      confidence: r.confidence.value,
      limitations: r.limitations,
    })),
    note: "Evidence-backed candidates for the Recommendation Engine. Ranking, sequencing and pricing are decided downstream, not here.",
  };
}

function overviewText(result: ProspectIntelligenceResult): string {
  const section = result.executiveSummary.sections.find((s) => s.key === "business_overview");
  return (section?.statements ?? []).map((s) => s.text).join(" ");
}

/**
 * The `internal_intelligence_report` envelope, keyed to the sections the scanner
 * renders. Deterministic projection of the assessment.
 */
export function toInternalReportEnvelope(result: ProspectIntelligenceResult): Record<string, unknown> {
  const { profile, maturity, industry, readiness } = result;
  const available = maturity.categories.filter((c) => c.available);

  return {
    kind: "internal_intelligence_report",
    scanId: result.scanId,
    reviewRequired: true,
    generatedAt: result.generatedAt,

    executiveOverview: overviewText(result) || "No profile field could be evidenced from the collected pages.",
    businessProfile: {
      identity: profile.identity.value,
      category: industry.category,
      geography: profile.geography.value,
      digitalMaturity: profile.digitalMaturity.value,
      primaryServices: profile.primaryServices,
      unknownFields: profile.unknownFields,
    },
    indexSummary:
      maturity.overall === null
        ? "Overall maturity could not be assessed from the available evidence."
        : `Overall digital maturity ${maturity.overall}/100 across ${available.length} assessable categories (${Math.round(maturity.coverage * 100)}% of weight observable).`,
    domainSummaries: available.map((c) => ({ category: c.category, score: c.score, confidence: c.confidence.value })),

    findings: [...result.strengths, ...result.weaknesses].map((f) => ({ title: f.title, kind: f.kind, description: f.description, evidenceIds: f.evidenceIds })),
    risks: result.risks.map((r) => ({ title: r.title, severity: r.severity, category: r.category, description: r.description, evidenceIds: r.evidenceIds })),
    opportunities: result.opportunities.map((o) => ({ title: o.title, businessImpact: o.businessImpact, complexity: o.implementationComplexityBand, workstream: o.recommendedWorkstream, evidenceIds: o.evidenceIds })),
    recommendationCandidates: result.recommendationInputs.map((r) => ({ title: r.title, impact: r.impact, effort: r.effort, evidenceIds: r.evidenceIds })),

    evidenceCoverage: { coverage: maturity.coverage, assessedCategories: available.length, totalCategories: maturity.categories.length },
    confidence: { value: result.confidence.value, band: result.confidence.band },
    conflicts: result.limitations.filter((l) => /conflict/i.test(l)),
    unavailableData: [
      ...maturity.categories.filter((c) => !c.available).map((c) => `${c.category}: not assessable`),
      ...profile.unknownFields.map((f) => `${f}: unknown`),
    ],
    limitations: result.limitations,
    readinessSummary: readiness.overall === null ? "Transformation readiness could not be assessed." : `Transformation readiness ${readiness.overall}/100.`,
    provenance: {
      evidenceItemCount: new Set([...result.strengths, ...result.weaknesses].flatMap((f) => f.evidenceIds)).size,
      artifactChecksums: result.artifacts.map((a) => ({ kind: a.kind, checksum: a.checksum })),
    },
  };
}
