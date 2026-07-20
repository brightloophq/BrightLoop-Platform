/* =============================================================================
 * Reasoning job model + state machine (AIS-001 §04 · PDF 27 §07) — PURE.
 *
 * Job lifecycle: pending → planned → routed → running → validating →
 * completed | failed | cancelled; blocked is reachable from the early states and
 * unblocks to pending. Transitions are legal-only; validation + failure route
 * back through retry. Deterministic; `now` supplied.
 * ========================================================================== */

import {
  reasoningJobSchema,
  type ReasoningJob,
  type ReasoningJobStatus,
  type ReasoningJobEvent,
} from "@brightloop/schema";

/** Legal (status → event → status). Anything else is rejected. */
const TRANSITIONS: Record<ReasoningJobStatus, Partial<Record<ReasoningJobEvent, ReasoningJobStatus>>> = {
  pending: { plan: "planned", block: "blocked", cancel: "cancelled" },
  planned: { route: "routed", block: "blocked", cancel: "cancelled" },
  routed: { start: "running", block: "blocked", cancel: "cancelled" },
  running: { validate: "validating", fail: "failed", cancel: "cancelled" },
  validating: { complete: "completed", fail: "failed", retry: "running", cancel: "cancelled" },
  blocked: { unblock: "pending", cancel: "cancelled" },
  completed: {},
  failed: { retry: "routed" }, // a retry after failure re-routes for provider fallback
  cancelled: {},
};

export function isJobTerminal(status: ReasoningJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function nextJobStatus(status: ReasoningJobStatus, event: ReasoningJobEvent): ReasoningJobStatus | null {
  return TRANSITIONS[status][event] ?? null;
}

export function canJobTransition(status: ReasoningJobStatus, event: ReasoningJobEvent): boolean {
  return nextJobStatus(status, event) !== null;
}

/**
 * Apply an event to a job. Illegal transitions return the job unchanged. A
 * `retry` bumps the attempt; `cancel` sets the cancellation flag; timestamps are
 * stamped from `now`. Pure.
 */
export function applyJobEvent(job: ReasoningJob, event: ReasoningJobEvent, now: string): ReasoningJob {
  const to = nextJobStatus(job.status, event);
  if (to === null) return job;
  return reasoningJobSchema.parse({
    ...job,
    status: to,
    attempt: event === "retry" ? job.attempt + 1 : job.attempt,
    cancelled: event === "cancel" ? true : job.cancelled,
    startedAt: to === "running" && job.startedAt === null ? now : job.startedAt,
    completedAt: isJobTerminal(to) ? now : job.completedAt,
  });
}

export interface NewJobInput {
  id: string;
  scanId: string;
  clientId: string | null;
  taskType: ReasoningJob["taskType"];
  stage: ReasoningJob["stage"];
  inputRefs?: Partial<ReasoningJob["inputRefs"]>;
  requiredOutputs?: string[];
  providerRequirements?: Partial<ReasoningJob["providerRequirements"]>;
  budget: ReasoningJob["budget"];
  deadline?: string | null;
  priority?: number;
}

/** Create a validated, pending reasoning job. Pure given `now`. */
export function newReasoningJob(input: NewJobInput, now: string): ReasoningJob {
  return reasoningJobSchema.parse({
    id: input.id,
    scanId: input.scanId,
    clientId: input.clientId,
    taskType: input.taskType,
    stage: input.stage,
    inputRefs: { evidenceIds: [], graphRefs: [], graphSnapshotChecksum: null, discoveryManifestId: null, ...input.inputRefs },
    requiredOutputs: input.requiredOutputs ?? [],
    providerRequirements: { capabilities: [], minContextTokens: 0, preferredProviderIds: [], ...input.providerRequirements },
    budget: input.budget,
    deadline: input.deadline ?? null,
    priority: input.priority ?? 0,
    status: "pending",
    attempt: 0,
    createdAt: now,
  });
}

/** Structural validity beyond the schema: a job must reference some input + budget. */
export function validateJob(job: ReasoningJob): string[] {
  const problems: string[] = [];
  if (job.inputRefs.evidenceIds.length === 0 && job.inputRefs.graphRefs.length === 0) problems.push("job has no input references");
  if (job.budget.costCeiling <= 0) problems.push("job has no cost budget");
  if (job.budget.inputTokens <= 0 && job.budget.outputTokens <= 0) problems.push("job has no token budget");
  return problems;
}
