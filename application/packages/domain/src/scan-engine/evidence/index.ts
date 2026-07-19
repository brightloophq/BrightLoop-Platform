/* =============================================================================
 * L3 · Evidence Engine (PDF 27 §03/§05) — SKELETON.
 *
 * Extracts, classifies (Observed / Estimated / Inferred / Unavailable), and
 * timestamps every signal with a source + reliability weight. The four-state
 * label travels with the signal through every downstream layer and appears
 * verbatim in the client report — an inference is never presented as observation.
 * Classification defaults are PURE; extraction/fetching is an adapter concern.
 * ========================================================================== */

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
