/* =============================================================================
 * Execution-management use-cases (Phase D · Sprint D3+D4).
 *
 * Reviews, tasks, assignments, and dependencies. Each: authorize the capability
 * against the loaded aggregate's tenant → run the pure domain service → persist
 * (optimistic concurrency where mutable) → append the append-only activity →
 * return a DTO. Transitions/decisions are idempotent (commandId-keyed activity)
 * and reject illegal moves with a 409. No provider, no network.
 * ========================================================================== */

import {
  assignTaskOwner,
  createTask as buildTask,
  decideReview,
  describeReviewDecision,
  linkDependency as validateLink,
  transitionTask,
  unassignTaskOwner,
  updateTaskFields,
  type ReviewDecision,
} from "@brightloop/domain";
import {
  assignmentSchema,
  dependencySchema,
  reviewSchema,
  taskSchema,
  type ActivitySubjectType,
  type Dependency,
  type DependencyType,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TransformationActivityType,
} from "@brightloop/schema";
import {
  authorize,
  requireExecution,
  ASSIGNMENT_WRITE_CAP,
  DEPENDENCY_WRITE_CAP,
  REVIEW_WRITE_CAP,
  TASK_WRITE_CAP,
  type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toDependencyDTO, toReviewDTO, toTaskDTO, type DependencyDTO, type ReviewDTO, type TaskDTO } from "./dto.js";

type Exec = ReturnType<typeof requireExecution>;

/** Append one append-only activity (id/at supplied here; idempotent on commandId). */
async function appendActivity(
  ctx: AppContext,
  exec: Exec,
  a: { workspaceId: string; clientId: string | null; type: TransformationActivityType; subjectType: ActivitySubjectType; subjectId: string; summary: string; commandId: string },
): Promise<void> {
  unwrap(await exec.activities.append({ id: ctx.ids("act"), at: ctx.clock(), ...a }));
}

/* ---- Reviews (D3) ---------------------------------------------------------- */

/** Open a pending review for an initiative (supporting use-case for the workflow). */
export async function openReview(ctx: AppContext, rawInitiativeId: unknown): Promise<ReviewDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, REVIEW_WRITE_CAP, initiative.clientId);

  const review = reviewSchema.parse({
    id: ctx.ids("rev"),
    workspaceId: initiative.workspaceId,
    initiativeId,
    clientId: initiative.clientId,
    status: "pending",
    note: null,
    decisionActorId: null,
    version: 1,
    createdAt: ctx.clock(),
  });
  unwrap(await exec.reviews.create(review));
  return toReviewDTO(review);
}

async function decide(ctx: AppContext, rawReviewId: unknown, to: ReviewDecision, note: string | null): Promise<ReviewDTO> {
  const id = requireId(rawReviewId, "reviewId");
  const exec = requireExecution(ctx);
  const review = unwrap(await exec.reviews.getById(id));
  if (review === null) throw new NotFoundError("review");
  authorize(ctx.actor, REVIEW_WRITE_CAP, review.clientId);

  const commandId = `${id}:${to}`;
  if (review.status === to) {
    const d = describeReviewDecision(to);
    await appendActivity(ctx, exec, { workspaceId: review.workspaceId, clientId: review.clientId, type: d.activityType, subjectType: "review", subjectId: id, summary: `Review ${to}.`, commandId });
    return toReviewDTO(review);
  }
  const outcome = decideReview(review, to, ctx.actor.userId, note);
  if (!outcome.ok) throw new ConflictError(`Cannot ${to} a review that is ${review.status}`);
  const saved = await exec.reviews.save(outcome.value.review, review.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The review changed concurrently; reload and retry");
    unwrap(saved);
  }
  await appendActivity(ctx, exec, { workspaceId: review.workspaceId, clientId: review.clientId, type: outcome.value.activityType, subjectType: "review", subjectId: id, summary: outcome.value.summary, commandId });
  return toReviewDTO(unwrap(saved));
}

