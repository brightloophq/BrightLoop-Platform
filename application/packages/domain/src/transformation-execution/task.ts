/* =============================================================================
 * Task engine + Assignment — STATE MACHINE + pure services (Phase D · Sprint D4).
 *
 * A task belongs to one initiative and moves:
 *   todo → in_progress → completed
 *   in_progress ↔ blocked
 * `completed` is terminal. Assignment tracks the current owner on the task and
 * emits an immutable Assignment history record (assigned / reassigned /
 * unassigned). All services are PURE — they validate and return the next
 * aggregate + descriptors; they never write.
 * ========================================================================== */

import type { Assignment, AssignmentAction, Task, TaskPriority, TaskStatus, TransformationActivityType } from "@brightloop/schema";
import type { TransformationWorkspaceEventName } from "./events.js";

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress"],
  in_progress: ["blocked", "completed"],
  blocked: ["in_progress"],
  completed: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export interface TaskTransition {
  task: Task;
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  summary: string;
}
export type TaskTransitionOutcome = { ok: true; value: TaskTransition } | { ok: false; reason: "illegal_transition" };

/** Descriptor per task target status (no dedicated "started" event — it is a generic update). */
const TASK_DESCRIPTOR: Record<TaskStatus, { event: TransformationWorkspaceEventName; activityType: TransformationActivityType; verb: string }> = {
  todo: { event: "task.updated", activityType: "task_updated", verb: "reopened" },
  in_progress: { event: "task.updated", activityType: "task_updated", verb: "started" },
  blocked: { event: "task.blocked", activityType: "task_blocked", verb: "blocked" },
  completed: { event: "task.completed", activityType: "task_completed", verb: "completed" },
};

/** A pure task status transition. `now` stamps `updatedAt`; version is bumped. */
export function transitionTask(task: Task, to: TaskStatus, now: string): TaskTransitionOutcome {
  if (!canTransitionTask(task.status, to)) return { ok: false, reason: "illegal_transition" };
  const d = TASK_DESCRIPTOR[to];
  return {
    ok: true,
    value: {
      task: { ...task, status: to, version: task.version + 1, updatedAt: now },
      event: d.event,
      activityType: d.activityType,
      summary: `Task "${task.title}" ${d.verb}.`.slice(0, 400),
    },
  };
}

export interface CreateTaskInput {
  id: string;
  initiativeId: string;
  workspaceId: string;
  clientId: string | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  estimate?: string | null;
  order?: number;
  dependencyIds?: readonly string[];
  now: string;
}

/** Build a new task in `todo` (pure). */
export function createTask(input: CreateTaskInput): Task {
  return {
    id: input.id,
    initiativeId: input.initiativeId,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    title: input.title.slice(0, 200),
    description: input.description ?? null,
    status: "todo",
    priority: input.priority ?? "medium",
    estimate: input.estimate ?? null,
    assigneeActorId: null,
    order: input.order ?? 0,
    dependencyIds: [...new Set(input.dependencyIds ?? [])],
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export interface TaskFieldPatch {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  estimate?: string | null;
  order?: number;
  dependencyIds?: readonly string[];
}

/** Apply a field patch (no status change) — version bumped, `updatedAt` stamped. */
export function updateTaskFields(task: Task, patch: TaskFieldPatch, now: string): Task {
  return {
    ...task,
    title: patch.title !== undefined ? patch.title.slice(0, 200) : task.title,
    description: patch.description !== undefined ? patch.description : task.description,
    priority: patch.priority ?? task.priority,
    estimate: patch.estimate !== undefined ? patch.estimate : task.estimate,
    order: patch.order ?? task.order,
    dependencyIds: patch.dependencyIds !== undefined ? [...new Set(patch.dependencyIds)] : task.dependencyIds,
    version: task.version + 1,
    updatedAt: now,
  };
}

/* ---- Assignment (immutable history) --------------------------------------- */

export interface AssignmentChange {
  task: Task;
  /** The immutable history record to append (id/at supplied by the caller). */
  record: Omit<Assignment, "id">;
  activityType: TransformationActivityType;
  event: TransformationWorkspaceEventName;
}

const ASSIGN_ACTIVITY: Record<AssignmentAction, { activityType: TransformationActivityType; event: TransformationWorkspaceEventName }> = {
  assigned: { activityType: "task_assigned", event: "task.assigned" },
  reassigned: { activityType: "task_reassigned", event: "task.reassigned" },
  unassigned: { activityType: "task_unassigned", event: "task.unassigned" },
};

/**
 * Set a task's owner. `assigned` when previously unassigned, else `reassigned`.
 * Returns the next task + the immutable assignment record (pure).
 */
export function assignTaskOwner(task: Task, assigneeActorId: string, byActorId: string, now: string): AssignmentChange {
  const action: AssignmentAction = task.assigneeActorId === null ? "assigned" : "reassigned";
  const d = ASSIGN_ACTIVITY[action];
  return {
    task: { ...task, assigneeActorId, version: task.version + 1, updatedAt: now },
    record: { taskId: task.id, workspaceId: task.workspaceId, clientId: task.clientId, action, assigneeActorId, assignedByActorId: byActorId, at: now },
    activityType: d.activityType,
    event: d.event,
  };
}

/** Remove a task's owner, appending an immutable `unassigned` record. */
export function unassignTaskOwner(task: Task, byActorId: string, now: string): AssignmentChange {
  const d = ASSIGN_ACTIVITY.unassigned;
  return {
    task: { ...task, assigneeActorId: null, version: task.version + 1, updatedAt: now },
    record: { taskId: task.id, workspaceId: task.workspaceId, clientId: task.clientId, action: "unassigned", assigneeActorId: null, assignedByActorId: byActorId, at: now },
    activityType: d.activityType,
    event: d.event,
  };
}
