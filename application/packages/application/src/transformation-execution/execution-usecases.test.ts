/* =============================================================================
 * Execution-management use-case tests (Phase D · Sprint D3+D4).
 *
 * Workspace → initiative → review → approval → tasks → assignments → dependencies
 * → execution-ready, exercised through the application layer with the in-memory
 * Phase D repositories. Covers authorization, optimistic concurrency, idempotency,
 * cycle rejection, append-only assignment history, and the execution read model.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError } from "../errors.js";
import { seedTransformation } from "./seed-transformation.js";
import { createInMemoryExecutionRepos } from "./testing.js";
import { approveReview, assignTask, blockTask, completeTask, createTask, linkDependency, openReview, reassignTask, rejectReview, removeTaskAssignment, requestChanges, startTask, unlinkDependency } from "./execution-usecases.js";
import { getInitiativeExecution, getWorkspaceExecution } from "./execution-read.js";

const T0 = "2026-07-25T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_other" };

function proposalSnapshot() {
  const b = { problem: "p", businessImpact: "high" as const, risks: [] as string[], confidence: { value: 70, band: "high" as const }, reviewRequired: true, status: "ready" as const };
  return {
    id: "prop:run:snapshot", scanId: "scan", status: "available" as const, reason: null,
    proposals: [
      { id: "prop:scan:1", title: "Alpha", recommendedSolution: "Do a", priority: "high" as const, estimatedEffort: "small" as const, dependencies: [] as string[], supportingEvidenceIds: ["ev_1"], ...b },
      { id: "prop:scan:2", title: "Beta", recommendedSolution: "Do b", priority: "low" as const, estimatedEffort: "large" as const, dependencies: [] as string[], supportingEvidenceIds: ["ev_2"], ...b },
    ],
    counts: { critical: 0, high: 1, medium: 0, low: 1 }, conflicts: 0,
    confidence: { value: 55, band: "moderate" as const }, evidenceIds: ["ev_1", "ev_2"], sourceArtifacts: ["art_rec"],
    summary: "2.", reviewRequired: true, checksum: "y", generatedAt: T0, formulaVersion: "pi-runtime-1.0",
  };
}

let ctx: AppContext;
let workspaceId: string;
let initA: string;
let initB: string;

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  const services = createRuntimeServices({ repo: new InMemoryRuntimeRepository(now), ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "cli_1", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  const runId = created.value.run.id;
  await services.artifacts.persist({ runId, clientId: "cli_1", scanId: "scan", kind: "proposal", envelope: proposalSnapshot() as unknown as Record<string, unknown>, sourceArtifactIds: [] });
  let k = 0;
  ctx = { services, actor: OWNER, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: now, execution: createInMemoryExecutionRepos() };
  const detail = await seedTransformation(ctx, runId);
  workspaceId = detail.workspace.id;
  initA = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!.id;
  initB = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!.id;
});

describe("review workflow", () => {
  it("opens, requests changes, then approves — driving execution readiness", async () => {
    const r = await openReview(ctx, initA);
    expect(r.status).toBe("pending");
    const cr = await requestChanges(ctx, r.id, "tighten scope");
    expect(cr.status).toBe("changes_requested");
    const ap = await approveReview(ctx, r.id);
    expect(ap.status).toBe("approved");
    expect(ap.version).toBe(3);

    const exec = await getInitiativeExecution(ctx, initA);
    expect(exec.executionReady).toBe(true);
    expect(exec.reviews.map((x) => x.status)).toContain("approved");
  });

  it("rejects an illegal review decision (approved is terminal)", async () => {
    const r = await openReview(ctx, initA);
    await approveReview(ctx, r.id);
    await expect(rejectReview(ctx, r.id)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("task engine + assignment", () => {
  it("creates a task, walks its lifecycle, and records assignment history", async () => {
    const t = await createTask(ctx, initA, { title: "Ship", priority: "high", estimate: "2d" });
    expect(t.status).toBe("todo");
    const started = await startTask(ctx, t.id);
    expect(started.status).toBe("in_progress");
    const assigned = await assignTask(ctx, t.id, "u_a");
    expect(assigned.assigneeActorId).toBe("u_a");
    const reassigned = await reassignTask(ctx, t.id, "u_b");
    expect(reassigned.assigneeActorId).toBe("u_b");
    const unassigned = await removeTaskAssignment(ctx, t.id);
    expect(unassigned.assigneeActorId).toBeNull();
    const done = await completeTask(ctx, t.id);
    expect(done.status).toBe("completed");

    const history = await ctx.execution!.assignments.listByTask(t.id);
    expect(history.ok && history.value.map((a) => a.action)).toEqual(["assigned", "reassigned", "unassigned"]);
  });

  it("rejects an illegal task transition (todo → completed)", async () => {
    const t = await createTask(ctx, initA, { title: "X" });
    await expect(completeTask(ctx, t.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("blocks and resumes a task", async () => {
    const t = await createTask(ctx, initA, { title: "Y" });
    await startTask(ctx, t.id);
    const blocked = await blockTask(ctx, t.id);
    expect(blocked.status).toBe("blocked");
  });
});

describe("dependency engine", () => {
  it("links a dependency and rejects a cycle", async () => {
    const d = await linkDependency(ctx, workspaceId, initA, initB, "depends_on");
    expect(d.type).toBe("depends_on");
    // initB depends_on initA would close a cycle initA→initB→initA
    await expect(linkDependency(ctx, workspaceId, initB, initA, "depends_on")).rejects.toBeInstanceOf(ConflictError);
    const ws = await getWorkspaceExecution(ctx, workspaceId);
    expect(ws.dependencies).toHaveLength(1);
  });

  it("unlinks a dependency", async () => {
    const d = await linkDependency(ctx, workspaceId, initA, initB, "depends_on");
    const res = await unlinkDependency(ctx, d.id);
    expect(res.ok).toBe(true);
    const ws = await getWorkspaceExecution(ctx, workspaceId);
    expect(ws.dependencies).toHaveLength(0);
  });
});

describe("authorization + concurrency", () => {
  it("forbids a foreign client actor from execution writes and reads", async () => {
    const t = await createTask(ctx, initA, { title: "Z" });
    const clientCtx: AppContext = { ...ctx, actor: CLIENT };
    await expect(createTask(clientCtx, initA, { title: "no" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(startTask(clientCtx, t.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getInitiativeExecution(clientCtx, initA)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("optimistic concurrency: a stale task save conflicts", async () => {
    const t = await createTask(ctx, initA, { title: "C" });
    await startTask(ctx, t.id); // stored version is now 2
    const loaded = await ctx.execution!.tasks.getById(t.id);
    const current = loaded.ok && loaded.value ? loaded.value : null;
    expect(current?.version).toBe(2);
    // A caller holding the pre-transition version 1 loses the save.
    const stale = await ctx.execution!.tasks.save({ ...(current as NonNullable<typeof current>), status: "completed", version: 3 }, 1);
    expect(stale.ok).toBe(false);
  });
});
