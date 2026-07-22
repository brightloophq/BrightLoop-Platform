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
export { loadAuthorizedRun } from "./shared.js";
