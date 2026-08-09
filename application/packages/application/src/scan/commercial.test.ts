/* =============================================================================
 * Commercial package use-cases — review gate authorization + fold (deterministic).
 *
 * Proves the human review gate at the application boundary: a generated package is
 * NOT auto-approved; only the grant authority (owner/admin) may decide; a client
 * role can never read internal prospect intelligence; decisions are an auditable,
 * last-writer-wins fold of the append-only event log.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
import { getScanCommercialProposal, getScanClientNarrative, getProspectPackageReview, decideProspectPackage } from "./commercial.js";

const T0 = "2026-08-09T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

function harness() {
  const now = () => T0;
  let counter = 0;
  const ids = (prefix: string) => `${prefix}_${(++counter).toString().padStart(4, "0")}`;
  const repo = new InMemoryRuntimeRepository(now);
  const services = createRuntimeServices({ repo, ids, clock: now, actorId: "u_owner" });
  const ctx = (actor: Actor): AppContext => ({ services, actor, ids, clock: now });
  return { services, ctx };
}

async function seedPackage(services: RuntimeServices): Promise<string> {
  const run = await services.runs.createRun({ clientId: null, scanId: "scan-x" });
  if (!run.ok) throw new Error("run");
  const runId = run.value.id;
  const b = { runId, clientId: null, scanId: "scan-x", version: 1 as const, sourceArtifactIds: ["a1"] };
  await services.proposals.save({ ...b, envelope: { status: "draft_ready", commercialState: "needs_pricing" }, checksum: "cp1", status: "needs_review" });
  await services.narratives.save({ ...b, envelope: { audience: "client", status: "ready" }, checksum: "cn1", audience: "client", status: "needs_review" });
  return runId;
}

describe("commercial package — reads", () => {
  it("exposes the latest draft (any status) to internal reviewers", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    const p = await getScanCommercialProposal(ctx(OWNER), runId);
    expect(p.status).toBe("needs_review");
    expect(p.content["commercialState"]).toBe("needs_pricing");
    const n = await getScanClientNarrative(ctx(OWNER), runId);
    expect(n.audience).toBe("client");
  });

  it("denies a client role access to internal prospect intelligence", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    await expect(getScanCommercialProposal(ctx(CLIENT), runId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("commercial package — review gate", () => {
  it("a generated package is pending, not approved", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    expect((await getProspectPackageReview(ctx(OWNER), runId)).decision).toBe("pending");
  });

  it("only the grant authority (owner/admin) may decide — team_member is forbidden", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    await expect(decideProspectPackage(ctx(TEAM), runId, { action: "approve" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("owner can approve; the decision is recorded with the actor", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    const decided = await decideProspectPackage(ctx(OWNER), runId, { action: "approve", note: "looks good" });
    expect(decided.decision).toBe("approved");
    expect(decided.decidedBy).toBe("u_owner");
    expect(decided.note).toBe("looks good");
  });

  it("the fold is last-writer-wins — a later revision request supersedes an approval", async () => {
    const { services, ctx } = harness();
    const runId = await seedPackage(services);
    await decideProspectPackage(ctx(OWNER), runId, { action: "approve" });
    await decideProspectPackage(ctx(OWNER), runId, { action: "request_revision", note: "tighten scope" });
    const review = await getProspectPackageReview(ctx(OWNER), runId);
    expect(review.decision).toBe("revision_requested");
    expect(review.note).toBe("tighten scope");
  });
});
