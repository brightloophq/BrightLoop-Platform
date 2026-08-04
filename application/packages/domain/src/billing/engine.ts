/* =============================================================================
 * Billing — INVOICE / PRORATION / DISCOUNT / TAX ENGINE (F5). Pure + deterministic.
 *
 * Given a subscription, its plan, the billing period, and any priced overage /
 * proration lines, the engine assembles a draft invoice with a content checksum
 * and a deterministic idempotency key. It NEVER invents a price: overage unit
 * prices and proration amounts are supplied by the caller (money in minor units).
 * ========================================================================== */

import {
  billingInvoiceSchema,
  type BillingInvoice,
  type BillingInvoiceLine,
  type BillingInvoiceStatus,
  type SubscriptionDiscount,
  type SubscriptionPlan,
  type UsageMeter,
  type WorkspaceSubscription,
} from "@brightloop/schema";

import { hashContent } from "../scan-engine/evidence/hash.js";
import { invoiceKey } from "./idempotency.js";
import type { BillingPeriod } from "./lifecycle.js";

/** Round to the nearest minor unit (half-up, sign-aware). Deterministic. */
export function roundCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Prorate `fullCents` to the portion of a period remaining at `effectiveAt`.
 * Clamped to [0, fullCents-equivalent]. A zero-length period yields the full amount.
 */
export function prorateRemaining(fullCents: number, period: BillingPeriod, effectiveAt: string): number {
  const start = new Date(period.startAt).getTime();
  const end = new Date(period.endAt).getTime();
  const at = new Date(effectiveAt).getTime();
  const span = end - start;
  if (span <= 0) return fullCents;
  const remaining = Math.min(Math.max(end - at, 0), span);
  return roundCents((fullCents * remaining) / span);
}

/**
 * Plan-change proration: credit the unused portion of the current plan and
 * charge the prorated portion of the next plan, both for the remainder of the
 * period. Returns signed amounts (credit negative). Quote-based plans (null
 * price) contribute 0 — never fabricated.
 */
export interface PlanChangeProration {
  creditCents: number; // ≤ 0
  chargeCents: number; // ≥ 0
  netCents: number;
}

export function computePlanChangeProration(
  fromPlan: SubscriptionPlan,
  toPlan: SubscriptionPlan,
  quantity: number,
  period: BillingPeriod,
  effectiveAt: string,
): PlanChangeProration {
  const fromFull = (fromPlan.priceCents ?? 0) * quantity;
  const toFull = (toPlan.priceCents ?? 0) * quantity;
  const creditCents = -prorateRemaining(fromFull, period, effectiveAt);
  const chargeCents = prorateRemaining(toFull, period, effectiveAt);
  return { creditCents, chargeCents, netCents: creditCents + chargeCents };
}

/** Is a subscription discount still in effect at `at`? */
export function isDiscountActive(discount: SubscriptionDiscount | null, at: string): boolean {
  if (discount === null) return false;
  if (discount.expiresAt === null) return true;
  return at < discount.expiresAt;
}

/** The discount amount (positive minor units) against a subtotal. Capped at the subtotal. */
export function computeDiscountCents(subtotalCents: number, discount: SubscriptionDiscount | null, at: string): number {
  if (!isDiscountActive(discount, at) || discount === null) return 0;
  if (subtotalCents <= 0) return 0;
  const raw = discount.type === "percent" ? (subtotalCents * discount.value) / 100 : discount.value;
  return Math.min(subtotalCents, Math.max(0, roundCents(raw)));
}

/** Tax on a taxable base at a basis-point rate (e.g. 875 = 8.75%). */
export function computeTaxCents(taxableCents: number, taxRateBps: number): number {
  if (taxRateBps <= 0 || taxableCents <= 0) return 0;
  return roundCents((taxableCents * taxRateBps) / 10_000);
}

/** A priced metered-overage charge (unit price supplied by the caller). */
export interface UsageCharge {
  meter: UsageMeter;
  quantity: number;
  unitAmountCents: number;
  description?: string;
}

/** A signed proration adjustment (credit or charge). */
export interface ProrationCharge {
  description: string;
  amountCents: number;
  periodStartAt?: string | null;
  periodEndAt?: string | null;
}

export interface InvoiceBuildInput {
  invoiceId: string;
  number: string;
  billingAccountId: string;
  subscription: WorkspaceSubscription;
  plan: SubscriptionPlan;
  period: BillingPeriod;
  now: string;
  dueAt?: string | null;
  prorations?: readonly ProrationCharge[];
  usageCharges?: readonly UsageCharge[];
  taxRateBps?: number;
  currency?: string;
  /** Override the initial status (default `draft`). */
  status?: BillingInvoiceStatus;
}

/**
 * Assemble a draft invoice from a subscription + plan + supplied overage /
 * proration lines. Deterministic: same inputs → identical lines, totals, and
 * checksum. The idempotency key is (subscription, period-start), so a re-run of
 * the same billing period replays rather than double-charging.
 */