export const approveReview = (ctx: AppContext, reviewId: unknown, note: string | null = null): Promise<ReviewDTO> => decide(ctx, reviewId, "approved", note);
export const requestChanges = (ctx: AppContext, reviewId: unknown, note: string | null = null): Promise<ReviewDTO> => decide(ctx, reviewId, "changes_requested", note);
export const rejectReview = (ctx: AppContext, reviewId: unknown, note: string | null = null): Promise<ReviewDTO> => decide(ctx, reviewId, "rejected", note);

/* ---- Tasks (D4) ------------------------------------------------------------ */

export interface CreateTaskFields {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  estimate?: string | null;
  order?: number;
  dependencyIds?: readonly string[];
}

export async function createTask(ctx: AppContext, rawInitiativeId: unknown, fields: CreateTaskFields): Promise<TaskDTO> {
  const initiativeId = requireId(rawInitiativeId, "initiativeId");
  const exec = requireExecution(ctx);
  const initiative = unwrap(await exec.initiatives.getById(initiativeId));
  if (initiative === null) throw new NotFoundError("initiative");
  authorize(ctx.actor, TASK_WRITE_CAP, initiative.clientId);

  const task = taskSchema.parse(
    buildTask({ id: ctx.ids("task"), initiativeId, workspaceId: initiative.workspaceId, clientId: initiative.clientId, now: ctx.clock(), ...fields }),
  );
  unwrap(await exec.tasks.create(task));
  await appendActivity(ctx, exec, { workspaceId: task.workspaceId, clientId: task.clientId, type: "task_created", subjectType: "task", subjectId: task.id, summary: `Task "${task.title}" created.`, commandId: `${task.id}:created` });
  return toTaskDTO(task);
}

async function loadTaskForWrite(ctx: AppContext, exec: Exec, rawTaskId: unknown, cap: string): Promise<Task> {
  const id = requireId(rawTaskId, "taskId");
  const task = unwrap(await exec.tasks.getById(id));
  if (task === null) throw new NotFoundError("task");
  authorize(ctx.actor, cap, task.clientId);
  return task;
}

/** Field patch (no status change) → task_updated. */
export async function updateTask(ctx: AppContext, rawTaskId: unknown, patch: { title?: string; description?: string | null; priority?: TaskPriority; estimate?: string | null; order?: number; dependencyIds?: readonly string[] }): Promise<TaskDTO> {
  const exec = requireExecution(ctx);
  const task = await loadTaskForWrite(ctx, exec, rawTaskId, TASK_WRITE_CAP);
  const next = updateTaskFields(task, patch, ctx.clock());
  const saved = await exec.tasks.save(next, task.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The task changed concurrently; reload and retry");
    unwrap(saved);
  }
  await appendActivity(ctx, exec, { workspaceId: task.workspaceId, clientId: task.clientId, type: "task_updated", subjectType: "task", subjectId: task.id, summary: `Task "${task.title}" updated.`, commandId: `${task.id}:updated:${next.version}` });
  return toTaskDTO(unwrap(saved));
}

async function taskTransition(ctx: AppContext, rawTaskId: unknown, to: TaskStatus): Promise<TaskDTO> {
  const exec = requireExecution(ctx);
  const task = await loadTaskForWrite(ctx, exec, rawTaskId, TASK_WRITE_CAP);
  const commandId = `${task.id}:${to}`;
  if (task.status === to) return toTaskDTO(task); // idempotent
  const outcome = transitionTask(task, to, ctx.clock());
  if (!outcome.ok) throw new ConflictError(`Cannot move a task from ${task.status} to ${to}`);
  const saved = await exec.tasks.save(outcome.value.task, task.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The task changed concurrently; reload and retry");
    unwrap(saved);
  }
  await appendActivity(ctx, exec, { workspaceId: task.workspaceId, clientId: task.clientId, type: outcome.value.activityType, subjectType: "task", subjectId: task.id, summary: outcome.value.summary, commandId });
  return toTaskDTO(unwrap(saved));
}

export const startTask = (ctx: AppContext, taskId: unknown): Promise<TaskDTO> => taskTransition(ctx, taskId, "in_progress");
export const completeTask = (ctx: AppContext, taskId: unknown): Promise<TaskDTO> => taskTransition(ctx, taskId, "completed");
export const blockTask = (ctx: AppContext, taskId: unknown): Promise<TaskDTO> => taskTransition(ctx, taskId, "blocked");

