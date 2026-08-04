/* =============================================================================
 * Billing — invoice & recurring-billing use-cases (F5).
 *
 * issue / renew / recordPayment / recordPaymentFailure / refund + the dunning
 * transitions (past_due → grace → expired, and recovery). Invoice generation is
 * idempotent per (subscription, period): a re-run replays the existing invoice
 * rather than double-charging. Engine writes need billing.invoice.write.
 * ========================================================================== */

import type { BillingInvoice, UsageMeter, WorkspaceSubscription } from "@brightloop/schema";
import {
  applyInvoicePayment,
  buildInvoice,
  computeGraceEnd,
  computePeriod,
  DEFAULT_GRACE_DAYS,
  findPlan,
  invoiceKey,
  type ProrationCharge,
} from "@brightloop/domain";

import { BILLING_INVOICE_CAP, requireBilling, type AppContext } from "../context.js";
import { ConflictError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toInvoiceDTO, toWorkspaceSubscriptionDTO, type InvoiceDTO, type WorkspaceSubscriptionDTO } from "./dto.js";
import { appendBillingEvent, loadInvoice, loadSubscription, transitionSubscription } from "./shared.js";

function invoiceNumber(subscriptionId: string, periodStartAt: string): string {
  return `INV-${subscriptionId.slice(-6).toUpperCase()}-${periodStartAt.slice(0, 10).replace(/-/g, "")}`;
}

export interface IssueInvoiceInput {
  subscriptionId: string;
  taxRateBps?: number;
  usageCharges?: { meter: UsageMeter; quantity: number; unitAmountCents: number; description?: string }[];
  prorations?: ProrationCharge[];
  /** Period start; defaults to the subscription's current period start. */
  periodStartAt?: string;
  /** Days until due (default 0 — due on issue). */
  dueInDays?: number;
}

/**
 * Issue (build + finalize) an invoice for a subscription's current period.
 * Idempotent: the same period returns the already-issued invoice (replay).
 */
export async function issueInvoice(ctx: AppContext, input: IssueInvoiceInput): Promise<InvoiceDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_INVOICE_CAP);
  const plan = findPlan(sub.planId);
  if (plan === null) throw new ValidationError("Subscription references an unknown plan", { planId: "unknown" });

  const periodStartAt = input.periodStartAt ?? sub.currentPeriodStartAt ?? ctx.clock();
  const period = computePeriod(periodStartAt, plan.interval);
  const repo = requireBilling(ctx);

  // Idempotency — one invoice per (subscription, period).
  const key = invoiceKey(sub.id, period.startAt);
  const existing = unwrap(await repo.invoices.findByIdempotencyKey(key));
  if (existing !== null) return toInvoiceDTO(existing);

  const now = ctx.clock();
  const dueAt = input.dueInDays && input.dueInDays > 0 ? computeGraceEnd(now, input.dueInDays) : now;
  const draft = buildInvoice({
    invoiceId: ctx.ids("binv"),
    number: invoiceNumber(sub.id, period.startAt),
    billingAccountId: sub.billingAccountId,
    subscription: sub,
    plan,
    period,
    now,
    dueAt,
    taxRateBps: input.taxRateBps ?? 0,
    usageCharges: input.usageCharges ?? [],
    prorations: input.prorations ?? [],
  });
  const created = unwrap(await repo.invoices.create(draft));

  // Finalize: draft → sent, stamp issuedAt.
  const finalized: BillingInvoice = {
    ...created,
    status: "sent",
    issuedAt: now,
    version: created.version + 1,
    updatedAt: now,
  };
  const saved = unwrap(await repo.invoices.save(finalized, created.version));

  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: sub.id,
    invoiceId: saved.id,
    type: "invoice.issued",
    summary: `Invoice ${saved.number} issued (${saved.totalCents} ${saved.currency})`,
    detail: { totalCents: saved.totalCents, periodStartAt: period.startAt },
    idempotencyKey: `issued:${key}`,
  });

  return toInvoiceDTO(saved);
}

export interface RecordPaymentInput {
  invoiceId: string;
  amountCents: number;
  at?: string;
}

/**
 * Record a payment against an invoice. Full settlement marks the invoice `paid`
 * and RECOVERS a past-due / grace subscription to `active`. Partial payment moves
 * a `sent` invoice to `pending`.
 */
