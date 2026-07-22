/* =============================================================================
 * RuntimeExecutionEngine (Phase B · Sprint 13C) — how ONE stage runs.
 *
 * Extracted from the coordinator, which had grown a single 93-line
 * `advanceStage` carrying six unrelated concerns. The split is by QUESTION:
 *
 *   · the ENGINE answers "how does one stage execute?"
 *       preconditions → recovery check → gate → work → artifact → checkpoint
 *   · the COORDINATOR answers "what runs next, and how is it queued?"
 *       run lifecycle, leasing, downstream enqueue, retry disposition
 *
 * THE ENGINE NEVER TOUCHES THE QUEUE. That is the boundary that makes the split
 * real rather than cosmetic: stage execution is now testable, and reusable,
 * without a queue in the picture at all — a backfill or a manual re-run can
 * drive the engine directly.
 *
 * Like the coordinator, the engine EXECUTES NOTHING ITSELF. The caller supplies
 * the work; the engine decides whether it may run and makes the result durable.
 * ========================================================================== */

import type { PipelineRunStage, RuntimeArtifactKind, RuntimeRun } from "@brightloop/schema";
import { PIPELINE_STAGE_ORDER } from "../../scan-engine/pipeline-run/stages.js";
import { err, type RuntimeResult } from "../results.js";
import type { ArtifactService } from "./artifact.service.js";
import type { CheckpointService } from "./checkpoint.service.js";
import type { EventService } from "./event.service.js";
import type { PipelineService, StageContext } from "./pipeline.service.js";
import type { RunService } from "./run.service.js";
import { RUNTIME_EVENTS, type RuntimeServiceContext } from "./support.js";

/** The work a stage performs, supplied by the caller. Pure data in, pure data out. */
export interface StageWork {
  /** The artifact envelope this stage produced, or null when it produces none. */
  envelope: Record<string, unknown> | null;
  kind: RuntimeArtifactKind | null;
  /** Lineage: artifacts this stage consumed. */
  sourceArtifactIds?: string[];
}

export type StageExecutor = (stage: PipelineRunStage, run: RuntimeRun) => Promise<StageWork>;

/** What executing one stage produced. */
export interface StageOutcome {
  stage: PipelineRunStage;
  status: "completed" | "skipped" | "blocked" | "failed" | "cancelled" | "deadline_exceeded";
  artifactId: string | null;
  detail: string | null;
}

export interface ExecutionEngineServices {
  runs: RunService;
  pipeline: PipelineService;
  checkpoints: CheckpointService;
  artifacts: ArtifactService;
  events: EventService;
}

export function stageOutcome(
  stage: PipelineRunStage,
  status: StageOutcome["status"],
  artifactId: string | null = null,
  detail: string | null = null,
): StageOutcome {
  return { stage, status, artifactId, detail };
}

