/* =============================================================================
 * Proposal request (Sprint 11 §1 · AIS-004 P1 Engage) — PURE.
 *
 * The canonical intake for a proposal. HARD RULE: a budget is NEVER inferred —
 * when the client supplied none, `budgetRange.provided` is false with null bounds
 * and downstream investment inputs mark the budget unavailable.
 * ========================================================================== */

import { proposalRequestSchema, type BudgetRange, type ProposalRequest } from "@brightloop/schema";

/** The explicit "no budget supplied" value. Never guessed, never zero. */
export const NO_BUDGET: BudgetRange = { provided: false, low: null, high: null, currency: null };

/** A supplied budget range. Both bounds are required to count as provided. */
export function suppliedBudget(low: number, high: number, currency: string): BudgetRange {
  return { provided: true, low: Math.min(low, high), high: Math.max(low, high), currency };
}

export interface NewProposalRequestInput {
  id: string;
  scanId: string;
  clientId: string | null;
  prospectId?: string | null;
  businessProfile?: Record<string, unknown>;
  selectedRecommendationIds?: string[];
  selectedScenarioId?: string | null;
  decisionBriefId?: string | null;
  competitorSnapshotId?: string | null;
  targetOutcomes?: string[];
  constraints?: string[];
  requestedServices?: string[];
  excludedServices?: string[];
  deliveryHorizon?: ProposalRequest["deliveryHorizon"];
  budgetRange?: BudgetRange;
  preferredPaymentStructure?: ProposalRequest["preferredPaymentStructure"];
  stakeholderRoles?: ProposalRequest["stakeholderRoles"];
  brandProfileRef?: string | null;
  approvalRequirements?: string[];
  sourceArtifactIds?: string[];
  createdAt: string;
}

/** Build a validated proposal request. Budget defaults to NOT provided. Pure. */
export function newProposalRequest(input: NewProposalRequestInput): ProposalRequest {
  return proposalRequestSchema.parse({
    id: input.id,
    scanId: input.scanId,
    clientId: input.clientId,
    prospectId: input.prospectId ?? null,
    businessProfile: input.businessProfile ?? {},
    selectedRecommendationIds: input.selectedRecommendationIds ?? [],
    selectedScenarioId: input.selectedScenarioId ?? null,
    decisionBriefId: input.decisionBriefId ?? null,
    competitorSnapshotId: input.competitorSnapshotId ?? null,
    targetOutcomes: input.targetOutcomes ?? [],
    constraints: input.constraints ?? [],
    requestedServices: input.requestedServices ?? [],
    excludedServices: input.excludedServices ?? [],
    deliveryHorizon: input.deliveryHorizon ?? "unavailable",
    budgetRange: input.budgetRange ?? NO_BUDGET, // never inferred
    preferredPaymentStructure: input.preferredPaymentStructure ?? "unspecified",
    stakeholderRoles: input.stakeholderRoles ?? [],
    brandProfileRef: input.brandProfileRef ?? null,
    approvalRequirements: input.approvalRequirements ?? [],
    sourceArtifactIds: input.sourceArtifactIds ?? [],
    createdAt: input.createdAt,
  });
}

/**
 * Structural validity beyond the schema. A proposal may not be built from nothing:
 * it needs recommendations AND a traceable source artifact.
 */
export function validateProposalRequest(request: ProposalRequest): string[] {
  const problems: string[] = [];
  if (request.selectedRecommendationIds.length === 0) problems.push("no recommendations selected — a proposal must derive from approved moves");
  if (request.sourceArtifactIds.length === 0 && request.decisionBriefId === null) problems.push("no source artifact or decision brief referenced — proposal would be untraceable");
  if (request.budgetRange.provided && (request.budgetRange.low === null || request.budgetRange.high === null)) problems.push("budget marked provided but bounds are missing");
  return problems;
}

/** Services the client explicitly excluded, normalized for comparison. Pure. */
export function excludedServiceSet(request: ProposalRequest): Set<string> {
  return new Set(request.excludedServices.map((s) => s.toLowerCase().trim()));
}
