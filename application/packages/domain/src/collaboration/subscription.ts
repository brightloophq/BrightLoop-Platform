/* =============================================================================
 * Subscription engine (Phase D · Sprint D7) — PURE.
 *
 * An internal user watches a target (workspace / initiative / task / review /
 * timeline / kpi). A user may hold at most one subscription per target — the
 * duplicate check is enforced by the application (loaded set) + a DB unique index.
 * ========================================================================== */

import type { Subscription, SubscriptionTargetType } from "@brightloop/schema";

export interface BuildSubscriptionInput {
  id: string;
  userId: string;
  workspaceId: string;
  clientId: string | null;
  targetType: SubscriptionTargetType;
  targetId: string;
  now: string;
}

/** Build a subscription record (pure). */
export function buildSubscription(input: BuildSubscriptionInput): Subscription {
  return {
    id: input.id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    targetType: input.targetType,
    targetId: input.targetId,
    createdAt: input.now,
  };
}

/** Is `user` already subscribed to `(targetType, targetId)` within `existing`? Pure. */
export function isDuplicateSubscription(existing: readonly Subscription[], userId: string, targetType: SubscriptionTargetType, targetId: string): boolean {
  return existing.some((s) => s.userId === userId && s.targetType === targetType && s.targetId === targetId);
}

/** The user ids subscribed to a target (recipients of its notifications). Pure. */
export function subscriberIds(existing: readonly Subscription[], targetType: SubscriptionTargetType, targetId: string): string[] {
  return [...new Set(existing.filter((s) => s.targetType === targetType && s.targetId === targetId).map((s) => s.userId))];
}
