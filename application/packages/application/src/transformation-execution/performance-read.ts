/* =============================================================================
 * Planning & Performance read models (Phase D · Sprint D5+D6).
 *
 * Read-only projections: an initiative's timeline + milestones + latest progress,
 * and the workspace performance / health dashboard (KPIs, timelines, per-initiative
 * progress, latest snapshots). Load-then-authorize; DTOs only; no derivation is
 * persisted here — that is the calculate* use-cases' job.
 * ========================================================================== */

import { authorize, requireExecution, MILESTONE_READ_CAP, PROGRESS_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toKpiDTO,
  toMilestoneDTO,
  toProgressSnapshotDTO,
  toInitiativeTimelineDTO,
  type InitiativePerformanceDTO,
  type ProgressSnapshotDTO,
  type WorkspacePerformanceDTO,
} from "./dto.js";

/** Newest snapshot for a subject (append-only history → pick the latest `at`). */
function latest(snapshots: readonly { at: string }[]): number {
  let idx = -1;
  for (let i = 0; i < snapshots.length; i += 1) if (idx === -1 || snapshots[i]!.at >= snapshots[idx]!.at) idx = i;
  return idx;
}

/** One initiative's plan: timeline (with derived variance) + ordered milestones + latest progress. */
export async function getInitiativePerformance(ctx: AppContext, rawInitiativeId: unknown): Promise<InitiativePerformanceDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, MILESTONE_READ_CAP, initiative.clientId);

  const [timeline, milestones, snapshots] = await Promise.all([
    exec.timelines.getByInitiative(initiativeId).then(unwrap),
    exec.milestones.listByInitiative(initiativeId).then(unwrap),
    exec.progress.listBySubject(initiativeId).then(unwrap),
  ]);
  const i = latest(snapshots);
  const latestSnapshot: ProgressSnapshotDTO | null = i === -1 ? null : toProgressSnapshotDTO(snapshots[i]!);
  return {
    initiativeId,
    timeline: timeline === null ? null : toInitiativeTimelineDTO(timeline),
    milestones: [...milestones].sort((a, b) => a.order - b.order).map(toMilestoneDTO),
    progress: latestSnapshot?.progress ?? 0,
    latestSnapshot,
  };
}

/** Workspace performance + health dashboard: KPIs, timelines, per-initiative progress. */
export async function getWorkspacePerformance(ctx: AppContext, rawWorkspaceId: unknown): Promise<WorkspacePerformanceDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const exec = requireExecution(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, PROGRESS_READ_CAP, workspace.clientId);

  const [kpis, timelines, milestones, snapshots] = await Promise.all([
    exec.kpis.listByWorkspace(workspaceId).then(unwrap),
    exec.timelines.listByWorkspace(workspaceId).then(unwrap),
    exec.milestones.listByWorkspace(workspaceId).then(unwrap),
    exec.progress.listByWorkspace(workspaceId).then(unwrap),
  ]);

  // Latest snapshot per subject (initiative or workspace).
  const bySubject = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const prev = bySubject.get(s.subjectId);
    if (prev === undefined || s.at >= prev.at) bySubject.set(s.subjectId, s);
  }
  const workspaceSnapshot = bySubject.get(workspaceId) ?? null;
  const initiativeSnapshots = [...bySubject.values()].filter((s) => s.scope === "initiative");

  return {
    workspaceId,
    workspaceProgress: workspaceSnapshot?.progress ?? 0,
    health: workspaceSnapshot?.health ?? null,
    healthReasons: [],
    kpis: [...kpis].sort((a, b) => a.name.localeCompare(b.name)).map(toKpiDTO),
    timelines: timelines.map(toInitiativeTimelineDTO),
    milestones: [...milestones].sort((a, b) => a.order - b.order).map(toMilestoneDTO),
    initiativeProgress: initiativeSnapshots.map((s) => ({ initiativeId: s.subjectId, progress: s.progress })).sort((a, b) => a.initiativeId.localeCompare(b.initiativeId)),
    latestSnapshots: [...bySubject.values()].sort((a, b) => a.subjectId.localeCompare(b.subjectId)).map(toProgressSnapshotDTO),
  };
}
