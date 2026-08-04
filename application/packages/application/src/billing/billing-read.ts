/* =============================================================================
 * Billing — read models (F5). All reads authorize billing.read on the tenant.
 * The entitlement + usage seam other subsystems call to enforce limits lives here.
 * ========================================================================== */

import type {
  BillingUsageEvent,
  EntitlementLimitKey,
  PlanEntitlements,
  SubscriptionPlan,
  UsageMeter,
  WorkspaceSubscription,
} from "@brightloop/schema";
import {
  aggregateUsage,
  checkLimit,
  entitlementSnapshot,
  findPlan,
  listPlans,
  USAGE_METER_LIMIT,
  type EntitlementCheck,
  type EntitlementSnapshot,
} from "@brightloop/domain";

import { authorize, BILLING_READ_CAP, requireBilling, type AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
import { may } from "@brightloop/domain";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toBillingAccountDTO,
  toBillingEventDTO,
  toEntitlementsDTO,
  toInvoiceDTO,
  toPaymentMethodDTO,
  toPlanDTO,
  toWorkspaceSubscriptionDTO,
  toUsageSummaryDTO,
  type BillingAccountDTO,
  type BillingEventDTO,
  type EntitlementsDTO,
  type InvoiceDTO,
  type PaymentMethodDTO,
  type PlanDTO,
  type WorkspaceSubscriptionDTO,
  type UsageSummaryDTO,
} from "./dto.js";

/** Resolved billing state for a workspace (internal; authorizes on read). */
interface WorkspaceBilling {
  subscription: WorkspaceSubscription;
  plan: SubscriptionPlan;
  snapshot: EntitlementSnapshot;
  usage: Record<UsageMeter, number>;
  periodStartAt: string | null;
  periodEndAt: string | null;
}

async function loadUsageForPeriod(
  ctx: AppContext,
  sub: WorkspaceSubscription,
): Promise<{ usage: Record<UsageMeter, number>; periodStartAt: string | null; periodEndAt: string | null }> {
  const repo = requireBilling(ctx);
  const periodStartAt = sub.currentPeriodStartAt;
  const periodEndAt = sub.currentPeriodEndAt;
  let events: BillingUsageEvent[];
  if (periodStartAt !== null && periodEndAt !== null) {
    events = unwrap(await repo.usage.listByWindow(sub.id, periodStartAt, periodEndAt));
  } else {
    events = unwrap(await repo.usage.listBySubscription(sub.id, 10_000));
  }
  return { usage: aggregateUsage(events), periodStartAt, periodEndAt };
}

async function resolveWorkspaceBilling(ctx: AppContext, workspaceId: string): Promise<WorkspaceBilling | null> {
  const repo = requireBilling(ctx);
  const subscription = unwrap(await repo.subscriptions.findByWorkspace(workspaceId));
  if (subscription === null) return null;
  authorize(ctx.actor, BILLING_READ_CAP, subscription.clientId);
  const plan = findPlan(subscription.planId);
  if (plan === null) return null;
  const snapshot = entitlementSnapshot(subscription, plan);
  const { usage, periodStartAt, periodEndAt } = await loadUsageForPeriod(ctx, subscription);
  return { subscription, plan, snapshot, usage, periodStartAt, periodEndAt };
}

export interface BillingOverviewDTO {
  account: BillingAccountDTO | null;
  subscription: WorkspaceSubscriptionDTO | null;
  entitlements: EntitlementsDTO | null;
  usage: UsageSummaryDTO | null;
}

/** The full billing overview for a workspace (subscription + entitlements + usage). */
export async function getBillingOverview(ctx: AppContext, workspaceId: string): Promise<BillingOverviewDTO> {
  const wid = requireId(workspaceId, "workspaceId");
  const repo = requireBilling(ctx);
  const account = unwrap(await repo.accounts.findByWorkspace(wid));
  if (account !== null) authorize(ctx.actor, BILLING_READ_CAP, account.clientId);

  const resolved = await resolveWorkspaceBilling(ctx, wid);
  let hasPaymentMethod = false;
  if (account !== null) {
    const methods = unwrap(await repo.paymentMethods.listByAccount(account.id));
    hasPaymentMethod = methods.some((m) => m.status === "active");
  }
  return {
    account: account !== null ? toBillingAccountDTO(account, hasPaymentMethod) : null,
    subscription: resolved !== null ? toWorkspaceSubscriptionDTO(resolved.subscription) : null,
    entitlements: resolved !== null ? toEntitlementsDTO(resolved.snapshot) : null,
    usage:
      resolved !== null
        ? toUsageSummaryDTO(resolved.snapshot, resolved.usage, resolved.periodStartAt, resolved.periodEndAt)
        : null,
  };
}