/* ---- Assignment (D4) ------------------------------------------------------- */

async function setAssignee(ctx: AppContext, rawTaskId: unknown, assigneeActorId: string | null): Promise<TaskDTO> {
  const exec = requireExecution(ctx);
  const task = await loadTaskForWrite(ctx, exec, rawTaskId, ASSIGNMENT_WRITE_CAP);
  const change = assigneeActorId === null ? unassignTaskOwner(task, ctx.actor.userId, ctx.clock()) : assignTaskOwner(task, assigneeActorId, ctx.actor.userId, ctx.clock());
  const saved = await exec.tasks.save(change.task, task.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The task changed concurrently; reload and retry");
    unwrap(saved);
  }
  unwrap(await exec.assignments.append(assignmentSchema.parse({ id: ctx.ids("asg"), ...change.record })));
  await appendActivity(ctx, exec, { workspaceId: task.workspaceId, clientId: task.clientId, type: change.activityType, subjectType: "task", subjectId: task.id, summary: `Task "${task.title}" ${change.record.action}.`, commandId: `${task.id}:${change.record.action}:${change.task.version}` });
  return toTaskDTO(unwrap(saved));
}

export const assignTask = (ctx: AppContext, taskId: unknown, assigneeActorId: string): Promise<TaskDTO> => setAssignee(ctx, taskId, assigneeActorId);
export const reassignTask = (ctx: AppContext, taskId: unknown, assigneeActorId: string): Promise<TaskDTO> => setAssignee(ctx, taskId, assigneeActorId);
export const removeTaskAssignment = (ctx: AppContext, taskId: unknown): Promise<TaskDTO> => setAssignee(ctx, taskId, null);

/* ---- Dependencies (D3) ----------------------------------------------------- */

export async function linkDependency(ctx: AppContext, rawWorkspaceId: unknown, fromInitiativeId: unknown, toInitiativeId: unknown, type: DependencyType): Promise<DependencyDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const from = requireId(fromInitiativeId, "fromInitiativeId");
  const to = requireId(toInitiativeId, "toInitiativeId");
  const exec = requireExecution(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, DEPENDENCY_WRITE_CAP, workspace.clientId);

  const existing = unwrap(await exec.dependencies.listByWorkspace(workspaceId));
  const check = validateLink(existing, from, to, type);
  if (!check.ok) throw new ConflictError(`Dependency rejected: ${check.reason}`);

  const dependency: Dependency = dependencySchema.parse({ id: ctx.ids("dep"), workspaceId, clientId: workspace.clientId, fromInitiativeId: from, toInitiativeId: to, type, createdAt: ctx.clock() });
  unwrap(await exec.dependencies.create(dependency));
  await appendActivity(ctx, exec, { workspaceId, clientId: workspace.clientId, type: "dependency_linked", subjectType: "dependency", subjectId: dependency.id, summary: `Dependency ${type} linked: ${from} → ${to}.`, commandId: `${dependency.id}:linked` });
  return toDependencyDTO(dependency);
}

export async function unlinkDependency(ctx: AppContext, rawDependencyId: unknown): Promise<{ ok: true; id: string }> {
  const id = requireId(rawDependencyId, "dependencyId");
  const exec = requireExecution(ctx);
  const dependency = unwrap(await exec.dependencies.getById(id));
  if (dependency === null) throw new NotFoundError("dependency");
  authorize(ctx.actor, DEPENDENCY_WRITE_CAP, dependency.clientId);
  unwrap(await exec.dependencies.remove(id));
  await appendActivity(ctx, exec, { workspaceId: dependency.workspaceId, clientId: dependency.clientId, type: "dependency_removed", subjectType: "dependency", subjectId: id, summary: `Dependency removed: ${dependency.fromInitiativeId} → ${dependency.toInitiativeId}.`, commandId: `${id}:removed` });
  return { ok: true, id };
}
