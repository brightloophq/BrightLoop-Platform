/* =============================================================================
 * Recommendation INPUTS (Phase C · Sprint C5) — PURE.
 *
 * C5 does not recommend. The Sprint-9 Recommendation Engine already owns
 * ranking, expected value, sequencing and dependencies; duplicating any of that
 * here would create a second source of truth.
 *
 * What C5 contributes is the missing upstream: evidence-backed CANDIDATES built
 * from observed opportunities and risks, carrying impact/effort inputs and full
 * traceability, ready to be handed to that engine. Nothing here ranks, prices,
 * schedules, or promises.
 * ========================================================================== */

import {
  prospectRecommendationInputSchema,
  type ProspectOpportunity,
  type ProspectRecommendationInput,
  type ProspectRisk,
} from "@brightloop/schema";
import { CATEGORY_WORKSTREAM } from "./opportunities.js";

export interface RecommendationInputsInput {
  opportunities: readonly ProspectOpportunity[];
  risks: readonly ProspectRisk[];
  idFor: (index: number) => string;
}

/**
 * Build recommendation candidates from opportunities, attaching any risk that
 * shares the opportunity's evidence — so the engine downstream can see that
 * acting on the gap also retires the exposure.
 *
 *   impact = opportunity.businessImpact          (already computed + traced)
 *   effort = opportunity.implementationComplexity (declared effort class)
 */
export function buildRecommendationInputs(input: RecommendationInputsInput): ProspectRecommendationInput[] {
  return input.opportunities.map((opportunity, index) => {
    // A risk is related when it rests on overlapping evidence.
    const related = input.risks.filter((r) => r.evidenceIds.some((id) => opportunity.evidenceIds.includes(id)));

    const problem =
      related.length > 0
        ? `${opportunity.description} Observed exposure: ${related.map((r) => r.title).join("; ")}.`
        : opportunity.description;

    return prospectRecommendationInputSchema.parse({
      id: input.idFor(index),
      title: opportunity.title,
      problemStatement: problem.slice(0, 2000),
      proposedAction: `Scope a ${CATEGORY_WORKSTREAM[opportunity.category]} workstream addressing the observed ${opportunity.category} gap. Scope, sequencing and investment are set by the recommendation and proposal engines, not here.`,
      category: opportunity.category,
      affectedDimensions: opportunity.affectedDimensions,
      evidenceIds: opportunity.evidenceIds,
      opportunityIds: [opportunity.id],
      riskIds: related.map((r) => r.id).sort(),
      impact: opportunity.businessImpact,
      effort: opportunity.implementationComplexity,
      confidence: opportunity.confidence,
      limitations: opportunity.limitations,
    });
  });
}
