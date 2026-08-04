/* =============================================================================
 * Billing — NOTIFICATION DERIVATION (F5). Pure + deterministic.
 *
 * Given the current subscription + entitlements + usage, derive the customer-
 * facing billing notifications that are due. The application layer persists each
 * as a `notification.sent` billing event (idempotency-keyed → sent once).
 * ========================================================================== */

import {
  usageMeterSchema,
  type BillingNotificationKind,
  type PlanEntitlements,
  type UsageMeter,
  type WorkspaceSubscription,
} from "@brightloop/schema";

import { utilization } from "./entitlements.js";
import { daysBetweenIso } from "./lifecycle.js";
import { USAGE_METER_LIMIT } from "./plans.js";

const ALL_METERS = usageMeterSchema.options as readonly UsageMeter[];

export interface BillingNotificationDescriptor {
  kind: BillingNotificationKind;
  subscriptionId: string;
  meter: UsageMeter | null;
  summary: string;
  detail: Record<string, unknown>;
  /** Stable discriminator for the notification's idempotency key. */
  discriminator: string;
}

export interface NotificationInput {
  now: string;
  subscription: WorkspaceSubscription;
  entitlements: PlanEntitlements;
  usage: Record<UsageMeter, number>;
  /** Notify this many days before trial end (default 3). */
  trialEndingWithinDays?: number;
  /** Utilization fraction at which to warn (default 0.8). */
  approachingThreshold?: number;
}

/**
 * Derive due notifications. Deterministic and side-effect free; the order is
 * fixed (trial → payment → per-meter in meter order) for stable tests.
 */
export function deriveNotifications(input: NotificationInput): BillingNotificationDescriptor[] {
  const { now, subscription, entitlements, usage } = input;
  const withinDays = input.trialEndingWithinDays ?? 3;
  const threshold = input.approachingThreshold ?? 0.8;
  const out: BillingNotificationDescriptor[] = [];
  const periodKey = subscription.currentPeriodStartAt ?? subscription.createdAt;

  // 1) Trial ending soon.
  if (subscription.status === "trialing" && subscription.trialEndAt !== null) {
    const daysLeft = daysBetweenIso(now, subscription.trialEndAt);
    if (daysLeft >= 0 && daysLeft <= withinDays) {
      out.push({
        kind: "trial_ending",
        subscriptionId: subscription.id,
        meter: null,
        summary: `Your trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
        detail: { trialEndAt: subscription.trialEndAt, daysLeft },
        discriminator: subscription.trialEndAt,
      });
    }
  }

  // 2) Payment attention (past_due / grace).
  if (subscription.status === "past_due" || subscription.status === "grace") {
    out.push({
      kind: "payment_failed",
      subscriptionId: subscription.id,
      meter: null,
      summary: "A payment failed. Please update your payment method to avoid interruption.",
      detail: { status: subscription.status, gracePeriodEndAt: subscription.gracePeriodEndAt },
      discriminator: `${subscription.status}:${subscription.gracePeriodEndAt ?? periodKey}`,
    });
  }

  // 3) Per-meter usage thresholds (meter order = stable).
  for (const meter of ALL_METERS) {
    const used = usage[meter] ?? 0;
    const util = utilization(entitlements, USAGE_METER_LIMIT[meter], used);
    if (util >= 1) {
      out.push({
        kind: "usage_limit_exceeded",
        subscriptionId: subscription.id,
        meter,
        summary: `You've reached your ${meter.replace(/_/g, " ")} limit.`,
        detail: { meter, used, utilization: util },
        discriminator: `${periodKey}:${meter}:exceeded`,
      });
    } else if (util >= threshold) {
      out.push({
        kind: "usage_limit_approaching",
        subscriptionId: subscription.id,
        meter,
        summary: `You've used ${Math.round(util * 100)}% of your ${meter.replace(/_/g, " ")} allowance.`,
        detail: { meter, used, utilization: util },
        discriminator: `${periodKey}:${meter}:approaching`,
      });
    }
  }

  return out;
}
