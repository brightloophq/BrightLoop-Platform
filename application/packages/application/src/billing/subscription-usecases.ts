/* =============================================================================
 * Billing — subscription command use-cases (F5).
 *
 * create / changePlan / cancel / reactivate / pause / resume / applyCoupon /
 * addAddon / removeAddon. Each: validate → authorize → domain logic → persist →
 * audit → DTO. Subscription writes are internal (billing.subscription.write).
 * ========================================================================== */

import {
  subscriptionAddonSchema,
  subscriptionDiscountSchema,
  workspaceSubscriptionSchema,
  type SubscriptionDiscount,
  type WorkspaceSubscription,
} from "@brightloop/schema";
import {
  comparePlans,
  computePeriod,
  computePlanChangeProration,
  computeTrialEnd,
  findAddon,
  findCouponByCode,
  findPlan,
  resolveEntitlements,
} from "@brightloop/domain";

import { authorize, BILLING_SUBSCRIPTION_CAP, requireBilling, type AppContext } from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toWorkspaceSubscriptionDTO, type WorkspaceSubscriptionDTO } from "./dto.js";
import { appendBillingEvent, ensureAccount, loadSubscription, transitionSubscription } from "./shared.js";

export interface CreateSubscriptionInput {
  workspaceId: string;
  clientId?: string | null;
  planId: string;
  seats?: number;
  couponCode?: string;
}

/** Start a subscription for a workspace. One subscription per workspace. */
export async function createSubscription(ctx: AppContext, input: CreateSubscriptionInput): Promise<WorkspaceSubscriptionDTO> {
  const workspaceId = requireId(input.workspaceId, "workspaceId");
  const planId = requireString(input.planId, "planId");
  const clientId = input.clientId ?? null;
  authorize(ctx.actor, BILLING_SUBSCRIPTION_CAP, clientId);

  const plan = findPlan(planId);
  if (plan === null) throw new ValidationError("Unknown plan", { planId: "unknown" });

  const repo = requireBilling(ctx);
  const existing = unwrap(await repo.subscriptions.findByWorkspace(workspaceId));
  if (existing !== null) throw new ConflictError("This workspace already has a subscription");

  const account = await ensureAccount(ctx, workspaceId, clientId, BILLING_SUBSCRIPTION_CAP);
  const now = ctx.clock();

  // Trial vs immediate activation. A trial plan starts `trialing`; otherwise the
  // subscription is `active` (free plans and net-term paid plans).
  const trialEndAt = computeTrialEnd(now, plan.trialDays);
  const status = trialEndAt !== null ? "trialing" : "active";
  const period = computePeriod(now, plan.interval);

  // Optional coupon.
  let discount: SubscriptionDiscount | null = null;
  if (input.couponCode !== undefined && input.couponCode.trim() !== "") {
    const coupon = findCouponByCode(input.couponCode);
    if (coupon === null || !coupon.active) throw new ValidationError("Unknown or inactive coupon", { couponCode: "invalid" });
    if (coupon.appliesToTiers.length > 0 && !coupon.appliesToTiers.includes(plan.tier)) {
      throw new ValidationError("This coupon does not apply to the selected plan", { couponCode: "tier" });
    }
    discount = subscriptionDiscountSchema.parse({
      couponId: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      appliedAt: now,
      expiresAt: null,
    });
  }

  const subscription = workspaceSubscriptionSchema.parse({
    id: ctx.ids("bsub"),
    workspaceId,
    clientId,
    billingAccountId: account.id,
    planId: plan.id,
    tier: plan.tier,
    status,
    interval: plan.interval,
    seats: input.seats ?? plan.seatsIncluded,
    quantity: 1,
    trialStartAt: trialEndAt !== null ? now : null,
    trialEndAt,
    currentPeriodStartAt: period.startAt,
    currentPeriodEndAt: plan.interval === "none" ? null : period.endAt,
    discount,
    addons: [],
    createdAt: now,
    updatedAt: now,
  });
  const created = unwrap(await repo.subscriptions.create(subscription));

  await appendBillingEvent(ctx, {
    workspaceId,
    clientId,
    subscriptionId: created.id,
    type: status === "trialing" ? "subscription.trial_started" : "subscription.created",
    summary: `Subscribed to ${plan.name} (${status})`,
    detail: { planId: plan.id, tier: plan.tier, status },
  });

  return toWorkspaceSubscriptionDTO(created);
}

export interface ChangePlanInput {
  subscriptionId: string;
  planId: string;
}

