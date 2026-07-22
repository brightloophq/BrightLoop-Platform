/* =============================================================================
 * RunService (Phase B · Sprint 13C) — the durable run lifecycle.
 *
 * REUSES the Phase-A transition guard (`canRunTransition` / `isRunTerminal`)
 * rather than restating the state machine. Sprint 8 already decided which
 * transitions are legal; this service only makes those decisions DURABLE and
 * emits the corresponding events. `RuntimeRunStatus` and `PipelineRunStatus`
 * enumerate the same members, so the guard applies unchanged.
 *
 * Illegal transitions are REJECTED, never silently coerced.
 * ========================================================================== */

import type { RuntimeRun, RuntimeRunStatus } from "@brightloop/schema";
import { canRunTransition, isRunTerminal } from "../../scan-engine/pipeline-run/run.js";
import type { IntelligenceRunRepository } from "../repository.js";
import { err, type RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { RUNTIME_EVENTS, runKey, type RuntimeServiceContext } from "./support.js";

export interface StartRunInput {
  clientId: string | null;
  scanId: string;
  /** Budget/policy envelope. Not a copy of canonical domain data. */
  metadata?: Record<string, unknown>;
  checksum?: string | null;
  /** Absolute time after which the run must stop. */
  deadline?: string | null;
}

export class RunService {
  constructor(
    private readonly repo: IntelligenceRunRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /**
   * Create the run for a scan, or replay the existing one.
   *
   * The idempotency key is derived from the scan id, so a duplicate "start"
   * after a crash returns the ORIGINAL run instead of forking a second one.
   * The `created` event fires only on genuine creation.
   */
  async createRun(input: StartRunInput): Promise<RuntimeResult<RuntimeRun>> {
    const now = this.ctx.clock();
    const record: RuntimeRun = {
      id: this.ctx.ids("run"),
      clientId: input.clientId,
      scanId: input.scanId,
      status: "pending",
      currentStage: null,
      failedStage: null,
      version: 1,
      idempotencyKey: runKey(input.scanId),
      metadata: input.metadata ?? {},
      checksum: input.checksum ?? null,
      deadline: input.deadline ?? null,
      cancelled: false,
      createdBy: this.ctx.actorId ?? null,
      createdAt: now,
      updatedAt: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
    };

    const result = await this.repo.createRun(record);
    if (result.ok && result.code === "created") {
      await this.events.emitRunEvent(RUNTIME_EVENTS.runCreated, result.value, { scanId: input.scanId });
    }
    return result;
  }

  async getRun(id: string): Promise<RuntimeResult<RuntimeRun>> {
    return this.repo.getRun(id);
  }

  async getRunForScan(scanId: string): Promise<RuntimeResult<RuntimeRun>> {
    return this.repo.getRunByIdempotencyKey(runKey(scanId));
  }

  /**
   * Move the run to a new status, rejecting any transition Phase A considers
   * illegal and any transition out of a terminal state.
   */
  async transition(
    id: string,
    to: RuntimeRunStatus,
    patch: Partial<Pick<RuntimeRun, "currentStage" | "failedStage" | "startedAt" | "completedAt" | "failedAt">> = {},
  ): Promise<RuntimeResult<RuntimeRun>> {
    const current = await this.repo.getRun(id);
    if (!current.ok) return current;

    if (isRunTerminal(current.value.status)) {
      return err("terminal_state", `run ${id} is terminal (${current.value.status}) and cannot move to ${to}`);
    }
    if (current.value.status !== to && !canRunTransition(current.value.status, to)) {
      return err("terminal_state", `illegal run transition ${current.value.status} → ${to}`);
    }
    return this.repo.updateRunStatus(id, to, patch);
  }

  /** Mark the run as executing and stamp `startedAt` once. */
  async markStarted(id: string, stage: string): Promise<RuntimeResult<RuntimeRun>> {
    const current = await this.repo.getRun(id);
    if (!current.ok) return current;
    const startedAt = current.value.startedAt ?? this.ctx.clock();
    const result = await this.transition(id, "discovering", { currentStage: stage, startedAt });
    if (result.ok) await this.events.emitRunEvent(RUNTIME_EVENTS.runStarted, result.value, {}, stage);
    return result;
  }

  async completeRun(id: string): Promise<RuntimeResult<RuntimeRun>> {
    const result = await this.transition(id, "completed", { completedAt: this.ctx.clock() });
    if (result.ok) await this.events.emitRunEvent(RUNTIME_EVENTS.runCompleted, result.value);
    return result;
  }

  /** Fail the run, recording WHICH stage failed so resume knows where to restart. */
  async failRun(id: string, stage: string, reason: string): Promise<RuntimeResult<RuntimeRun>> {
    const result = await this.transition(id, "failed", { failedStage: stage, failedAt: this.ctx.clock() });
    if (result.ok) await this.events.emitRunEvent(RUNTIME_EVENTS.runFailed, result.value, { reason }, stage);
    return result;
  }

  /**
   * Cancel the run. Idempotent by contract: cancelling an already-cancelled run
   * replays, while a completed run is refused as `terminal_state`.
   */
  async cancelRun(id: string): Promise<RuntimeResult<RuntimeRun>> {
    const result = await this.repo.cancelRun(id, this.ctx.clock());
    if (result.ok && result.code !== "replayed") {
      await this.events.emitRunEvent(RUNTIME_EVENTS.runCancelled, result.value);
    }
    return result;
  }

  /** True when the run has passed its deadline — the caller decides what to do. */
  isPastDeadline(run: RuntimeRun, now: string = this.ctx.clock()): boolean {
    return run.deadline !== null && now >= run.deadline;
  }
}
