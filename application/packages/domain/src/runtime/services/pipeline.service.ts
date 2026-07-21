/* =============================================================================
 * PipelineService (Phase B · Sprint 13C) — durable stage advancement.
 *
 * DECIDES NOTHING ITSELF. Phase A (Sprint 8) already owns the stage graph:
 * `PIPELINE_STAGE_ORDER`, `canAdvanceStage`, `stageDependenciesMet`,
 * `missingDependencies`, `nextPipelineStage`, `STATUS_FOR_STAGE`. This service
 * makes those decisions durable — it reads what artifacts actually exist in the
 * database, asks Phase A whether the stage may run, and records the answer.
 *
 * A stage is BLOCKED (not failed) when its dependencies are missing: blocking is
 * a recoverable, diagnosable state that names exactly which artifact kinds are
 * absent, whereas failure implies the stage ran and went wrong.
 * ========================================================================== */

import type {
  ArtifactKind,
  PipelineRunStage,
  PipelineRunStatus,
  RuntimeStage,
  RuntimeStageStatus,
} from "@brightloop/schema";
import {
  canAdvanceStage,
  missingDependencies,
  nextPipelineStage,
  PIPELINE_STAGE_ORDER,
  PIPELINE_STAGE_SPECS,
  stageDependenciesMet,
} from "../../scan-engine/pipeline-run/stages.js";
import { STATUS_FOR_STAGE } from "../../scan-engine/pipeline-run/run.js";
import type { ArtifactRepository, StageRepository } from "../repository.js";
import { err, type RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { RUNTIME_EVENTS, stageKey, type RuntimeServiceContext } from "./support.js";

export interface StageContext {
  runId: string;
  clientId: string | null;
  scanId: string;
}

/** Why a stage may not proceed. `missing` is populated for `dependencies_unmet`. */
export interface StageGate {
  allowed: boolean;
  reason: "ok" | "illegal_transition" | "dependencies_unmet";
  missing: ArtifactKind[];
}

export class PipelineService {
  constructor(
    private readonly stages: StageRepository,
    private readonly artifacts: ArtifactRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /** The canonical 13-stage order, surfaced so callers never hard-code it. */
  get stageOrder(): readonly PipelineRunStage[] {
    return PIPELINE_STAGE_ORDER;
  }

  /** The stage after this one, or null at the end of the pipeline. */
  nextStage(stage: PipelineRunStage): PipelineRunStage | null {
    return nextPipelineStage(stage);
  }

  /** The run status a stage implies (Phase A's mapping). */
  statusForStage(stage: PipelineRunStage): PipelineRunStatus {
    return STATUS_FOR_STAGE[stage];
  }

  /**
   * Which artifact kinds this run has actually produced. Read from the database,
   * not from an in-memory registry — that is what makes the dependency gate
   * survive a process restart.
   */
  async availableArtifactKinds(runId: string): Promise<RuntimeResult<ArtifactKind[]>> {
    const kinds: ArtifactKind[] = [];
    for (const kind of ARTIFACT_KINDS_IN_PIPELINE) {
      const listed = await this.artifacts.listArtifactsByKind(runId, kind);
      if (!listed.ok) return listed;
      if (listed.value.some((a) => a.validationStatus !== "invalid")) kinds.push(kind);
    }
    return { ok: true, code: "found", value: kinds };
  }

  /**
   * May `to` run now, given `from` and what the run has produced? Consults Phase A
   * for both the ordering rule and the dependency rule.
   */
  async gate(runId: string, from: PipelineRunStage | null, to: PipelineRunStage): Promise<RuntimeResult<StageGate>> {
    if (from !== null && !canAdvanceStage(from, to)) {
      return { ok: true, code: "found", value: { allowed: false, reason: "illegal_transition", missing: [] } };
    }
    const available = await this.availableArtifactKinds(runId);
    if (!available.ok) return available;

    if (!stageDependenciesMet(to, available.value)) {
      return {
        ok: true,
        code: "found",
        value: { allowed: false, reason: "dependencies_unmet", missing: missingDependencies(to, available.value) },
      };
    }
    return { ok: true, code: "found", value: { allowed: true, reason: "ok", missing: [] } };
  }

  /**
   * Begin a stage. Refuses an illegal transition outright and records a BLOCKED
   * transition (with the missing kinds) when dependencies are unmet — the run
   * stays diagnosable instead of failing opaquely.
   */
  async beginStage(
    context: StageContext,
    from: PipelineRunStage | null,
    to: PipelineRunStage,
    attempt = 0,
  ): Promise<RuntimeResult<RuntimeStage>> {
    const gate = await this.gate(context.runId, from, to);
    if (!gate.ok) return gate;

    if (!gate.value.allowed) {
      if (gate.value.reason === "illegal_transition") {
        return err("terminal_state", `illegal stage transition ${from} → ${to}`);
      }
      const blocked = await this.record(context, to, "pending", attempt, {
        blocked: true,
        missingArtifacts: gate.value.missing,
      });
      await this.events.emit({
        eventType: RUNTIME_EVENTS.stageBlocked,
        aggregateType: "intelligence_run",
        aggregateId: context.runId,
        clientId: context.clientId,
        runId: context.runId,
        scanId: context.scanId,
        stage: to,
        payload: { missingArtifacts: gate.value.missing },
      });
      if (!blocked.ok) return blocked;
      return err("check_violation", `stage ${to} is blocked: missing ${gate.value.missing.join(", ")}`);
    }

    const started = await this.record(context, to, "running", attempt, {});
    if (started.ok && started.code === "created") {
      await this.emitStage(RUNTIME_EVENTS.stageStarted, context, to, { attempt });
    }
    return started;
  }

  /** Record a stage as completed. */
  async completeStage(context: StageContext, stage: PipelineRunStage, attempt = 0): Promise<RuntimeResult<RuntimeStage>> {
    const result = await this.record(context, stage, "completed", attempt, {});
    if (result.ok) await this.emitStage(RUNTIME_EVENTS.stageCompleted, context, stage, { attempt });
    return result;
  }

  /** Record a stage as failed, preserving the error for diagnosis and retry. */
  async failStage(
    context: StageContext,
    stage: PipelineRunStage,
    attempt: number,
    error: string,
  ): Promise<RuntimeResult<RuntimeStage>> {
    const result = await this.record(context, stage, "failed", attempt, {}, error);
    if (result.ok) await this.emitStage(RUNTIME_EVENTS.stageFailed, context, stage, { attempt, error });
    return result;
  }

  /**
   * Record a stage as skipped — the resume path for work a checkpoint proves is
   * already done. This is how "already-completed work never executes twice"
   * becomes visible in the timeline rather than silent.
   */
  async skipStage(context: StageContext, stage: PipelineRunStage, attempt = 0): Promise<RuntimeResult<RuntimeStage>> {
    const result = await this.record(context, stage, "skipped", attempt, { reason: "already_completed" });
    if (result.ok) await this.emitStage(RUNTIME_EVENTS.stageSkipped, context, stage, { attempt });
    return result;
  }

  async listStages(runId: string): Promise<RuntimeResult<RuntimeStage[]>> {
    return this.stages.listStages(runId);
  }

  async latestStage(runId: string): Promise<RuntimeResult<RuntimeStage>> {
    return this.stages.getLatestStage(runId);
  }

  /* ---- internals ----------------------------------------------------------- */
  private async record(
    context: StageContext,
    stage: PipelineRunStage,
    status: RuntimeStageStatus,
    attempt: number,
    metadata: Record<string, unknown>,
    lastError: string | null = null,
  ): Promise<RuntimeResult<RuntimeStage>> {
    const now = this.ctx.clock();
    return this.stages.appendStageTransition({
      id: this.ctx.ids("stg"),
      runId: context.runId,
      clientId: context.clientId,
      scanId: context.scanId,
      stage,
      status,
      attempt,
      idempotencyKey: `${stageKey(context.runId, stage, attempt)}:${status}`,
      metadata,
      lastError,
      createdBy: this.ctx.actorId ?? null,
      createdAt: now,
      updatedAt: null,
      startedAt: status === "running" ? now : null,
      completedAt: status === "completed" ? now : null,
      failedAt: status === "failed" ? now : null,
      cancelledAt: status === "cancelled" ? now : null,
    });
  }

  private async emitStage(
    eventType: (typeof RUNTIME_EVENTS)[keyof typeof RUNTIME_EVENTS],
    context: StageContext,
    stage: PipelineRunStage,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateType: "intelligence_run",
      aggregateId: context.runId,
      clientId: context.clientId,
      runId: context.runId,
      scanId: context.scanId,
      stage,
      payload,
    });
  }
}

/**
 * Every artifact kind the 13-stage pipeline can produce, DERIVED from the stage
 * specs rather than restated. A stage added in Phase A automatically joins the
 * dependency gate instead of silently escaping it.
 */
const ARTIFACT_KINDS_IN_PIPELINE: readonly ArtifactKind[] = [
  ...new Set(
    Object.values(PIPELINE_STAGE_SPECS)
      .map((spec) => spec.producesArtifact)
      .filter((kind): kind is ArtifactKind => kind !== null),
  ),
];
