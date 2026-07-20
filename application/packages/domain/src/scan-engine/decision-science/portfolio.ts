/* =============================================================================
 * Portfolio optimization (Sprint 9 §8 · AIS-003 §11) — PURE.
 *
 *   max Σ π(ri)·si   s.t.  Σ Cost(ri)·si ≤ B,  si ∈ {0,1}
 *
 * A deterministic greedy knapsack over priority-density, respecting dependencies
 * (a prerequisite is pulled in before its dependent), pinning critical risks
 * regardless of budget pressure, and rejecting conflicts. NO external solver —
 * a documented heuristic whose output is reproducible.
 *
 * NOTE: budget/capacity are ABSTRACT units. Service pricing is out of scope.
 * ========================================================================== */

import {
  FORMULA_VERSION,
  portfolioSchema,
  type DependencyAnalysis,
  type IndexDimension,
  type Portfolio,
  type PortfolioConstraints,
  type PriorityScore,
  type EngineRecommendation,
} from "@brightloop/schema";
import { conflictsFor, prerequisitesOf } from "./dependencies.js";

/** Risk tolerance → the maximum implementation risk admitted. */
const RISK_CEILING: Record<PortfolioConstraints["riskTolerance"], number> = { low: 40, moderate: 70, high: 100 };

export interface PortfolioInput {
  id: string;
  recommendations: readonly EngineRecommendation[];
  priorities: ReadonlyMap<string, PriorityScore>;
  dependencies: DependencyAnalysis;
  constraints: PortfolioConstraints;
  /** Cost per recommendation in abstract budget units; defaults to `effort`. */
  costFor?: (rec: EngineRecommendation) => number;
}

/**
 * Select a portfolio. Order of consideration: critical risks (pinned) first, then
 * by priority density (π / cost) descending, id-stable. Deterministic.
 */
export function selectPortfolio(input: PortfolioInput): Portfolio {
  const { constraints, dependencies } = input;
  const cost = input.costFor ?? ((r: EngineRecommendation) => r.effort);
  const byId = new Map(input.recommendations.map((r) => [r.id, r]));
  const priorityOf = (id: string) => input.priorities.get(id)?.total ?? 0;
  const warnings: string[] = [];

  const excluded = new Set(constraints.excludedRecommendationIds);
  const blocked = new Set(dependencies.blocked);
  const riskCeiling = RISK_CEILING[constraints.riskTolerance];

  // eligible = present, not excluded, not blocked, within risk tolerance
  const eligible = input.recommendations.filter((r) => {
    if (excluded.has(r.id)) return false;
    if (blocked.has(r.id)) return false;
    if (r.implementationRisk > riskCeiling) {
      warnings.push(`${r.id} exceeds the ${constraints.riskTolerance} risk tolerance (risk ${r.implementationRisk}).`);
      return false;
    }
    return true;
  });

  // consideration order: critical risks pinned first, then priority density
  const ordered = [...eligible].sort((a, b) => {
    const aCrit = a.tier === "critical_risk" ? 0 : 1;
    const bCrit = b.tier === "critical_risk" ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;
    const ad = priorityOf(a.id) / Math.max(1, cost(a));
    const bd = priorityOf(b.id) / Math.max(1, cost(b));
    if (ad !== bd) return bd - ad;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const selected: string[] = [];
  const deferred: string[] = [];
  let spend = 0;
  let capacity = 0;

  const fits = (extra: number) => {
    const budgetOk = constraints.budgetCeiling === null || spend + extra <= constraints.budgetCeiling;
    const capacityOk = constraints.capacityCeiling === null || capacity + extra <= constraints.capacityCeiling;
    return budgetOk && capacityOk;
  };

  for (const rec of ordered) {
    if (selected.includes(rec.id)) continue;

    // conflicts: never select two conflicting moves
    const conflicting = conflictsFor(dependencies, rec.id).filter((id) => selected.includes(id));
    if (conflicting.length > 0) {
      deferred.push(rec.id);
      warnings.push(`${rec.id} deferred: conflicts with selected ${conflicting.join(", ")}.`);
      continue;
    }

    // dependency-aware: pull in present prerequisites first
    const prereqs = prerequisitesOf(dependencies, rec.id).filter((id) => byId.has(id) && !selected.includes(id));
    const bundle = [...prereqs, rec.id];
    const bundleCost = bundle.reduce((acc, id) => acc + cost(byId.get(id)!), 0);

    const pinned = rec.tier === "critical_risk"; // critical risks pin in regardless of budget
    if (!pinned && !fits(bundleCost)) {
      deferred.push(rec.id);
      continue;
    }
    if (pinned && !fits(bundleCost)) warnings.push(`${rec.id} pinned as a critical risk despite exceeding the budget/capacity ceiling.`);

    for (const id of bundle) if (!selected.includes(id)) selected.push(id);
    spend += bundleCost;
    capacity += bundleCost;
  }

  // required-domain coverage check
  const coverage = [...new Set(selected.flatMap((id) => byId.get(id)!.affectedDomains))].sort() as IndexDimension[];
  for (const d of constraints.requiredDomains) {
    if (!coverage.includes(d)) warnings.push(`Required domain '${d}' is not covered by the selected portfolio.`);
  }

  const selectedRecs = selected.map((id) => byId.get(id)!);
  const dependencyOrder = dependencies.order.filter((id) => selected.includes(id));
  if (!dependencies.acyclic) warnings.push("Dependency cycle detected; dependency order is unavailable.");

  return portfolioSchema.parse({
    id: input.id,
    selected,
    deferred: deferred.sort(),
    blocked: [...blocked].sort(),
    projectedImpact: selectedRecs.reduce((acc, r) => acc + r.impact, 0),
    aggregateEffort: selectedRecs.reduce((acc, r) => acc + r.effort, 0),
    aggregateRisk: selectedRecs.length === 0 ? 0 : Math.round(selectedRecs.reduce((acc, r) => acc + r.implementationRisk, 0) / selectedRecs.length),
    domainCoverage: coverage,
    dependencyOrder,
    warnings,
    constraints,
    formulaVersion: FORMULA_VERSION,
  });
}
