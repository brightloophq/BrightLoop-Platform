/* =============================================================================
 * Prospect assessment pipeline (Phase C · Sprint C6) — barrel.
 *
 * The controlled application-layer integration that runs a scan's normalized
 * discovery evidence through the deterministic Prospect Intelligence Engine and
 * persists reviewable artifacts through the existing runtime abstractions. No new
 * engine, no provider call, no persistence bypass.
 * ========================================================================== */

export { normalizeDiscoveryToEvidence, type BridgeResult } from "./evidence-bridge.js";
export { toFindingsEnvelope, toRecommendationEnvelope, toInternalReportEnvelope } from "./report-adapter.js";
export {
  assessProspect,
  latestAssessmentReport,
  type AssessmentOutcome,
  type AssessmentStatus,
  type AssessmentArtifactIds,
} from "./assess-prospect.js";
export { getScanAssessment, type AssessmentDTO, type AssessmentArtifactDTO } from "./get-assessment.js";
export {
  createIntelligenceStageRegistry,
  INTELLIGENCE_STAGE_KEYS,
  type IntelligenceStageRegistry,
  type IntelligenceStageSupport,
  type IntelligenceStageDeps,
} from "./stage-executors.js";