/** The resolved entitlements for a workspace, or null if unsubscribed. */
export async function getEntitlements(ctx: AppContext, workspaceId: string): Promise<EntitlementsDTO | null> {
  const resolved = await resolveWorkspaceBilling(ctx, requireId(workspaceId, "workspaceId"));
  return resolved !== null ? toEntitlementsDTO(resolved.snapshot) : null;
}

/** Current-period usage against limits for a workspace. */
export async function getUsageSummary(ctx: AppContext, workspaceId: string): Promise<UsageSummaryDTO | null> {
  const resolved = await resolveWorkspaceBilling(ctx, requireId(workspaceId, "workspaceId"));
  return resolved !== null
    ? toUsageSummaryDTO(resolved.snapshot, resolved.usage, resolved.periodStartAt, resolved.periodEndAt)
    : null;
}

/** Invoices for a workspace, newest first. */
export async function listInvoices(ctx: AppContext, workspaceId: string, limit = 50): Promise<InvoiceDTO[]> {
  const wid = requireId(workspaceId, "workspaceId");
  const repo = requireBilling(ctx);
  const account = unwrap(await repo.accounts.findByWorkspace(wid));
  if (account === null) return [];
  authorize(ctx.actor, BILLING_READ_CAP, account.clientId);
  const invoices = unwrap(await repo.invoices.listByWorkspace(wid, Math.min(Math.max(limit, 1), 200)));
  return invoices.map(toInvoiceDTO);
}

/** Billing history (audit / notification ledger) for a workspace, newest first. */
export async function listBillingHistory(ctx: AppContext, workspaceId: string, limit = 50): Promise<BillingEventDTO[]> {
  const wid = requireId(workspaceId, "workspaceId");
  const repo = requireBilling(ctx);
  const account = unwrap(await repo.accounts.findByWorkspace(wid));
  if (account === null) return [];
  authorize(ctx.actor, BILLING_READ_CAP, account.clientId);
  const events = unwrap(await repo.events.listByWorkspace(wid, Math.min(Math.max(limit, 1), 200)));
  return events.map(toBillingEventDTO);
}

/** Stored payment methods for a workspace (brand + last4 only). */
export async function listPaymentMethods(ctx: AppContext, workspaceId: string): Promise<PaymentMethodDTO[]> {
  const wid = requireId(workspaceId, "workspaceId");
  const repo = requireBilling(ctx);
  const account = unwrap(await repo.accounts.findByWorkspace(wid));
  if (account === null) return [];
  authorize(ctx.actor, BILLING_READ_CAP, account.clientId);
  const methods = unwrap(await repo.paymentMethods.listByAccount(account.id));
  return methods.filter((m) => m.status !== "removed").map(toPaymentMethodDTO);
}

/**
 * The public plan catalogue (upgrade options). Requires the read capability but
 * carries no tenant — plans are not tenant-scoped.
 */
export function listAvailablePlans(ctx: AppContext): PlanDTO[] {
  if (!may(ctx.actor, BILLING_READ_CAP)) throw new ForbiddenError();
  return listPlans(true).map(toPlanDTO);
}

export interface EntitlementCheckDTO extends EntitlementCheck {
  meter: UsageMeter;
}

/**
 * The metered-limit enforcement seam other subsystems call: would consuming
 * `requested` more of `meter` stay within the workspace's current-period limit?
 * An unsubscribed workspace is denied (no entitlements). Requires billing.read.
 */
export async function checkUsageAllowance(
  ctx: AppContext,
  workspaceId: string,
  meter: UsageMeter,
  requested = 1,
): Promise<EntitlementCheckDTO> {
  const resolved = await resolveWorkspaceBilling(ctx, requireId(workspaceId, "workspaceId"));
  const key: EntitlementLimitKey = USAGE_METER_LIMIT[meter];
  if (resolved === null) {
    return { meter, key, allowed: false, unlimited: false, limit: 0, used: 0, requested, remaining: 0 };
  }
  const used = resolved.usage[meter] ?? 0;
  const check = checkLimit(resolved.snapshot.entitlements, key, used, requested);
  return { ...check, meter };
}

/** Is a boolean feature entitled for a workspace? Unsubscribed → false. */
export async function isFeatureEntitled(
  ctx: AppContext,
  workspaceId: string,
  feature: keyof PlanEntitlements["features"],
): Promise<boolean> {
  const resolved = await resolveWorkspaceBilling(ctx, requireId(workspaceId, "workspaceId"));
  if (resolved === null) return false;
  return resolved.snapshot.entitlements.features[feature] === true;
}
