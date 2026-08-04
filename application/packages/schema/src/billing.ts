/* =============================================================================
 * Billing & Subscription Platform (Phase F · F5) — contract module.
 *
 * A new `billing` bounded context: the COMMERCIAL layer on top of the certified
 * platform. It does NOT re-integrate Stripe — Stripe already exists as a
 * commerce connector (F4.4); billing REUSES that connector for charges. AUXION
 * REMAINS THE SYSTEM OF RECORD: plans, entitlements, usage, and invoices live in
 * Auxion tables; the provider is a payment rail, never the record.
 *
 * Naming: billing entities are prefixed to avoid barrel collisions with the
 * catalog `Plan`/`planSchema` and the collaboration `Subscription` — hence
 * `SubscriptionPlan`, `WorkspaceSubscription`, `Billing*`.
 *
 * All logic that consumes these contracts is pure `@brightloop/domain`; this
 * module declares shapes only (Zod), never behaviour.
 * ========================================================================== */

import { z } from "zod";

/* -----------------------------------------------------------------------------
 * Enumerations
 * -------------------------------------------------------------------------- */

/** The five commercial tiers. `enterprise` is quote-based (price may be null). */
export const planTierSchema = z.enum(["free", "starter", "professional", "business", "enterprise"]);
export type PlanTier = z.infer<typeof planTierSchema>;

/** Recurring billing cadence. `none` = a non-recurring (free) plan. */
export const billingIntervalSchema = z.enum(["none", "month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/**
 * Subscription lifecycle — mirrors the `subscription` state machine in
 * `machines.ts` and the `state_transitions` DB mirror. Do not diverge.
 */
export const subscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "grace",
  "paused",
  "canceled",
  "expired",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** Invoice lifecycle — REUSES the existing `invoice` state machine. */
export const billingInvoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "pending",
  "paid",
  "overdue",
  "failed",
  "refunded",
]);
export type BillingInvoiceStatus = z.infer<typeof billingInvoiceStatusSchema>;

/** The nine metered dimensions. Provider-neutral; the business never meters $. */
export const usageMeterSchema = z.enum([
  "workflow_executions",
  "ai_requests",
  "connector_invocations",
  "storage_bytes",
  "webhook_events",
  "runtime_executions",
  "api_requests",
  "copilot_sessions",
  "marketplace_actions",
]);
export type UsageMeter = z.infer<typeof usageMeterSchema>;

/**
 * Numeric entitlement limits. `null` limit = UNLIMITED. Nine consumption
 * limits map 1:1 to the usage meters; three structural limits (`max_connectors`,
 * `max_team_members`, `max_workflows`) are checked at resource-creation time.
 */
export const entitlementLimitKeySchema = z.enum([
  // consumption (checked against metered usage per period)
  "max_workflow_executions",
  "max_ai_executions",
  "max_connector_invocations",
  "max_storage_bytes",
  "max_webhook_events",
  "max_runtime_executions",
  "max_api_requests",
  "max_copilot_sessions",
  "max_marketplace_actions",
  // structural (checked at creation time)
  "max_connectors",
  "max_team_members",
  "max_workflows",
]);
export type EntitlementLimitKey = z.infer<typeof entitlementLimitKeySchema>;

/** Boolean feature entitlements. Business code resolves capability through these. */
export const entitlementFeatureKeySchema = z.enum([
  "premium_integrations",
  "analytics_access",
  "marketplace_access",
  "priority_support",
  "custom_branding",
  "sso",
  "audit_export",
]);
export type EntitlementFeatureKey = z.infer<typeof entitlementFeatureKeySchema>;

/** A percentage or a fixed-amount discount. */
export const discountTypeSchema = z.enum(["percent", "amount"]);
export type DiscountType = z.infer<typeof discountTypeSchema>;

/** Card / instrument brand — presentation only; the PAN is never stored. */
export const paymentMethodBrandSchema = z.enum([
  "visa",
  "mastercard",
  "amex",
  "discover",
  "bank",
  "other",
]);
export type PaymentMethodBrand = z.infer<typeof paymentMethodBrandSchema>;

/** Billing account standing. */
export const billingAccountStatusSchema = z.enum(["active", "delinquent", "closed"]);
export type BillingAccountStatus = z.infer<typeof billingAccountStatusSchema>;

/** Payment-method standing. */
export const paymentMethodStatusSchema = z.enum(["active", "expired", "removed"]);
export type PaymentMethodStatus = z.infer<typeof paymentMethodStatusSchema>;

/** Invoice line kind. Discounts/credits carry negative amounts. */
export const billingInvoiceLineTypeSchema = z.enum([
  "subscription",
  "addon",
  "usage",
  "proration",
  "discount",
  "tax",
  "credit",
]);
export type BillingInvoiceLineType = z.infer<typeof billingInvoiceLineTypeSchema>;

/**
 * The billing history / audit / notification ledger vocabulary. Every material
 * commercial event appends one row (append-only), doubling as billing history.
 */
