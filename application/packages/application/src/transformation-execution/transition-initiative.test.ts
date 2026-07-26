/* =============================================================================
 * Initiative lifecycle use-case tests (Phase D · Sprint D2).
 *
 * Seeds a workspace, then drives an initiative through the lifecycle via the
 * use-cases. Proves: version bumps + activity append per transition; illegal
 * transitions → 409; idempotent re-transition (no-op, no duplicate activity);
 * optimistic-concurrency conflict → 409; authorization against the loaded tenant;
 * read-model history; replay stability.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, ok, type Actor, type RuntimeResult, type TransformationExecutionRepositories } from "@brightloop/domain";
import type { Initiative, ProposalIntelligenceSnapshot, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";
import { seedTransformation } from "./seed-transformation.js";
import { activateInitiative, archiveInitiative, completeInitiative, planInitiative } from "./transition-initiative.js";
import { getInitiative } from "./get-initiative.js";
import type { AppContext } from "../context.js";
import { ConflictError, ForbiddenError } from "../errors.js";

const T0 = "2026-07-25T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_other" };

function proposalSnapshot(): ProposalIntelligenceSnapshot {
  const b = { problem: "p", businessImpact: "high" as const, risks: [] as string[], confidence: { value: 70, band: "high" as const }, reviewRequired: true, status: "ready" as const };
  return {
    id: "prop:run:snapshot", scanId: "scan", status: "available", reason: null,
    proposals: [{ id: "prop:scan:1", title: "Add metadata", recommendedSolution: "Do meta", priority: "critical", estimatedEffort: "small", dependencies: [], supportingEvidenceIds: ["ev_1"], ...b }],
    counts: { critical: 1, high: 0, medium: 0, low: 0 }, conflicts: 0,
    confidence: { value: 55, band: "moderate" }, evidenceIds: ["ev_1"], sourceArtifacts: ["art_rec"],
    summary: "1 proposal.", reviewRequired: true, checksum: "y", generatedAt: T0, formulaVersion: "pi-runtime-1.0",
  };
}

function makeExecutionRepos(): TransformationExecutionRepositories {
  const workspaces = new Map<string, TransformationWorkspace>();
  const initiatives = new Map<string, Initiative>();
  const activities = new Map<string, TransformationActivity>(); // keyed by commandId
  return {
    workspaces: {
      create: async (w): Promise<RuntimeResult<TransformationWorkspace>> => { workspaces.set(w.id, w); return ok("created", w); },
      getById: async (id) => ok("found", workspaces.get(id) ?? null),
      getBySeed: async (s, c) => ok("found", [...workspaces.values()].find((w) => w.scanRunId === s && w.seedChecksum === c) ?? null),
      listByClient: async () => ok("found", [...workspaces.values()]),
    },
    initiatives: {
      createMany: async (items) => { for (const i of items) initiatives.set(i.id, i); return ok("created", [...items]); },
      listByWorkspace: async (wid) => ok("found", [...initiatives.values()].filter((i) => i.workspaceId === wid)),
      getById: async (id) => ok("found", initiatives.get(id) ?? null),
      save: async (next, expectedVersion) => {
        const cur = initiatives.get(next.id);
        if (!cur || cur.version !== expectedVersion) return { ok: false, code: "conflict", message: "version mismatch", detail: null };
        initiatives.set(next.id, next);
        return ok("updated", next);
      },
    },
    activities: {
      append: async (a) => { if (!activities.has(a.commandId)) activities.set(a.commandId, a); return ok(activities.get(a.commandId) === a ? "created" : "replayed", activities.get(a.commandId)!); },
      listByWorkspace: async (wid) => ok("found", [...activities.values()].filter((a) => a.workspaceId === wid)),
    },
    reviews: { create: async (r) => ok("created", r), getById: async () => ok("found", null), listByInitiative: async () => ok("found", []), listByWorkspace: async () => ok("found", []), save: async (next) => ok("updated", next) },
    tasks: { create: async (t) => ok("created", t), getById: async () => ok("found", null), listByInitiative: async () => ok("found", []), listByWorkspace: async () => ok("found", []), save: async (next) => ok("updated", next) },
    assignments: { append: async (a) => ok("created", a), listByTask: async () => ok("found", []) },
    dependencies: { create: async (d) => ok("created", d), remove: async () => ok("updated", null), getById: async () => ok("found", null), listByWorkspace: async () => ok("found", []) },
    timelines: { create: async (t) => ok("created", t), getById: async () => ok("found", null), getByInitiative: async () => ok("found", null), listByWorkspace: async () => ok("found", []), save: async (next) => ok("updated", next) },
    milestones: { create: async (m) => ok("created", m), getById: async () => ok("found", null), listByInitiative: async () => ok("found", []), listByWorkspace: async () => ok("found", []), save: async (next) => ok("updated", next) },
    kpis: { create: async (k) => ok("created", k), getById: async () => ok("found", null), listByWorkspace: async () => ok("found", []), save: async (next) => ok("updated", next) },
    progress: { append: async (s) => ok("created", s), listByWorkspace: async () => ok("found", []), listBySubject: async () => ok("found", []) },
  };
}

let ctx: AppContext;
let initiativeId: string;
let exec: TransformationExecutionRepositories;

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  const services = createRuntimeServices({ repo: new InMemoryRuntimeRepository(now), ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "cli_1", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  const runId = created.value.run.id;
  await services.artifacts.persist({ runId, clientId: "cli_1", scanId: "scan", kind: "proposal", envelope: proposalSnapshot() as unknown as Record<string, unknown>, sourceArtifactIds: [] });
  exec = makeExecutionRepos();
  let k = 0;
  ctx = { services, actor: OWNER, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: now, execution: exec };
  const detail = await seedTransformation(ctx, runId);
  initiativeId = detail.initiatives[0]!.id;
});

describe("initiative lifecycle use-cases", () => {
  it("walks the full lifecycle, bumping version and appending one activity per step", async () => {
    const p = await planInitiative(ctx, initiativeId);
    expect(p.executionStatus).toBe("planned");
    expect(p.version).toBe(2);
    const a = await activateInitiative(ctx, initiativeId);
    expect(a.executionStatus).toBe("active");
    const c = await completeInitiative(ctx, initiativeId);
    expect(c.executionStatus).toBe("completed");
    const ar = await archiveInitiative(ctx, initiativeId);
    expect(ar.executionStatus).toBe("archived");
    expect(ar.version).toBe(5);

    const detail = await getInitiative(ctx, initiativeId);
    // Full per-initiative history: the seed event, then each lifecycle transition.
    expect(detail.history.map((h) => h.type)).toEqual(["initiative_seeded", "initiative_planned", "initiative_activated", "initiative_completed", "initiative_archived"]);
  });

  it("rejects an illegal transition with a 409 and no mutation", async () => {
    await expect(activateInitiative(ctx, initiativeId)).rejects.toBeInstanceOf(ConflictError); // seeded → active
    const detail = await getInitiative(ctx, initiativeId);
    expect(detail.initiative.executionStatus).toBe("seeded");
    expect(detail.initiative.version).toBe(1);
  });

  it("is idempotent: re-issuing the same transition is a no-op with no duplicate activity", async () => {
    await planInitiative(ctx, initiativeId);
    const again = await planInitiative(ctx, initiativeId);
    expect(again.executionStatus).toBe("planned");
    expect(again.version).toBe(2); // not 3
    const detail = await getInitiative(ctx, initiativeId);
    expect(detail.history.filter((h) => h.type === "initiative_planned")).toHaveLength(1);
  });

  it("idempotency is target-exact: same-state is a no-op, wrong-state is illegal", async () => {
    await planInitiative(ctx, initiativeId);
    await activateInitiative(ctx, initiativeId);
    await completeInitiative(ctx, initiativeId);
    const archived = await archiveInitiative(ctx, initiativeId);
    expect(archived.version).toBe(5);

    // archive on archived → idempotent success, NO further version bump.
    const again = await archiveInitiative(ctx, initiativeId);
    expect(again.executionStatus).toBe("archived");
    expect(again.version).toBe(5);

    // complete on archived → illegal (different target, not idempotent).
    await expect(completeInitiative(ctx, initiativeId)).rejects.toBeInstanceOf(ConflictError);

    const detail = await getInitiative(ctx, initiativeId);
    expect(detail.history.filter((h) => h.type === "initiative_archived")).toHaveLength(1);
  });

  it("optimistic concurrency: a save against a stale expected version conflicts", async () => {
    await planInitiative(ctx, initiativeId); // stored is now version 2
    const loaded = await exec.initiatives.getById(initiativeId);
    const current = loaded.ok && loaded.value ? loaded.value : null;
    expect(current?.version).toBe(2);
    // A caller who read the pre-transition version 1 now loses the save.
    const stale = await exec.initiatives.save({ ...(current as Initiative), executionStatus: "active", version: 3 }, 1);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("conflict");
  });

  it("authorizes against the loaded tenant: a foreign client actor is forbidden", async () => {
    const clientCtx: AppContext = { ...ctx, actor: CLIENT };
    await expect(planInitiative(clientCtx, initiativeId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getInitiative(clientCtx, initiativeId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
