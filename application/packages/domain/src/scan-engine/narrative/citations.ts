/* =============================================================================
 * Citation engine (Sprint 12 §6 · AIS-001 §03 Explainability) — PURE.
 *
 * Links narrative claims to their sources: evidence, graph nodes, benchmarks,
 * findings, recommendations, proposal scope, competitors.
 *
 * Validates, de-duplicates, orders, flags stale sources, REJECTS unavailable
 * sources, filters by audience visibility, and scores citation coverage.
 * "Every material claim must have at least one valid citation."
 * ========================================================================== */

import {
  citationValidationSchema,
  narrativeCitationSchema,
  type CitationTarget,
  type CitationValidation,
  type NarrativeAudience,
  type NarrativeCitation,
  type NarrativeClaim,
} from "@brightloop/schema";

/** Claim types that MUST carry a citation to be published. */
export const MATERIAL_CLAIM_TYPES = new Set(["factual", "estimated", "inferred", "comparative", "causal", "recommendation"]);

/** Deterministic ordering of citation targets. */
const TARGET_ORDER: Record<CitationTarget, number> = {
  evidence: 0, benchmark: 1, finding: 2, graph_node: 3, competitor: 4, recommendation: 5, proposal_scope: 6,
};

export interface NewCitationInput {
  id: string;
  target: CitationTarget;
  targetId: string;
  sourceUrl?: string | null;
  sourceTimestamp?: string | null;
  evidenceState: NarrativeCitation["evidenceState"];
  freshnessBand?: NarrativeCitation["freshnessBand"];
  visibleTo?: NarrativeAudience[];
}

/** Build a citation, deriving its stale flag from the freshness band. Pure. */
export function buildCitation(input: NewCitationInput): NarrativeCitation {
  const stale = input.freshnessBand === "stale" || input.freshnessBand === "expired";
  return narrativeCitationSchema.parse({
    id: input.id,
    target: input.target,
    targetId: input.targetId,
    sourceUrl: input.sourceUrl ?? null,
    sourceTimestamp: input.sourceTimestamp ?? null,
    evidenceState: input.evidenceState,
    freshnessBand: input.freshnessBand ?? null,
    visibleTo: input.visibleTo ?? [],
    stale,
    order: TARGET_ORDER[input.target],
  });
}

/** Order: target class → target id → citation id. Total + stable. Pure. */
export function orderCitations(citations: readonly NarrativeCitation[]): NarrativeCitation[] {
  return [...citations].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Remove duplicates by (target, targetId), keeping the lowest id. Pure. */
export function dedupeCitations(citations: readonly NarrativeCitation[]): { unique: NarrativeCitation[]; removed: string[] } {
  const seen = new Map<string, NarrativeCitation>();
  const removed: string[] = [];
  for (const c of orderCitations(citations)) {
    const key = `${c.target}:${c.targetId}`;
    const existing = seen.get(key);
    if (existing === undefined) seen.set(key, c);
    else removed.push(c.id > existing.id ? c.id : existing.id);
  }
  return { unique: orderCitations([...seen.values()]), removed: [...new Set(removed)].sort() };
}

export interface CitationValidationInput {
  citations: readonly NarrativeCitation[];
  claims: readonly NarrativeClaim[];
  audience: NarrativeAudience;
}

/**
 * Validate the citation set: reject unavailable sources and unknown references,
 * de-duplicate, warn on stale sources, and score coverage over material claims.
 */
export function validateCitations(input: CitationValidationInput): CitationValidation {
  const { unique, removed } = dedupeCitations(input.citations);
  const rejected: { citationId: string; reason: string }[] = [];
  const valid: string[] = [];
  const staleWarnings: string[] = [];

  for (const c of unique) {
    // an Unavailable source may never be cited as support
    if (c.evidenceState === "unavailable") {
      rejected.push({ citationId: c.id, reason: "source is Unavailable and cannot support a claim" });
      continue;
    }
    if (c.targetId.trim() === "") {
      rejected.push({ citationId: c.id, reason: "citation has no target id" });
      continue;
    }
    // audience visibility
    if (c.visibleTo.length > 0 && !c.visibleTo.includes(input.audience)) {
      rejected.push({ citationId: c.id, reason: `not visible to '${input.audience}'` });
      continue;
    }
    if (c.stale) staleWarnings.push(`${c.id}: source is ${c.freshnessBand}`);
    valid.push(c.id);
  }

  const validSet = new Set(valid);
  const material = input.claims.filter((cl) => MATERIAL_CLAIM_TYPES.has(cl.type));
  const covered = material.filter((cl) => cl.citationIds.some((id) => validSet.has(id))).length;
  const coverage = material.length === 0 ? 1 : covered / material.length;

  return citationValidationSchema.parse({
    valid: valid.sort(),
    rejected: rejected.sort((a, b) => (a.citationId < b.citationId ? -1 : 1)),
    duplicatesRemoved: removed,
    staleWarnings: staleWarnings.sort(),
    coverage,
  });
}

/** Material claims with no valid citation — these may not be published. Pure. */
export function uncitedMaterialClaims(claims: readonly NarrativeClaim[], validCitationIds: readonly string[]): string[] {
  const valid = new Set(validCitationIds);
  return claims
    .filter((c) => MATERIAL_CLAIM_TYPES.has(c.type) && !c.citationIds.some((id) => valid.has(id)))
    .map((c) => c.id)
    .sort();
}

/** Citations a given audience may see. Pure. */
export function citationsFor(citations: readonly NarrativeCitation[], audience: NarrativeAudience): NarrativeCitation[] {
  return orderCitations(citations.filter((c) => c.visibleTo.length === 0 || c.visibleTo.includes(audience)));
}
