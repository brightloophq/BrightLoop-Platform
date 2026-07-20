/* =============================================================================
 * Internal Intelligence Report assembly (Sprint 8 §9 · PDF 27 · AIS-001 §14) — PURE.
 *
 * Assembles the canonical INTERNAL report from validated artifacts only. Nothing
 * unvalidated enters it; absent data is reported under `unavailableData` rather
 * than filled (AIS-001 §05 No Hallucinations / §06 Never Fabricate). No PDF, no
 * rendering, no UI — this is a data contract the surface layer will later read.
 * ========================================================================== */

import {
  internalIntelligenceReportSchema,
  PIPELINE_SCHEMA_VERSION,
  type CoverageSummary,
  type EvidenceConfidence,
  type EvidenceConflict,
  type IndexSummary,
  type DomainSummary,
  type InternalIntelligenceReport,
  type PipelineFinding,
  type PipelineRecommendationCandidate,
  type PipelineRun,
} from "@brightloop/schema";
import { orderFindings } from "./findings.js";

/** Findings whose severity marks them as the strongest risks, ordered. Pure. */
export function strongestRisks(findings: readonly PipelineFinding[], limit = 5): string[] {
  return orderFindings(findings)
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, limit)
    .map((f) => f.id);
}

/** Highest-confidence opportunity findings, confidence-ordered then id. Pure. */
export function highestConfidenceOpportunities(findings: readonly PipelineFinding[], limit = 5): string[] {
  return [...findings]
    .filter((f) => f.domain === "opportunity" || f.domain === "growth")
    .sort((a, b) => (b.confidence.value !== a.confidence.value ? b.confidence.value - a.confidence.value : a.id < b.id ? -1 : 1))
    .slice(0, limit)
    .map((f) => f.id);
}

/** Per-domain summaries derived from the findings ledger. Deterministic (domain-sorted). */
export function buildDomainSummaries(findings: readonly PipelineFinding[]): DomainSummary[] {
  const byDomain = new Map<PipelineFinding["domain"], PipelineFinding[]>();
  for (const f of findings) {
    const list = byDomain.get(f.domain) ?? [];
    list.push(f);
    byDomain.set(f.domain, list);
  }
  return [...byDomain.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([domain, list]) => {
      const ordered = orderFindings(list);
      const avg = Math.round(list.reduce((acc, f) => acc + f.confidence.value, 0) / list.length);
      return {
        domain,
        summary: `${list.length} validated finding(s); highest severity ${ordered[0]!.severity}.`,
        score: avg,
        confidence: null,
        findingIds: ordered.map((f) => f.id),
      };
    });
}

export interface BuildReportInput {
  id: string;
  run: PipelineRun;
  findings: readonly PipelineFinding[];
  candidates: readonly PipelineRecommendationCandidate[];
  executiveOverview?: string;
  businessProfile?: Record<string, unknown>;
  indexSummary?: IndexSummary;
  evidenceCoverage?: CoverageSummary | null;
  confidenceSummary?: EvidenceConfidence | null;
  conflicts?: EvidenceConflict[];
  unavailableData?: string[];
  limitations?: string[];
  provenance?: Record<string, unknown>;
  artifactIds?: string[];
  now: string;
}

/** Assemble the validated internal intelligence report. Pure. */
export function buildInternalIntelligenceReport(input: BuildReportInput): InternalIntelligenceReport {
  const ledger = orderFindings(input.findings);
  return internalIntelligenceReportSchema.parse({
    id: input.id,
    pipelineRunId: input.run.id,
    scanId: input.run.scanId,
    generatedAt: input.now,
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    executiveOverview:
      input.executiveOverview ??
      `${ledger.length} validated finding(s) across ${new Set(ledger.map((f) => f.domain)).size} dimension(s); ${input.candidates.length} recommendation candidate(s) pending review.`,
    businessProfile: input.businessProfile ?? {},
    indexSummary: input.indexSummary ?? { overall: null, byDimension: {} },
    domainSummaries: buildDomainSummaries(ledger),
    findingsLedger: ledger,
    evidenceCoverage: input.evidenceCoverage ?? null,
    confidenceSummary: input.confidenceSummary ?? null,
    conflicts: input.conflicts ?? [],
    strongestRisks: strongestRisks(ledger),
    highestConfidenceOpportunities: highestConfidenceOpportunities(ledger),
    recommendationCandidates: [...input.candidates],
    unavailableData: input.unavailableData ?? [],
    limitations: input.limitations ?? [],
    provenance: input.provenance ?? {},
    pipelineMetadata: {
      runId: input.run.id,
      completedStages: input.run.completedStages,
      estimatedSpend: input.run.spend.estimated,
      actualSpend: input.run.spend.actual,
      artifactIds: input.artifactIds ?? [],
    },
  });
}
