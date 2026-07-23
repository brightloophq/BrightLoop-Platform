/* =============================================================================
 * Weakness derivation (Phase C · Sprint C5) — PURE, observation-only.
 *
 * A weakness requires an OBSERVED low score plus the evidence behind it. The
 * critical distinction this module enforces:
 *
 *   a category that scored low          → a weakness (something was observed)
 *   a category that could not be scored → NOT a weakness (nothing was observed)
 *
 * An unassessable category is an evidence gap, not a deficiency, and is never
 * reported as one. That is the difference between "we looked and it was poor"
 * and "we could not look" — conflating them would be fabrication.
 * ========================================================================== */

import {
  prospectFindingSchema,
  type EngineEvidenceItem,
  type MaturityAssessment,
  type MaturityScore,
  type ProspectFinding,
} from "@brightloop/schema";
import { itemConfidence } from "./confidence.js";
import { weakestCategories } from "./maturity.js";

/** A category at or below this observed score is called a weakness. */
export const WEAKNESS_THRESHOLD = 50;

/** Validated phrasing per category — templates, never free-form composition. */
const WEAKNESS_TEMPLATES: Record<string, { title: string; description: (score: number) => string }> = {
  website: { title: "Incomplete website foundation", description: (s) => `Foundation signals scored ${s}/100; parts of the site are missing or unreachable.` },
  seo: { title: "Weak on-page search signals", description: (s) => `On-page search signals scored ${s}/100; core tags are missing or duplicated.` },
  branding: { title: "Inconsistent brand presentation", description: (s) => `Brand presentation signals scored ${s}/100 across the observed pages.` },
  trust: { title: "Thin trust signals", description: (s) => `Published trust signals scored ${s}/100; a buyer has little to verify.` },
  accessibility: { title: "Accessibility gaps", description: (s) => `Accessibility markup scored ${s}/100; some users will struggle to use the site.` },
  content: { title: "Thin content base", description: (s) => `Published content scored ${s}/100; there is little substance to sell from.` },
  lead_capture: { title: "Weak lead capture", description: (s) => `Lead capture scored ${s}/100; visitors have a limited route to make contact.` },
  performance: { title: "Heavy page weight", description: (s) => `Transferred page weight scored ${s}/100 against the observed budget.` },
  automation: { title: "Limited automation signals", description: (s) => `Automation signals scored ${s}/100.` },
  analytics: { title: "Limited measurement", description: (s) => `Measurement signals scored ${s}/100.` },
  social_presence: { title: "Minimal social footprint", description: (s) => `Linked social profiles scored ${s}/100.` },
  customer_journey: { title: "Unclear customer journey", description: (s) => `The route from interest to enquiry scored ${s}/100.` },
  operations: { title: "Limited operational signals", description: (s) => `Operational signals scored ${s}/100.` },
};

export interface WeaknessInput {
  items: readonly EngineEvidenceItem[];
  maturity: MaturityAssessment;
  idFor: (index: number) => string;
  threshold?: number;
}

/**
 * Derive weaknesses, weakest first. Unassessed categories are excluded by
 * construction — `weakestCategories` only returns categories that carry a score.
 */
export function deriveWeaknesses(input: WeaknessInput): ProspectFinding[] {
  const threshold = input.threshold ?? WEAKNESS_THRESHOLD;
  const eligible = weakestCategories(input.maturity).filter(
    (c): c is MaturityScore & { score: number } => c.score !== null && c.score <= threshold && c.evidenceIds.length > 0,
  );

  return eligible.map((category, index) => {
    const template = WEAKNESS_TEMPLATES[category.category] ?? {
      title: `Observed weakness in ${category.category}`,
      description: (s: number) => `Observed signals scored ${s}/100.`,
    };
    return prospectFindingSchema.parse({
      id: input.idFor(index),
      kind: "weakness",
      category: category.category,
      title: template.title,
      description: template.description(category.score),
      evidenceIds: category.evidenceIds,
      confidence: itemConfidence(input.items, category.evidenceIds),
      observedScore: category.score,
      limitations: category.limitations,
    });
  });
}

/**
 * Categories that could NOT be assessed. These are evidence gaps to close, and
 * are returned separately so no caller can mistake them for weaknesses.
 */
export function evidenceGaps(maturity: MaturityAssessment): { category: string; reason: string }[] {
  return maturity.categories
    .filter((c) => !c.available)
    .map((c) => ({ category: c.category, reason: c.limitations[0] ?? "No signal resolved for this category." }))
    .sort((a, b) => (a.category < b.category ? -1 : 1));
}