export class RuntimeExecutionEngine {
  constructor(
    private readonly svc: ExecutionEngineServices,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /* ---- recovery ---------------------------------------------------------------- */
  /**
   * The stage a resumed run should execute next.
   *
   * With a valid checkpoint that is its `nextStage` (a checkpoint records a
   * COMPLETED stage). With none, the run starts at the beginning. This single
   * decision is the whole of crash recovery — everything else follows from it.
   */
  async resumePoint(runId: string): Promise<RuntimeResult<PipelineRunStage>> {
    const checkpoint = await this.svc.checkpoints.latestValid(runId);
    if (!checkpoint.ok) {
      if (checkpoint.code === "not_found") return { ok: true, code: "found", value: PIPELINE_STAGE_ORDER[0]! };
      return checkpoint;
    }
    const next = checkpoint.value.nextStage;
    if (next === null) return err("terminal_state", `run ${runId} has already checkpointed its final stage`);
    return { ok: true, code: "found", value: next as PipelineRunStage };
  }

  /** Stages already proven complete by checkpoints — these must never re-execute. */
  async completedStages(runId: string): Promise<RuntimeResult<PipelineRunStage[]>> {
    const resume = await this.resumePoint(runId);
    if (!resume.ok) return resume;
    const index = PIPELINE_STAGE_ORDER.indexOf(resume.value);
    return { ok: true, code: "found", value: [...PIPELINE_STAGE_ORDER.slice(0, index)] };
  }

  /* ---- execution ----------------------------------------------------------------- */
  /**
   * Execute one stage, durably.
   *
   * The six steps below are ordered deliberately and each is its own method, so
   * the sequence reads as a sequence rather than as a wall of branching. A crash
   * between any two of them is safe because every write is keyed on natural
   * identity and therefore replays rather than duplicating.
   */
  async execute(
    runId: string,
    stage: PipelineRunStage,
    work: StageExecutor,
    attempt = 0,
  ): Promise<RuntimeResult<StageOutcome>> {
    const loaded = await this.svc.runs.getRun(runId);
    if (!loaded.ok) return loaded;
    const run = loaded.value;
    const context: StageContext = { runId: run.id, clientId: run.clientId, scanId: run.scanId };

    // 1 · cheapest refusals first: a run that is over must not start work
    const halted = await this.preflight(run, stage);
    if (halted !== null) return { ok: true, code: "found", value: halted };

    // 2 · recovery: a checkpoint proving completion means skip, never re-run
    const skip = await this.skipIfComplete(context, stage, attempt);
    if (skip !== null) return skip;

    // 3 · legality + dependencies (Phase A decides both)
    const opened = await this.openStage(context, stage, attempt);
    if (opened !== null) return { ok: true, code: "found", value: opened };

    // 4 · the caller's work
    const produced = await this.runWork(context, run, stage, work, attempt);
    if (!produced.ok) return produced;
    if (produced.value.outcome !== null) return { ok: true, code: "found", value: produced.value.outcome };

    // 5 · artifact BEFORE checkpoint, so a checkpoint never dangles
    const artifactId = await this.persistOutput(run, produced.value.work!);
    if (!artifactId.ok) return artifactId;

    // 6 · checkpoint = durably complete
    return this.sealStage(context, stage, attempt, artifactId.value);
  }

  /* ---- steps -------------------------------------------------------------------- */
  /** Cancellation and deadline beat everything else. Returns an outcome to stop on. */
  private async preflight(run: RuntimeRun, stage: PipelineRunStage): Promise<StageOutcome | null> {
    if (run.cancelled || run.status === "cancelled") {
      return stageOutcome(stage, "cancelled", null, "run cancelled");
    }
    if (this.svc.runs.isPastDeadline(run, this.ctx.clock())) {
      await this.svc.events.emitRunEvent(RUNTIME_EVENTS.deadlineExceeded, run, { stage }, stage);
      await this.svc.runs.failRun(run.id, stage, "deadline exceeded");
      return stageOutcome(stage, "deadline_exceeded", null, "deadline exceeded");
    }
    return null;
  }

  /**
   * Skip a stage a checkpoint already proves complete. Recording the skip makes
   * "already-completed work never executes twice" visible in the timeline rather
   * than silent.
   */
  private async skipIfComplete(
    context: StageContext,
    stage: PipelineRunStage,
    attempt: number,
  ): Promise<RuntimeResult<StageOutcome> | null> {
    const done = await this.completedStages(context.runId);
    if (!done.ok) return done;
    if (!done.value.includes(stage)) return null;

    const skipped = await this.svc.pipeline.skipStage(context, stage, attempt);
    if (!skipped.ok) return skipped;
    return { ok: true, code: "found", value: stageOutcome(stage, "skipped", null, "checkpoint proves completion") };
  }

  /**
   * Open the stage: dependency + ordering gate, then project the stage onto the
   * run status. Returns a stopping outcome, or null to proceed.
   */
  private async openStage(
    context: StageContext,
    stage: PipelineRunStage,
    attempt: number,
  ): Promise<StageOutcome | null> {
    const begun = await this.svc.pipeline.beginStage(context, priorStage(stage), stage, attempt);
    if (!begun.ok) {
      // `check_violation` is the blocked signal — recoverable, and it names what is missing
      const blocked = begun.code === "check_violation";
      return stageOutcome(stage, blocked ? "blocked" : "failed", null, begun.message);
    }

    // A `terminal_state` here means the run was cancelled or failed between the
    // preflight and now — stop rather than execute work for a run that is over.
    const projected = await this.svc.runs.transition(context.runId, this.svc.pipeline.statusForStage(stage), {
      currentStage: stage,
    });
    if (!projected.ok && projected.code === "terminal_state") {
      return stageOutcome(stage, "cancelled", null, projected.message);
    }
    return null;
  }

  /** Run the caller's work, converting a thrown error into a recorded stage failure. */
  private async runWork(
    context: StageContext,
    run: RuntimeRun,
    stage: PipelineRunStage,
    work: StageExecutor,
    attempt: number,
  ): Promise<RuntimeResult<{ work: StageWork | null; outcome: StageOutcome | null }>> {
    try {
      const produced = await work(stage, run);
      return { ok: true, code: "found", value: { work: produced, outcome: null } };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const failed = await this.svc.pipeline.failStage(context, stage, attempt, detail);
      if (!failed.ok) return failed;
      return { ok: true, code: "found", value: { work: null, outcome: stageOutcome(stage, "failed", null, detail) } };
    }
  }

  /** Persist the stage's artifact, if it produced one. Returns its id, or null. */
  private async persistOutput(run: RuntimeRun, work: StageWork): Promise<RuntimeResult<string | null>> {
    if (work.envelope === null || work.kind === null) return { ok: true, code: "found", value: null };

    const persisted = await this.svc.artifacts.persist({
      runId: run.id,
      clientId: run.clientId,
      scanId: run.scanId,
      kind: work.kind,
      envelope: work.envelope,
      sourceArtifactIds: work.sourceArtifactIds ?? [],
      validationStatus: "valid",
    });
    if (!persisted.ok) return persisted;
    return { ok: true, code: "found", value: persisted.value.id };
  }

  /** Complete the stage and checkpoint it — the point at which it becomes durable. */
  private async sealStage(
    context: StageContext,
    stage: PipelineRunStage,
    attempt: number,
    artifactId: string | null,
  ): Promise<RuntimeResult<StageOutcome>> {
    const completed = await this.svc.pipeline.completeStage(context, stage, attempt);
    if (!completed.ok) return completed;

    const checkpoint = await this.svc.checkpoints.save({
      runId: context.runId,
      clientId: context.clientId,
      scanId: context.scanId,
      stage,
      attempt,
      artifactIds: artifactId === null ? [] : [artifactId],
      nextStage: this.svc.pipeline.nextStage(stage),
    });
    if (!checkpoint.ok) return checkpoint;

    return { ok: true, code: "found", value: stageOutcome(stage, "completed", artifactId, null) };
  }
}

/** The stage immediately before this one, or null at the head of the pipeline. */
export function priorStage(stage: PipelineRunStage): PipelineRunStage | null {
  const index = PIPELINE_STAGE_ORDER.indexOf(stage);
  return index <= 0 ? null : PIPELINE_STAGE_ORDER[index - 1]!;
}
