/* =============================================================================
 * Roadmap generation + clarifications + validation (Phase E · Sprint E3) — PURE.
 * ========================================================================== */

import type { BusinessDimension, RoadmapPhase, StrategyRecommendation } from "@brightloop/schema";

/* ---- roadmap --------------------------------------------------------------- */

const PHASE_NAMES = ["Phase 1 — Stabilize", "Phase 2 — Optimize", "Phase 3 — Scale"] as const;

/**
 * Build a 3-phase transformation roadmap from prioritized recommendations:
 * highest-priority work lands in Phase 1, next in Phase 2, the rest in Phase 3.
 * Each phase carries initiatives, goals, dependencies, deliverables, outcomes. Pure.
 */
export function buildRoadmap(recommendations: readonly StrategyRecommendation[]): RoadmapPhase[] {
  const sorted = [...recommendations].sort((a, b) => b.priority - a.priority);
  const buckets: StrategyRecommendation[][] = [[], [], []];
  sorted.forEach((rec, i) => { buckets[Math.min(2, Math.floor(i / Math.max(1, Math.ceil(sorted.length / 3))))]!.push(rec); });
  return buckets.map((recs, idx) => ({
    phase: idx + 1,
    name: PHASE_NAMES[idx]!,
    goals: recs.map((r) => r.title),
    initiatives: recs.map((r) => r.title),
    dependencies: [...new Set(recs.flatMap((r) => r.dependencies))],
    deliverables: recs.map((r) => r.description || r.title),
    expectedOutcomes: recs.map((r) => `Expected impact: ${r.expectedImpact}`),
  })).filter((p) => p.initiatives.length > 0);
}

/* ---- clarifications -------------------------------------------------------- */

const QUESTION_TEMPLATES: Partial<Record<BusinessDimension, string>> = {
  technology: "What core systems (CRM, ERP, accounting) are currently in place?",
  sales: "What CRM do you currently use, and what is your average sales cycle?",
  marketing: "Which marketing channels drive the most qualified leads today?",
  automation_maturity: "Which processes are currently manual that you would most like to automate?",
  operations: "What are the top operational bottlenecks slowing delivery?",
  team_structure: "How is the team structured, and where are the capacity gaps?",
  documentation_quality: "Where is critical process knowledge documented today?",
  customer_journey: "What does the current customer onboarding journey look like?",
  branding: "How would you describe your current brand positioning?",
};

export interface Clarification { question: string; dimension: BusinessDimension | null; }

/** Generate structured clarification questions for the missing dimensions. Pure. */
export function generateClarifications(missingDimensions: readonly BusinessDimension[]): Clarification[] {
  return missingDimensions.map((d) => ({ question: QUESTION_TEMPLATES[d] ?? `Can you share more about your ${d.replace(/_/g, " ")}?`, dimension: d }));
}

/* ---- validation ------------------------------------------------------------ */

export interface StrategyValidationInput {
  executiveSummary: string;
  findingCount: number;
  recommendations: readonly Pick<StrategyRecommendation, "priority" | "confidence">[];
  /** Recommendation ids that carry at least one citation. */
  citedRecommendationIds: ReadonlySet<string>;
  recommendationIds: readonly string[];
  /** When true, uncited recommendations are allowed (explicitly model-generated). */
  allowModelGenerated: boolean;
}

export interface StrategyValidationResult { ok: boolean; issues: string[]; }

/**
 * Validate a strategy is structurally complete and internally consistent: summary
 * present, at least one finding, priorities in range, and (unless explicitly
 * model-generated) every recommendation carries a citation. Pure.
 */
export function validateStrategy(input: StrategyValidationInput): StrategyValidationResult {
  const issues: string[] = [];
  if (input.executiveSummary.trim() === "") issues.push("Missing executive summary");
  if (input.findingCount === 0) issues.push("No business findings produced");
  for (const r of input.recommendations) {
    if (r.priority < 0 || r.priority > 100) issues.push("Recommendation priority out of range");
    if (r.confidence < 0 || r.confidence > 100) issues.push("Recommendation confidence out of range");
  }
  if (!input.allowModelGenerated) {
    const uncited = input.recommendationIds.filter((id) => !input.citedRecommendationIds.has(id));
    if (uncited.length > 0) issues.push(`${uncited.length} recommendation(s) lack a citation`);
  }
  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
