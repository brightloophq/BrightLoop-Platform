/* =============================================================================
 * Scan use-cases (Phase C · Sprint C1) — barrel.
 *
 * One file per use-case; no shared god-service. `shared.ts` holds only the
 * load-and-authorize helper every guarded lookup reuses.
 * ========================================================================== */

export { createScan, parseCreateScanRequest } from "./create-scan.js";
export { cancelScan } from "./cancel-scan.js";
export { retryScan } from "./retry-scan.js";
export { getScan } from "./get-scan.js";
export { listScans, type ListScansQuery } from "./list-scans.js";
export { getScanTimeline } from "./timeline.js";
export { getScanReport } from "./report.js";
export { getScanProposal } from "./proposal.js";
export { getScanNarrative, parseAudience } from "./narrative.js";
export { getScanEvidenceValidation, toEvidenceValidationDTO } from "./evidence-validation.js";
export {
  getScanCommercialProposal,
  getScanClientNarrative,
  getProspectPackageReview,
  decideProspectPackage,
  advanceCommercialWorkflow,
  setProposalPricing,
  type SetProposalPricingInput,
  type ProspectPackageReviewDTO,
  type PackageReviewAction,
  type DecideProspectPackageInput,
  type CommercialKickoffOutcome,
  type CommercialAdvance,
} from "./commercial.js";
export {
  computeProspectPackage,
  type ProspectPackage,
  type ProspectPackageInput,
  type ProspectPackageState,
  type ComponentStatus,
  type PackageReviewDecision,
} from "./package-readiness.js";
export {
  getScanArtifact,
  parseArtifactKind,
  isReadableArtifactKind,
  READABLE_ARTIFACT_KINDS,
  type ReadableArtifactKind,
} from "./artifact.js";
export { loadAuthorizedRun } from "./shared.js";
