/* =============================================================================
 * Commercial workflow — shared stage contract (PURE types).
 *
 * The dependency surface and result shape every commercial stage executor shares.
 * Kept in its own module so stage executors, the coordinator and the app-layer
 * driver all agree on one contract without importing each other.
 * ========================================================================== */

import type { ArtifactService } from "../services/artifact.service.js";
import type { EventService } from "../services/event.service.js";
import type { ProposalService, NarrativeService } from "../services/derived.services.js";
import type { RuntimeServiceContext } from "../services/support.js";
import type { CommercialStage, CommercialStageStatus } from "./stages.js";

/** Everything a commercial stage executor may read or write. */
export interface CommercialStageDeps {
  /** Runtime artifacts (read the core scan's outputs; the competitor snapshot). */
  artifacts: ArtifactService;
  /** Versioned proposal persistence (proposal_versions). */
  proposals: ProposalService;
  /** Versioned, per-audience narrative persistence (narrative_versions). */
  narratives: NarrativeService;
  events: EventService;
  ctx: RuntimeServiceContext;
}

/** The uniform result every commercial stage returns to the coordinator. */
export interface CommercialStageResult {
  stage: CommercialStage;
  status: CommercialStageStatus;
  /** Whether a new artifact version was written, or an identical one replayed. */
  persisted: "created" | "revised" | "replayed";
  /** Stage-specific counts (e.g. competitor discovery tallies). Safe/aggregate only. */
  counts?: Record<string, number>;
  /** Stage-specific flags surfaced to events/telemetry (e.g. needsPricing, reviewStatus). */
  detail?: Record<string, string | boolean>;
}
