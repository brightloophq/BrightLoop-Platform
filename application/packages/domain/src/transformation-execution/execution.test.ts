/* =============================================================================
 * Execution-management domain tests (Phase D · Sprint D3+D4).
 *
 * Review + Task state machines, assignment lifecycle, and the dependency graph's
 * cycle detection — all pure and deterministic.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { Dependency, Review, Task } from "@brightloop/schema";
import { approveReview, canTransitionReview, rejectReview, requestChanges } from "./review.js";
import { assignTaskOwner, canTransitionTask, createTask, transitionTask, unassignTaskOwner, updateTaskFields } from "./task.js";
import { hasCycle, linkDependency, validateDependencyGraph } from "./dependency.js";

const NOW = "2026-07-25T00:00:00.000Z";

function review(status: Review["status"], version = 1): Review {
  return { id: "rev_1", workspaceId: "txw", initiativeId: "init_1", clientId: "cli", status, note: null, decisionActorId: null, version, createdAt: NOW };
}
function task(status: Task["status"], over: Partial<Task> = {}): Task {
  return { id: "task_1", initiativeId: "init_1", workspaceId: "txw", clientId: "cli", title: "T", description: null, status, priority: "medium", estimate: null, assigneeActorId: null, order: 0, dependencyIds: [], version: 1, createdAt: NOW, updatedAt: NOW, ...over };
}
function dep(id: string, from: string, to: string, type: Dependency["type"] = "depends_on"): Dependency {
  return { id, workspaceId: "txw", clientId: "cli", fromInitiativeId: from, toInitiativeId: to, type, createdAt: NOW };
}

/* ---- Review ---------------------------------------------------------------- */
describe("review workflow", () => {
  it("allows only the legal transitions", () => {
    expect(canTransitionReview("pending", "approved")).toBe(true);
    expect(canTransitionReview("pending", "changes_requested")).toBe(true);
    expect(canTransitionReview("pending", "rejected")).toBe(true);
    expect(canTransitionReview("changes_requested", "approved")).toBe(true);
    expect(canTransitionReview("changes_requested", "rejected")).toBe(false);
    expect(canTransitionReview("approved", "rejected")).toBe(false);
    expect(canTransitionReview("rejected", "approved")).toBe(false); // terminal
  });

  it("records a decision with actor, note, and a version bump", () => {
    const out = approveReview(review("pending", 1), "u_admin", "looks good");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.review.status).toBe("approved");
    expect(out.value.review.decisionActorId).toBe("u_admin");
    expect(out.value.review.note).toBe("looks good");
    expect(out.value.review.version).toBe(2);
    expect(out.value.activityType).toBe("review_approved");
  });

  it("changes_requested can later be approved; rejected is terminal", () => {
    const cr = requestChanges(review("pending"), "u1");
    expect(cr.ok && cr.value.review.status).toBe("changes_requested");
    const ap = approveReview(review("changes_requested", 2), "u2");
    expect(ap.ok && ap.value.review.status).toBe("approved");
    expect(rejectReview(review("rejected", 3), "u3").ok).toBe(false);
  });
});

/* ---- Task ------------------------------------------------------------------ */
describe("task engine", () => {
  it("allows only the legal transitions", () => {
    expect(canTransitionTask("todo", "in_progress")).toBe(true);
    expect(canTransitionTask("in_progress", "blocked")).toBe(true);
    expect(canTransitionTask("in_progress", "completed")).toBe(true);
    expect(canTransitionTask("blocked", "in_progress")).toBe(true);
    expect(canTransitionTask("todo", "completed")).toBe(false);
    expect(canTransitionTask("completed", "in_progress")).toBe(false); // terminal
    expect(canTransitionTask("blocked", "completed")).toBe(false);
  });

  it("creates a todo task, patches fields, and transitions with version bumps", () => {
    const t = createTask({ id: "task_1", initiativeId: "init_1", workspaceId: "txw", clientId: "cli", title: "Build", now: NOW });
    expect(t.status).toBe("todo");
    expect(t.version).toBe(1);
    const patched = updateTaskFields(t, { priority: "high", estimate: "2d" }, NOW);
    expect(patched.priority).toBe("high");
    expect(patched.version).toBe(2);
    const started = transitionTask(patched, "in_progress", NOW);
    expect(started.ok && started.value.task.status).toBe("in_progress");
    const done = transitionTask(started.ok ? started.value.task : t, "completed", NOW);
    expect(done.ok && done.value.task.status).toBe("completed");
    expect(done.ok && done.value.activityType).toBe("task_completed");
  });

  it("rejects an illegal task transition", () => {
    expect(transitionTask(task("todo"), "completed", NOW).ok).toBe(false);
  });
});

/* ---- Assignment ------------------------------------------------------------ */
describe("assignment lifecycle", () => {
  it("assign → reassign → unassign, each an immutable history record", () => {
    const a1 = assignTaskOwner(task("todo"), "u_a", "u_mgr", NOW);
    expect(a1.record.action).toBe("assigned");
    expect(a1.task.assigneeActorId).toBe("u_a");
    const a2 = assignTaskOwner(a1.task, "u_b", "u_mgr", NOW);
    expect(a2.record.action).toBe("reassigned");
    expect(a2.task.assigneeActorId).toBe("u_b");
    const a3 = unassignTaskOwner(a2.task, "u_mgr", NOW);
    expect(a3.record.action).toBe("unassigned");
    expect(a3.task.assigneeActorId).toBeNull();
    expect(a3.record.assigneeActorId).toBeNull();
  });
});

/* ---- Dependency graph ------------------------------------------------------ */
describe("dependency graph", () => {
  it("detects a direct cycle", () => {
    expect(hasCycle([{ from: "a", to: "b" }, { from: "b", to: "a" }])).toBe(true);
    expect(hasCycle([{ from: "a", to: "b" }, { from: "b", to: "c" }])).toBe(false);
  });

  it("rejects a link that would introduce a cycle", () => {
    const existing = [dep("d1", "a", "b"), dep("d2", "b", "c")]; // a→b→c
    const cycle = linkDependency(existing, "c", "a", "depends_on"); // c→a closes the loop
    expect(cycle).toEqual({ ok: false, reason: "cycle" });
    const ok = linkDependency(existing, "a", "c", "depends_on"); // a→c is fine (DAG)
    expect(ok.ok).toBe(true);
  });

  it("rejects self and duplicate dependencies", () => {
    expect(linkDependency([], "a", "a", "depends_on")).toEqual({ ok: false, reason: "self_dependency" });
    expect(linkDependency([dep("d1", "a", "b")], "a", "b", "depends_on")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("normalizes `blocks` to the inverse must-precede edge (blocks(a,b) → b→a)", () => {
    // a blocks b  and  b blocks a  → mutual block → cycle.
    const existing = [dep("d1", "a", "b", "blocks")]; // edge b→a
    const cycle = linkDependency(existing, "b", "a", "blocks"); // edge a→b → cycle with b→a
    expect(cycle).toEqual({ ok: false, reason: "cycle" });
  });

  it("validateDependencyGraph flags an existing cyclic set", () => {
    expect(validateDependencyGraph([dep("d1", "a", "b"), dep("d2", "b", "a")])).toEqual({ ok: false, reason: "cycle" });
    expect(validateDependencyGraph([dep("d1", "a", "b")])).toEqual({ ok: true });
  });
});
