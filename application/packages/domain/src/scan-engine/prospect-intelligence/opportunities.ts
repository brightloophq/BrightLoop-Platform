/* =============================================================================
 * Transformation opportunities (Phase C · Sprint C5) — PURE, derived.
 *
 * An opportunity is the gap between an OBSERVED category score and 100, sized by
 * that category's weight. It is never authored free-hand: the impact figure is
 * computed, the workstream is a routing label from a declared map, and the
 * supporting evidence is the evidence that produced the score.
 *
 * The contract carries no price, no timeline and no promise — those fields do
 * not exist on `ProspectOpportunity`, so this module cannot emit them. Ranking,
 * sequencing and expected value stay with the Sprint-9 Recommendation Engine.
 * ========================================================================== */

import {
  prospectOpportunitySchema,
  scoreCalculationSchema,
  type ComplexityBand,
  type EngineEvidenceItem,
  type ImpactBand,
  type IndexDimension,
  type MaturityAssessment,
  type MaturityCategory,
  type MaturityScore,
  type ProspectOpportunity,
} from "@brightloop/schema";
import { itemConfidence } from "./confidence.js";
import { CATEGORY_WEIGHTS } from "./scoring.js";

/** The Auxion workstream each category routes to — a label, not a commitment. */
export const CATEGORY_WORKSTREAM: Record<MaturityCategory, string> = {
  website: "Web Presence",
  seo: "Search Visibility",
  branding: "Brand System",
  trust: "Trust & Credibility",
  accessibility: "Accessibility Remediation",
  content: "Content System",
  lead_capture: "Lead Capture",
  performance: "Performance Engineering",
  automation: "Automation",
  analytics: "Measurement",
  social_presence: "Social Presence",
  customer_journey: "Customer Journey",
  operations: "Operations",
};

/** Which Index dimensions a category informs (Sprint-1 dimension vocabulary). */
export const CATEGORY_DIMENSIONS: Record<MaturityCategory, IndexDimension[]> = {
  website: ["digital_presence"],
  seo: ["marketing", "digital_presence"],
  branding: ["brand"],
  trust: ["brand", "risk"],
  accessibility: ["risk", "customer_experience"],
  content: ["marketing"],
  lead_capture: ["sales"],
  performance: ["digital_presence", "customer_experience"],
  automation: ["automation"],
  analytics: ["growth"],
  social_presence: ["marketing", "brand"],
  customer_journey: ["customer_experience", "sales"],
  operations: ["operations"],
};

/**
 * Implementation complexity per category (0–100), declared rather than guessed.
 * This is a fixed engineering estimate of effort class, not a quote.
 */
export const CATEGORY_COMPLEXITY: Record<MaturityCategory, number> = {
  website: 60,
  seo: 35,
  branding: 55,
  trust: 25,
  accessibility: 40,
  content: 50,
  lead_capture: 30,
  performance: 55,
  automation: 70,
  analytics: 35,
  social_presence: 25,
  customer_journey: 45,
  operations: 75,
};

/** An opportunity is only raised when the observed gap is at least this large. */
export const OPPORTUNITY_GAP_THRESHOLD = 15;

function band(value: number): ImpactBand & ComplexityBand {
  return (value < 34 ? "low" : value < 67 ? "moderate" : "high") as ImpactBand & ComplexityBand;
}

