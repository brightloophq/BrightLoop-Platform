/* =============================================================================
 * Transformation Execution — REPOSITORY PORTS (Phase D · Sprint D1).
 *
 * The persistence contracts the application layer depends on. Ports only — the
 * Supabase adapters live in `@brightloop/data`. Every method returns a
 * `RuntimeResult` (never throws a raw DB error), mirroring the Phase B runtime
 * repositories. RLS remains the real tenant boundary; the adapters add no filters.
 *
 * D1 scope: create-once + read. Optimistic-concurrency `save`/transitions arrive
 * with the workflow engine in D2+.
 * ========================================================================== */

import type { Initiative, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface TransformationWorkspaceRepository {
  /** Persist a freshly seeded workspace. Idempotent on `(scanRunId, seedChecksum)`. */
  create(workspace: TransformationWorkspace): Promise<RuntimeResult<TransformationWorkspace>>;
  getById(id: string): Promise<RuntimeResult<TransformationWorkspace | null>>;
  /** The idempotency lookup: an existing workspace for this exact seed, or null. */
  getBySeed(scanRunId: string, seedChecksum: string): Promise<RuntimeResult<TransformationWorkspace | null>>;
  listByClient(clientId: string | null): Promise<RuntimeResult<TransformationWorkspace[]>>;
}

export interface InitiativeRepository {
  /** Persist the seeded initiatives for a workspace (idempotent per initiative id). */
  createMany(initiatives: readonly Initiative[]): Promise<RuntimeResult<Initiative[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<Initiative[]>>;
}

export interface TransformationActivityRepository {
  /** Append one activity record. Idempotent on `commandId` — replays are no-ops. */
  append(record: TransformationActivity): Promise<RuntimeResult<TransformationActivity>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<TransformationActivity[]>>;
}

/** The three ports the Phase D application use-cases are wired with. */
export interface TransformationExecutionRepositories {
  workspaces: TransformationWorkspaceRepository;
  initiatives: InitiativeRepository;
  activities: TransformationActivityRepository;
}
