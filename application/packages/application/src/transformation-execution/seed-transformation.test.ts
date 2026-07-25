/* =============================================================================
 * seedTransformation + workspace read-model tests (Phase D · Sprint D1).
 *
 * Proves the Phase C → D bridge as an application command: a certified proposal
 * artifact seeds a workspace + initiatives + append-only activities; re-seeding is
 * idempotent (no duplicate workspace/initiatives, identical audit); read models
 * project cleanly; and authorization is enforced against the loaded tenant.
 *
 * Uses the real in-memory runtime (to hold the proposal artifact) + in-memory
 * Phase D repositories. No provider, no network.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import { createRuntimeServices, InMemoryRuntimeRepository, type RuntimeResult, type TransformationExecutionRepositories } from "@brightloop/domain";
import type { Actor } from "@brightloop/domain";
import type { Initiative, ProposalIntelligenceSnapshot, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";
import { ok } from "@brightloop/domain";
import { seedTransformation } from "./seed-transformation.js";
import { getTransformationWorkspace, listTransformationWorkspaces } from "./get-workspace.js";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";

const T0 = "2026-07-25T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_other" };

function proposalSnapshot(): ProposalIntelligenceSnapshot {
  const itemBase = { problem: "p", businessImpact: "high" as const, risks: [] as string[], confidence: { value: 70, band: "high" as const }, reviewRequired: true, status: "ready" as const };
  return {
    id: "prop:run:snapshot", scanId: "scan", status: "available", reason: null,
    proposals: [
      { id: "prop:scan:1", title: "Add metadata", recommendedSolution: "Do meta", priority: "critical", estimatedEffort: "small", dependencies: [], supportingEvidenceIds: ["ev_1"], ...itemBase },
      { id: "prop:scan:2", title: "Rebuild", recommendedSolution: "Do rebuild", priority: "low", estimatedEffort: "large", dependencies: ["prop:scan:1"], supportingEvidenceIds: ["ev_2"], ...itemBase },
    ],
    counts: { critical: 1, high: 0, medium: 0, low: 1 }, conflicts: 0,
    confidence: { value: 55, band: "moderate" }, evidenceIds: ["ev_1", "ev_2"], sourceArtifacts: ["art_rec"],
    summary: "2 proposals.", reviewRequired: true, checksum: "y", generatedAt: T0, formulaVersion: "pi-runtime-1.0",
  };
}

/** In-memory Phase D repositories. */
function makeExecutionRepos(): TransformationExecutionRepositories {
  const workspaces = new Map<string, TransformationWorkspace>();
  const initiatives = new Map<string, Initiative>();
  const activities = new Map<string, TransformationActivity>(); // keyed by commandId (idempotent)
  return {
    workspaces: {
      create: async (w): Promise<RuntimeResult<TransformationWorkspace>> => { workspaces.set(w.id, w); return ok("created", w); },
      getById: async (id) => ok("found", workspaces.get(id) ?? null),
      getBySeed: async (scanRunId, seedChecksum) => ok("found", [...workspaces.values()].find((w) => w.scanRunId === scanRunId && w.seedChecksum === seedChecksum) ?? null),
      listByClient: async () => ok("found", [...workspaces.values()]),
    },
    initiatives: {
      createMany: async (items) => { for (const i of items) initiatives.set(i.id, i); return ok("created", [...items]); },
      listByWorkspace: async (wid) => ok("found", [...initiatives.values()].filter((i) => i.workspaceId === wid)),
    },
    activities: {
      append: async (a) => { if (!activities.has(a.commandId)) activities.set(a.commandId, a); return ok(activities.get(a.commandId) === a ? "created" : "replayed", activities.get(a.commandId)!); },
      listByWorkspace: async (wid) => ok("found", [...activities.values()].filter((a) => a.workspaceId === wid)),
    },
  };
}

let ctx: AppContext;
let runId: string;
let exec: TransformationExecutionRepositories;

beforeEach(async () => {
  const now = () => T0;
  let c = 0;
  const services = createRuntimeServices({ repo: new InMemoryRuntimeRepository(now), ids: (p) => `${p}_${(++c).toString().padStart(4, "0")}`, clock: now });
  const created = await services.coordinator.initializeRun({ clientId: "cli_1", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("init");
  runId = created.value.run.id;
  await services.artifacts.persist({ runId, clientId: "cli_1", scanId: "scan", kind: "proposal", envelope: proposalSnapshot() as unknown as Record<string, unknown>, sourceArtifactIds: [] });
  await services.artifacts.persist({ runId, clientId: "cli_1", scanId: "scan", kind: "internal_intelligence_report", envelope: { scanId: "scan" }, sourceArtifactIds: [] });
  exec = makeExecutionRepos();
  let k = 0;
  ctx = { services, actor: OWNER, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: now, execution: exec };
});

describe("seedTransformation", () => {
  it("seeds a workspace + one initiative per proposal item + seed activities", async () => {
    const detail = await seedTransformation(ctx, runId);
    expect(detail.workspace.scanRunId).toBe(runId);
    expect(detail.workspace.status).toBe("seeded");
    expect(detail.initiatives).toHaveLength(2);
    expect(detail.progress.byPriority).toEqual({ critical: 1, high: 0, medium: 0, low: 1 });
    expect(detail.activities.map((a) => a.type)).toEqual(["workspace_created", "initiative_seeded", "initiative_seeded"]);
    // dependency rewired to the initiative id
    const rebuild = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:2")!;
    const meta = detail.initiatives.find((i) => i.sourceProposalItemId === "prop:scan:1")!;
    expect(rebuild.dependencies).toEqual([meta.id]);
  });

  it("is idempotent: re-seeding returns the same workspace with no duplicates", async () => {
    const first = await seedTransformation(ctx, runId);
    const second = await seedTransformation(ctx, runId);
    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.workspace.seedChecksum).toBe(first.workspace.seedChecksum);
    const all = await exec.workspaces.listByClient(null);
    expect(all.ok && all.value.length).toBe(1);
    const inits = await exec.initiatives.listByWorkspace(first.workspace.id);
    expect(inits.ok && inits.value.length).toBe(2); // not 4
    const acts = await exec.activities.listByWorkspace(first.workspace.id);
    expect(acts.ok && acts.value.length).toBe(3); // append-only, idempotent on commandId
  });

  it("read model: getTransformationWorkspace returns the seeded detail", async () => {
    const seeded = await seedTransformation(ctx, runId);
    const read = await getTransformationWorkspace(ctx, seeded.workspace.id);
    expect(read.workspace.id).toBe(seeded.workspace.id);
    expect(read.initiatives).toHaveLength(2);
    const list = await listTransformationWorkspaces(ctx);
    expect(list).toHaveLength(1);
    expect(list[0]!.initiativeCount).toBe(2);
  });

  it("authorizes against the loaded tenant: a foreign client actor is forbidden", async () => {
    const seeded = await seedTransformation(ctx, runId);
    const clientCtx: AppContext = { ...ctx, actor: CLIENT };
    await expect(getTransformationWorkspace(clientCtx, seeded.workspace.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(seedTransformation(clientCtx, runId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
