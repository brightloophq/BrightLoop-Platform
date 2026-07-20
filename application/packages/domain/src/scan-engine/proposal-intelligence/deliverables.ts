/* =============================================================================
 * Deliverables (Sprint 11 §4 · AIS-004 §03) — PURE.
 *
 * "Deliverables map one-to-one from the approved, prioritized moves." Each
 * deliverable must link at least one scope item; a deliverable with no scope has
 * nothing to deliver and is rejected. No delivery EXECUTION happens here — the
 * status model is a contract only.
 * ========================================================================== */

import {
  proposalDeliverableSchema,
  type DeliverableStatus,
  type ProposalDeliverable,
  type ProposalScopeItem,
} from "@brightloop/schema";

/** Legal deliverable status transitions (contract only — nothing executes). */
const TRANSITIONS: Record<DeliverableStatus, DeliverableStatus[]> = {
  proposed: ["approved", "deferred", "rejected"],
  approved: ["in_progress", "blocked", "deferred"],
  in_progress: ["delivered", "blocked"],
  blocked: ["in_progress", "deferred"],
  delivered: ["accepted", "rejected"],
  accepted: [],
  rejected: ["proposed"],
  deferred: ["proposed"],
};

export function canDeliverableTransition(from: DeliverableStatus, to: DeliverableStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionDeliverable(deliverable: ProposalDeliverable, to: DeliverableStatus): ProposalDeliverable {
  if (!canDeliverableTransition(deliverable.status, to)) return deliverable;
  return proposalDeliverableSchema.parse({ ...deliverable, status: to });
}

export interface BuildDeliverablesInput {
  idFor: (scope: ProposalScopeItem, index: number) => string;
  scope: readonly ProposalScopeItem[];
  /** Default artifact format when the caller does not specify one. */
  formatFor?: (scope: ProposalScopeItem) => string;
  ownerRoleFor?: (scope: ProposalScopeItem) => string | null;
  qualityCriteriaFor?: (scope: ProposalScopeItem) => string[];
}

/**
 * Build one deliverable per work scope item. Non-work scope (responsibilities,
 * boundaries, exclusions) produces no deliverable. Deterministic.
 */
export function buildDeliverables(input: BuildDeliverablesInput): { deliverables: ProposalDeliverable[]; rejected: { scopeId: string; reason: string }[] } {
  const deliverables: ProposalDeliverable[] = [];
  const rejected: { scopeId: string; reason: string }[] = [];
  let index = 0;

  for (const scope of [...input.scope].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (scope.kind !== "mandatory" && scope.kind !== "optional") continue; // only work produces deliverables
    if (scope.workstreamId === null) {
      rejected.push({ scopeId: scope.id, reason: "scope item is not attached to a workstream" });
      continue;
    }
    deliverables.push(
      proposalDeliverableSchema.parse({
        id: input.idFor(scope, index++),
        workstreamId: scope.workstreamId,
        title: scope.title,
        description: scope.description,
        linkedScopeIds: [scope.id],
        format: input.formatFor?.(scope) ?? "implementation",
        ownerRole: input.ownerRoleFor?.(scope) ?? null,
        acceptanceCriteria: scope.acceptanceCriteria,
        dependencies: scope.dependencies,
        targetMilestoneId: null,
        qualityCriteria: input.qualityCriteriaFor?.(scope) ?? [],
        reviewGates: scope.reviewRequired ? ["internal_review"] : [],
        evidenceOfCompletion: [],
        status: "proposed",
        limitations: scope.limitations,
      }),
    );
  }
  return { deliverables, rejected };
}

/** Attach deliverables to their target milestone. Returns new values. Pure. */
export function assignMilestone(deliverables: readonly ProposalDeliverable[], milestoneId: string, deliverableIds: readonly string[]): ProposalDeliverable[] {
  const target = new Set(deliverableIds);
  return deliverables.map((d) => (target.has(d.id) ? { ...d, targetMilestoneId: milestoneId } : d));
}
