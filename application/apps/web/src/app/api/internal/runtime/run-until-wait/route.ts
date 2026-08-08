import "server-only";

import { NextResponse } from "next/server";
import { hasCapability, isClientRole } from "@brightloop/schema";
import { RUNTIME_EVENTS } from "@brightloop/domain";
import { getScan, isApplicationError } from "@brightloop/application";
import { getActor } from "@/lib/auth";
import { buildAppContext } from "@/lib/runtime-api";
import { buildRuntimeDriver } from "@/lib/runtime-driver";
import { getRuntimeServices } from "@/lib/repositories";
import { buildAutoRunResponse, runUntilWait, type AutoRunResponse } from "@/lib/auto-run";

/**
 * POST /api/internal/runtime/run-until-wait — bounded one-click auto-run.
 *
 * Drives the EXISTING runtime toward completion by repeating the EXISTING
 * one-turn driver (`runQueueTurn`) inside a bounded server window, then telling
 * the browser whether to poll again. It creates NO new engine, leases through the
 * SAME queue, and respects the SAME retry/backoff/dead-letter policy — each turn
 * is exactly the controlled `run-once`. The browser drives the cadence; the server
 * never loops beyond the bounded window and starts no worker/cron/daemon.
 *
 * ██ INTERNAL ONLY ██ — same guard as `run-once`: an authenticated internal actor
 * (owner/admin/team_member) holding `transformation.executions.write`; client
 * roles are denied. The caller's own RLS session is used (no service-role bypass);
 * the provider gate is unchanged. The response is a safe DTO — no domain entity,
 * DB row, key, prompt, or raw provider output.
 */

const RUN_CAPABILITY = "transformation.executions.write";

interface Body {
  runId: string;
  clientId?: string | null;
  maxTurns?: number;
  maxMillis?: number;
}

function parseBody(value: unknown): Body | null {
  if (value === null || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  if (typeof b["runId"] !== "string" || b["runId"] === "") return null;
  return {
    runId: b["runId"],
    maxTurns: typeof b["maxTurns"] === "number" && Number.isFinite(b["maxTurns"]) ? b["maxTurns"] : undefined,
    maxMillis: typeof b["maxMillis"] === "number" && Number.isFinite(b["maxMillis"]) ? b["maxMillis"] : undefined,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (actor === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  if (isClientRole(actor.role) || !hasCapability(actor.role, RUN_CAPABILITY)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Insufficient capability for the runtime driver" } }, { status: 403 });
  }

  const body = parseBody(await req.json().catch(() => null));
  if (body === null) {
    return NextResponse.json({ error: { code: "validation", message: "runId is required" } }, { status: 422 });
  }

  const ctx = await buildAppContext();
  if (ctx === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }

  try {
    // Load the run first — authorizes ownership against its tenant (RLS remains the
    // final boundary), and gives us the clientId to scope the queue turns to.
    const before = await getScan(ctx, body.runId);
    const driver = await buildRuntimeDriver();

    const loop = await runUntilWait(driver, {
      clientId: before.clientId,
      owner: `internal:${actor.userId}`,
      now: () => Date.now(),
      ...(body.maxTurns !== undefined ? { maxTurns: body.maxTurns } : {}),
      ...(body.maxMillis !== undefined ? { maxMillis: body.maxMillis } : {}),
    });

    // Re-read the run so progress/status reflect the turns just executed.
    const after = await getScan(ctx, body.runId);

    // Exact backoff for a scheduled retry, read from the queue's own availability.
    let retryAfterMs: number | undefined;
    const svc = await getRuntimeServices();
    if (loop.decision === "wait" && loop.last?.queueJobId) {
      const job = await svc.queue.get(loop.last.queueJobId);
      if (job.ok) retryAfterMs = Math.max(0, new Date(job.value.availableAt).getTime() - Date.now());
    }

    const response = buildAutoRunResponse({
      runId: body.runId,
      scanStatus: after.lifecycle,
      currentStage: after.currentStage,
      progress: after.progress,
      loop,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    });

    await emitAutorunEvents(svc, actor.userId, before, after, response);
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (isApplicationError(error)) return NextResponse.json(error.toBody(), { status: error.status });
    return NextResponse.json({ error: { code: "internal", message: "An unexpected error occurred" } }, { status: 500 });
  }
}

/** Best-effort session markers (never duplicate stage events; failures are non-fatal). */
async function emitAutorunEvents(
  svc: Awaited<ReturnType<typeof getRuntimeServices>>,
  userId: string,
  before: { clientId: string | null; scanId: string; lifecycle: string },
  after: { clientId: string | null; scanId: string; lifecycle: string },
  response: AutoRunResponse,
): Promise<void> {
  const run = { id: response.runId, clientId: after.clientId, scanId: after.scanId };
  const safe = { turnsExecuted: response.turnsExecuted, stage: response.currentStage, actor: `internal:${userId}` };
  try {
    if (before.lifecycle === "pending" && response.turnsExecuted > 0) {
      await svc.events.emitRunEvent(RUNTIME_EVENTS.autorunStarted, run, safe);
    }
    if (response.nextAction === "continue" && response.lastOutcome !== "advanced") {
      await svc.events.emitRunEvent(RUNTIME_EVENTS.autorunWaiting, run, { ...safe, retryAfterMs: response.retryAfterMs });
    }
    if (after.lifecycle === "completed") {
      await svc.events.emitRunEvent(RUNTIME_EVENTS.autorunCompleted, run, safe);
    }
  } catch {
    // observability is best-effort; a failed marker must never fail the turn.
  }
}
