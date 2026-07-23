/* =============================================================================
 * Strength derivation (Phase C · Sprint C5) — PURE, observation-only.
 *
 * A strength is asserted ONLY where a category scored at or above the strength
 * threshold AND evidence ids back that score. `ProspectFinding.evidenceIds` is
 * `.min(1)` in the contract, so an unevidenced strength cannot be constructed at
 * all — the rule is enforced by the type, not by discipline.
 *
 * Nothing here is comparative: no benchmark, no peer, no "better than average".
 * The engine states what was observed and how strongly.
 * ========================================================================== */

import {
  prospectFindingSchema,
  type EngineEvidenceItem,
  type MaturityAssessment,
  type MaturityScore,
  type ProspectFinding,
} from "@brightloop/schema";
import { itemConfidence } from "./confidence.js";
import { strongestCategories } from "./maturity.js";

/** A category must reach this score before it is called a strength. */
export const STRENGTH_THRESHOLD = 70;

/** Validated phrasing per category — templates, never free-form composition. */
const STRENGTH_TEMPLATES: Record<string, { title: string; description: (score: number) => string }> = {
  website: { title: "Solid website foundation", description: (s) => `The website is structurally sound, scoring ${s}/100 on the observed foundation signals.` },
  seo: { title: "Search-ready page structure", description: (s) => `Core on-page search signals are in place, scoring ${s}/100.` },
  branding: { title: "Consistent brand presentation", description: (s) => `Brand presentation signals are consistent across the observed pages, scoring ${s}/100.` },
  trust: { title: "Credible trust signals", description: (s) => `Published trust signals are strong, scoring ${s}/100.` },
  accessibility: { title: "Accessible markup", description: (s) => `Observed accessibility markup is above the threshold, scoring ${s}/100.` },
  content: { title: "Substantive content base", description: (s) => `There is enough published content to work from, scoring ${s}/100.` },
  lead_capture: { title: "Working lead capture", description: (s) => `A visitor has a clear route to make contact, scoring ${s}/100.` },
  performance: { title: "Lean page weight", description: (s) => `Transferred page weight stays within the observed budget, scoring ${s}/100.` },
  automation: { title: "Observed automation", description: (s) => `Automation signals are present, scoring ${s}/100.` },
  analytics: { title: "Measurement in place", description: (s) => `Measurement signals are present, scoring ${s}/100.` },
  social_presence: { title: "Active social footprint", description: (s) => `Multiple social profiles are linked, scoring ${s}/100.` },
  customer_journey: { title: "Clear customer journey", description: (s) => `The path from interest to enquiry is navigable, scoring ${s}/100.` },
  operations: { title: "Observed operational signals", description: (s) => `Operational signals are present, scoring ${s}/100.` },
};

export interface StrengthInput {
  items: readonly EngineEvidenceItem[];
  maturity: MaturityAssessment;
  idFor: (index: number) => string;
  threshold?: number;
}

/**
 * Derive strengths, strongest first. A high-scoring category with NO evidence
 * ids is skipped — the score alone is not a citation.
 */
export function deriveStrengths(input: StrengthInput): ProspectFinding[] {
  const threshold = input.threshold ?? STRENGTH_THRESHOLD;
  const eligible = strongestCategories(input.maturity).filter(
    (c): c is MaturityScore & { score: number } => c.score !== null && c.score >= threshold && c.evidenceIds.length > 0,
  );

  return eligible.map((category, index) => {
    const template = STRENGTH_TEMPLATES[category.category] ?? {
      title: `Observed strength in ${category.category}`,
      description: (s: number) => `Observed signals scored ${s}/100.`,
    };
    return prospectFindingSchema.parse({
      id: input.idFor(index),
      kind: "strength",
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
