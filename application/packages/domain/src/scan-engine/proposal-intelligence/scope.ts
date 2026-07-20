/* =============================================================================
 * Scope generation (Sprint 11 §3 · AIS-004 §03) — PURE.
 *
 * HARD RULE: no work is generated without a source recommendation or finding.
 * `buildScope` returns the derived items plus every REJECTED request with its
 * reason — the engine refuses to invent work, even to fill a package.
 *
 * Client-side responsibilities, boundaries, and change-control triggers are
 * declared explicitly so nothing is an unstated assumption.
 * ========================================================================== */

import {
  proposalScopeItemSchema,
  type EngineRecommendation,
  type PriorityBand,
  type ProposalScopeItem,
  type ProposalWorkstream,
  type RiskBand,
  type ScopeKind,
} from "@brightloop/schema";
import { effortBandFor } from "./strategy.js";

/** Priority band from a recommendation tier + impact. Pure. */
export function priorityBandFor(rec: EngineRecommendation): PriorityBand {
  if (rec.tier === "critical_risk") return "critical";
  if (rec.impact >= 70) return "high";
  if (rec.impact >= 40) return "medium";
  return "low";
}

/** Risk band from implementation risk. Pure. */
export function riskBandFor(risk: number): RiskBand {
  if (risk >= 80) return "critical";
  if (risk >= 55) return "high";
  if (risk >= 30) return "moderate";
  return "low";
}

export interface ScopeRequestItem {
  kind: ScopeKind;
  title: string;
  description: string;
  recommendationId?: string;
  findingIds?: string[];
  workstreamId?: string | null;
  acceptanceCriteria?: string[];
  changeControlTriggers?: string[];
}

export interface BuildScopeInput {
  idFor: (kind: ScopeKind, index: number) => string;
  recommendations: readonly EngineRecommendation[];
  workstreams?: readonly ProposalWorkstream[];
  /** Recommendations deferred by the portfolio/scenario — become `deferred` scope. */
  deferredRecommendationIds?: readonly string[];
  /** Services the client excluded — become `excluded` scope, not silent omissions. */
  excludedServices?: readonly string[];
  /** Additional non-work scope declarations (responsibilities, boundaries). */
  declarations?: readonly ScopeRequestItem[];
}

/** Scope kinds that describe WORK and therefore require a source. */
const WORK_KINDS: ReadonlySet<ScopeKind> = new Set(["mandatory", "optional", "deferred"]);

/**
 * Build the scope. Work items derive one-to-one from recommendations; declarations
 * (responsibilities, boundaries, assumptions, exclusions) need no source but are
 * still recorded explicitly. Deterministic.
 */
export function buildScope(input: BuildScopeInput): { items: ProposalScopeItem[]; rejected: { title: string; reason: string }[] } {
  const items: ProposalScopeItem[] = [];
  const rejected: { title: string; reason: string }[] = [];
  const deferred = new Set(input.deferredRecommendationIds ?? []);
  const wsByRec = new Map((input.workstreams ?? []).flatMap((w) => w.recommendationIds.map((r) => [r, w.id] as const)));
  let index = 0;

  for (const rec of [...input.recommendations].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    // rule 1: a work item must trace to a finding AND carry evidence
    if (rec.findingIds.length === 0 || rec.evidenceIds.length === 0) {
      rejected.push({ title: rec.title, reason: "recommendation has no linked finding or evidence — no scope generated" });
      continue;
    }
    const kind: ScopeKind = deferred.has(rec.id) ? "deferred" : rec.tier === "critical_risk" ? "mandatory" : "optional";
    items.push(
      proposalScopeItemSchema.parse({
        id: input.idFor(kind, index++),
        kind,
        title: rec.title,
        description: rec.proposedAction,
        sourceRecommendationIds: [rec.id],
        sourceFindingIds: rec.findingIds,
        workstreamId: wsByRec.get(rec.id) ?? null,
        affectedDomains: rec.affectedDomains,
        priority: priorityBandFor(rec),
        confidence: rec.confidence.value,
        effortBand: effortBandFor(rec.effort),
        riskBand: riskBandFor(rec.implementationRisk),
        dependencies: rec.dependencies,
        acceptanceCriteria: rec.successMetrics.map((m) => m.description),
        changeControlTriggers: ["scope addition", "dependency change", "evidence invalidated"],
        limitations: rec.limitations,
        reviewRequired: true,
      }),
    );
  }

  // client-excluded services become explicit `excluded` scope
  for (const service of [...(input.excludedServices ?? [])].sort()) {
    items.push(
      proposalScopeItemSchema.parse({
        id: input.idFor("excluded", index++),
        kind: "excluded",
        title: service,
        description: `Explicitly excluded at the client's request.`,
        priority: "low",
        confidence: 100,
        effortBand: "unavailable",
        riskBand: "unknown",
        reviewRequired: false,
      }),
    );
  }

  // declarations: responsibilities, boundaries, assumptions
  for (const d of input.declarations ?? []) {
    if (WORK_KINDS.has(d.kind) && d.recommendationId === undefined && (d.findingIds ?? []).length === 0) {
      rejected.push({ title: d.title, reason: `work-kind scope '${d.kind}' supplied without a recommendation or finding source` });
      continue;
    }
    items.push(
      proposalScopeItemSchema.parse({
        id: input.idFor(d.kind, index++),
        kind: d.kind,
        title: d.title,
        description: d.description,
        sourceRecommendationIds: d.recommendationId === undefined ? [] : [d.recommendationId],
        sourceFindingIds: d.findingIds ?? [],
        workstreamId: d.workstreamId ?? null,
        priority: "medium",
        confidence: 100,
        effortBand: "unavailable",
        riskBand: "unknown",
        acceptanceCriteria: d.acceptanceCriteria ?? [],
        changeControlTriggers: d.changeControlTriggers ?? [],
        reviewRequired: false,
      }),
    );
  }

  return { items, rejected };
}

export function scopeOfKind(items: readonly ProposalScopeItem[], kind: ScopeKind): ProposalScopeItem[] {
  return items.filter((i) => i.kind === kind);
}

/** Scope items that represent billable/deliverable work. Pure. */
export function workScope(items: readonly ProposalScopeItem[]): ProposalScopeItem[] {
  return items.filter((i) => i.kind === "mandatory" || i.kind === "optional");
}
