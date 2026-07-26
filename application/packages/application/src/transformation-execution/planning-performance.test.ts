/* =============================================================================
 * Planning & Performance use-case tests (Phase D · Sprint D5+D6).
 *
 * Timelines, milestones, KPIs, DERIVED progress + workspace health, and their read
 * models — exercised through the application layer with the in-memory Phase D
 * repositories. Covers authorization, validation (negative duration, duplicate
 * timeline / milestone order / KPI name, milestone-after-cancelled-timeline),
 * append-only snapshots, and the fully-satisfied progress rollup.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type Actor } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError, ValidationError } from "../errors.js";
import { seedTransformation } from "./seed-transformation.js";
import { createInMemoryExecutionRepos } from "./testing.js";
import { approveReview, completeTask, createTask, openReview, startTask } from "./execution-usecases.js";
import { cancelTimeline, completeMilestone, completeTimeline, createKpi, createMilestone, createTimeline, missMilestone, startTimeline, updateKpi } from "./planning-usecases.js";
import { calculateProgress, calculateWorkspaceHealth } from "./performance-usecases.js";
import { getInitiativePerformance, getWorkspacePerformance } from "./performance-read.js";

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

describe("timeline lifecycle", () => {
  it("creates → starts → completes and derives variance", async () => {
    const tl = await createTimeline(ctx, initA, { startDate: "2026-07-01", targetEndDate: "2026-07-11" });
    expect(tl.status).toBe("planned");
    expect(tl.plannedDuration).toBe(10);
    expect(tl.variance).toBeNull();
    const started = await startTimeline(ctx, tl.id);
    expect(started.status).toBe("active");
    const done = await completeTimeline(ctx, tl.id);
    expect(done.status).toBe("completed");
    expect(done.actualEndDate).toBe(T0);
    expect(done.variance).toBe(14); // 2026-07-01 → 2026-07-25 is 24 days vs 10 planned
  });

  it("rejects a negative planned duration and a duplicate timeline", async () => {
    await expect(createTimeline(ctx, initA, { startDate: "2026-07-11", targetEndDate: "2026-07-01" })).rejects.toBeInstanceOf(ValidationError);
    await createTimeline(ctx, initA, { startDate: "2026-07-01", targetEndDate: "2026-07-11" });
    await expect(createTimeline(ctx, initA, { startDate: "2026-07-01", targetEndDate: "2026-07-11" })).rejects.toBeInstanceOf(ConflictError);
  });

  it("denies a client actor", async () => {
    const clientCtx = { ...ctx, actor: CLIENT };
    await expect(createTimeline(clientCtx, initA, { startDate: "2026-07-01", targetEndDate: "2026-07-11" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("milestones", () => {
  it("creates ordered milestones, completes and misses them", async () => {
    const m0 = await createMilestone(ctx, initA, { title: "Kickoff", plannedDate: "2026-07-03" });
    const m1 = await createMilestone(ctx, initA, { title: "Launch", plannedDate: "2026-07-09" });
    expect(m0.order).toBe(0);
    expect(m1.order).toBe(1);
    const done = await completeMilestone(ctx, m0.id);
    expect(done.status).toBe("completed");
    expect(done.completedDate).toBe(T0);
    const missed = await missMilestone(ctx, m1.id);
    expect(missed.status).toBe("missed");
  });

  it("rejects a duplicate order and a milestone on a cancelled timeline", async () => {
    await createMilestone(ctx, initA, { title: "A", plannedDate: "2026-07-03", order: 0 });
    await expect(createMilestone(ctx, initA, { title: "B", plannedDate: "2026-07-04", order: 0 })).rejects.toBeInstanceOf(ConflictError);
    const tl = await createTimeline(ctx, initB, { startDate: "2026-07-01", targetEndDate: "2026-07-11" });
    await cancelTimeline(ctx, tl.id);
    await expect(createMilestone(ctx, initB, { title: "C", plannedDate: "2026-07-05" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("KPIs", () => {
  it("creates with a derived status, updates it, and rejects duplicate names", async () => {
    const k = await createKpi(ctx, workspaceId, { name: "Conversions", target: 100, current: 40, unit: "count" });
    expect(k.status).toBe("off_track");
    const up = await updateKpi(ctx, k.id, 95);
    expect(up.status).toBe("at_risk");
    expect(up.current).toBe(95);
    await expect(createKpi(ctx, workspaceId, { name: "conversions", target: 10 })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("derived progress", () => {
  it("is 100% when review + tasks + milestones + timeline are all done", async () => {
    const review = await openReview(ctx, initA);
    await approveReview(ctx, review.id);
    const t1 = await createTask(ctx, initA, { title: "T1" });
    await startTask(ctx, t1.id);
    await completeTask(ctx, t1.id);
    const m = await createMilestone(ctx, initA, { title: "M", plannedDate: "2026-07-05" });
    await completeMilestone(ctx, m.id);
    const tl = await createTimeline(ctx, initA, { startDate: "2026-07-01", targetEndDate: "2026-07-11" });
    await startTimeline(ctx, tl.id);
    await completeTimeline(ctx, tl.id);

    const snap = await calculateProgress(ctx, initA);
    expect(snap.scope).toBe("initiative");
    expect(snap.progress).toBe(100);
    expect(snap.reviewCompletion).toBe(100);
    expect(snap.taskCompletion).toBe(100);
    expect(snap.milestoneCompletion).toBe(100);

    const read = await getInitiativePerformance(ctx, initA);
    expect(read.progress).toBe(100);
    expect(read.timeline?.status).toBe("completed");
    expect(read.milestones).toHaveLength(1);
  });

  it("scores only the dependency weight for an untouched, unblocked initiative", async () => {
    // No review / tasks / milestones / timeline, but zero prerequisites ⇒ the
    // initiative is trivially unblocked and earns just the 10-pt dependency weight.
    const snap = await calculateProgress(ctx, initB);
    expect(snap.progress).toBe(10);
    expect(snap.reviewCompletion).toBe(0);
    expect(snap.taskCompletion).toBe(0);
    expect(snap.dependencyCompletion).toBe(100);
  });
});

describe("workspace health", () => {
  it("is critical when nothing is executing and an off-track KPI exists", async () => {
    await createKpi(ctx, workspaceId, { name: "Revenue", target: 100, current: 10 });
    const result = await calculateWorkspaceHealth(ctx, workspaceId);
    expect(result.health).toBe("critical");
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.snapshot.scope).toBe("workspace");
  });

  it("surfaces the latest workspace snapshot + KPIs in the dashboard read model", async () => {
    await createKpi(ctx, workspaceId, { name: "Revenue", target: 100, current: 10 });
    await calculateWorkspaceHealth(ctx, workspaceId);
    const dash = await getWorkspacePerformance(ctx, workspaceId);
    expect(dash.health).toBe("critical");
    expect(dash.kpis).toHaveLength(1);
    expect(dash.latestSnapshots.some((s) => s.scope === "workspace")).toBe(true);
  });
});
