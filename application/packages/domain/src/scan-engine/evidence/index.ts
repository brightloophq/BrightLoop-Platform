/* =============================================================================
 * L3 · Evidence Engine (PDF 27 §03/§05/§08) — DETERMINISTIC layer.
 *
 * Extracts, classifies (Observed / Estimated / Inferred / Unavailable), and
 * timestamps every signal with a source + reliability weight. The four-state
 * label travels with the signal through every downstream layer and appears
 * verbatim in the client report — an inference is never presented as observation.
 *
 * Sprint 3 adds the full deterministic evidence-processing model on top of the
 * Sprint-1 classification skeleton: normalization, provenance, freshness,
 * reliability, coverage, confidence, conflict/dedup, validation, and the
 * EvidenceBundle. All pure. (The raw `evidenceSignal` classification below is
 * unchanged; the canonical `EngineEvidenceItem` is the processed form.)
 * ========================================================================== */

/* ---- Sprint-3 deterministic evidence engine ---- */
export * from "./hash.js";
export * from "./reliability.js";
export * from "./freshness.js";
export * from "./provenance.js";
export * from "./confidence.js";
export * from "./coverage.js";
export * from "./conflict.js";
export * from "./normalize.js";
export * from "./validate.js";
export * from "./bundle.js";

import {
  EVIDENCE_SOURCE_DEFAULT_STATE,
  evidenceSourceSchema,
  evidenceSignalSchema,
  type EvidenceSource,
  type EvidenceState,
  type EvidenceSignal,
} from "@brightloop/schema";

/** The canonical default state for a source (PDF 27 §05). A source may be
 *  reclassified at collection time (e.g. a granted Analytics property). Pure. */
export function defaultStateForSource(source: EvidenceSource): EvidenceState {
  return EVIDENCE_SOURCE_DEFAULT_STATE[source];
}

/** True when a source cannot inform a conclusion until it is connected/granted. */
export function isUnavailableByDefault(source: EvidenceSource): boolean {
  return EVIDENCE_SOURCE_DEFAULT_STATE[source] === "unavailable";
}

/** Validate a raw signal against the contract, defaulting its state from source
 *  when not explicitly classified. Pure; throws on an invalid signal. */
export function classifySignal(input: Omit<EvidenceSignal, "state"> & { state?: EvidenceState }): EvidenceSignal {
  return evidenceSignalSchema.parse({
    ...input,
    state: input.state ?? defaultStateForSource(input.source),
  });
}

/* ---- evidence port --------------------------------------------------------- */
/** Turns raw crawler/connector output into classified, timestamped signals. */
export interface EvidenceEngine {
  collect(input: { scanId: string; source: EvidenceSource; raw: unknown }): Promise<EvidenceSignal[]>;
}

export { evidenceSourceSchema, evidenceSignalSchema };
