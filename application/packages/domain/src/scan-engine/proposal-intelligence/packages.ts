/* =============================================================================
 * Option packages (Sprint 11 §10 · AIS-004 §03) — PURE.
 *
 * "Good/better/best tiers are assembled from NESTED SUBSETS of the move set, each
 * a coherent outcome at its own price." Packages derive from the recommendation
 * portfolio and scenarios — never from invented work.
 *
 * HARD RULE: a package that has no qualifying workstreams stays EMPTY with a
 * stated limitation. Nothing is fabricated to fill a tier.
 * ========================================================================== */

import {
  proposalOptionPackageSchema,
  type PackageKind,
  type ProposalDeliverable,
  type ProposalOptionPackage,
  type ProposalWorkstream,
} from "@brightloop/schema";
import { aggregateDurationBand } from "./phases.js";

/** Canonical package order (ascending ambition). */
export const PACKAGE_ORDER: readonly PackageKind[] = ["essential", "recommended", "accelerated", "strategic"];

const EFFORT_RANK = { xs: 0, s: 1, m: 2, l: 3, xl: 4, unavailable: -1 } as const;
const RANK_EFFORT: ProposalWorkstream["effortBand"][] = ["xs", "s", "m", "l", "xl"];

/** The highest effort band across a set. Pure. */
export function aggregateEffortBand(bands: readonly ProposalWorkstream["effortBand"][]): ProposalWorkstream["effortBand"] {
  const known = bands.filter((b) => b !== "unavailable");
  if (known.length === 0) return "unavailable";
  return RANK_EFFORT[Math.max(...known.map((b) => EFFORT_RANK[b]))]!;
}

/** The deterministic membership rule for each tier — recorded on the package. */
export const PACKAGE_RULES: Record<PackageKind, { describe: string; match: (w: ProposalWorkstream) => boolean }> = {
  essential: { describe: "critical_risk workstreams only", match: (w) => w.tier === "critical_risk" },
  recommended: { describe: "critical_risk + quick_win workstreams", match: (w) => w.tier === "critical_risk" || w.tier === "quick_win" },
  accelerated: { describe: "critical_risk + quick_win + medium_win workstreams", match: (w) => w.tier !== "strategic_win" },
  strategic: { describe: "all workstreams", match: () => true },
};

export interface BuildPackagesInput {
  idFor: (kind: PackageKind) => string;
  workstreams: readonly ProposalWorkstream[];
  deliverables?: readonly ProposalDeliverable[];
  /** Scenario-selected recommendation ids, when a scenario constrains the set. */
  scenarioRecommendationIds?: readonly string[];
  titleFor?: (kind: PackageKind) => string;
}

/**
 * Build the four nested packages. Each is a subset of the SAME workstream set, so
 * the tiers nest by construction. Deterministic (id-ordered).
 */
export function buildOptionPackages(input: BuildPackagesInput): ProposalOptionPackage[] {
  const all = [...input.workstreams].sort((a, b) => (a.id < b.id ? -1 : 1));
  const scenarioFilter = input.scenarioRecommendationIds === undefined
    ? () => true
    : (w: ProposalWorkstream) => w.recommendationIds.some((r) => input.scenarioRecommendationIds!.includes(r));

  return PACKAGE_ORDER.map((kind) => {
    const rule = PACKAGE_RULES[kind];
    const included = all.filter((w) => rule.match(w) && scenarioFilter(w));
    const excluded = all.filter((w) => !included.includes(w));
    const includedIds = included.map((w) => w.id);
    const deliverableIds = (input.deliverables ?? []).filter((d) => includedIds.includes(d.workstreamId)).map((d) => d.id).sort();

    const limitations: string[] = [];
    if (included.length === 0) limitations.push("No workstream in the evidence-derived set matches this package; none was invented to fill it.");
    if (input.scenarioRecommendationIds !== undefined) limitations.push("Package constrained to the selected scenario's recommendations.");

    const meanConfidence = included.length === 0 ? 0 : Math.round(included.reduce((a, w) => a + w.confidence, 0) / included.length);

    return proposalOptionPackageSchema.parse({
      id: input.idFor(kind),
      kind,
      title: input.titleFor?.(kind) ?? `${kind} package`,
      workstreamIds: includedIds,
      deliverableIds,
      excludedWorkstreamIds: excluded.map((w) => w.id),
      durationBand: aggregateDurationBand(included.map((w) => w.durationBand)),
      effortBand: aggregateEffortBand(included.map((w) => w.effortBand)),
      expectedOutcomes: [...new Set(included.flatMap((w) => w.affectedDomains))].sort().map((d) => `Movement in ${d}`),
      risks: [],
      dependencies: [...new Set(included.flatMap((w) => w.dependencies))].sort(),
      confidence: meanConfidence,
      derivationRule: rule.describe,
      limitations,
      reviewRequired: true,
    });
  });
}

/** True when each package's workstreams are a subset of the next tier's. Pure. */
export function packagesAreNested(packages: readonly ProposalOptionPackage[]): boolean {
  const ordered = PACKAGE_ORDER.map((k) => packages.find((p) => p.kind === k)).filter((p): p is ProposalOptionPackage => p !== undefined);
  for (let i = 0; i + 1 < ordered.length; i += 1) {
    const inner = new Set(ordered[i]!.workstreamIds);
    const outer = new Set(ordered[i + 1]!.workstreamIds);
    for (const id of inner) if (!outer.has(id)) return false;
  }
  return true;
}
