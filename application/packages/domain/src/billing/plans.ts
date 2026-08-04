/* =============================================================================
 * Billing — PLAN / ADD-ON / COUPON CATALOGUE (F5).
 *
 * A pure, additive, code-defined catalogue (like CONNECTOR_REGISTRY / MODEL_
 * REGISTRY) — NOT database rows. Ids are stable; plans append, never renumber.
 * Business code NEVER hardcodes a tier — it resolves entitlements through a plan.
 * ========================================================================== */

import {
  billingAddonSchema,
  billingCouponSchema,
  subscriptionPlanSchema,
  type BillingAddon,
  type BillingCoupon,
  type EntitlementLimitKey,
  type SubscriptionPlan,
  type UsageMeter,
} from "@brightloop/schema";

/** Parse-and-freeze a plan literal (fills defaults, validates entitlement shape). */
const plan = (raw: unknown): SubscriptionPlan => Object.freeze(subscriptionPlanSchema.parse(raw));
const addon = (raw: unknown): BillingAddon => Object.freeze(billingAddonSchema.parse(raw));
const coupon = (raw: unknown): BillingCoupon => Object.freeze(billingCouponSchema.parse(raw));

/** Storage limit helpers (minor-unit-free — bytes). */
const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * The canonical mapping from a metered dimension to its consumption limit. Nine
 * meters, nine consumption limits, 1:1. Structural limits (`max_connectors`,
 * `max_team_members`, `max_workflows`) are NOT metered — checked at creation.
 */
export const USAGE_METER_LIMIT: Readonly<Record<UsageMeter, EntitlementLimitKey>> = Object.freeze({
  workflow_executions: "max_workflow_executions",
  ai_requests: "max_ai_executions",
  connector_invocations: "max_connector_invocations",
  storage_bytes: "max_storage_bytes",
  webhook_events: "max_webhook_events",
  runtime_executions: "max_runtime_executions",
  api_requests: "max_api_requests",
  copilot_sessions: "max_copilot_sessions",
  marketplace_actions: "max_marketplace_actions",
});

/** The canonical subscription plans. Append-only; ids are stable identifiers. */
export const PLAN_CATALOG: readonly SubscriptionPlan[] = Object.freeze([
  plan({
    id: "free",
    tier: "free",
    name: "Free",
    description: "Get started with core automation and a taste of the platform.",
    interval: "none",
    priceCents: 0,
    trialDays: 0,
    seatsIncluded: 2,
    availableAddonIds: [],
    entitlements: {
      limits: {
        max_workflow_executions: 100,
        max_ai_executions: 50,
        max_connector_invocations: 500,
        max_storage_bytes: 500 * MB,
        max_webhook_events: 500,
        max_runtime_executions: 100,
        max_api_requests: 1_000,
        max_copilot_sessions: 20,
        max_marketplace_actions: 10,
        max_connectors: 2,
        max_team_members: 2,
        max_workflows: 3,
      },
      features: {
        premium_integrations: false,
        analytics_access: false,
        marketplace_access: true,
        priority_support: false,
        custom_branding: false,
        sso: false,
        audit_export: false,
      },
    },
  }),
  plan({
    id: "starter",
    tier: "starter",
    name: "Starter",
    description: "For small teams putting their first workflows into production.",
    interval: "month",
    priceCents: 4_900,
    trialDays: 14,
    seatsIncluded: 5,
    availableAddonIds: ["extra_seats", "extra_ai_pack", "extra_storage"],
    entitlements: {
      limits: {
        max_workflow_executions: 1_000,
        max_ai_executions: 500,
        max_connector_invocations: 5_000,
        max_storage_bytes: 5 * GB,
        max_webhook_events: 5_000,
        max_runtime_executions: 1_000,
        max_api_requests: 20_000,
        max_copilot_sessions: 200,
        max_marketplace_actions: 100,
        max_connectors: 5,
        max_team_members: 5,
        max_workflows: 20,
      },
      features: {
        premium_integrations: false,
        analytics_access: true,
        marketplace_access: true,
        priority_support: false,
        custom_branding: false,
        sso: false,
        audit_export: false,
      },
    },
  }),
  plan({
    id: "professional",
    tier: "professional",
    name: "Professional",
    description: "For growing teams that run the business on Auxion.",
    interval: "month",
    priceCents: 14_900,
    trialDays: 14,
    seatsIncluded: 20,
    availableAddonIds: ["extra_seats", "extra_ai_pack", "extra_storage"],
    entitlements: {
      limits: {
        max_workflow_executions: 10_000,
        max_ai_executions: 5_000,
        max_connector_invocations: 50_000,
        max_storage_bytes: 50 * GB,
        max_webhook_events: 50_000,
        max_runtime_executions: 10_000,
        max_api_requests: 200_000,
        max_copilot_sessions: 2_000,
        max_marketplace_actions: 1_000,
        max_connectors: 20,
        max_team_members: 20,
        max_workflows: 100,
      },
      features: {
        premium_integrations: true,
        analytics_access: true,
        marketplace_access: true,
        priority_support: true,
        custom_branding: false,
        sso: false,
        audit_export: true,
      },
    },
  }),
  plan({
    id: "business",
    tier: "business",
    name: "Business",
    description: "For established organizations operating at scale.",
    interval: "month",
    priceCents: 49_900,
    trialDays: 14,
    seatsIncluded: 100,
    availableAddonIds: ["extra_seats", "extra_ai_pack", "extra_storage"],
    entitlements: {
      limits: {
        max_workflow_executions: 100_000,
        max_ai_executions: 50_000,
        max_connector_invocations: 500_000,
        max_storage_bytes: 500 * GB,
        max_webhook_events: 500_000,
        max_runtime_executions: 100_000,
        max_api_requests: 2_000_000,
        max_copilot_sessions: 20_000,
        max_marketplace_actions: 10_000,
        max_connectors: 100,
        max_team_members: 100,
        max_workflows: 500,
      },
      features: {
        premium_integrations: true,
        analytics_access: true,
        marketplace_access: true,
        priority_support: true,
        custom_branding: true,
        sso: true,
        audit_export: true,
      },
    },
  }),
  plan({
    id: "enterprise",
    tier: "enterprise",
    name: "Enterprise",
    description: "Custom limits, security review, and dedicated support. Quote-based.",
    interval: "month",
    priceCents: null, // quote-based — never fabricate a price
    trialDays: 0,
    seatsIncluded: 1,
    availableAddonIds: [],
    entitlements: {
      // Unlimited across the board — `null` = no cap.
      limits: {
        max_workflow_executions: null,
        max_ai_executions: null,
        max_connector_invocations: null,
        max_storage_bytes: null,
        max_webhook_events: null,
        max_runtime_executions: null,
        max_api_requests: null,
        max_copilot_sessions: null,
        max_marketplace_actions: null,
        max_connectors: null,
        max_team_members: null,
        max_workflows: null,
      },
      features: {
        premium_integrations: true,
        analytics_access: true,
        marketplace_access: true,
        priority_support: true,
        custom_branding: true,
        sso: true,
        audit_export: true,
      },
    },
  }),
]);

