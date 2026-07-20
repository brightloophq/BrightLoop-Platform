/* =============================================================================
 * Scenarios (Sprint 9 §9 · AIS-003 §10) — PURE.
 *
 * Six deterministic scenario constructions, each a documented FILTER over the
 * existing recommendation set plus a weight profile. A scenario only ever selects
 * from what the evidence produced — it never invents a recommendation to fill a
 * slot (AIS-001 §05/§06). Unresolved dependencies are reported, not hidden.
 * ========================================================================== */

import {
  scenarioSchema,
  type DecisionWeights,
  type DependencyAnalysis,
  type PriorityScore,
  type EngineRecommendation,
  type Scenario,
  type ScenarioKind,
} from "@brightloop/schema";
import { DEFAULT_WEIGHTS } from "./priority.js";
import { prerequisitesOf } from "./dependencies.js";

/** Weight profile per scenario (explicit + auditable, AIS-003 §01). */
export const SCENARIO_WEIGHTS: Record<ScenarioKind, DecisionWeights> = {
  minimum_viable_intervention: { impact: 0.3, opportunity: 0.2, riskReduction: 0.4, strategicAlignment: 0.1 },
  quick_wins: { impact: 0.4, opportunity: 0.35, riskReduction: 0.15, strategicAlignment: 0.1 },
  balanced_transformation: DEFAULT_WEIGHTS,
  growth_acceleration: { impact: 0.4, opportunity: 0.4, riskReduction: 0.05, strategicAlignment: 0.15 },
  risk_reduction: { impact: 0.2, opportunity: 0.1, riskReduction: 0.6, strategicAlignment: 0.1 },
  strategic_transformation: { impact: 0.3, opportunity: 0.15, riskReduction: 0.15, strategicAlignment: 0.4 },
};

const GROWTH_DOMAINS = new Set(["growth", "opportunity", "sales", "marketing"]);

/** The deterministic selection rule per scenario. Documented in `rationale.filter`. */
export const SCENARIO_FILTERS: Record<ScenarioKind, { describe: string; match: (r: EngineRecommendation) => boolean }> = {
  minimum_viable_intervention: { describe: "critical_risk tier only", match: (r) => r.tier === "critical_risk" },
  quick_wins: { describe: "quick_win tier, or effort ≤ 35 with short horizon", match: (r) => r.tier === "quick_win" || (r.effort <= 35 && (r.timeHorizon === "days" || r.timeHorizon === "weeks")) },
  balanced_transformation: { describe: "all recommendations", match: () => true },
  growth_acceleration: { describe: "touches a growth/opportunity/sales/marketing domain", match: (r) => r.affectedDomains.some((d) => GROWTH_DOMAINS.has(d)) },
  risk_reduction: { describe: "critical_risk tier or risk domain or implementation risk ≥ 60", match: (r) => r.tier === "critical_risk" || r.affectedDomains.includes("risk") || r.implementationRisk >= 60 },
  strategic_transformation: { describe: "strategic_win tier or quarter+ horizon", match: (r) => r.tier === "strategic_win" || r.timeHorizon === "quarter_plus" },
};

const HORIZON_RANK: Record<EngineRecommendation["timeHorizon"], number> = { days: 0, weeks: 1, quarter: 2, quarter_plus: 3 };
const RANK_HORIZON: EngineRecommendation["timeHorizon"][] = ["days", "weeks", "quarter", "quarter_plus"];

export interface ScenarioInput {
  kind: ScenarioKind;
  recommendations: readonly EngineRecommendation[];
  priorities: ReadonlyMap<string, PriorityScore>;
  dependencies: DependencyAnalysis;
}

/** Build one scenario. Selection is id-stable within equal priority. Pure. */
export function buildScenario(input: ScenarioInput): Scenario {
  const filter = SCENARIO_FILTERS[input.kind];
  const matched = input.recommendations
    .filter(filter.match)
    .sort((a, b) => {
      const pa = input.priorities.get(a.id)?.total ?? 0;
      const pb = input.priorities.get(b.id)?.total ?? 0;
      if (pa !== pb) return pb - pa;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const selectedIds = matched.map((r) => r.id);
  const limitations: string[] = [];
  if (matched.length === 0) limitations.push("No recommendation in the evidence-derived set matches this scenario; none was invented to fill it.");

  // unresolved prerequisites: required but not part of this scenario's selection
  const unresolved = [
    ...new Set(selectedIds.flatMap((id) => prerequisitesOf(input.dependencies, id).filter((p) => !selectedIds.includes(p)))),
  ].sort();
  if (unresolved.length > 0) limitations.push(`${unresolved.length} prerequisite(s) fall outside this scenario's selection.`);

  const totalImpact = matched.reduce((acc, r) => acc + r.impact, 0);
  const totalEffort = matched.reduce((acc, r) => acc + r.effort, 0);
  const totalRisk = matched.length === 0 ? 0 : Math.round(matched.reduce((acc, r) => acc + r.implementationRisk, 0) / matched.length);
  const meanConfidence = matched.length === 0 ? null : Math.round(matched.reduce((acc, r) => acc + r.confidence.value, 0) / matched.length);
  const slowest = matched.length === 0 ? null : RANK_HORIZON[Math.max(...matched.map((r) => HORIZON_RANK[r.timeHorizon]))]!;

  return scenarioSchema.parse({
    kind: input.kind,
    selected: selectedIds,
    rationale: { filter: filter.describe, weights: SCENARIO_WEIGHTS[input.kind], constraints: null },
    totalImpact,
    totalEffort,
    totalRisk,
    expectedTimeToValue: slowest,
    unresolvedDependencies: unresolved,
    evidenceConfidence: meanConfidence,
    limitations,
  });
}

/** Build all six scenarios, in canonical order. Pure. */
export function buildAllScenarios(recommendations: readonly EngineRecommendation[], priorities: ReadonlyMap<string, PriorityScore>, dependencies: DependencyAnalysis): Scenario[] {
  return (Object.keys(SCENARIO_FILTERS) as ScenarioKind[]).map((kind) => buildScenario({ kind, recommendations, priorities, dependencies }));
}
