/* =============================================================================
 * Evidence normalization (PDF 27 §03) — PURE.
 *
 * Turns a raw collected input into a canonical, fully-attributed EngineEvidenceItem:
 * defaults the state from its source, computes freshness + effective reliability
 * + provenance quality + confidence, and stamps a deterministic content hash.
 * No fetching, no interpretation — deterministic given `now`.
 * ========================================================================== */

import {
  EVIDENCE_SOURCE_DEFAULT_STATE,
  engineEvidenceItemSchema,
  type EngineEvidenceItem,
  type EvidenceSource,
  type EvidenceState,
  type IndexDimension,
  type EvidenceVisibility,
  type Provenance,
} from "@brightloop/schema";
import { computeFreshness, type FreshnessThresholds } from "./freshness.js";
import { effectiveReliability } from "./reliability.js";
import { provenanceQuality } from "./provenance.js";
import { computeEvidenceConfidence } from "./confidence.js";
import { hashContent } from "./hash.js";

export interface NormalizeInput {
  id: string;
  scanId: string;
  source: EvidenceSource;
  state?: EvidenceState; // defaults from the source
  timestamp: string;
  provenance: Provenance;
  value?: Record<string, unknown>;
  affectedDomains?: IndexDimension[];
  citations?: string[];
  visibility?: EvidenceVisibility;
  metadata?: Record<string, unknown>;
  reliabilityOverride?: number;
  /** Optional per-item confidence context; sensible defaults otherwise. */
  confidence?: { coverage?: number; agreement?: number; completeness?: number };
}

/** Deterministic content hash: two items with the same subject + value + timestamp
 *  collide (a TRUE duplicate). A same-value item at a different time is not a
 *  duplicate — it is a supersession, detected separately. */
export function evidenceHash(
  input: Pick<EngineEvidenceItem, "source" | "state" | "affectedDomains" | "value" | "metadata"> & { timestamp?: string },
): string {
  const metric = typeof input.metadata.metric === "string" ? input.metadata.metric : "";
  return hashContent({ source: input.source, state: input.state, affectedDomains: [...input.affectedDomains].sort(), metric, value: input.value, timestamp: input.timestamp ?? "" });
}

/** Normalize a raw input into a canonical EngineEvidenceItem. Pure given `now`. */
export function normalizeEvidence(input: NormalizeInput, now: string, thresholds?: FreshnessThresholds): EngineEvidenceItem {
  const state = input.state ?? EVIDENCE_SOURCE_DEFAULT_STATE[input.source];
  const value = input.value ?? {};
  const metadata = input.metadata ?? {};
  const affectedDomains = input.affectedDomains ?? [];
  const freshness = computeFreshness(input.timestamp, now, thresholds);
  const reliability = effectiveReliability(input.source, state, input.reliabilityOverride);
  const provQuality = provenanceQuality(input.provenance);

  const confidence = computeEvidenceConfidence({
    coverage: input.confidence?.coverage ?? (affectedDomains.length > 0 ? 1 : 0),
    reliability,
    freshness: freshness.score,
    agreement: input.confidence?.agreement ?? 1, // single item; bundle-level recompute adjusts
    completeness: input.confidence?.completeness ?? (Object.keys(value).length > 0 ? 1 : 0.3),
    provenanceQuality: provQuality,
  });

  const hash = evidenceHash({ source: input.source, state, affectedDomains, value, metadata, timestamp: input.timestamp });

  return engineEvidenceItemSchema.parse({
    id: input.id,
    scanId: input.scanId,
    source: input.source,
    state,
    timestamp: input.timestamp,
    freshness,
    reliability,
    provenance: input.provenance,
    confidence,
    metadata,
    hash,
    affectedDomains,
    citations: input.citations ?? [],
    visibility: input.visibility ?? "internal",
    value,
  });
}