/** Purchasable add-ons. Grants are PER UNIT and added to the base plan. */
export const ADDON_CATALOG: readonly BillingAddon[] = Object.freeze([
  addon({
    id: "extra_seats",
    name: "Additional seats",
    description: "Add team members beyond your plan's included seats.",
    unitPriceCents: 1_500,
    grants: { limits: { max_team_members: 1 }, features: {} },
  }),
  addon({
    id: "extra_ai_pack",
    name: "AI execution pack",
    description: "5,000 additional AI executions per month.",
    unitPriceCents: 2_000,
    grants: { limits: { max_ai_executions: 5_000 }, features: {} },
  }),
  addon({
    id: "extra_storage",
    name: "Storage pack",
    description: "10 GB additional storage.",
    unitPriceCents: 1_000,
    grants: { limits: { max_storage_bytes: 10 * GB }, features: {} },
  }),
]);

/** Promotional coupons. Redemptions are recorded on the subscription. */
export const COUPON_CATALOG: readonly BillingCoupon[] = Object.freeze([
  coupon({ id: "welcome20", code: "WELCOME20", type: "percent", value: 20, durationMonths: 3 }),
  coupon({ id: "launch50", code: "LAUNCH50", type: "percent", value: 50, durationMonths: 1 }),
  coupon({ id: "annual_saver", code: "ANNUAL", type: "amount", value: 10_000, durationMonths: 1 }),
]);

const PLAN_BY_ID = new Map<string, SubscriptionPlan>(PLAN_CATALOG.map((p) => [p.id, p]));
const PLAN_BY_TIER = new Map<string, SubscriptionPlan>(PLAN_CATALOG.map((p) => [p.tier, p]));
const ADDON_BY_ID = new Map<string, BillingAddon>(ADDON_CATALOG.map((a) => [a.id, a]));
const COUPON_BY_ID = new Map<string, BillingCoupon>(COUPON_CATALOG.map((c) => [c.id, c]));
const COUPON_BY_CODE = new Map<string, BillingCoupon>(
  COUPON_CATALOG.map((c) => [c.code.toUpperCase(), c]),
);

/** Tier ordering — for upgrade/downgrade comparisons. */
export const TIER_ORDER: readonly SubscriptionPlan["tier"][] = Object.freeze([
  "free",
  "starter",
  "professional",
  "business",
  "enterprise",
]);

/** Look up a plan by id. Pure. */
export function findPlan(planId: string): SubscriptionPlan | null {
  return PLAN_BY_ID.get(planId) ?? null;
}

/** Look up a plan by tier. Pure. */
export function findPlanByTier(tier: string): SubscriptionPlan | null {
  return PLAN_BY_TIER.get(tier) ?? null;
}

export function isKnownPlan(planId: string): boolean {
  return PLAN_BY_ID.has(planId);
}

/** Every plan, optionally only the available (publicly selectable) ones. */
export function listPlans(availableOnly = false): readonly SubscriptionPlan[] {
  return availableOnly ? PLAN_CATALOG.filter((p) => p.available) : PLAN_CATALOG;
}

export function findAddon(addonId: string): BillingAddon | null {
  return ADDON_BY_ID.get(addonId) ?? null;
}

export function findCoupon(couponId: string): BillingCoupon | null {
  return COUPON_BY_ID.get(couponId) ?? null;
}

/** Resolve a coupon by its user-facing code (case-insensitive). */
export function findCouponByCode(code: string): BillingCoupon | null {
  return COUPON_BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

/** Numeric rank of a tier (−1 if unknown). Higher = more capable. */
export function tierRank(tier: string): number {
  return TIER_ORDER.indexOf(tier as SubscriptionPlan["tier"]);
}

/**
 * Compare two plans by tier. Returns "upgrade" | "downgrade" | "lateral".
 * Pure — used to decide proration credit vs immediate charge.
 */
export function comparePlans(fromPlanId: string, toPlanId: string): "upgrade" | "downgrade" | "lateral" | "unknown" {
  const from = findPlan(fromPlanId);
  const to = findPlan(toPlanId);
  if (from === null || to === null) return "unknown";
  const a = tierRank(from.tier);
  const b = tierRank(to.tier);
  if (a < b) return "upgrade";
  if (a > b) return "downgrade";
  return "lateral";
}