export const billingEventTypeSchema = z.enum([
  "subscription.created",
  "subscription.activated",
  "subscription.trial_started",
  "subscription.trial_converted",
  "subscription.plan_changed",
  "subscription.past_due",
  "subscription.grace_started",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
  "subscription.reactivated",
  "subscription.expired",
  "invoice.issued",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_retry_scheduled",
  "invoice.voided",
  "invoice.refunded",
  "payment_method.added",
  "payment_method.removed",
  "usage.recorded",
  "coupon.applied",
  "notification.sent",
]);
export type BillingEventType = z.infer<typeof billingEventTypeSchema>;

/** Customer-facing billing notification kinds (carried in a `notification.sent` event). */
export const billingNotificationKindSchema = z.enum([
  "trial_ending",
  "trial_converted",
  "payment_failed",
  "payment_recovered",
  "invoice_issued",
  "subscription_canceled",
  "usage_limit_approaching",
  "usage_limit_exceeded",
]);
export type BillingNotificationKind = z.infer<typeof billingNotificationKindSchema>;

/* -----------------------------------------------------------------------------
 * Entitlements (value objects)
 * -------------------------------------------------------------------------- */

/**
 * A plan's (or add-on's) entitlement grant. `limits` values are per billing
 * period; `null` means unlimited. `features` are hard on/off flags. Business
 * code NEVER hardcodes a plan — it resolves through a `PlanEntitlements`.
 */
export const planEntitlementsSchema = z.object({
  limits: z.record(entitlementLimitKeySchema, z.number().int().nullable()),
  features: z.record(entitlementFeatureKeySchema, z.boolean()),
});
export type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

/* -----------------------------------------------------------------------------
 * Catalogue descriptors (code-defined; not persisted — like CONNECTOR_REGISTRY)
 * -------------------------------------------------------------------------- */

/** A subscription plan. Additive catalogue; ids are stable. Not a DB row. */
export const subscriptionPlanSchema = z.object({
  id: z.string(),
  tier: planTierSchema,
  name: z.string(),
  description: z.string().default(""),
  interval: billingIntervalSchema,
  /** Price per interval, in minor units. `null` = quote-based (enterprise). */
  priceCents: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).default("usd"),
  trialDays: z.number().int().nonnegative().default(0),
  seatsIncluded: z.number().int().nonnegative().default(1),
  entitlements: planEntitlementsSchema,
  /** Add-on ids offered against this plan (see ADDON_CATALOG). */
  availableAddonIds: z.array(z.string()).default([]),
  available: z.boolean().default(true),
  version: z.number().int().positive().default(1),
});
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

/** A purchasable add-on that grants additional entitlements. Code-defined. */
export const billingAddonSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  unitPriceCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("usd"),
  /** Entitlements granted PER UNIT (added to the base plan's entitlements). */
  grants: planEntitlementsSchema,
  available: z.boolean().default(true),
  version: z.number().int().positive().default(1),
});
export type BillingAddon = z.infer<typeof billingAddonSchema>;

/** A promotional coupon. Code-defined catalogue; redemptions live on a subscription. */
export const billingCouponSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: discountTypeSchema,
  /** percent: 0–100; amount: minor units. */
  value: z.number().nonnegative(),
  currency: z.string().length(3).default("usd"),
  /** Number of billing periods the discount applies; `null` = forever. */
  durationMonths: z.number().int().positive().nullable().default(null),
  /** Empty = applies to all tiers. */
  appliesToTiers: z.array(planTierSchema).default([]),
  active: z.boolean().default(true),
  version: z.number().int().positive().default(1),
});
export type BillingCoupon = z.infer<typeof billingCouponSchema>;

/* -----------------------------------------------------------------------------
 * Persisted value objects (embedded as JSONB)
 * -------------------------------------------------------------------------- */

/** A discount applied to a subscription (a redeemed coupon). */
export const subscriptionDiscountSchema = z.object({
  couponId: z.string(),
  code: z.string(),
  type: discountTypeSchema,
  value: z.number().nonnegative(),
  appliedAt: z.string(),
  /** Absolute end of the discount; `null` = for the life of the subscription. */
  expiresAt: z.string().nullable().default(null),
});
export type SubscriptionDiscount = z.infer<typeof subscriptionDiscountSchema>;

/** An add-on attached to a subscription, with a quantity. */
export const subscriptionAddonSchema = z.object({
  addonId: z.string(),
  name: z.string(),
  quantity: z.number().int().positive().default(1),
  unitPriceCents: z.number().int().nonnegative(),
  grants: planEntitlementsSchema,
});
export type SubscriptionAddon = z.infer<typeof subscriptionAddonSchema>;

/** One line on an invoice. Discount/credit lines carry a negative `amountCents`. */
export const billingInvoiceLineSchema = z.object({
  id: z.string(),
  type: billingInvoiceLineTypeSchema,
  description: z.string(),
  quantity: z.number().default(1),
  unitAmountCents: z.number().int(),
  amountCents: z.number().int(),
  /** For `usage` lines — which meter this line settles. */
  meter: usageMeterSchema.nullable().default(null),
  periodStartAt: z.string().nullable().default(null),
  periodEndAt: z.string().nullable().default(null),
});
export type BillingInvoiceLine = z.infer<typeof billingInvoiceLineSchema>;

