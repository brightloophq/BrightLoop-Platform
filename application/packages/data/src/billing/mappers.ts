/* =============================================================================
 * Billing — row ↔ domain mappers (F5). The typed boundary; the adapter is cast.
 * snake_case columns ↔ camelCase domain fields. JSONB blobs pass through.
 * ========================================================================== */

import type {
  BillingAccount,
  BillingEvent,
  BillingInvoice,
  BillingInvoiceLine,
  BillingPaymentMethod,
  BillingUsageEvent,
  PaymentMethodBrand,
  SubscriptionAddon,
  SubscriptionDiscount,
  SubscriptionStatus,
  WorkspaceSubscription,
} from "@brightloop/schema";

const S = (v: unknown): string => String(v);
const SN = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const N = (v: unknown): number => Number(v);
const NN = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const B = (v: unknown): boolean => v === true;
const J = (v: unknown): Record<string, unknown> => (v as Record<string, unknown>) ?? {};

/* ---- billing account ------------------------------------------------------ */

export function accountRow(a: BillingAccount): Record<string, unknown> {
  return {
    id: a.id,
    workspace_id: a.workspaceId,
    client_id: a.clientId,
    currency: a.currency,
    status: a.status,
    billing_email: a.billingEmail,
    tax_id: a.taxId,
    provider_customer_ref: a.providerCustomerRef,
    metadata: a.metadata,
    version: a.version,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

export function toAccount(row: Record<string, unknown>): BillingAccount {
  return {
    id: S(row["id"]),
    workspaceId: S(row["workspace_id"]),
    clientId: SN(row["client_id"]),
    currency: S(row["currency"]),
    status: row["status"] as BillingAccount["status"],
    billingEmail: SN(row["billing_email"]),
    taxId: SN(row["tax_id"]),
    providerCustomerRef: SN(row["provider_customer_ref"]),
    metadata: J(row["metadata"]),
    version: N(row["version"]),
    createdAt: S(row["created_at"]),
    updatedAt: S(row["updated_at"]),
  };
}

/* ---- subscription --------------------------------------------------------- */

export function subscriptionRow(s: WorkspaceSubscription): Record<string, unknown> {
  return {
    id: s.id,
    workspace_id: s.workspaceId,
    client_id: s.clientId,
    billing_account_id: s.billingAccountId,
    plan_id: s.planId,
    tier: s.tier,
    status: s.status,
    interval: s.interval,
    seats: s.seats,
    quantity: s.quantity,
    trial_start_at: s.trialStartAt,
    trial_end_at: s.trialEndAt,
    current_period_start_at: s.currentPeriodStartAt,
    current_period_end_at: s.currentPeriodEndAt,
    grace_period_end_at: s.gracePeriodEndAt,
    cancel_at_period_end: s.cancelAtPeriodEnd,
    canceled_at: s.canceledAt,
    discount: s.discount,
    addons: s.addons,
    provider_subscription_ref: s.providerSubscriptionRef,
    metadata: s.metadata,
    version: s.version,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export function toSubscription(row: Record<string, unknown>): WorkspaceSubscription {
  return {
    id: S(row["id"]),
    workspaceId: S(row["workspace_id"]),
    clientId: SN(row["client_id"]),
    billingAccountId: S(row["billing_account_id"]),
    planId: S(row["plan_id"]),
    tier: row["tier"] as WorkspaceSubscription["tier"],
    status: row["status"] as SubscriptionStatus,
    interval: row["interval"] as WorkspaceSubscription["interval"],
    seats: N(row["seats"]),
    quantity: N(row["quantity"]),
    trialStartAt: SN(row["trial_start_at"]),
    trialEndAt: SN(row["trial_end_at"]),
    currentPeriodStartAt: SN(row["current_period_start_at"]),
    currentPeriodEndAt: SN(row["current_period_end_at"]),
    gracePeriodEndAt: SN(row["grace_period_end_at"]),
    cancelAtPeriodEnd: B(row["cancel_at_period_end"]),
    canceledAt: SN(row["canceled_at"]),
    discount: (row["discount"] as SubscriptionDiscount | null) ?? null,
    addons: (row["addons"] as SubscriptionAddon[]) ?? [],
    providerSubscriptionRef: SN(row["provider_subscription_ref"]),
    metadata: J(row["metadata"]),
    version: N(row["version"]),
    createdAt: S(row["created_at"]),
    updatedAt: S(row["updated_at"]),
  };
}

/* ---- invoice -------------------------------------------------------------- */

export function invoiceRow(i: BillingInvoice): Record<string, unknown> {
  return {
    id: i.id,
    workspace_id: i.workspaceId,
    client_id: i.clientId,
    billing_account_id: i.billingAccountId,
    subscription_id: i.subscriptionId,
    number: i.number,
    status: i.status,
    currency: i.currency,
    lines: i.lines,
    subtotal_cents: i.subtotalCents,
    discount_cents: i.discountCents,
    tax_cents: i.taxCents,
    total_cents: i.totalCents,
    amount_paid_cents: i.amountPaidCents,
    amount_due_cents: i.amountDueCents,
    period_start_at: i.periodStartAt,
    period_end_at: i.periodEndAt,
    due_at: i.dueAt,
    issued_at: i.issuedAt,
    paid_at: i.paidAt,
    voided_at: i.voidedAt,
    attempt_count: i.attemptCount,
    provider_invoice_ref: i.providerInvoiceRef,
    checksum: i.checksum,
    idempotency_key: i.idempotencyKey,
    metadata: i.metadata,
    version: i.version,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

export function toInvoice(row: Record<string, unknown>): BillingInvoice {
  return {
    id: S(row["id"]),
    workspaceId: S(row["workspace_id"]),
    clientId: SN(row["client_id"]),
    billingAccountId: S(row["billing_account_id"]),
    subscriptionId: SN(row["subscription_id"]),
    number: S(row["number"]),
    status: row["status"] as BillingInvoice["status"],
    currency: S(row["currency"]),
    lines: (row["lines"] as BillingInvoiceLine[]) ?? [],
    subtotalCents: N(row["subtotal_cents"]),
    discountCents: N(row["discount_cents"]),
    taxCents: N(row["tax_cents"]),
    totalCents: N(row["total_cents"]),
    amountPaidCents: N(row["amount_paid_cents"]),
    amountDueCents: N(row["amount_due_cents"]),
    periodStartAt: SN(row["period_start_at"]),
    periodEndAt: SN(row["period_end_at"]),
    dueAt: SN(row["due_at"]),
    issuedAt: SN(row["issued_at"]),
    paidAt: SN(row["paid_at"]),
    voidedAt: SN(row["voided_at"]),
    attemptCount: N(row["attempt_count"]),
    providerInvoiceRef: SN(row["provider_invoice_ref"]),
    checksum: S(row["checksum"]),
    idempotencyKey: S(row["idempotency_key"]),
    metadata: J(row["metadata"]),
    version: N(row["version"]),
    createdAt: S(row["created_at"]),
    updatedAt: S(row["updated_at"]),
  };
}

/* ---- payment method ------------------------------------------------------- */

export function paymentMethodRow(p: BillingPaymentMethod): Record<string, unknown> {
  return {
    id: p.id,
    workspace_id: p.workspaceId,
    client_id: p.clientId,
    billing_account_id: p.billingAccountId,
    brand: p.brand,
    last4: p.last4,
    exp_month: p.expMonth,
    exp_year: p.expYear,
    is_default: p.isDefault,
    status: p.status,
    provider_method_ref: p.providerMethodRef,
    version: p.version,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function toPaymentMethod(row: Record<string, unknown>): BillingPaymentMethod {
  return {
    id: S(row["id"]),
    workspaceId: S(row["workspace_id"]),
    clientId: SN(row["client_id"]),
    billingAccountId: S(row["billing_account_id"]),
    brand: row["brand"] as PaymentMethodBrand,
    last4: S(row["last4"]),
    expMonth: NN(row["exp_month"]),
    expYear: NN(row["exp_year"]),
    isDefault: B(row["is_default"]),
    status: row["status"] as BillingPaymentMethod["status"],
    providerMethodRef: SN(row["provider_method_ref"]),
    version: N(row["version"]),
    createdAt: S(row["created_at"]),
    updatedAt: S(row["updated_at"]),
  };
}

/* ---- usage event ---------------------------------------------------------- */

export function usageEventRow(u: BillingUsageEvent): Record<string, unknown> {
  return {
    id: u.id,
    workspace_id: u.workspaceId,
    client_id: u.clientId,
    subscription_id: u.subscriptionId,
    meter: u.meter,
    quantity: u.quantity,
    occurred_at: u.occurredAt,
    idempotency_key: u.idempotencyKey,
    source: u.source,
    metadata: u.metadata,
    created_at: u.createdAt,
  };
}

export function toUsageEvent(row: Record<string, unknown>): BillingUsageEvent {
  return {
    id: S(row["id"]),
    workspaceId: S(row["workspace_id"]),
    clientId: SN(row["client_id"]),
    subscriptionId: S(row["subscription_id"]),
    meter: row["meter"] as BillingUsageEvent["meter"],
    quantity: N(row["quantity"]),
    occurredAt: S(row["occurred_at"]),
    idempotencyKey: S(row["idempotency_key"]),
    source: S(row["source"]),
    metadata: J(row["metadata"]),
    createdAt: S(row["created_at"]),
  };
}

/* ---- billing event -------------------------------------------------------- */

export function billingEventRow(e: BillingEvent): Record<string, unknown> {
  return {
    id: e.id,
    workspace_id: e.workspaceId,
    client_id: e.clientId,
    subscription_id: e.subscriptionId,
    invoice_id: e.invoiceId,
    type: e.type,
    summary: e.summary,
    detail: e.detail,
    actor_id: e.actorId,
    correlation_id: e.correlationId,
    idempotency_key: e.idempotencyKey,
    created_at: e.createdAt,
  };
}

export function toBillingEvent(row: Record<string, unknown>): BillingEvent {
  return {
    id: S(row["id"]),
    workspaceId: S(row["workspace_id"]),
    clientId: SN(row["client_id"]),
    subscriptionId: SN(row["subscription_id"]),
    invoiceId: SN(row["invoice_id"]),
    type: row["type"] as BillingEvent["type"],
    summary: S(row["summary"]),
    detail: J(row["detail"]),
    actorId: SN(row["actor_id"]),
    correlationId: S(row["correlation_id"]),
    idempotencyKey: SN(row["idempotency_key"]),
    createdAt: S(row["created_at"]),
  };
}