/**
 * Move a subscription to a different plan. Proration for the remainder of the
 * current period is recorded on the event (an actual proration invoice is issued
 * by the invoice engine on the next settlement). Quote-based plans never fabricate
 * a price, so their proration is 0.
 */
export async function changePlan(ctx: AppContext, input: ChangePlanInput): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  const nextPlan = findPlan(requireString(input.planId, "planId"));
  if (nextPlan === null) throw new ValidationError("Unknown plan", { planId: "unknown" });
  if (nextPlan.id === sub.planId) throw new ConflictError("The subscription is already on this plan");

  const currentPlan = findPlan(sub.planId);
  const direction = comparePlans(sub.planId, nextPlan.id);
  const repo = requireBilling(ctx);
  const now = ctx.clock();

  let prorationDetail: Record<string, unknown> = { direction };
  if (
    currentPlan !== null &&
    sub.currentPeriodStartAt !== null &&
    sub.currentPeriodEndAt !== null &&
    currentPlan.priceCents !== null &&
    nextPlan.priceCents !== null
  ) {
    const proration = computePlanChangeProration(
      currentPlan,
      nextPlan,
      sub.quantity,
      { startAt: sub.currentPeriodStartAt, endAt: sub.currentPeriodEndAt },
      now,
    );
    prorationDetail = { direction, ...proration };
  }

  const next: WorkspaceSubscription = {
    ...sub,
    planId: nextPlan.id,
    tier: nextPlan.tier,
    interval: nextPlan.interval,
    version: sub.version + 1,
    updatedAt: now,
  };
  const saved = unwrap(await repo.subscriptions.save(next, sub.version));

  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.id,
    type: "subscription.plan_changed",
    summary: `Plan changed to ${nextPlan.name} (${direction})`,
    detail: { fromPlanId: sub.planId, toPlanId: nextPlan.id, ...prorationDetail },
  });

  return toWorkspaceSubscriptionDTO(saved);
}

export interface CancelSubscriptionInput {
  subscriptionId: string;
  /** When true, cancel at period end (keep access until then); else cancel now. */
  atPeriodEnd?: boolean;
  reason?: string;
}

/** Cancel a subscription — immediately or at the end of the current period. */
export async function cancelSubscription(ctx: AppContext, input: CancelSubscriptionInput): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  if (sub.status === "canceled" || sub.status === "expired") {
    throw new ConflictError("The subscription is already canceled");
  }
  const now = ctx.clock();

  if (input.atPeriodEnd === true) {
    const repo = requireBilling(ctx);
    const next: WorkspaceSubscription = { ...sub, cancelAtPeriodEnd: true, version: sub.version + 1, updatedAt: now };
    const saved = unwrap(await repo.subscriptions.save(next, sub.version));
    await appendBillingEvent(ctx, {
      workspaceId: saved.workspaceId,
      clientId: saved.clientId,
      subscriptionId: saved.id,
      type: "subscription.canceled",
      summary: "Cancellation scheduled at period end",
      detail: { atPeriodEnd: true, reason: input.reason ?? null },
    });
    return toWorkspaceSubscriptionDTO(saved);
  }

  const saved = await transitionSubscription(
    ctx,
    sub,
    "canceled",
    { cancelAtPeriodEnd: false, canceledAt: now },
    { type: "subscription.canceled", summary: "Subscription canceled", detail: { atPeriodEnd: false, reason: input.reason ?? null } },
  );
  return toWorkspaceSubscriptionDTO(saved);
}

export interface ReactivateSubscriptionInput {
  subscriptionId: string;
}

/**
 * Reactivate a canceled subscription — allowed ONLY while still inside the paid
 * period. A lapsed (`expired`) subscription is never resurrected; the caller must
 * start a new subscription.
 */
export async function reactivateSubscription(ctx: AppContext, input: ReactivateSubscriptionInput): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  if (sub.status === "expired") throw new ConflictError("This subscription has expired; start a new subscription");
  if (sub.status !== "canceled") throw new ConflictError("Only a canceled subscription can be reactivated");
  const now = ctx.clock();
  if (sub.currentPeriodEndAt !== null && now >= sub.currentPeriodEndAt) {
    throw new ConflictError("The paid period has ended; start a new subscription");
  }
  const saved = await transitionSubscription(
    ctx,
    sub,
    "active",
    { cancelAtPeriodEnd: false, canceledAt: null },
    { type: "subscription.reactivated", summary: "Subscription reactivated" },
  );
  return toWorkspaceSubscriptionDTO(saved);
}