export async function recordInvoicePayment(ctx: AppContext, input: RecordPaymentInput): Promise<InvoiceDTO> {
  const invoice = await loadInvoice(ctx, requireId(input.invoiceId, "invoiceId"), BILLING_INVOICE_CAP);
  if (invoice.status === "paid" || invoice.status === "refunded") {
    throw new ConflictError("The invoice is already settled");
  }
  const amountCents = Math.max(0, Math.trunc(input.amountCents));
  if (amountCents <= 0) throw new ValidationError("Payment amount must be positive", { amountCents: "invalid" });
  const at = input.at ?? ctx.clock();
  const repo = requireBilling(ctx);

  const result = applyInvoicePayment(invoice, amountCents, at);
  let nextStatus = result.invoice.status;
  if (!result.fullyPaid && invoice.status === "sent") nextStatus = "pending";

  const next: BillingInvoice = { ...result.invoice, status: nextStatus, version: invoice.version + 1, updatedAt: at };
  const saved = unwrap(await repo.invoices.save(next, invoice.version));

  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.subscriptionId,
    invoiceId: saved.id,
    type: result.fullyPaid ? "invoice.paid" : "invoice.finalized",
    summary: result.fullyPaid ? `Invoice ${saved.number} paid` : `Partial payment on ${saved.number}`,
    detail: { amountCents, amountDueCents: saved.amountDueCents },
    idempotencyKey: result.fullyPaid ? `paid:${saved.idempotencyKey}` : null,
  });

  // Recover a dunning subscription on full settlement.
  if (result.fullyPaid && saved.subscriptionId !== null) {
    const sub = unwrap(await repo.subscriptions.getById(saved.subscriptionId));
    if (sub !== null && (sub.status === "past_due" || sub.status === "grace")) {
      await transitionSubscription(
        ctx,
        sub,
        "active",
        { gracePeriodEndAt: null },
        { type: "subscription.activated", summary: "Payment recovered — subscription reactivated" },
      );
    }
  }

  return toInvoiceDTO(saved);
}

export interface PaymentFailureInput {
  invoiceId: string;
  at?: string;
  graceDays?: number;
}

/**
 * Record a failed payment attempt. Increments the attempt count, advances the
 * invoice toward `failed`, and drives the subscription into `past_due` with a
 * grace window. Deterministic; the grace window is set from the failure instant.
 */
export async function recordPaymentFailure(ctx: AppContext, input: PaymentFailureInput): Promise<InvoiceDTO> {
  const invoice = await loadInvoice(ctx, requireId(input.invoiceId, "invoiceId"), BILLING_INVOICE_CAP);
  if (invoice.status === "paid" || invoice.status === "refunded") {
    throw new ConflictError("The invoice is already settled");
  }
  const at = input.at ?? ctx.clock();
  const repo = requireBilling(ctx);

  // Invoice: sent → pending (attempted), pending/overdue → failed.
  let nextStatus = invoice.status;
  if (invoice.status === "sent") nextStatus = "pending";
  else if (invoice.status === "pending" || invoice.status === "overdue") nextStatus = "failed";

  const next: BillingInvoice = {
    ...invoice,
    status: nextStatus,
    attemptCount: invoice.attemptCount + 1,
    version: invoice.version + 1,
    updatedAt: at,
  };
  const saved = unwrap(await repo.invoices.save(next, invoice.version));

  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.subscriptionId,
    invoiceId: saved.id,
    type: "invoice.payment_failed",
    summary: `Payment failed on ${saved.number} (attempt ${saved.attemptCount})`,
    detail: { attempt: saved.attemptCount, status: nextStatus },
  });

  // Subscription: active → past_due with a grace window.
  if (saved.subscriptionId !== null) {
    const sub = unwrap(await repo.subscriptions.getById(saved.subscriptionId));
    if (sub !== null && sub.status === "active") {
      const graceEnd = computeGraceEnd(at, input.graceDays ?? DEFAULT_GRACE_DAYS);
      await transitionSubscription(
        ctx,
        sub,
        "past_due",
        { gracePeriodEndAt: graceEnd },
        { type: "subscription.past_due", summary: "Subscription past due", detail: { gracePeriodEndAt: graceEnd } },
      );
    }
  }

  return toInvoiceDTO(saved);
}

