/* =============================================================================
 * Billing application layer — use-case + authorization tests (F5).
 *
 * Drives the real use-cases over the in-memory repositories: subscription
 * lifecycle (trial / change / cancel / reactivate / coupon / add-on), the
 * invoice engine (issue idempotency, payment → paid + recovery, failure →
 * past_due + grace, refund, renew + trial conversion), usage metering
 * (idempotent replay), entitlement + usage reads, the enforcement seam, and
 * authorization (client cannot write; cross-tenant read denied; secret non-leak).
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createRuntimeServices,
  InMemoryRuntimeRepository,
  type Actor,
} from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
import { createInMemoryBillingRepos } from "./testing.js";
import {
  addAddon,
  applyCoupon,
  cancelSubscription,
  changePlan,
  createSubscription,
  reactivateSubscription,
  removeAddon,
} from "./subscription-usecases.js";
import {
  issueInvoice,
  recordInvoicePayment,
  recordPaymentFailure,
  refundInvoice,
  renewSubscription,
} from "./invoice-usecases.js";
import { recordUsage } from "./usage-usecases.js";
import { checkUsageAllowance, getBillingOverview, getUsageSummary, isFeatureEntitled, listAvailablePlans } from "./billing-read.js";
import { settleInvoiceViaProvider } from "./charge-usecases.js";

const T0 = "2026-08-08T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT_1: Actor = { userId: "u_c1", role: "client_admin", clientId: "cli_1" };
const CLIENT_2: Actor = { userId: "u_c2", role: "client_admin", clientId: "cli_2" };
const WS = "ws_bill";

let billing = createInMemoryBillingRepos();

function makeCtx(actor: Actor, clock: () => string = () => T0): AppContext {
  let n = 0;
  const ids = (p: string) => `${p}_${(n += 1)}`;
  return {
    services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock }),
    actor,
    ids,
    clock,
    billing,
  };
}

let ctx: AppContext;
beforeEach(() => {
  billing = createInMemoryBillingRepos();
  ctx = makeCtx(OWNER);
});

async function newProfessional() {
  return createSubscription(ctx, { workspaceId: WS, clientId: "cli_1", planId: "professional" });
}

describe("subscription lifecycle", () => {
  it("starts a trial for a trial plan and audits it", async () => {
    const sub = await newProfessional();
    expect(sub.status).toBe("trialing");
    expect(sub.trialEndAt).not.toBeNull();
    const history = await billing.events.listBySubscription(sub.id, 10);
    expect(history.ok && history.value.some((e) => e.type === "subscription.trial_started")).toBe(true);
  });

  it("activates a free plan immediately (no trial, no period end)", async () => {
    const sub = await createSubscription(ctx, { workspaceId: "ws_free", clientId: "cli_1", planId: "free" });
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodEndAt).toBeNull();
  });

  it("rejects a second subscription for the same workspace", async () => {
    await newProfessional();
    await expect(newProfessional()).rejects.toMatchObject({ code: "conflict" });
  });

  it("changes plan and records proration direction", async () => {
    const sub = await newProfessional();
    const changed = await changePlan(ctx, { subscriptionId: sub.id, planId: "business" });
    expect(changed.tier).toBe("business");
    const history = await billing.events.listBySubscription(sub.id, 10);
    const evt = history.ok ? history.value.find((e) => e.type === "subscription.plan_changed") : undefined;
    expect(evt?.detail.direction).toBe("upgrade");
  });

  it("cancels immediately vs at period end", async () => {
    const a = await createSubscription(ctx, { workspaceId: "ws_a", clientId: "cli_1", planId: "professional" });
    const canceledNow = await cancelSubscription(ctx, { subscriptionId: a.id });
    expect(canceledNow.status).toBe("canceled");

    const b = await createSubscription(ctx, { workspaceId: "ws_b", clientId: "cli_1", planId: "professional" });
    const atEnd = await cancelSubscription(ctx, { subscriptionId: b.id, atPeriodEnd: true });
    expect(atEnd.status).toBe("trialing");
    expect(atEnd.cancelAtPeriodEnd).toBe(true);
  });

  it("reactivates a canceled subscription only inside the paid period", async () => {
    const sub = await newProfessional();
    const canceled = await cancelSubscription(ctx, { subscriptionId: sub.id });
    const reactivated = await reactivateSubscription(ctx, { subscriptionId: canceled.id });
    expect(reactivated.status).toBe("active");
  });

  it("applies a coupon and manages add-ons", async () => {
    const sub = await newProfessional();
    const withCoupon = await applyCoupon(ctx, { subscriptionId: sub.id, couponCode: "WELCOME20" });
    expect(withCoupon.discount?.code).toBe("WELCOME20");
    const withAddon = await addAddon(ctx, { subscriptionId: sub.id, addonId: "extra_seats", quantity: 3 });
    expect(withAddon.addons.find((a) => a.addonId === "extra_seats")?.quantity).toBe(3);
    const removed = await removeAddon(ctx, { subscriptionId: sub.id, addonId: "extra_seats" });
    expect(removed.addons.some((a) => a.addonId === "extra_seats")).toBe(false);
  });
});

describe("invoice engine + dunning", () => {
  it("issues an invoice idempotently (same period replays)", async () => {
    const sub = await newProfessional();
    const a = await issueInvoice(ctx, { subscriptionId: sub.id });
    const b = await issueInvoice(ctx, { subscriptionId: sub.id });
    expect(a.id).toBe(b.id);
    expect(a.status).toBe("sent");
    expect(a.totalCents).toBe(14_900);
  });

  it("records a payment, marks paid, and recovers a past-due subscription", async () => {
    const sub = await newProfessional();
    const renewed = await renewSubscription(ctx, { subscriptionId: sub.id }); // trialing → active + invoice
    expect(renewed.subscription.status).toBe("active");
    const invoice = renewed.invoice!;

    const failed = await recordPaymentFailure(ctx, { invoiceId: invoice.id });
    expect(failed.status).toBe("pending");
    const afterFail = await getBillingOverview(ctx, WS);
    expect(afterFail.subscription?.status).toBe("past_due");
    expect(afterFail.subscription?.gracePeriodEndAt).not.toBeNull();

    const paid = await recordInvoicePayment(ctx, { invoiceId: invoice.id, amountCents: invoice.totalCents });
    expect(paid.status).toBe("paid");
    const afterPay = await getBillingOverview(ctx, WS);
    expect(afterPay.subscription?.status).toBe("active");
  });

  it("refunds a paid invoice", async () => {
    const sub = await newProfessional();
    const invoice = await issueInvoice(ctx, { subscriptionId: sub.id });
    await recordInvoicePayment(ctx, { invoiceId: invoice.id, amountCents: invoice.totalCents });
    const refunded = await refundInvoice(ctx, { invoiceId: invoice.id });
    expect(refunded.status).toBe("refunded");
  });
});

describe("usage metering", () => {
  it("records usage and replays a duplicate", async () => {
    const sub = await newProfessional();
    const first = await recordUsage(ctx, { subscriptionId: sub.id, meter: "ai_requests", quantity: 5, ordinal: "a" });
    expect(first.recorded).toBe(true);
    const dup = await recordUsage(ctx, { subscriptionId: sub.id, meter: "ai_requests", quantity: 5, ordinal: "a" });
    expect(dup.replayed).toBe(true);
    const summary = await getUsageSummary(ctx, WS);
    const ai = summary?.meters.find((m) => m.meter === "ai_requests");
    expect(ai?.used).toBe(5);
  });
});

describe("entitlement enforcement seam", () => {
  it("allows within limit and denies over the current-period limit", async () => {
    const sub = await createSubscription(ctx, { workspaceId: WS, clientId: "cli_1", planId: "starter" }); // ai limit 500
    await recordUsage(ctx, { subscriptionId: sub.id, meter: "ai_requests", quantity: 450, ordinal: "x" });
    const allow = await checkUsageAllowance(ctx, WS, "ai_requests", 50);
    expect(allow.allowed).toBe(true);
    const deny = await checkUsageAllowance(ctx, WS, "ai_requests", 51);
    expect(deny.allowed).toBe(false);
    expect(deny.remaining).toBe(50);
  });

  it("resolves feature entitlements; unsubscribed workspace denies", async () => {
    await createSubscription(ctx, { workspaceId: WS, clientId: "cli_1", planId: "professional" });
    expect(await isFeatureEntitled(ctx, WS, "premium_integrations")).toBe(true);
    expect(await isFeatureEntitled(ctx, "ws_nobody", "premium_integrations")).toBe(false);
  });

  it("lists the public plan catalogue for a read holder", () => {
    const plans = listAvailablePlans(ctx);
    expect(plans.map((p) => p.id)).toContain("enterprise");
  });
});

describe("authorization + isolation", () => {
  it("a client actor cannot create a subscription", async () => {
    const clientCtx = makeCtx(CLIENT_1);
    await expect(
      createSubscription(clientCtx, { workspaceId: WS, clientId: "cli_1", planId: "professional" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a same-org client may read its billing; another org may not", async () => {
    await newProfessional(); // owned by cli_1
    const owned = await getBillingOverview(makeCtx(CLIENT_1), WS);
    expect(owned.subscription?.tier).toBe("professional");
    await expect(getBillingOverview(makeCtx(CLIENT_2), WS)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no provider reference, checksum, or idempotency key leaks into a DTO", async () => {
    const sub = await newProfessional();
    const invoice = await issueInvoice(ctx, { subscriptionId: sub.id });
    const overview = await getBillingOverview(ctx, WS);
    const serialized = JSON.stringify({ sub, invoice, overview });
    expect(serialized).not.toMatch(/providerSubscriptionRef|providerInvoiceRef|providerCustomerRef|checksum|idempotencyKey/);
  });
});

describe("payment settlement façade (commerce connector reuse)", () => {
  it("degrades gracefully when no payment connector is installed", async () => {
    const sub = await newProfessional();
    const invoice = await issueInvoice(ctx, { subscriptionId: sub.id });
    const result = await settleInvoiceViaProvider(ctx, { invoiceId: invoice.id });
    expect(result.settled).toBe(false);
    expect(result.reason).toBe("no_payment_connector");
    expect(result.invoice.status).toBe("sent"); // untouched
  });
});
