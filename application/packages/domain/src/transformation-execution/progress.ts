/* =============================================================================
 * Progress engine (Phase D · Sprint D6) — PURE.
 *
 * Progress is DERIVED, never manually edited. Initiative progress is a fixed
 * weighted blend of the execution signals; workspace progress is the mean of its
 * initiatives'. All outputs are integers in [0, 100]. Deterministic.
 * ========================================================================== */

/** The weights (sum = 100). A signal contributes only its own weight. */
export const PROGRESS_WEIGHTS = { review: 20, tasks: 40, dependencies: 10, milestones: 20, timeline: 10 } as const;

export interface InitiativeProgressInput {
  /** An approved review exists. */
  approvedReview: boolean;
  taskTotal: number;
  taskCompleted: number;
  /** Whether every prerequisite dependency is satisfied (no open blocker). */
  dependenciesSatisfied: boolean;
  milestoneTotal: number;
  milestoneCompleted: number;
  /** The initiative's timeline is completed. */
  timelineCompleted: boolean;
}

const ratio = (done: number, total: number): number => (total <= 0 ? 0 : Math.min(1, Math.max(0, done / total)));
const clampPct = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

/** Deterministic initiative progress in [0, 100]. Pure. */
export function calculateInitiativeProgress(input: InitiativeProgressInput): number {
  const w = PROGRESS_WEIGHTS;
  const score =
    w.review * (input.approvedReview ? 1 : 0) +
    w.tasks * ratio(input.taskCompleted, input.taskTotal) +
    w.dependencies * (input.dependenciesSatisfied ? 1 : 0) +
    w.milestones * ratio(input.milestoneCompleted, input.milestoneTotal) +
    w.timeline * (input.timelineCompleted ? 1 : 0);
  return clampPct(score);
}

/** Deterministic workspace progress: the mean of initiative progresses. Pure. */
export function calculateWorkspaceProgress(initiativeProgresses: readonly number[]): number {
  if (initiativeProgresses.length === 0) return 0;
  return clampPct(initiativeProgresses.reduce((s, p) => s + p, 0) / initiativeProgresses.length);
}