export function buildInvoice(input: InvoiceBuildInput): BillingInvoice {
  const {
    invoiceId,
    number,
    billingAccountId,
    subscription,
    plan,
    period,
    now,
    prorations = [],
    usageCharges = [],
    taxRateBps = 0,
  } = input;
  const currency = input.currency ?? plan.currency ?? "usd";
  const lines: BillingInvoiceLine[] = [];
  // Deterministic, per-invoice line ids (1-based in build order).
  let lineOrdinal = 0;
  const lineId = (): string => `${invoiceId}_l${(lineOrdinal += 1)}`;

  // 1) Recurring base (skipped for quote-based / zero-price plans).
  if (plan.priceCents !== null && plan.priceCents > 0) {
    const amount = plan.priceCents * subscription.quantity;
    lines.push({
      id: lineId(),
      type: "subscription",
      description: `${plan.name} plan (${plan.interval})`,
      quantity: subscription.quantity,
      unitAmountCents: plan.priceCents,
      amountCents: amount,
      meter: null,
      periodStartAt: period.startAt,
      periodEndAt: period.endAt,
    });
  }

  // 2) Add-ons.
  for (const addon of subscription.addons) {
    if (addon.unitPriceCents <= 0) continue;
    lines.push({
      id: lineId(),
      type: "addon",
      description: `${addon.name} ×${addon.quantity}`,
      quantity: addon.quantity,
      unitAmountCents: addon.unitPriceCents,
      amountCents: addon.unitPriceCents * addon.quantity,
      meter: null,
      periodStartAt: period.startAt,
      periodEndAt: period.endAt,
    });
  }

  // 3) Metered overage (priced by the caller — engine never invents unit prices).
  for (const charge of usageCharges) {
    if (charge.quantity <= 0 || charge.unitAmountCents <= 0) continue;
    lines.push({
      id: lineId(),
      type: "usage",
      description: charge.description ?? `Usage overage — ${charge.meter}`,
      quantity: charge.quantity,
      unitAmountCents: charge.unitAmountCents,
      amountCents: roundCents(charge.quantity * charge.unitAmountCents),
      meter: charge.meter,
      periodStartAt: period.startAt,
      periodEndAt: period.endAt,
    });
  }

  // 4) Proration adjustments (signed).
  for (const p of prorations) {
    if (p.amountCents === 0) continue;
    lines.push({
      id: lineId(),
      type: "proration",
      description: p.description,
      quantity: 1,
      unitAmountCents: p.amountCents,
      amountCents: p.amountCents,
      meter: null,
      periodStartAt: p.periodStartAt ?? null,
      periodEndAt: p.periodEndAt ?? null,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.amountCents, 0);

  // 5) Discount (applied to the positive subtotal).
  const discountCents = computeDiscountCents(subtotalCents, subscription.discount, now);
  if (discountCents > 0) {
    lines.push({
      id: lineId(),
      type: "discount",
      description: subscription.discount ? `Discount (${subscription.discount.code})` : "Discount",
      quantity: 1,
      unitAmountCents: -discountCents,
      amountCents: -discountCents,
      meter: null,
      periodStartAt: null,
      periodEndAt: null,
    });
  }

  // 6) Tax (on subtotal net of discount).
  const taxableCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = computeTaxCents(taxableCents, taxRateBps);
  if (taxCents > 0) {
    lines.push({
      id: lineId(),
      type: "tax",
      description: "Tax",
      quantity: 1,
      unitAmountCents: taxCents,
      amountCents: taxCents,
      meter: null,
      periodStartAt: null,
      periodEndAt: null,
    });
  }

  const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);
  const checksumBody = {
    subscriptionId: subscription.id,
    period,
    lines: lines.map((l) => ({ type: l.type, amountCents: l.amountCents, meter: l.meter })),
    totalCents,
  };

  return billingInvoiceSchema.parse({
    id: invoiceId,
    workspaceId: subscription.workspaceId,
    clientId: subscription.clientId,
    billingAccountId,
    subscriptionId: subscription.id,
    number,
    status: input.status ?? "draft",
    currency,
    lines,
    subtotalCents,
    discountCents,
    taxCents,
    totalCents,
    amountPaidCents: 0,
    amountDueCents: totalCents,
    periodStartAt: period.startAt,
    periodEndAt: period.endAt,
    dueAt: input.dueAt ?? null,
    issuedAt: null,
    paidAt: null,
    voidedAt: null,
    attemptCount: 0,
    providerInvoiceRef: null,
    checksum: hashContent(checksumBody),
    idempotencyKey: invoiceKey(subscription.id, period.startAt),
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });
}

/** The outcome of applying a payment to an invoice. */
export interface InvoicePaymentResult {
  invoice: BillingInvoice;
  status: BillingInvoiceStatus;
  fullyPaid: boolean;
}

/**
 * Apply a payment of `amountCents` to an invoice at `at`. Recomputes amounts;
 * marks `paid` (and stamps `paidAt`) when fully settled. Pure — no side effects.
 */
export function applyInvoicePayment(invoice: BillingInvoice, amountCents: number, at: string): InvoicePaymentResult {
  const amountPaidCents = invoice.amountPaidCents + Math.max(0, amountCents);
  const amountDueCents = Math.max(0, invoice.totalCents - amountPaidCents);
  const fullyPaid = amountDueCents === 0 && invoice.totalCents > 0;
  const status: BillingInvoiceStatus = fullyPaid ? "paid" : invoice.status;
  return {
    invoice: {
      ...invoice,
      amountPaidCents,
      amountDueCents,
      status,
      paidAt: fullyPaid ? at : invoice.paidAt,
      updatedAt: at,
    },
    status,
    fullyPaid,
  };
}
