/* =============================================================================
 * Billing DTOs (F5) — the ONLY billing shapes that cross outward.
 *
 * NEVER a providerCustomerRef / providerSubscriptionRef / providerInvoiceRef /
 * providerMethodRef, never a checksum, never an idempotencyKey. Payment presence
 * is a boolean + last4; the provider linkage stays server-side.
 * ========================================================================== */

import {
  entitlementFeatureKeySchema,
  entitlementLimitKeySchema,
  usageMeterSchema,
  type BillingAccount,
  type BillingEvent,
  type BillingInvoice,
  type BillingPaymentMethod,
  type EntitlementFeatureKey,
  type EntitlementLimitKey,
  type SubscriptionPlan,
  type UsageMeter,
  type WorkspaceSubscription,
} from "@brightloop/schema";
import {
  checkLimit,
  findPlan,
  USAGE_METER_LIMIT,
  utilization,
  type EntitlementSnapshot,
} from "@brightloop/domain";

const ALL_METERS = usageMeterSchema.options as readonly UsageMeter[];
const LIMIT_KEYS = entitlementLimitKeySchema.options as readonly EntitlementLimitKey[];
const FEATURE_KEYS = entitlementFeatureKeySchema.options as readonly EntitlementFeatureKey[];

export interface WorkspaceSubscriptionDTO {
  id: string;
  workspaceId: string;
  planId: string;
  planName: string;
  tier: string;
  status: string;
  interval: string;
  seats: number;
  quantity: number;
  priceCents: number | null;
  trialEndAt: string | null;
  currentPeriodStartAt: string | null;
  currentPeriodEndAt: string | null;
  gracePeriodEndAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  discount: { code: string; type: string; value: number; expiresAt: string | null } | null;
  addons: { addonId: string; name: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
}

export function toWorkspaceSubscriptionDTO(s: WorkspaceSubscription): WorkspaceSubscriptionDTO {
  const plan = findPlan(s.planId);
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    planId: s.planId,
    planName: plan?.name ?? s.planId,
    tier: s.tier,
    status: s.status,
    interval: s.interval,
    seats: s.seats,
    quantity: s.quantity,
    priceCents: plan?.priceCents ?? null,
    trialEndAt: s.trialEndAt,
    currentPeriodStartAt: s.currentPeriodStartAt,
    currentPeriodEndAt: s.currentPeriodEndAt,
    gracePeriodEndAt: s.gracePeriodEndAt,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    canceledAt: s.canceledAt,
    discount: s.discount
      ? { code: s.discount.code, type: s.discount.type, value: s.discount.value, expiresAt: s.discount.expiresAt }
      : null,
    addons: s.addons.map((a) => ({ addonId: a.addonId, name: a.name, quantity: a.quantity })),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export interface InvoiceLineDTO {
  id: string;
  type: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  meter: string | null;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  status: string;
  currency: string;
  lines: InvoiceLineDTO[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  periodStartAt: string | null;
  periodEndAt: string | null;
  dueAt: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  attemptCount: number;
  createdAt: string;
}

export function toInvoiceDTO(i: BillingInvoice): InvoiceDTO {
  return {
    id: i.id,
    number: i.number,
    status: i.status,
    currency: i.currency,
    lines: i.lines.map((l) => ({
      id: l.id,
      type: l.type,
      description: l.description,
      quantity: l.quantity,
      unitAmountCents: l.unitAmountCents,
      amountCents: l.amountCents,
      meter: l.meter,
    })),
    subtotalCents: i.subtotalCents,
    discountCents: i.discountCents,
    taxCents: i.taxCents,
    totalCents: i.totalCents,
    amountPaidCents: i.amountPaidCents,
    amountDueCents: i.amountDueCents,
    periodStartAt: i.periodStartAt,
    periodEndAt: i.periodEndAt,
    dueAt: i.dueAt,
    issuedAt: i.issuedAt,
    paidAt: i.paidAt,
    attemptCount: i.attemptCount,
    createdAt: i.createdAt,
  };
}

export interface EntitlementsDTO {
  planId: string;
  tier: string;
  active: boolean;
  seats: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}

export function toEntitlementsDTO(snapshot: EntitlementSnapshot): EntitlementsDTO {
  const limits: Record<string, number | null> = {};
  const features: Record<string, boolean> = {};
  for (const k of LIMIT_KEYS) limits[k] = snapshot.entitlements.limits[k] ?? 0;
  for (const k of FEATURE_KEYS) features[k] = snapshot.entitlements.features[k] === true;
  return {
    planId: snapshot.planId,
    tier: snapshot.tier,
    active: snapshot.active,
    seats: snapshot.seats,
    limits,
    features,
  };
}

export interface UsageMeterDTO {
  meter: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  utilization: number;
}

export interface UsageSummaryDTO {
  periodStartAt: string | null;
  periodEndAt: string | null;
  meters: UsageMeterDTO[];
}

export function toUsageSummaryDTO(
  snapshot: EntitlementSnapshot,
  usage: Record<UsageMeter, number>,
  periodStartAt: string | null,
  periodEndAt: string | null,
): UsageSummaryDTO {
  const meters = ALL_METERS.map((meter) => {
    const key = USAGE_METER_LIMIT[meter];
    const used = usage[meter] ?? 0;
    const check = checkLimit(snapshot.entitlements, key, used, 0);
    return {
      meter,
      used,
      limit: check.limit,
      remaining: check.remaining,
      unlimited: check.unlimited,
      utilization: utilization(snapshot.entitlements, key, used),
    };
  });
  return { periodStartAt, periodEndAt, meters };
}

export interface PlanDTO {
  id: string;
  tier: string;
  name: string;
  description: string;
  interval: string;
  priceCents: number | null;
  currency: string;
  trialDays: number;
  seatsIncluded: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
  availableAddonIds: string[];
  available: boolean;
}

export function toPlanDTO(p: SubscriptionPlan): PlanDTO {
  const limits: Record<string, number | null> = {};
  const features: Record<string, boolean> = {};
  for (const k of LIMIT_KEYS) limits[k] = p.entitlements.limits[k] ?? 0;
  for (const k of FEATURE_KEYS) features[k] = p.entitlements.features[k] === true;
  return {
    id: p.id,
    tier: p.tier,
    name: p.name,
    description: p.description,
    interval: p.interval,
    priceCents: p.priceCents,
    currency: p.currency,
    trialDays: p.trialDays,
    seatsIncluded: p.seatsIncluded,
    limits,
    features,
    availableAddonIds: p.availableAddonIds,
    available: p.available,
  };
}

export interface PaymentMethodDTO {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  status: string;
}

export function toPaymentMethodDTO(p: BillingPaymentMethod): PaymentMethodDTO {
  return {
    id: p.id,
    brand: p.brand,
    last4: p.last4,
    expMonth: p.expMonth,
    expYear: p.expYear,
    isDefault: p.isDefault,
    status: p.status,
  };
}

export interface BillingAccountDTO {
  id: string;
  currency: string;
  status: string;
  billingEmail: string | null;
  hasPaymentMethod: boolean;
}

export function toBillingAccountDTO(a: BillingAccount, hasPaymentMethod: boolean): BillingAccountDTO {
  return {
    id: a.id,
    currency: a.currency,
    status: a.status,
    billingEmail: a.billingEmail,
    hasPaymentMethod,
  };
}

export interface BillingEventDTO {
  id: string;
  type: string;
  summary: string;
  subscriptionId: string | null;
  invoiceId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export function toBillingEventDTO(e: BillingEvent): BillingEventDTO {
  return {
    id: e.id,
    type: e.type,
    summary: e.summary,
    subscriptionId: e.subscriptionId,
    invoiceId: e.invoiceId,
    detail: e.detail,
    createdAt: e.createdAt,
  };
}
