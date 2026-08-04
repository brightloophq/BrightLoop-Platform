/* =============================================================================
 * Billing domain — pure-logic tests (F5). Catalogue integrity, entitlement
 * resolution + enforcement, deterministic usage aggregation, the invoice /
 * proration / discount / tax engine, subscription lifecycle + date math, and
 * notification derivation. No DB, no clock, fully deterministic.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  usageMeterSchema,
  workspaceSubscriptionSchema,
  type BillingUsageEvent,
  type UsageMeter,
  type WorkspaceSubscription,
} from "@brightloop/schema";
import {
  addDays,
  addMonths,
  aggregateUsage,
  applyInvoicePayment,
  buildInvoice,
  canTransitionSubscription,
  checkLimit,
  comparePlans,
  computeGraceEnd,
  computePeriod,
  computePlanChangeProration,
  computeTrialEnd,
  dedupeUsageEvents,
  deriveNotifications,
  emptyEntitlements,
  entitlementSnapshot,
  findPlan,
  isFeatureEnabled,
  isSubscriptionTerminal,
  mergeEntitlements,
  nextRetryAt,
  PLAN_CATALOG,
  resolveEntitlements,
  TIER_ORDER,
  tierRank,
  usageForMeter,
  USAGE_METER_LIMIT,
  utilization,
} from "../index.js";

const T0 = "2026-08-08T00:00:00.000Z";

function sub(overrides: Partial<WorkspaceSubscription> = {}): WorkspaceSubscription {
  return workspaceSubscriptionSchema.parse({
    id: "bsub_1",
    workspaceId: "ws_1",
    clientId: "cli_1",
    billingAccountId: "bacct_1",
    planId: "professional",
    tier: "professional",
    status: "active",
    interval: "month",
    seats: 20,
    quantity: 1,
    currentPeriodStartAt: T0,
    currentPeriodEndAt: addMonths(T0, 1),
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  });
}

function usageEvent(meter: UsageMeter, quantity: number, occurredAt: string, key: string): BillingUsageEvent {
  return {
    id: `bu_${key}`,
    workspaceId: "ws_1",
    clientId: "cli_1",
    subscriptionId: "bsub_1",
    meter,
    quantity,
    occurredAt,
    idempotencyKey: key,
    source: "system",
    metadata: {},
    createdAt: occurredAt,
  };
}

describe("plan catalogue", () => {
  it("exposes the five commercial tiers in ascending order", () => {
    expect(PLAN_CATALOG.map((p) => p.tier)).toEqual(TIER_ORDER);
    expect(PLAN_CATALOG).toHaveLength(5);
  });

  it("enterprise is quote-based and unlimited", () => {
    const ent = findPlan("enterprise");
    expect(ent?.priceCents).toBeNull();
    for (const key of Object.values(USAGE_METER_LIMIT)) {
      expect(ent?.entitlements.limits[key]).toBeNull();
    }
  });

  it("maps every usage meter to a distinct consumption limit", () => {
    const meters = usageMeterSchema.options as readonly UsageMeter[];
    const limits = meters.map((m) => USAGE_METER_LIMIT[m]);
    expect(new Set(limits).size).toBe(meters.length);
  });

  it("compares plans by tier", () => {
    expect(comparePlans("starter", "business")).toBe("upgrade");
    expect(comparePlans("business", "starter")).toBe("downgrade");
    expect(comparePlans("starter", "starter")).toBe("lateral");
    expect(tierRank("free")).toBeLessThan(tierRank("enterprise"));
  });
});

describe("entitlements", () => {
  it("resolves a plan's entitlements over the full key set", () => {
    const pro = findPlan("professional")!;
    const resolved = resolveEntitlements(pro, []);
    expect(resolved.limits.max_ai_executions).toBe(5_000);
    expect(resolved.features.premium_integrations).toBe(true);
  });

  it("adds an add-on grant scaled by quantity; unlimited absorbs", () => {
    const base = { limits: { max_ai_executions: 500 }, features: {} };
    const grant = { limits: { max_ai_executions: 5_000 }, features: {} };
    const merged = mergeEntitlements(emptyEntitlements(), base, 1);
    const withAddon = mergeEntitlements(merged, grant, 2);
    expect(withAddon.limits.max_ai_executions).toBe(500 + 5_000 * 2);

    const unlimited = mergeEntitlements(withAddon, { limits: { max_ai_executions: null }, features: {} }, 1);
    expect(unlimited.limits.max_ai_executions).toBeNull();
  });

  it("enforces limits: allow within, deny over, unlimited always allows", () => {
    const ent = resolveEntitlements(findPlan("starter")!, []);
    expect(checkLimit(ent, "max_ai_executions", 499, 1).allowed).toBe(true);
    expect(checkLimit(ent, "max_ai_executions", 500, 1).allowed).toBe(false);
    const entUnlimited = resolveEntitlements(findPlan("enterprise")!, []);
    const check = checkLimit(entUnlimited, "max_ai_executions", 10 ** 9, 1);
    expect(check.allowed).toBe(true);
    expect(check.unlimited).toBe(true);
    expect(check.remaining).toBeNull();
  });

  it("computes utilization and feature flags", () => {
    const ent = resolveEntitlements(findPlan("starter")!, []);
    expect(utilization(ent, "max_ai_executions", 250)).toBeCloseTo(0.5);
    expect(isFeatureEnabled(ent, "analytics_access")).toBe(true);
    expect(isFeatureEnabled(ent, "sso")).toBe(false);
  });

  it("collapses entitlements to empty for a non-entitled subscription", () => {
    const canceled = sub({ status: "canceled" });
    const snap = entitlementSnapshot(canceled, findPlan("professional")!);
    expect(snap.active).toBe(false);
    expect(snap.entitlements.limits.max_ai_executions).toBe(0);
  });
});

describe("usage aggregation", () => {
  const events = [
    usageEvent("ai_requests", 3, T0, "k1"),
    usageEvent("ai_requests", 2, addDays(T0, 1), "k2"),
    usageEvent("workflow_executions", 10, addDays(T0, 2), "k3"),
    usageEvent("ai_requests", 100, addDays(T0, 40), "k4"), // outside a 1-month window
  ];

  it("sums per meter (order-independent)", () => {
    const totals = aggregateUsage(events);
    expect(totals.ai_requests).toBe(105);
    expect(totals.workflow_executions).toBe(10);
    expect(aggregateUsage([...events].reverse()).ai_requests).toBe(105);
  });

  it("bounds aggregation to a window", () => {
    const window = { startAt: T0, endAt: addMonths(T0, 1) };
    expect(usageForMeter(events, "ai_requests", window)).toBe(5);
    expect(aggregateUsage(events, window).ai_requests).toBe(5);
  });

  it("dedupes replayed events by idempotency key", () => {
    const dup = [events[0]!, events[0]!, events[1]!];
    expect(dedupeUsageEvents(dup)).toHaveLength(2);
  });
});

describe("invoice engine", () => {
  it("builds a deterministic invoice with a stable checksum + idempotency key", () => {
    const plan = findPlan("professional")!;
    const period = computePeriod(T0, "month");
    const a = buildInvoice({ invoiceId: "binv_1", number: "INV-1", billingAccountId: "bacct_1", subscription: sub(), plan, period, now: T0, taxRateBps: 0 });
    const b = buildInvoice({ invoiceId: "binv_1", number: "INV-1", billingAccountId: "bacct_1", subscription: sub(), plan, period, now: T0, taxRateBps: 0 });
    expect(a.checksum).toBe(b.checksum);
    expect(a.idempotencyKey).toBe(`invoice:bsub_1:${T0}`);
    expect(a.totalCents).toBe(14_900);
  });

  it("applies discount and tax; totals reconcile", () => {
    const plan = findPlan("professional")!;
    const period = computePeriod(T0, "month");
    const discounted = sub({ discount: { couponId: "welcome20", code: "WELCOME20", type: "percent", value: 20, appliedAt: T0, expiresAt: null } });
    const inv = buildInvoice({ invoiceId: "binv_2", number: "INV-2", billingAccountId: "bacct_1", subscription: discounted, plan, period, now: T0, taxRateBps: 1000 });
    expect(inv.subtotalCents).toBe(14_900);
    expect(inv.discountCents).toBe(2_980); // 20%
    expect(inv.taxCents).toBe(Math.round((14_900 - 2_980) * 0.1)); // 10% of net
    expect(inv.totalCents).toBe(14_900 - 2_980 + inv.taxCents);
  });

  it("prorates and computes plan-change credit/charge", () => {
    const period = computePeriod(T0, "month");
    const mid = addDays(T0, 15);
    const proration = computePlanChangeProration(findPlan("starter")!, findPlan("professional")!, 1, period, mid);
    expect(proration.creditCents).toBeLessThanOrEqual(0); // unused starter time credited
    expect(proration.chargeCents).toBeGreaterThanOrEqual(0); // remaining pro time charged
    expect(proration.netCents).toBe(proration.creditCents + proration.chargeCents);
    // An upgrade mid-period nets a positive charge (pro costs more than starter).
    expect(proration.netCents).toBeGreaterThan(0);
  });

  it("applies payment: partial keeps due, full marks paid", () => {
    const plan = findPlan("professional")!;
    const inv = buildInvoice({ invoiceId: "binv_3", number: "INV-3", billingAccountId: "bacct_1", subscription: sub(), plan, period: computePeriod(T0, "month"), now: T0 });
    const partial = applyInvoicePayment(inv, 5_000, T0);
    expect(partial.fullyPaid).toBe(false);
    expect(partial.invoice.amountDueCents).toBe(14_900 - 5_000);
    const full = applyInvoicePayment(partial.invoice, 14_900 - 5_000, T0);
    expect(full.fullyPaid).toBe(true);
    expect(full.invoice.status).toBe("paid");
    expect(full.invoice.paidAt).toBe(T0);
  });
});

describe("subscription lifecycle + date math", () => {
  it("honors the subscription machine", () => {
    expect(canTransitionSubscription("trialing", "active")).toBe(true);
    expect(canTransitionSubscription("active", "expired")).toBe(false);
    expect(canTransitionSubscription("past_due", "grace")).toBe(true);
    expect(canTransitionSubscription("canceled", "active")).toBe(true);
    expect(isSubscriptionTerminal("expired")).toBe(true);
    expect(isSubscriptionTerminal("canceled")).toBe(false);
  });

  it("clamps month-end when adding months", () => {
    expect(addMonths("2026-01-31T00:00:00.000Z", 1)).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths("2026-12-15T00:00:00.000Z", 1)).toBe("2027-01-15T00:00:00.000Z");
  });

  it("computes trial end and grace window", () => {
    expect(computeTrialEnd(T0, 14)).toBe(addDays(T0, 14));
    expect(computeTrialEnd(T0, 0)).toBeNull();
    expect(computeGraceEnd(T0, 7)).toBe(addDays(T0, 7));
  });

  it("follows the payment retry schedule then exhausts", () => {
    expect(nextRetryAt(T0, 1)).toBe(addDays(T0, 1));
    expect(nextRetryAt(T0, 3)).toBe(addDays(T0, 5));
    expect(nextRetryAt(T0, 4)).toBeNull();
  });
});

describe("notification derivation", () => {
  it("warns when a trial is ending soon", () => {
    const s = sub({ status: "trialing", trialEndAt: addDays(T0, 2) });
    const notes = deriveNotifications({ now: T0, subscription: s, entitlements: emptyEntitlements(), usage: aggregateUsage([]) });
    expect(notes.some((n) => n.kind === "trial_ending")).toBe(true);
  });

  it("flags a past-due payment", () => {
    const s = sub({ status: "past_due", gracePeriodEndAt: addDays(T0, 7) });
    const notes = deriveNotifications({ now: T0, subscription: s, entitlements: emptyEntitlements(), usage: aggregateUsage([]) });
    expect(notes.some((n) => n.kind === "payment_failed")).toBe(true);
  });

  it("flags approaching and exceeded usage", () => {
    const ent = resolveEntitlements(findPlan("starter")!, []); // max_ai_executions 500
    const approaching = deriveNotifications({ now: T0, subscription: sub(), entitlements: ent, usage: { ...aggregateUsage([]), ai_requests: 450 } });
    expect(approaching.some((n) => n.kind === "usage_limit_approaching" && n.meter === "ai_requests")).toBe(true);
    const exceeded = deriveNotifications({ now: T0, subscription: sub(), entitlements: ent, usage: { ...aggregateUsage([]), ai_requests: 500 } });
    expect(exceeded.some((n) => n.kind === "usage_limit_exceeded" && n.meter === "ai_requests")).toBe(true);
  });
});
