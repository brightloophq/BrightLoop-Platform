import "server-only";

import { NextResponse } from "next/server";
import { hasCapability, isClientRole } from "@brightloop/schema";
import { getActor } from "@/lib/auth";
import { buildRuntimeDriver } from "@/lib/runtime-driver";

/**
 * POST /api/internal/runtime/run-once — internal controlled-runtime entry point
 * (Phase C · Sprint C2.1 §2).
 *
 * Drives EXACTLY ONE runtime turn: lease ≤1 job, execute ≤1 stage, persist ≤1
 * outcome, enqueue ≤1 downstream, return. It is NOT a worker, cron, daemon, or
 * loop, and it starts none.
 *
 * ██ INTERNAL ONLY ██
 *   - `server-only` keeps the Anthropic SDK and key resolution out of the client
 *     bundle; a browser import is a build error.
 *   - The caller must be an authenticated INTERNAL actor (owner/admin/team_member)
 *     holding `transformation.executions.write`. Client roles are denied outright;
 *     an unauthenticated caller is 401. No service-role key is used — the runtime
 *     services carry the caller's own RLS-scoped session, so the database remains
 *     the final tenant boundary.
 *   - The provider is never called from the browser; live reasoning is gated by
 *     env (AUXION_LIVE_AI_ENABLED && AUXION_ANTHROPIC_ENABLED && a key). Disabled
 *     by default → the reasoning stage returns a stable `provider_disabled`, never
 *     a fabricated success.
 *   - The response is a plain, safe DTO: no domain entity, no database row, no API
 *     key, no raw provider output, no prompt, no hidden reasoning.
 */

/** Capability that authorizes running a controlled execution turn. */
const RUN_CAPABILITY = "transformation.executions.write";

interface RunOnceBody {
  dryRun?: boolean;
  jobType?: string;
  clientId?: string | null;
  leaseSeconds?: number;
}

function parseBody(value: unknown): RunOnceBody {
  if (value === null || typeof value !== "object") return {};
  const b = value as Record<string, unknown>;
  return {
    dryRun: typeof b["dryRun"] === "boolean" ? b["dryRun"] : undefined,
    jobType: typeof b["jobType"] === "string" ? b["jobType"] : undefined,
    clientId: typeof b["clientId"] === "string" ? b["clientId"] : b["clientId"] === null ? null : undefined,
    leaseSeconds: typeof b["leaseSeconds"] === "number" && Number.isFinite(b["leaseSeconds"]) ? b["leaseSeconds"] : undefined,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (actor === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  // Internal-only: reject client roles, then require the execution capability.
  if (isClientRole(actor.role) || !hasCapability(actor.role, RUN_CAPABILITY)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Insufficient capability for the controlled runtime driver" } }, { status: 403 });
  }

  let body: RunOnceBody = {};
  try {
    body = parseBody(await req.json());
  } catch {
    body = {};
  }

  try {
    const driver = await buildRuntimeDriver();

    if (body.dryRun === true) {
      const eligibility = await driver.checkEligibility({
        ...(body.jobType !== undefined ? { jobType: body.jobType } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
      });
      return NextResponse.json({ eligibility }, { status: 200 });
    }

    const result = await driver.runQueueTurn({
      owner: `internal:${actor.userId}`,
      ...(body.jobType !== undefined ? { jobType: body.jobType } : {}),
      ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
      ...(body.leaseSeconds !== undefined ? { leaseSeconds: body.leaseSeconds } : {}),
    });
    return NextResponse.json({ result }, { status: 200 });
  } catch {
    // Never leak an unexpected error's message or stack across the boundary.
    return NextResponse.json({ error: { code: "internal", message: "An unexpected error occurred" } }, { status: 500 });
  }
}
