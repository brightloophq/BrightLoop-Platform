import "server-only";

import { NextResponse } from "next/server";
import { hasCapability, isClientRole } from "@brightloop/schema";
import { RUNTIME_EVENTS, COMMERCIAL_JOB_TYPE, COMMERCIAL_STAGE_ORDER } from "@brightloop/domain";
import { getScan, isApplicationError } from "@brightloop/application";
import { getActor } from "@/lib/auth";
import { buildAppContext } from "@/lib/runtime-api";
import { getRuntimeServices } from "@/lib/repositories";
import { ensureCommercialWorkflowStarted, driveCommercialUntilWait } from "@/lib/commercial-run";

/**
 * POST /api/internal/runtime/run-commercial-until-wait — bounded, resumable driver
 * for the POST-SCAN COMMERCIAL workflow (competitor → proposal → narrative → review).
 *
 * This is the durable continuation seam that replaces the old single-shot trigger.
 * It (1) ENSURES the workflow is enqueued (idempotent, server-authoritative — a
 * refresh after a missed kickoff repairs it), then (2) drives the SAME durable queue
 * in bounded turns and tells the browser whether to poll again. It starts no worker
 * or cron; every turn is one controlled commercial queue turn, so idempotency,
 * backoff and dead-letter all apply. The browser drives cadence; the server never
 * loops beyond the bounded window.
 *
 * ██ INTERNAL ONLY ██ — same guard as `run-until-wait`: an authenticated internal
 * actor holding `transformation.executions.write`; client roles are denied. The
 * caller's own RLS session is used (no service-role bypass). The response is a safe
 * DTO — no domain entity, DB row, key, prompt, or raw output.
 */

const RUN_CAPABILITY = "transformation.executions.write";
const COMMERCIAL_STAGES = new Set<string>(COMMERCIAL_STAGE_ORDER);
const DEFAULT_RETRY_MS = 600;

export type CommercialNextAction = "continue" | "done";

export interface CommercialRunResponse {
  runId: string;
  /** core_incomplete → the core scan hasn't finished; nothing to drive yet. */
  status: "core_incomplete" | "running" | "ready_for_review" | "failed" | "blocked";
  currentStage: string | null;
  nextAction: CommercialNextAction;
  retryAfterMs: number;
}

function parseRunId(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  return typeof b["runId"] === "string" && b["runId"] !== "" ? b["runId"] : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  const actor = await getActor();
  if (actor === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  if (isClientRole(actor.role) || !hasCapability(actor.role, RUN_CAPABILITY)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Insufficient capability for the commercial workflow" } }, { status: 403 });
  }

  const runId = parseRunId(await req.json().catch(() => null));
  if (runId === null) {
    return NextResponse.json({ error: { code: "validation", message: "runId is required" } }, { status: 422 });
  }

  const ctx = await buildAppContext();
  if (ctx === null) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }

  try {
    const scan = await getScan(ctx, runId); // authorizes ownership under RLS
    const svc = await getRuntimeServices();

    // The commercial workflow only exists AFTER the core scan completes.
    if (scan.lifecycle !== "completed") {
      return NextResponse.json(done(runId, "core_incomplete", null), { status: 200 });
    }

    // (1) Durable, idempotent kickoff — repairs a missed/failed enqueue on refresh.
    const started = await ensureCommercialWorkflowStarted(svc.commercial, {
      runId,
      scanId: scan.scanId,
      clientId: scan.clientId,
    });
    if (!started.ok) {
      return NextResponse.json(done(runId, "failed", null), { status: 200 });
    }

    // (2) Bounded, resumable drive of the durable queue.
    const drive = await driveCommercialUntilWait(svc.commercial, `internal:${actor.userId}`, { now: () => Date.now() });
    const lastStage = drive.results.length > 0 ? drive.results[drive.results.length - 1]!.stage : null;

    // Terminal detection from the append-only event log + queue eligibility.
    const events = await svc.events.list({ aggregateType: "intelligence_run", aggregateId: runId });
    const names = events.ok ? new Set(events.value.map((e) => e.eventType)) : new Set<string>();
    const ready = names.has(RUNTIME_EVENTS.commercialReadyForReview);
    const failedEvent =
      names.has(RUNTIME_EVENTS.commercialEnqueueFailed) ||
      (events.ok && events.value.some((e) => e.eventType === RUNTIME_EVENTS.jobDeadLettered && typeof e.stage === "string" && COMMERCIAL_STAGES.has(e.stage)));

    if (ready) return NextResponse.json(done(runId, "ready_for_review", lastStage), { status: 200 });
    if (failedEvent) return NextResponse.json(done(runId, "failed", lastStage), { status: 200 });

    // Is there still commercial work queued (or backing off)? If so, keep polling.
    const pending = await svc.queue.nextEligibleInMs(COMMERCIAL_JOB_TYPE, scan.clientId);
    if (pending.ok && pending.value !== null) {
      return NextResponse.json(
        { runId, status: "running", currentStage: lastStage, nextAction: "continue", retryAfterMs: Math.max(DEFAULT_RETRY_MS, pending.value) },
        { status: 200 },
      );
    }

    // Idle and not ready and nothing pending: a required stage produced no artifact
    // (e.g. insufficient inputs). Stop polling; the package panel shows the reason.
    return NextResponse.json(done(runId, "blocked", lastStage), { status: 200 });
  } catch (error) {
    if (isApplicationError(error)) return NextResponse.json(error.toBody(), { status: error.status });
    return NextResponse.json({ error: { code: "internal", message: "An unexpected error occurred" } }, { status: 500 });
  }
}

function done(runId: string, status: CommercialRunResponse["status"], currentStage: string | null): CommercialRunResponse {
  return { runId, status, currentStage, nextAction: "done", retryAfterMs: 0 };
}
