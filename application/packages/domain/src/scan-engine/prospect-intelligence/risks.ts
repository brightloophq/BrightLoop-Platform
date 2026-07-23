/* =============================================================================
 * Risk derivation (Phase C · Sprint C5) — PURE, evidence-backed only.
 *
 * A risk is raised ONLY from an observed low score in a category that maps to a
 * risk class. The mapping is declared below, so every risk can be traced to the
 * category, the signals, and the evidence that produced it.
 *
 * An unassessed category raises NO risk. "We could not observe X" is an evidence
 * gap; asserting a risk from it would be speculation, which this module has no
 * path to express (`evidenceIds` is `.min(1)` in the contract).
 * ========================================================================== */

import {
  prospectRiskSchema,
  type EngineEvidenceItem,
  type MaturityAssessment,
  type MaturityCategory,
  type MaturityScore,
  type ProspectRisk,
  type ProspectRiskCategory,
  type ProspectRiskSeverity,
} from "@brightloop/schema";
import { itemConfidence } from "./confidence.js";

/** Category → risk class. A category absent here raises no risk. */
export const CATEGORY_RISK_CLASS: Partial<Record<MaturityCategory, ProspectRiskCategory>> = {
  website: "technical",
  seo: "seo",
  branding: "marketing",
  trust: "trust",
  accessibility: "accessibility",
  content: "content",
  lead_capture: "marketing",
  performance: "technical",
  automation: "automation",
  analytics: "operational",
  social_presence: "marketing",
  customer_journey: "operational",
  operations: "operational",
};

/** Risks that additionally carry a compliance dimension. */
const COMPLIANCE_CATEGORIES: readonly MaturityCategory[] = ["accessibility", "trust"];

/** Observed score at or below this raises a risk. */
export const RISK_THRESHOLD = 55;

/**
 * Severity from the observed score. Lower score ⇒ higher severity.
 *
 *   ≤ 20 → critical · ≤ 35 → high · ≤ 45 → moderate · ≤ 55 → low
 */
export function severityForScore(score: number): { severity: ProspectRiskSeverity; severityScore: number } {
  const severityScore = Math.max(0, Math.min(100, 100 - score));
  if (score <= 20) return { severity: "critical", severityScore };
  if (score <= 35) return { severity: "high", severityScore };
  if (score <= 45) return { severity: "moderate", severityScore };
  return { severity: "low", severityScore };
}

const TEMPLATES: Partial<Record<MaturityCategory, { title: string; description: (score: number) => string }>> = {
  website: { title: "Unreliable website foundation", description: (s) => `Foundation signals scored ${s}/100; parts of the site may be unreachable to visitors and crawlers.` },
  seo: { title: "Low search discoverability", description: (s) => `On-page search signals scored ${s}/100; the business is harder to find in organic search.` },
  branding: { title: "Inconsistent brand presentation", description: (s) => `Brand signals scored ${s}/100; presentation varies across the observed pages.` },
  trust: { title: "Insufficient trust signals", description: (s) => `Trust signals scored ${s}/100; a prospective buyer has little published basis to verify legitimacy.` },
  accessibility: { title: "Accessibility exposure", description: (s) => `Accessibility markup scored ${s}/100; some users cannot use the site, which also carries regulatory exposure.` },
  content: { title: "Insufficient published content", description: (s) => `Content scored ${s}/100; there is limited substance to support search or sales.` },
  lead_capture: { title: "Lost enquiry capture", description: (s) => `Lead capture scored ${s}/100; interested visitors may leave without a route to contact.` },
  performance: { title: "Excessive page weight", description: (s) => `Page weight scored ${s}/100; heavier pages degrade experience on constrained connections.` },
  automation: { title: "Manual process exposure", description: (s) => `Automation signals scored ${s}/100.` },
  analytics: { title: "Decisions without measurement", description: (s) => `Measurement signals scored ${s}/100; changes cannot be evaluated.` },
  social_presence: { title: "Limited owned distribution", description: (s) => `Social presence scored ${s}/100; the business has limited owned distribution.` },
  customer_journey: { title: "Broken customer journey", description: (s) => `The customer journey scored ${s}/100; visitors may not reach an enquiry point.` },
  operations: { title: "Limited operational visibility", description: (s) => `Operational signals scored ${s}/100.` },
};

export interface RiskInput {
  items: readonly EngineEvidenceItem[];
  maturity: MaturityAssessment;
  idFor: (index: number) => string;
  threshold?: number;
}

/** Derive risks from observed low scores, most severe first. */
export function deriveRisks(input: RiskInput): ProspectRisk[] {
  const threshold = input.threshold ?? RISK_THRESHOLD;

  const eligible = input.maturity.categories
    .filter((c): c is MaturityScore & { score: number } => c.score !== null && c.score <= threshold && c.evidenceIds.length > 0)
    .filter((c) => CATEGORY_RISK_CLASS[c.category] !== undefined)
    .sort((a, b) => a.score - b.score || (a.category < b.category ? -1 : 1));

  const risks: ProspectRisk[] = [];
  let index = 0;

  for (const category of eligible) {
    const { severity, severityScore } = severityForScore(category.score);
    const template = TEMPLATES[category.category] ?? {
      title: `Observed risk in ${category.category}`,
      description: (s: number) => `Observed signals scored ${s}/100.`,
    };

    risks.push(
      prospectRiskSchema.parse({
        id: input.idFor(index++),
        category: CATEGORY_RISK_CLASS[category.category]!,
        title: template.title,
        description: template.description(category.score),
        severity,
        severityScore,
        confidence: itemConfidence(input.items, category.evidenceIds),
        evidenceIds: category.evidenceIds,
        limitations: category.limitations,
      }),
    );

    // A weak accessibility or trust posture is additionally a compliance risk —
    // stated separately so it is not buried inside a technical finding.
    if (COMPLIANCE_CATEGORIES.includes(category.category) && (severity === "high" || severity === "critical")) {
      risks.push(
        prospectRiskSchema.parse({
          id: input.idFor(index++),
          category: "compliance",
          title: `Regulatory exposure from weak ${category.category} posture`,
          description: `${category.category} scored ${category.score}/100. Published accessibility and trust posture carry regulatory expectations in most jurisdictions; this is an observation, not legal advice.`,
          severity,
          severityScore,
          confidence: itemConfidence(input.items, category.evidenceIds),
          evidenceIds: category.evidenceIds,
          limitations: [...category.limitations, "Jurisdiction-specific obligations were not assessed; confirm with qualified counsel."],
        }),
      );
    }
  }

  return risks;
}
