/* =============================================================================
 * Review workflow — STATE MACHINE + pure services (Phase D · Sprint D3).
 *
 * A review/approval gate against one initiative:
 *   pending → approved | changes_requested | rejected
 *   changes_requested → approved
 * `approved` and `rejected` are terminal. Pure: services validate the move and
 * produce the next aggregate + event/activity descriptors; they never write.
 * ========================================================================== */

import type { Review, ReviewStatus, TransformationActivityType } from "@brightloop/schema";
import type { TransformationWorkspaceEventName } from "./events.js";

export const REVIEW_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  pending: ["approved", "changes_requested", "rejected"],
  changes_requested: ["approved"],
  approved: [],
  rejected: [],
};

export function canTransitionReview(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

/** A decision target (never `pending`, which is only the initial state). */
export type ReviewDecision = Exclude<ReviewStatus, "pending">;

export interface ReviewTransition {
  review: Review;
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  summary: string;
}
export type ReviewTransitionOutcome = { ok: true; value: ReviewTransition } | { ok: false; reason: "illegal_transition" };

interface Descriptor {
  event: TransformationWorkspaceEventName;
  activityType: TransformationActivityType;
  verb: string;
}
const DESCRIPTOR: Record<ReviewDecision, Descriptor> = {
  approved: { event: "review.approved", activityType: "review_approved", verb: "approved" },
  changes_requested: { event: "review.changes_requested", activityType: "review_changes_requested", verb: "requested changes on" },
  rejected: { event: "review.rejected", activityType: "review_rejected", verb: "rejected" },
};

/**
 * Record a review decision. Pure — returns the next review (status set, version
 * bumped, decision actor + optional note recorded) or an illegal-transition
 * outcome the application maps to a 409.
 */
export function decideReview(review: Review, to: ReviewDecision, actorId: string, note: string | null): ReviewTransitionOutcome {
  if (!canTransitionReview(review.status, to)) return { ok: false, reason: "illegal_transition" };
  const d = DESCRIPTOR[to];
  return {
    ok: true,
    value: {
      review: { ...review, status: to, decisionActorId: actorId, note: note ?? review.note, version: review.version + 1 },
      event: d.event,
      activityType: d.activityType,
      summary: `Review of initiative ${review.initiativeId} ${d.verb}.`.slice(0, 400),
    },
  };
}

export const approveReview = (review: Review, actorId: string, note: string | null = null): ReviewTransitionOutcome => decideReview(review, "approved", actorId, note);
export const requestChanges = (review: Review, actorId: string, note: string | null = null): ReviewTransitionOutcome => decideReview(review, "changes_requested", actorId, note);
export const rejectReview = (review: Review, actorId: string, note: string | null = null): ReviewTransitionOutcome => decideReview(review, "rejected", actorId, note);

/** The activity descriptor for a decision (used by the idempotent re-assert path). */
export function describeReviewDecision(to: ReviewDecision): { event: TransformationWorkspaceEventName; activityType: TransformationActivityType } {
  const d = DESCRIPTOR[to];
  return { event: d.event, activityType: d.activityType };
}