/** Refund a paid invoice. */
export async function refundInvoice(ctx: AppContext, input: { invoiceId: string }): Promise<InvoiceDTO> {
  const invoice = await loadInvoice(ctx, requireId(input.invoiceId, "invoiceId"), BILLING_INVOICE_CAP);
  if (invoice.status !== "paid") throw new ConflictError("Only a paid invoice can be refunded");
  const now = ctx.clock();
  const repo = requireBilling(ctx);
  const next: BillingInvoice = { ...invoice, status: "refunded", version: invoice.version + 1, updatedAt: now };
  const saved = unwrap(await repo.invoices.save(next, invoice.version));
  await appendBillingEvent(ctx, {
    workspaceId: saved.workspaceId,
    clientId: saved.clientId,
    subscriptionId: saved.subscriptionId,
    invoiceId: saved.id,
    type: "invoice.refunded",
    summary: `Invoice ${saved.number} refunded`,
    detail: { totalCents: saved.totalCents },
  });
  return toInvoiceDTO(saved);
}

/**
 * Renew a subscription into its next period and issue the period invoice. A
 * trialing subscription converts to `active`. Idempotent via the invoice key.
 */
export async function renewSubscription(
  ctx: AppContext,
  input: { subscriptionId: string; taxRateBps?: number },
): Promise<{ subscription: WorkspaceSubscriptionDTO; invoice: InvoiceDTO | null }> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_INVOICE_CAP);
  const plan = findPlan(sub.planId);
  if (plan === null) throw new ValidationError("Subscription references an unknown plan", { planId: "unknown" });
  if (plan.interval === "none") throw new ConflictError("A non-recurring plan does not renew");
  if (sub.status === "canceled" || sub.status === "expired" || sub.status === "paused") {
    throw new ConflictError(`A ${sub.status} subscription cannot be renewed`);
  }

  const now = ctx.clock();
  const nextPeriodStart = sub.currentPeriodEndAt ?? now;
  const period = computePeriod(nextPeriodStart, plan.interval);
  const repo = requireBilling(ctx);

  // Advance the subscription period; convert a trial to active.
  const converting = sub.status === "trialing";
  const patch: Partial<WorkspaceSubscription> = {
    currentPeriodStartAt: period.startAt,
    currentPeriodEndAt: period.endAt,
  };
  let nextSub: WorkspaceSubscription;
  if (converting) {
    nextSub = await transitionSubscription(ctx, sub, "active", patch, {
      type: "subscription.trial_converted",
      summary: "Trial converted to active",
    });
  } else {
    nextSub = unwrap(
      await repo.subscriptions.save({ ...sub, ...patch, version: sub.version + 1, updatedAt: now }, sub.version),
    );
  }

  // If cancel-at-period-end was set, cancel now instead of billing.
  if (nextSub.cancelAtPeriodEnd) {
    const canceled = await transitionSubscription(ctx, nextSub, "canceled", { canceledAt: now }, {
      type: "subscription.canceled",
      summary: "Subscription canceled at period end",
    });
    return { subscription: toWorkspaceSubscriptionDTO(canceled), invoice: null };
  }

  const invoice = await issueInvoice(ctx, {
    subscriptionId: sub.id,
    periodStartAt: period.startAt,
    taxRateBps: input.taxRateBps ?? 0,
  });
  return { subscription: toWorkspaceSubscriptionDTO(nextSub), invoice };
}

/** Move a past-due subscription into the grace window (dunning escalation). */
export async function enterGracePeriod(
  ctx: AppContext,
  input: { subscriptionId: string; graceDays?: number },
): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_INVOICE_CAP);
  const now = ctx.clock();
  const graceEnd = computeGraceEnd(now, input.graceDays ?? DEFAULT_GRACE_DAYS);
  const saved = await transitionSubscription(ctx, sub, "grace", { gracePeriodEndAt: graceEnd }, {
    type: "subscription.grace_started",
    summary: "Grace period started",
    detail: { gracePeriodEndAt: graceEnd },
  });
  return toWorkspaceSubscriptionDTO(saved);
}

/** Lapse a subscription whose grace window has ended. Terminal — never resurrected. */
export async function lapseSubscription(ctx: AppContext, input: { subscriptionId: string }): Promise<WorkspaceSubscriptionDTO> {
  const sub = await loadSubscription(ctx, requireId(input.subscriptionId, "subscriptionId"), BILLING_INVOICE_CAP);
  if (sub.status !== "grace" && sub.status !== "trialing") {
    throw new ConflictError("Only a grace or trialing subscription can lapse to expired");
  }
  const saved = await transitionSubscription(ctx, sub, "expired", {}, {
    type: "subscription.expired",
    summary: "Subscription expired",
  });
  return toWorkspaceSubscriptionDTO(saved);
}