/* -----------------------------------------------------------------------------
 * Persisted roots
 * -------------------------------------------------------------------------- */

/** The workspace's billing account (versioned root). One per workspace. */
export const billingAccountSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  currency: z.string().length(3).default("usd"),
  status: billingAccountStatusSchema.default("active"),
  billingEmail: z.string().nullable().default(null),
  taxId: z.string().nullable().default(null),
  /** Opaque provider customer reference (e.g. Stripe customer id). INTERNAL. */
  providerCustomerRef: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BillingAccount = z.infer<typeof billingAccountSchema>;

/** A workspace's subscription to a plan (versioned root). */
export const workspaceSubscriptionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  billingAccountId: z.string(),
  planId: z.string(),
  tier: planTierSchema,
  status: subscriptionStatusSchema.default("trialing"),
  interval: billingIntervalSchema,
  seats: z.number().int().positive().default(1),
  /** Base plan quantity (usually 1). */
  quantity: z.number().int().positive().default(1),
  trialStartAt: z.string().nullable().default(null),
  trialEndAt: z.string().nullable().default(null),
  currentPeriodStartAt: z.string().nullable().default(null),
  currentPeriodEndAt: z.string().nullable().default(null),
  /** When set, the subscription is in dunning grace until this instant. */
  gracePeriodEndAt: z.string().nullable().default(null),
  cancelAtPeriodEnd: z.boolean().default(false),
  canceledAt: z.string().nullable().default(null),
  discount: subscriptionDiscountSchema.nullable().default(null),
  addons: z.array(subscriptionAddonSchema).default([]),
  /** Opaque provider subscription reference. INTERNAL — never leaves in a DTO. */
  providerSubscriptionRef: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkspaceSubscription = z.infer<typeof workspaceSubscriptionSchema>;

/** An invoice (versioned root). Lines are embedded (JSONB). */
export const billingInvoiceSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  billingAccountId: z.string(),
  subscriptionId: z.string().nullable().default(null),
  number: z.string(),
  status: billingInvoiceStatusSchema.default("draft"),
  currency: z.string().length(3).default("usd"),
  lines: z.array(billingInvoiceLineSchema).default([]),
  subtotalCents: z.number().int().default(0),
  discountCents: z.number().int().default(0),
  taxCents: z.number().int().default(0),
  totalCents: z.number().int().default(0),
  amountPaidCents: z.number().int().default(0),
  amountDueCents: z.number().int().default(0),
  periodStartAt: z.string().nullable().default(null),
  periodEndAt: z.string().nullable().default(null),
  dueAt: z.string().nullable().default(null),
  issuedAt: z.string().nullable().default(null),
  paidAt: z.string().nullable().default(null),
  voidedAt: z.string().nullable().default(null),
  /** Number of settlement attempts (dunning). */
  attemptCount: z.number().int().nonnegative().default(0),
  /** Opaque provider invoice reference. INTERNAL. */
  providerInvoiceRef: z.string().nullable().default(null),
  /** Content checksum over the lines/totals — tamper-evidence + dedupe. */
  checksum: z.string(),
  /** Deterministic idempotency key (subscription + period). */
  idempotencyKey: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BillingInvoice = z.infer<typeof billingInvoiceSchema>;

/** A raw metered usage event (append-only). Deterministic aggregation reads these. */
export const billingUsageEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  subscriptionId: z.string(),
  meter: usageMeterSchema,
  quantity: z.number().nonnegative(),
  occurredAt: z.string(),
  /** Deterministic natural-identity key — replay-safe. */
  idempotencyKey: z.string(),
  source: z.string().default("system"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});
export type BillingUsageEvent = z.infer<typeof billingUsageEventSchema>;

/** A stored payment instrument reference (versioned root). PAN is never stored. */
export const billingPaymentMethodSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  billingAccountId: z.string(),
  brand: paymentMethodBrandSchema,
  last4: z.string().length(4),
  expMonth: z.number().int().min(1).max(12).nullable().default(null),
  expYear: z.number().int().nullable().default(null),
  isDefault: z.boolean().default(false),
  status: paymentMethodStatusSchema.default("active"),
  /** Opaque provider payment-method reference. INTERNAL — never in a DTO. */
  providerMethodRef: z.string().nullable().default(null),
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BillingPaymentMethod = z.infer<typeof billingPaymentMethodSchema>;

/** The billing history / audit / notification ledger (append-only). */
export const billingEventSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  subscriptionId: z.string().nullable().default(null),
  invoiceId: z.string().nullable().default(null),
  type: billingEventTypeSchema,
  summary: z.string(),
  detail: z.record(z.string(), z.unknown()).default({}),
  /** null actor = a system/engine action (renewal, dunning, metering). */
  actorId: z.string().nullable().default(null),
  correlationId: z.string(),
  /** For idempotent engine writes (renewal/notification dedupe). */
  idempotencyKey: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type BillingEvent = z.infer<typeof billingEventSchema>;

/** Contract version stamp. */
export const BILLING_SCHEMA_VERSION = 1 as const;