const TEMPLATES: Record<string, { title: string; description: (gap: number, score: number) => string }> = {
  website: { title: "Complete the website foundation", description: (g, s) => `Foundation signals scored ${s}/100, leaving a ${g}-point observed gap in structure and coverage.` },
  seo: { title: "Close on-page search gaps", description: (g, s) => `On-page search signals scored ${s}/100, leaving a ${g}-point observed gap in discoverability.` },
  branding: { title: "Systematize brand presentation", description: (g, s) => `Brand signals scored ${s}/100, leaving a ${g}-point observed gap in consistency.` },
  trust: { title: "Strengthen published trust signals", description: (g, s) => `Trust signals scored ${s}/100, leaving a ${g}-point observed gap in what a buyer can verify.` },
  accessibility: { title: "Remediate accessibility gaps", description: (g, s) => `Accessibility markup scored ${s}/100, leaving a ${g}-point observed gap.` },
  content: { title: "Build out the content base", description: (g, s) => `Content scored ${s}/100, leaving a ${g}-point observed gap in published substance.` },
  lead_capture: { title: "Strengthen lead capture", description: (g, s) => `Lead capture scored ${s}/100, leaving a ${g}-point observed gap in conversion routes.` },
  performance: { title: "Reduce page weight", description: (g, s) => `Page weight scored ${s}/100, leaving a ${g}-point observed gap against the budget.` },
  automation: { title: "Introduce automation", description: (g, s) => `Automation signals scored ${s}/100, leaving a ${g}-point observed gap.` },
  analytics: { title: "Establish measurement", description: (g, s) => `Measurement signals scored ${s}/100, leaving a ${g}-point observed gap.` },
  social_presence: { title: "Extend the social footprint", description: (g, s) => `Social presence scored ${s}/100, leaving a ${g}-point observed gap.` },
  customer_journey: { title: "Clarify the customer journey", description: (g, s) => `The customer journey scored ${s}/100, leaving a ${g}-point observed gap.` },
  operations: { title: "Surface operational signals", description: (g, s) => `Operational signals scored ${s}/100, leaving a ${g}-point observed gap.` },
};

export interface OpportunityInput {
  items: readonly EngineEvidenceItem[];
  maturity: MaturityAssessment;
  idFor: (index: number) => string;
  gapThreshold?: number;
}

/**
 * Derive opportunities from observed gaps.
 *
 *   gap    = 100 − observedScore
 *   impact = round( gap × categoryWeight / maxCategoryWeight )
 *
 * Impact is therefore bounded by BOTH how large the observed gap is and how much
 * the category matters. An unassessed category yields NO opportunity — the
 * engine does not sell against something it could not observe.
 */
export function deriveOpportunities(input: OpportunityInput): ProspectOpportunity[] {
  const threshold = input.gapThreshold ?? OPPORTUNITY_GAP_THRESHOLD;
  const maxWeight = Math.max(...Object.values(CATEGORY_WEIGHTS));

  const eligible = input.maturity.categories
    .filter((c): c is MaturityScore & { score: number } => c.score !== null && c.evidenceIds.length > 0)
    .map((c) => ({ category: c, gap: 100 - c.score }))
    .filter((c) => c.gap >= threshold)
    // Deterministic: largest impact first, then category name.
    .sort((a, b) => {
      const ia = (a.gap * CATEGORY_WEIGHTS[a.category.category]) / maxWeight;
      const ib = (b.gap * CATEGORY_WEIGHTS[b.category.category]) / maxWeight;
      return ib - ia || (a.category.category < b.category.category ? -1 : 1);
    });

  return eligible.map(({ category, gap }, index) => {
    const weight = CATEGORY_WEIGHTS[category.category];
    const impact = Math.round((gap * weight) / maxWeight);
    const complexity = CATEGORY_COMPLEXITY[category.category];
    const template = TEMPLATES[category.category] ?? {
      title: `Improve ${category.category}`,
      description: (g: number, s: number) => `Observed score ${s}/100 leaves a ${g}-point gap.`,
    };

    return prospectOpportunitySchema.parse({
      id: input.idFor(index),
      category: category.category,
      title: template.title,
      description: template.description(gap, category.score),
      businessImpact: impact,
      businessImpactBand: band(impact),
      implementationComplexity: complexity,
      implementationComplexityBand: band(complexity),
      confidence: itemConfidence(input.items, category.evidenceIds),
      evidenceIds: category.evidenceIds,
      recommendedWorkstream: CATEGORY_WORKSTREAM[category.category],
      affectedDimensions: CATEGORY_DIMENSIONS[category.category],
      calculation: scoreCalculationSchema.parse({
        formula: "impact = round((100 − observedScore) × categoryWeight / maxCategoryWeight)",
        inputs: { observedScore: category.score, gap, categoryWeight: weight, maxCategoryWeight: maxWeight, impact, implementationComplexity: complexity },
        signalCount: category.calculation.signalCount,
        missingSignals: category.calculation.missingSignals,
      }),
      limitations: category.limitations,
    });
  });
}
