/* =============================================================================
 * Phase D end-to-end certification flows (D8).
 *
 * FLOW A — successful execution → 100% progress + healthy signals + activity/inbox.
 * FLOW B — blocked execution → progress reflects the blocker, health degrades.
 * FLOW C — unauthorized client → every Phase D operation denied, no mutation.
 * FLOW D — optimistic concurrency → one writer wins, the stale writer conflicts.
 * FLOW E — idempotency / append-only classification.
 * Tenant isolation is proven throughout (a foreign-tenant client is denied).
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError, ConflictError } from "../errors.js";
import { unwrap as unwrapResult } from "../runtime-result.js";
import { seedTransformation } from "../transformation-execution/seed-transformation.js";
import { createInMemoryExecutionRepos } from "../transformation-execution/testing.js";
import { approveReview, blockTask, completeTask, createTask, linkDependency, openReview, startTask } from "../transformation-execution/execution-usecases.js";
import { getWorkspaceExecution } from "../transformation-execution/execution-read.js";
import { completeMilestone, completeTimeline, createKpi, createMilestone, createTimeline, startTimeline } from "../transformation-execution/planning-usecases.js";
import { calculateProgress, calculateWorkspaceHealth } from "../transformation-execution/performance-usecases.js";
import { getWorkspacePerformance } from "../transformation-execution/performance-read.js";
import { createInMemoryCollaborationRepos } from "../collaboration/testing.js";
import { createMention, markRead, subscribe } from "../collaboration/collaboration-usecases.js";
import { listFeed, listInbox } from "../collaboration/collaboration-read.js";

const T0 = "2026-07-26T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TWO: Actor = { userId: "u_two", role: "team_member", clientId: null };
const FOREIGN_CLIENT: Actor = { userId: "u_c", role: "client_admin", clientId: "cli_other" };
const SAME_TENANT_CLIENT: Actor = { userId: "u_c1", role: "client_admin", clientId: "cli_1" };

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
let exec: ReturnType<typeof createInMemoryExecutionRepos>;
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
  exec = createInMemoryExecutionRepos();
  ctx = { services, actor: OWNER, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: now, execution: exec, collaboration: createInMemoryCollaborationRepos() };
  const detail = await seedTransformation(ctx, runId);
  workspaceId = detail.workspace.id;
  initA = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!.id;
  initB = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!.id;
});

const as = (actor: Actor): AppContext => ({ ...ctx, actor });

describe("FLOW A — successful execution", () => {
  it("drives an initiative to 100% progress with a coherent activity/inbox trail", async () => {
    const review = await openReview(ctx, initA);
    await approveReview(ctx, review.id);
    // Target end on/after the fixed clock (T0) so completion is on-time, not late.
    const tl = await createTimeline(ctx, initA, { startDate: "2026-07-25", targetEndDate: "2026-07-27" });
    await startTimeline(ctx, tl.id);
    await completeTimeline(ctx, tl.id);
    const ms = await createMilestone(ctx, initA, { title: "Launch", plannedDate: "2026-07-05" });
    await completeMilestone(ctx, ms.id);
    const t1 = await createTask(ctx, initA, { title: "T1" });
    await startTask(ctx, t1.id);
    await completeTask(ctx, t1.id);
    const kpi = await createKpi(ctx, workspaceId, { name: "Conversions", target: 100, current: 100 });
    expect(kpi.status).toBe("on_track");

    const progress = await calculateProgress(ctx, initA);
    expect(progress.progress).toBe(100);

    const health = await calculateWorkspaceHealth(ctx, workspaceId);
    // On-time timeline + full task/dependency completion + on-track KPI ⇒ no critical signal.
    expect(["healthy", "warning"]).toContain(health.health);

    // collaboration trail
    await subscribe(as(TWO), workspaceId, "initiative", initA);
    await createMention(ctx, workspaceId, "initiative", initA, "shipped @two", ["u_two"]);
    const inbox = await listInbox(as(TWO));
    expect(inbox.unread).toBeGreaterThanOrEqual(1);
    const item = inbox.items[0]!;
    expect((await markRead(as(TWO), item.id)).status).toBe("read");

    const feed = await listFeed(ctx, workspaceId, { limit: 100 });
    const types = feed.items.map((f) => f.type);
    expect(types).toContain("review_approved");
    expect(types).toContain("timeline_completed");
    expect(types).toContain("progress_calculated");
    // append-only history: no duplicate progress_calculated for a single calculate call
    expect(types.filter((t) => t === "progress_calculated")).toHaveLength(1);
  });
});

describe("FLOW B — blocked execution", () => {
  it("reflects an unsatisfied dependency + blocked task in progress and health", async () => {
    // initA depends on initB; initB never completes → dependency unsatisfied.
    await linkDependency(ctx, workspaceId, initA, initB, "depends_on");
    const review = await openReview(ctx, initA);
    await approveReview(ctx, review.id);
    const t1 = await createTask(ctx, initA, { title: "T1" });
    await startTask(ctx, t1.id);
    await blockTask(ctx, t1.id);

    const progress = await calculateProgress(ctx, initA);
    expect(progress.dependencyCompletion).toBe(0); // blocked by initB
    expect(progress.taskCompletion).toBe(0); // task is blocked, not completed
    expect(progress.progress).toBeLessThan(100);

    const health = await calculateWorkspaceHealth(ctx, workspaceId);
    expect(["warning", "critical"]).toContain(health.health);
    expect(health.reasons.length).toBeGreaterThan(0);
  });
});

describe("FLOW C — unauthorized client (tenant isolation)", () => {
  it("denies every Phase D operation to a foreign-tenant client, with no mutation", async () => {
    const client = as(FOREIGN_CLIENT);
    const before = unwrapResult(await exec.activities.listByWorkspace(workspaceId)).length;
    await expect(getWorkspaceExecution(client, workspaceId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getWorkspacePerformance(client, workspaceId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTask(client, initA, { title: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createKpi(client, workspaceId, { name: "x", target: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(calculateWorkspaceHealth(client, workspaceId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(subscribe(client, workspaceId, "initiative", initA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listInbox(client)).rejects.toBeInstanceOf(ForbiddenError);
    const after = unwrapResult(await exec.activities.listByWorkspace(workspaceId)).length;
    expect(after).toBe(before); // no activity appended by denied ops
  });

  it("denies a SAME-tenant client too (Phase D is internal-only, not client-scoped)", async () => {
    const client = as(SAME_TENANT_CLIENT);
    await expect(getWorkspaceExecution(client, workspaceId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createKpi(client, workspaceId, { name: "y", target: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("FLOW D — optimistic concurrency", () => {
  it("rejects a stale-version write across every versioned aggregate", async () => {
    // Seed one of each versioned aggregate, then attempt two writes at the same expected version.
    const review = await openReview(ctx, initA);
    const t1 = await createTask(ctx, initA, { title: "T1" });
    const tl = await createTimeline(ctx, initA, { startDate: "2026-07-01", targetEndDate: "2026-07-11" });
    const ms = await createMilestone(ctx, initA, { title: "M", plannedDate: "2026-07-05" });
    const kpi = await createKpi(ctx, workspaceId, { name: "K", target: 100 });

    // review v1 → v2 wins; second save at v1 conflicts
    const rev = unwrapResult(await exec.reviews.getById(review.id))!;
    expect((await exec.reviews.save({ ...rev, version: rev.version + 1 }, rev.version)).ok).toBe(true);
    expect((await exec.reviews.save({ ...rev, version: rev.version + 1 }, rev.version)).ok).toBe(false);

    const task = unwrapResult(await exec.tasks.getById(t1.id))!;
    expect((await exec.tasks.save({ ...task, version: task.version + 1 }, task.version)).ok).toBe(true);
    const staleTask = await exec.tasks.save({ ...task, version: task.version + 1 }, task.version);
    expect(staleTask.ok === false && staleTask.code).toBe("conflict");

    const timeline = unwrapResult(await exec.timelines.getById(tl.id))!;
    expect((await exec.timelines.save({ ...timeline, version: timeline.version + 1 }, timeline.version)).ok).toBe(true);
    expect((await exec.timelines.save({ ...timeline, version: timeline.version + 1 }, timeline.version)).ok).toBe(false);

    const milestone = unwrapResult(await exec.milestones.getById(ms.id))!;
    expect((await exec.milestones.save({ ...milestone, version: milestone.version + 1 }, milestone.version)).ok).toBe(true);
    expect((await exec.milestones.save({ ...milestone, version: milestone.version + 1 }, milestone.version)).ok).toBe(false);

    const k = unwrapResult(await exec.kpis.getById(kpi.id))!;
    expect((await exec.kpis.save({ ...k, version: k.version + 1 }, k.version)).ok).toBe(true);
    expect((await exec.kpis.save({ ...k, version: k.version + 1 }, k.version)).ok).toBe(false);
  });
});

describe("FLOW E — idempotency & append-only classification", () => {
  it("exact-target retries are idempotent; append-only calcs intentionally append", async () => {
    const review = await openReview(ctx, initA);
    // duplicate approve (exact target) → idempotent, no error
    await approveReview(ctx, review.id);
    await approveReview(ctx, review.id);

    // duplicate subscribe → deterministic conflict (dedup)
    await subscribe(as(TWO), workspaceId, "initiative", initA);
    await expect(subscribe(as(TWO), workspaceId, "initiative", initA)).rejects.toBeInstanceOf(ConflictError);

    // repeated progress calculation → append-only: two snapshots (history), both valid
    await calculateProgress(ctx, initA);
    await calculateProgress(ctx, initA);
    const snaps = unwrapResult(await ctx.execution!.progress.listBySubject(initA));
    expect(snaps.length).toBe(2);
    expect(snaps.every((s) => s.progress >= 0 && s.progress <= 100)).toBe(true);
  });
});
