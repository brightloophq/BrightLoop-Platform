/* =============================================================================
 * Performance use-cases (Phase D · Sprint D6) — DERIVED progress & health.
 *
 * Progress and health are NEVER manually edited — they are recomputed here from
 * the live execution signals (approved review + completed tasks + satisfied
 * dependencies + completed milestones + timeline completion + KPIs), recorded as
 * an immutable, append-only Progress Snapshot, and echoed to the activity log.
 * Read authority only (`progress.read`): callers observe, they do not set.
 * ========================================================================== */

import {
  calculateInitiativeProgress,
  calculateVariance,
  calculateWorkspaceHealth as evaluateWorkspaceHealth,
  calculateWorkspaceProgress,
  edgeOf,
} from "@brightloop/domain";
import { progressSnapshotSchema, type Initiative, type ProgressSnapshot, type Review, type Task, type Timeline, type TxMilestone } from "@brightloop/schema";
import { authorize, requireExecution, PROGRESS_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toProgressSnapshotDTO, type ProgressSnapshotDTO, type WorkspaceHealthDTO } from "./dto.js";

/* An initiative whose lifecycle has reached a terminal-done state satisfies a
 * downstream prerequisite edge. */
const DONE_INITIATIVE_STATES = new Set<Initiative["executionStatus"]>(["completed", "archived"]);
const pct = (done: number, total: number): number => (total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((done / total) * 100))));

/** The per-initiative signal bundle used by both progress and health. */
function initiativeSignals(
  initiativeId: string,
  reviews: readonly Review[],
  tasks: readonly Task[],
  milestones: readonly TxMilestone[],
  timeline: Timeline | null,
  edges: readonly { from: string; to: string }[],
  initiativeStatus: ReadonlyMap<string, Initiative["executionStatus"]>,
): { progress: number; reviewCompletion: number; taskCompletion: number; dependencyCompletion: number; milestoneCompletion: number; timelineVariance: number | null } {
  const approvedReview = reviews.some((r) => r.status === "approved");
  const taskTotal = tasks.length;
  const taskCompleted = tasks.filter((t) => t.status === "completed").length;
  const msTotal = milestones.length;
  const msCompleted = milestones.filter((m) => m.status === "completed").length;
  const prereqs = edges.filter((e) => e.from === initiativeId);
  const dependenciesSatisfied = prereqs.every((e) => DONE_INITIATIVE_STATES.has(initiativeStatus.get(e.to) ?? "seeded"));
  const timelineCompleted = timeline !== null && timeline.status === "completed";
  const progress = calculateInitiativeProgress({ approvedReview, taskTotal, taskCompleted, dependenciesSatisfied, milestoneTotal: msTotal, milestoneCompleted: msCompleted, timelineCompleted });
  return {
    progress,
    reviewCompletion: approvedReview ? 100 : 0,
    taskCompletion: pct(taskCompleted, taskTotal),
    dependencyCompletion: prereqs.length === 0 ? 100 : pct(prereqs.filter((e) => DONE_INITIATIVE_STATES.has(initiativeStatus.get(e.to) ?? "seeded")).length, prereqs.length),
    milestoneCompletion: pct(msCompleted, msTotal),
    timelineVariance: timeline === null ? null : calculateVariance(timeline).variance,
  };
}

/**
 * Recompute one initiative's progress from its live signals and append an
 * immutable snapshot. Derived — no field is caller-supplied.
 */
export async function calculateProgress(ctx: AppContext, rawInitiativeId: unknown): Promise<ProgressSnapshotDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, PROGRESS_READ_CAP, initiative.clientId);

  const [reviews, tasks, milestones, timeline, dependencies, siblings] = await Promise.all([
    exec.reviews.listByInitiative(initiativeId).then(unwrap),
    exec.tasks.listByInitiative(initiativeId).then(unwrap),
    exec.milestones.listByInitiative(initiativeId).then(unwrap),
    exec.timelines.getByInitiative(initiativeId).then(unwrap),
    exec.dependencies.listByWorkspace(initiative.workspaceId).then(unwrap),
    exec.initiatives.listByWorkspace(initiative.workspaceId).then(unwrap),
  ]);
  const statusMap = new Map<string, Initiative["executionStatus"]>(siblings.map((i) => [i.id, i.executionStatus]));
  const s = initiativeSignals(initiativeId, reviews, tasks, milestones, timeline, dependencies.map(edgeOf), statusMap);

  const snapshot: ProgressSnapshot = progressSnapshotSchema.parse({
    id: ctx.ids("snap"), workspaceId: initiative.workspaceId, clientId: initiative.clientId,
    scope: "initiative", subjectId: initiativeId, progress: s.progress,
    taskCompletion: s.taskCompletion, reviewCompletion: s.reviewCompletion, dependencyCompletion: s.dependencyCompletion,
    milestoneCompletion: s.milestoneCompletion, timelineVariance: s.timelineVariance, health: null, at: ctx.clock(),
  });
  unwrap(await exec.progress.append(snapshot));
  unwrap(await exec.activities.append({ id: ctx.ids("act"), at: ctx.clock(), workspaceId: initiative.workspaceId, clientId: initiative.clientId, type: "progress_calculated", subjectType: "progress", subjectId: initiativeId, summary: `Initiative progress recalculated: ${s.progress}%.`, commandId: `${snapshot.id}` }));
  return toProgressSnapshotDTO(snapshot);
}

