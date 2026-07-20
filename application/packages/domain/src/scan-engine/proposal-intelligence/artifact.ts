/* =============================================================================
 * Proposal artifact (Sprint 11 §12) — PURE, DATA ONLY.
 *
 * Assembles the canonical, checksummed `ProposalArtifact` from already-derived
 * parts. No PDF, no rendering, no prose generation — the surface layer reads this
 * contract later.
 *
 * The checksum is content-addressed (excludes id/version/timestamps/status) so an
 * identical proposal body always hashes identically — the basis of the revision
 * and approval-reset logic in lifecycle.ts.
 * ========================================================================== */

import {
  PROPOSAL_MODEL_VERSION,
  PROPOSAL_SCHEMA_VERSION,
  proposalArtifactSchema,
  type CaseStudyReference,
  type EvidenceConfidence,
  type InvestmentStructureInputs,
  type MilestoneSequence,
  type ProposalApproval,
  type ProposalArtifact,
  type ProposalDeliverable,
  type ProposalMilestone,
  type ProposalOptionPackage,
  type ProposalPhase,
  type ProposalQualifier,
  type ProposalRequest,
  type ProposalScopeItem,
  type ProposalStrategy,
  type ProposalSuccessMetric,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { usableProof } from "./proof.js";
import { isPublishable } from "./strategy.js";

export interface CompetitorContextInput {
  snapshotId?: string | null;
  marketPercentile?: number | null;
  supportsMarketClaims?: boolean;
  competitorIds?: string[];
}

export interface BuildArtifactInput {
  id: string;
  version?: number;
  request: ProposalRequest;
  strategy: ProposalStrategy;
  scope: readonly ProposalScopeItem[];
  deliverables: readonly ProposalDeliverable[];
  phases: readonly ProposalPhase[];
  milestones: readonly ProposalMilestone[];
  milestoneSequence?: MilestoneSequence | null;
  successMetrics?: readonly ProposalSuccessMetric[];
  qualifiers?: readonly ProposalQualifier[];
  investmentInputs: InvestmentStructureInputs;
  optionPackages?: readonly ProposalOptionPackage[];
  selectedPackageId?: string | null;
  proofReferences?: readonly CaseStudyReference[];
  approvals?: readonly ProposalApproval[];
  competitorContext?: CompetitorContextInput;
  evidenceConfidence?: EvidenceConfidence | null;
  evidenceGaps?: string[];
  validityPeriodDays?: number | null;
  sourceArtifactIds?: string[];
  title?: string;
  now: string;
}

/** The content the checksum covers — identity, version, status, and time excluded. */
function checksumContent(input: BuildArtifactInput, keyPoints: ProposalStrategy["expectedOutcomes"], proof: CaseStudyReference[]) {
  return {
    proposalRequestId: input.request.id,
    scanId: input.request.scanId,
    strategy: input.strategy,
    scope: input.scope,
    deliverables: input.deliverables,
    phases: input.phases,
    milestones: input.milestones,
    successMetrics: input.successMetrics ?? [],
    qualifiers: input.qualifiers ?? [],
    investmentInputs: input.investmentInputs,
    optionPackages: input.optionPackages ?? [],
    selectedPackageId: input.selectedPackageId ?? null,
    proofReferences: proof,
    keyPoints,
  };
}

/**
 * Assemble the proposal artifact. Only PUBLISHABLE (traceable) strategy statements
 * and USABLE (verified + approved) proof reach the artifact. Deterministic.
 */
export function buildProposalArtifact(input: BuildArtifactInput): ProposalArtifact {
  const keyPoints = input.strategy.expectedOutcomes.filter(isPublishable);
  const proof = usableProof(input.proofReferences ?? []);
  const evidenceIds = [...new Set(input.scope.flatMap((s) => s.sourceFindingIds))].sort();

  const content = checksumContent(input, keyPoints, proof);
  const version = input.version ?? 1;

  const workScopeCount = input.scope.filter((s) => s.kind === "mandatory" || s.kind === "optional").length;

  return proposalArtifactSchema.parse({
    id: input.id,
    proposalRequestId: input.request.id,
    scanId: input.request.scanId,
    clientId: input.request.clientId,
    version,
    status: "draft",
    title: input.title ?? `Transformation proposal — ${input.request.scanId}`,
    executiveSummary: {
      headline: `${workScopeCount} scoped workstream(s) derived from ${input.strategy.workstreams.length} approved recommendation(s).`,
      keyPoints,
      findingCount: new Set(input.scope.flatMap((s) => s.sourceFindingIds)).size,
      recommendationCount: new Set(input.scope.flatMap((s) => s.sourceRecommendationIds)).size,
    },
    businessContext: input.request.businessProfile,
    evidenceSummary: {
      evidenceIds,
      coverage: input.strategy.evidenceCoverage,
      confidence: input.evidenceConfidence ?? null,
      gaps: input.evidenceGaps ?? [],
    },
    competitorContext: {
      snapshotId: input.competitorContext?.snapshotId ?? input.request.competitorSnapshotId,
      marketPercentile: input.competitorContext?.marketPercentile ?? null,
      supportsMarketClaims: input.competitorContext?.supportsMarketClaims ?? false,
      competitorIds: [...(input.competitorContext?.competitorIds ?? [])].sort(),
    },
    strategy: input.strategy,
    optionPackages: [...(input.optionPackages ?? [])],
    selectedPackageId: input.selectedPackageId ?? null,
    scope: [...input.scope],
    deliverables: [...input.deliverables],
    phases: [...input.phases],
    milestones: [...input.milestones],
    milestoneSequence: input.milestoneSequence ?? null,
    successMetrics: [...(input.successMetrics ?? [])],
    qualifiers: [...(input.qualifiers ?? [])],
    investmentInputs: input.investmentInputs,
    proofReferences: proof,
    approvals: [...(input.approvals ?? [])],
    approvalRequirementsMet: false,
    validityPeriodDays: input.validityPeriodDays ?? null,
    sourceArtifactIds: [...(input.sourceArtifactIds ?? input.request.sourceArtifactIds)].sort(),
    modelVersions: { schema: PROPOSAL_SCHEMA_VERSION, model: PROPOSAL_MODEL_VERSION, strategy: input.strategy.modelVersion },
    provenance: { scanId: input.request.scanId, proposalRequestId: input.request.id, decisionBriefId: input.request.decisionBriefId },
    checksum: hashContent(content),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/** Recompute the content checksum of an existing artifact. Pure. */
export function proposalChecksum(artifact: ProposalArtifact): string {
  return hashContent({
    proposalRequestId: artifact.proposalRequestId,
    scanId: artifact.scanId,
    strategy: artifact.strategy,
    scope: artifact.scope,
    deliverables: artifact.deliverables,
    phases: artifact.phases,
    milestones: artifact.milestones,
    successMetrics: artifact.successMetrics,
    qualifiers: artifact.qualifiers,
    investmentInputs: artifact.investmentInputs,
    optionPackages: artifact.optionPackages,
    selectedPackageId: artifact.selectedPackageId,
    proofReferences: artifact.proofReferences,
    keyPoints: artifact.executiveSummary.keyPoints,
  });
}