/** Pause an active subscription. */
export async function pauseSubscription(ctx: AppContext, input: { subscriptionId: string }): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  const saved = await transitionSubscription(ctx, sub, "paused", {}, { type: "subscription.paused", summary: "Subscription paused" });
  return toWorkspaceSubscriptionDTO(saved);
}

/** Resume a paused subscription. */
export async function resumeSubscription(ctx: AppContext, input: { subscriptionId: string }): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  const saved = await transitionSubscription(ctx, sub, "active", {}, { type: "subscription.resumed", summary: "Subscription resumed" });
  return toWorkspaceSubscriptionDTO(saved);
}

export interface ApplyCouponInput {
  subscriptionId: string;
  couponCode: string;
}

/** Apply a coupon to an existing subscription. */
export async function applyCoupon(ctx: AppContext, input: ApplyCouponInput): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  const coupon = findCouponByCode(requireString(input.couponCode, "couponCode"));
  if (coupon === null || !coupon.active) throw new ValidationError("Unknown or inactive coupon", { couponCode: "invalid" });
  if (coupon.appliesToTiers.length > 0 && !coupon.appliesToTiers.includes(sub.tier)) {
    throw new ValidationError("This coupon does not apply to the current plan", { couponCode: "tier" });
  }
  const now = ctx.clock();
  const discount = subscriptionDiscountSchema.parse({
    couponId: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    appliedAt: now,
    expiresAt: null,
  });
  const repo = requireBilling(ctx);
  const next: WorkspaceSubscription = { ...sub, discount, version: sub.version + 1, updatedAt: now };
  const saved = unwrap(await repo.subscriptions.save(next, sub.version));
  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.id,
    type: "coupon.applied",
    summary: `Coupon ${coupon.code} applied`,
    detail: { couponId: coupon.id, type: coupon.type, value: coupon.value },
  });
  return toWorkspaceSubscriptionDTO(saved);
}

export interface AddonInput {
  subscriptionId: string;
  addonId: string;
  quantity?: number;
}

/** Attach (or increase the quantity of) an add-on. */
export async function addAddon(ctx: AppContext, input: AddonInput): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  const addon = findAddon(requireString(input.addonId, "addonId"));
  if (addon === null || !addon.available) throw new ValidationError("Unknown or unavailable add-on", { addonId: "invalid" });
  const quantity = Math.max(1, Math.trunc(input.quantity ?? 1));

  const others = sub.addons.filter((a) => a.addonId !== addon.id);
  const nextAddon = subscriptionAddonSchema.parse({
    addonId: addon.id,
    name: addon.name,
    quantity,
    unitPriceCents: addon.unitPriceCents,
    grants: addon.grants,
  });
  const now = ctx.clock();
  const repo = requireBilling(ctx);
  const next: WorkspaceSubscription = { ...sub, addons: [...others, nextAddon], version: sub.version + 1, updatedAt: now };
  const saved = unwrap(await repo.subscriptions.save(next, sub.version));
  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.id,
    type: "subscription.plan_changed",
    summary: `Add-on ${addon.name} ×${quantity}`,
    detail: { addonId: addon.id, quantity },
  });
  return toWorkspaceSubscriptionDTO(saved);
}

/** Remove an add-on entirely. */
export async function removeAddon(ctx: AppContext, input: { subscriptionId: string; addonId: string }): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_SUBSCRIPTION_CAP);
  const addonId = requireString(input.addonId, "addonId");
  if (!sub.addons.some((a) => a.addonId === addonId)) throw new NotFoundError("subscription add-on");
  const now = ctx.clock();
  const repo = requireBilling(ctx);
  const next: WorkspaceSubscription = {
    ...sub,
    addons: sub.addons.filter((a) => a.addonId !== addonId),
    version: sub.version + 1,
    updatedAt: now,
  };
  const saved = unwrap(await repo.subscriptions.save(next, sub.version));
  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.id,
    type: "subscription.plan_changed",
    summary: `Add-on ${addonId} removed`,
    detail: { addonId },
  });
  return toWorkspaceSubscriptionDTO(saved);
}

/** The resolved effective entitlements for a subscription (for internal reuse). */
export function subscriptionEntitlements(sub: WorkspaceSubscription) {
  const plan = findPlan(sub.planId);
  if (plan === null) return null;
  return resolveEntitlements(plan, sub.addons);
}
