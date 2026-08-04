/* =============================================================================
 * Billing — ENTITLEMENT ENGINE (F5). Pure, provider-neutral, deterministic.
 *
 * The one place "what can this workspace do" is answered. Business code resolves
 * capability through a resolved `PlanEntitlements` — never a hardcoded tier.
 * A `null` limit means UNLIMITED; a missing limit is treated as 0 (deny).
 * ========================================================================== */

import {
  entitlementFeatureKeySchema,
  entitlementLimitKeySchema,
  type EntitlementFeatureKey,
  type EntitlementLimitKey,
  type PlanEntitlements,
  type SubscriptionAddon,
  type SubscriptionPlan,
  type WorkspaceSubscription,
} from "@brightloop/schema";

const LIMIT_KEYS = entitlementLimitKeySchema.options as readonly EntitlementLimitKey[];
const FEATURE_KEYS = entitlementFeatureKeySchema.options as readonly EntitlementFeatureKey[];

/** An empty entitlement grant — everything denied / off. Deterministic. */
export function emptyEntitlements(): PlanEntitlements {
  const limits = {} as Record<EntitlementLimitKey, number | null>;
  const features = {} as Record<EntitlementFeatureKey, boolean>;
  for (const k of LIMIT_KEYS) limits[k] = 0;
  for (const k of FEATURE_KEYS) features[k] = false;
  return { limits, features };
}

/** Read a limit as `number | null` (null = unlimited); a missing key = 0 (deny). */
export function limitOf(entitlements: PlanEntitlements, key: EntitlementLimitKey): number | null {
  const value = entitlements.limits[key];
  if (value === undefined) return 0;
  return value;
}

/** Is `key` unlimited in these entitlements? */
export function isUnlimited(entitlements: PlanEntitlements, key: EntitlementLimitKey): boolean {
  return entitlements.limits[key] === null;
}

/** Is a boolean feature enabled? Missing key = false. */
export function isFeatureEnabled(entitlements: PlanEntitlements, key: EntitlementFeatureKey): boolean {
  return entitlements.features[key] === true;
}

/**
 * Combine a base grant with an additive grant (scaled by `quantity`). `null`
 * (unlimited) on either side wins. Additive over the full key set — deterministic.
 */
export function mergeEntitlements(
  base: PlanEntitlements,
  grant: PlanEntitlements,
  quantity = 1,
): PlanEntitlements {
  const limits = {} as Record<EntitlementLimitKey, number | null>;
  const features = {} as Record<EntitlementFeatureKey, boolean>;
  for (const key of LIMIT_KEYS) {
    const baseVal = base.limits[key];
    const grantVal = grant.limits[key];
    if (baseVal === null || grantVal === null) {
      limits[key] = null; // unlimited absorbs everything
    } else {
      limits[key] = (baseVal ?? 0) + (grantVal ?? 0) * quantity;
    }
  }
  for (const key of FEATURE_KEYS) {
    features[key] = (base.features[key] === true) || (grant.features[key] === true);
  }
  return { limits, features };
}

/**
 * Resolve the EFFECTIVE entitlements for a plan plus its attached add-ons.
 * Start from the plan, fold each add-on grant by its quantity. Pure.
 */
export function resolveEntitlements(
  plan: SubscriptionPlan,
  addons: readonly SubscriptionAddon[] = [],
): PlanEntitlements {
  // Normalize the plan grant onto the full key set first (fills missing → 0/false).
  let resolved = mergeEntitlements(emptyEntitlements(), plan.entitlements, 1);
  for (const addon of addons) {
    resolved = mergeEntitlements(resolved, addon.grants, addon.quantity);
  }
  return resolved;
}

/** The result of checking a metered/structural limit before an action. */
export interface EntitlementCheck {
  key: EntitlementLimitKey;
  allowed: boolean;
  unlimited: boolean;
  limit: number | null;
  used: number;
  requested: number;
  /** Remaining allowance (`null` = unlimited). */
  remaining: number | null;
}

/**
 * Would consuming `requested` more of `key` (given `used` already consumed) stay
 * within the limit? Unlimited (`null`) always allows. Pure — the enforcement seam.
 */
export function checkLimit(
  entitlements: PlanEntitlements,
  key: EntitlementLimitKey,
  used: number,
  requested = 1,
): EntitlementCheck {
  const limit = limitOf(entitlements, key);
  if (limit === null) {
    return { key, allowed: true, unlimited: true, limit: null, used, requested, remaining: null };
  }
  const remaining = Math.max(0, limit - used);
  return {
    key,
    allowed: used + requested <= limit,
    unlimited: false,
    limit,
    used,
    requested,
    remaining,
  };
}

/** Fraction (0–1) of a limit consumed. Unlimited → 0. Missing/zero limit → 1 when used. */
export function utilization(entitlements: PlanEntitlements, key: EntitlementLimitKey, used: number): number {
  const limit = limitOf(entitlements, key);
  if (limit === null) return 0;
  if (limit <= 0) return used > 0 ? 1 : 0;
  return Math.min(1, used / limit);
}

/**
 * The full entitlement snapshot for a subscription — the effective grant, seat
 * count, and whether the subscription is in an entitled (non-lapsed) state.
 * A `canceled`/`expired`/`paused` subscription grants nothing operational.
 */
export interface EntitlementSnapshot {
  subscriptionId: string;
  planId: string;
  tier: SubscriptionPlan["tier"];
  active: boolean;
  seats: number;
  entitlements: PlanEntitlements;
}

/** States in which entitlements are honored. */
const ENTITLED_STATES = new Set<WorkspaceSubscription["status"]>(["trialing", "active", "past_due", "grace"]);

export function isEntitledStatus(status: WorkspaceSubscription["status"]): boolean {
  return ENTITLED_STATES.has(status);
}

/**
 * Build the entitlement snapshot for a subscription against a plan. When the
 * subscription is not in an entitled state, entitlements collapse to empty —
 * business code sees a hard stop, never a lingering allowance.
 */
export function entitlementSnapshot(
  subscription: WorkspaceSubscription,
  plan: SubscriptionPlan,
): EntitlementSnapshot {
  const active = isEntitledStatus(subscription.status);
  const resolved = active ? resolveEntitlements(plan, subscription.addons) : emptyEntitlements();
  return {
    subscriptionId: subscription.id,
    planId: plan.id,
    tier: plan.tier,
    active,
    seats: subscription.seats,
    entitlements: resolved,
  };
}
