/* =============================================================================
 * Provenance model (PDF 27 §16 audit) — PURE.
 *
 * Every item preserves where/when/how it was collected, whether it was
 * transformed (with the ordered transform-step ids — never free-text reasoning),
 * which engine stage produced it, and optionally which provider. A deterministic
 * `provenanceQuality` (0–1) grades how trustworthy that trace is.
 * ========================================================================== */

import { provenanceSchema, type Provenance, type CollectionMethod, type EngineStage } from "@brightloop/schema";

/** Base trust per collection method. */
const METHOD_QUALITY: Record<CollectionMethod, number> = {
  manual: 0.95, // operator-supplied, direct
  crawl: 0.9,
  api: 0.85,
  imported: 0.75,
  historical: 0.7,
  computed: 0.6, // derived, one step removed from observation
};

export interface BuildProvenanceInput {
  origin: string;
  collectedAt: string;
  method: CollectionMethod;
  stage: EngineStage;
  transformations?: string[];
  providerId?: string | null;
}

/** Build a validated provenance record. `transformed` is derived from the steps. */
export function buildProvenance(input: BuildProvenanceInput): Provenance {
  const transformations = input.transformations ?? [];
  return provenanceSchema.parse({
    origin: input.origin,
    collectedAt: input.collectedAt,
    method: input.method,
    transformed: transformations.length > 0,
    transformations,
    stage: input.stage,
    providerId: input.providerId ?? null,
  });
}

/**
 * Provenance quality (0–1): the method's base trust, discounted when the item was
 * transformed WITHOUT a recorded step trace (an opaque transform), or when the
 * origin is missing. Pure + deterministic.
 */
export function provenanceQuality(provenance: Provenance): number {
  let q = METHOD_QUALITY[provenance.method];
  if (provenance.transformed && provenance.transformations.length === 0) q *= 0.8; // opaque transform
  if (provenance.origin.trim().length === 0) q *= 0.7; // no traceable origin
  return Math.max(0, Math.min(1, q));
}