/**
 * Recompute the whole workspace's health from every initiative's signals, record
 * an immutable workspace-scoped snapshot, and return the health verdict + reasons.
 */
export async function calculateWorkspaceHealth(ctx: AppContext, rawWorkspaceId: unknown): Promise<WorkspaceHealthDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const exec = requireExecution(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, PROGRESS_READ_CAP, workspace.clientId);

  const [initiatives, reviews, tasks, milestones, timelines, dependencies, kpis] = await Promise.all([
    exec.initiatives.listByWorkspace(workspaceId).then(unwrap),
    exec.reviews.listByWorkspace(workspaceId).then(unwrap),
    exec.tasks.listByWorkspace(workspaceId).then(unwrap),
    exec.milestones.listByWorkspace(workspaceId).then(unwrap),
    exec.timelines.listByWorkspace(workspaceId).then(unwrap),
    exec.dependencies.listByWorkspace(workspaceId).then(unwrap),
    exec.kpis.listByWorkspace(workspaceId).then(unwrap),
  ]);
  const edges = dependencies.map(edgeOf);
  const statusMap = new Map<string, Initiative["executionStatus"]>(initiatives.map((i) => [i.id, i.executionStatus]));
  const timelineByInitiative = new Map<string, Timeline>(timelines.map((t) => [t.initiativeId, t]));

  const perInitiative = initiatives.map((i) =>
    initiativeSignals(i.id, reviews.filter((r) => r.initiativeId === i.id), tasks.filter((t) => t.initiativeId === i.id), milestones.filter((m) => m.initiativeId === i.id), timelineByInitiative.get(i.id) ?? null, edges, statusMap),
  );
  const workspaceProgress = calculateWorkspaceProgress(perInitiative.map((p) => p.progress));

  // Workspace-level ratios in [0,1] for the health policy.
  const approvedInitiatives = initiatives.filter((i) => reviews.some((r) => r.initiativeId === i.id && r.status === "approved")).length;
  const reviewRatio = initiatives.length === 0 ? 1 : approvedInitiatives / initiatives.length;
  const taskDone = tasks.filter((t) => t.status === "completed").length;
  const taskRatio = tasks.length === 0 ? 1 : taskDone / tasks.length;
  const depSatisfied = edges.filter((e) => DONE_INITIATIVE_STATES.has(statusMap.get(e.to) ?? "seeded")).length;
  const depRatio = edges.length === 0 ? 1 : depSatisfied / edges.length;
  const variances = timelines.map((t) => calculateVariance(t).variance).filter((v): v is number => v !== null);
  const timelineVarianceDays = variances.length === 0 ? null : Math.max(...variances);

  const result = evaluateWorkspaceHealth({ reviewCompletion: reviewRatio, taskCompletion: taskRatio, dependencySatisfaction: depRatio, timelineVarianceDays, kpiStatuses: kpis.map((k) => k.status) });

  const snapshot: ProgressSnapshot = progressSnapshotSchema.parse({
    id: ctx.ids("snap"), workspaceId, clientId: workspace.clientId, scope: "workspace", subjectId: workspaceId,
    progress: workspaceProgress, taskCompletion: Math.round(taskRatio * 100), reviewCompletion: Math.round(reviewRatio * 100),
    dependencyCompletion: Math.round(depRatio * 100), milestoneCompletion: pct(milestones.filter((m) => m.status === "completed").length, milestones.length),
    timelineVariance: timelineVarianceDays, health: result.health, at: ctx.clock(),
  });
  unwrap(await exec.progress.append(snapshot));
  unwrap(await exec.activities.append({ id: ctx.ids("act"), at: ctx.clock(), workspaceId, clientId: workspace.clientId, type: "workspace_health_calculated", subjectType: "progress", subjectId: workspaceId, summary: `Workspace health: ${result.health} (${workspaceProgress}% progress).`, commandId: `${snapshot.id}` }));
  return { workspaceId, health: result.health, reasons: result.reasons, workspaceProgress, snapshot: toProgressSnapshotDTO(snapshot) };
}
