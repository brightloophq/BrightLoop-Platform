/* =============================================================================
 * Pipeline run model + status machine (Sprint 8 §1) — PURE.
 *
 * The run record and its legal status transitions. Statuses track the coarse
 * phase of the run; the fine-grained 13-stage progression lives in stages.ts.
 * Deterministic — `now` is supplied, never read from a clock.
 * ========================================================================== */

import {
  pipelineRunSchema,
  type PipelineRun,
  type PipelineRunStatus,
  type PipelineRunStage,
  type PipelineBudget,
} from "@brightloop/schema";

/** Status reached while a given stage is executing. */
export const STATUS_FOR_STAGE: Record<PipelineRunStage, PipelineRunStatus> = {
  discovery_planning: "discovering",
  discovery_completion: "discovering",
  evidence_normalization: "ingesting_evidence",
  evidence_validation: "ingesting_evidence",
  graph_assembly: "assembling_graph",
  graph_snapshot: "assembling_graph",
  reasoning_job_creation: "planning_reasoning",
  provider_routing: "planning_reasoning",
  provider_execution: "executing_reasoning",
  grounding_validation: "validating_results",
  finding_synthesis: "synthesizing_findings",
  recommendation_candidates: "building_recommendations",
  report_assembly: "preparing_report",
};

/** The ordered progression of run statuses (excluding terminal/exceptional ones). */
const PROGRESSION: readonly PipelineRunStatus[] = [
  "pending",
  "discovering",
  "ingesting_evidence",
  "assembling_graph",
  "planning_reasoning",
  "executing_reasoning",
  "validating_results",
  "synthesizing_findings",
  "building_recommendations",
  "preparing_report",
  "completed",
];

const TERMINAL: ReadonlySet<PipelineRunStatus> = new Set(["completed", "failed", "cancelled"]);

export function isRunTerminal(status: PipelineRunStatus): boolean {
  return TERMINAL.has(status);
}

/**
 * A status transition is legal when it advances along the progression (never
 * backwards), or moves to an exceptional state. `blocked` may resume to the
 * status it blocked from; terminal statuses accept nothing.
 */
export function canRunTransition(from: PipelineRunStatus, to: PipelineRunStatus): boolean {
  if (isRunTerminal(from)) return false;
  if (to === "failed" || to === "cancelled" || to === "blocked") return true;
  if (from === "blocked") return PROGRESSION.includes(to); // resume
  const a = PROGRESSION.indexOf(from);
  const b = PROGRESSION.indexOf(to);
  if (a < 0 || b < 0) return false;
  return b > a; // strictly forward
}

/** Apply a status transition. Illegal transitions return the run unchanged. Pure. */
export function transitionRun(run: PipelineRun, to: PipelineRunStatus, now: string): PipelineRun {
  if (!canRunTransition(run.status, to)) return run;
  return pipelineRunSchema.parse({
    ...run,
    status: to,
    startedAt: run.startedAt === null && to !== "pending" ? now : run.startedAt,
    completedAt: isRunTerminal(to) ? now : run.completedAt,
    cancelled: to === "cancelled" ? true : run.cancelled,
  });
}

export interface NewRunInput {
  id: string;
  scanId: string;
  clientId: string | null;
  discoveryRequestId?: string | null;
  budget: PipelineBudget;
  deadline?: string | null;
}

/** Create a validated, pending pipeline run. Pure given `now`. */
export function newPipelineRun(input: NewRunInput, now: string): PipelineRun {
  return pipelineRunSchema.parse({
    id: input.id,
    scanId: input.scanId,
    clientId: input.clientId,
    discoveryRequestId: input.discoveryRequestId ?? null,
    budget: input.budget,
    spend: { estimated: 0, actual: 0, remaining: input.budget.scanCeiling, softWarning: false, hardStop: false },
    deadline: input.deadline ?? null,
    status: "pending",
    createdAt: now,
  });
}

/** Record a stage attempt on the run. Pure. */
export function recordAttempt(run: PipelineRun, stage: PipelineRunStage, ok: boolean, failureKind: PipelineRun["attempts"][number]["failureKind"], now: string): PipelineRun {
  const attempt = run.attempts.filter((a) => a.stage === stage).length;
  return pipelineRunSchema.parse({ ...run, attempts: [...run.attempts, { stage, attempt, ok, failureKind, at: now }] });
}
