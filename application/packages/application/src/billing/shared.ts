/* =============================================================================
 * Billing — shared load-authorize-audit helpers (F5). Every command use-case
 * composes these: load the row, authorize on its tenant, transition with
 * optimistic concurrency, and append to the append-only billing history ledger.
 * ========================================================================== */

import {
  billingAccountSchema,
  billingEventSchema,
  type BillingAccount,
  type BillingEventType,
  type BillingInvoice,
  type SubscriptionStatus,
  type WorkspaceSubscription,
} from "@brightloop/schema";
import { canTransitionSubscription } from "@brightloop/domain";

import { authorize, requireBilling, type AppContext } from "../context.js";
import { ConflictError, NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";

/** Find the workspace's billing account (authorizing when present). */
export async function loadAccountByWorkspace(
  ctx: AppContext,
  workspaceId: string,
  cap: string,
): Promise<BillingAccount | null> {
  const repo = requireBilling(ctx);
  const account = unwrap(await repo.accounts.findByWorkspace(workspaceId));
  if (account !== null) authorize(ctx.actor, cap, account.clientId);
  return account;
}

/** Get-or-create the workspace's billing account. Authorizes on the resolved tenant. */
export async function ensureAccount(
  ctx: AppContext,
  workspaceId: string,
  clientId: string | null,
  cap: string,
): Promise<BillingAccount> {
  const repo = requireBilling(ctx);
  const existing = unwrap(await repo.accounts.findByWorkspace(workspaceId));
  if (existing !== null) {
    authorize(ctx.actor, cap, existing.clientId);
    return existing;
  }
  authorize(ctx.actor, cap, clientId);
  const now = ctx.clock();
  const account = billingAccountSchema.parse({
    id: ctx.ids("bacct"),
    workspaceId,
    clientId,
    createdAt: now,
    updatedAt: now,
  });
  return unwrap(await repo.accounts.create(account));
}

/** Load a subscription by id, then authorize on its tenant (404 if absent). */
export async function loadSubscription(ctx: AppContext, id: string, cap: string): Promise<WorkspaceSubscription> {
  const repo = requireBilling(ctx);
  const sub = unwrap(await repo.subscriptions.getById(id));
  if (sub === null) throw new NotFoundError("subscription");
  authorize(ctx.actor, cap, sub.clientId);
  return sub;
}

/** Find the workspace's subscription (authorizing when present). */
export async function loadSubscriptionByWorkspace(
  ctx: AppContext,
  workspaceId: string,
  cap: string,
): Promise<WorkspaceSubscription | null> {
  const repo = requireBilling(ctx);
  const sub = unwrap(await repo.subscriptions.findByWorkspace(workspaceId));
  if (sub !== null) authorize(ctx.actor, cap, sub.clientId);
  return sub;
}

/** Load an invoice by id, then authorize on its tenant (404 if absent). */
export async function loadInvoice(ctx: AppContext, id: string, cap: string): Promise<BillingInvoice> {
  const repo = requireBilling(ctx);
  const inv = unwrap(await repo.invoices.getById(id));
  if (inv === null) throw new NotFoundError("invoice");
  authorize(ctx.actor, cap, inv.clientId);
  return inv;
}

/** Append a row to the append-only billing history / audit / notification ledger. */
export async function appendBillingEvent(
  ctx: AppContext,
  args: {
    workspaceId: string;
    clientId: string | null;
    subscriptionId?: string | null;
    invoiceId?: string | null;
    type: BillingEventType;
    summary: string;
    detail?: Record<string, unknown>;
    idempotencyKey?: string | null;
  },
): Promise<void> {
  const repo = requireBilling(ctx);
  if (args.idempotencyKey) {
    const existing = unwrap(await repo.events.findByIdempotencyKey(args.idempotencyKey));
    if (existing !== null) return; // already recorded — replay-safe
  }
  const event = billingEventSchema.parse({
    id: ctx.ids("bevt"),
    workspaceId: args.workspaceId,
    clientId: args.clientId,
    subscriptionId: args.subscriptionId ?? null,
    invoiceId: args.invoiceId ?? null,
    type: args.type,
    summary: args.summary,
    detail: args.detail ?? {},
    actorId: ctx.actor.userId,
    correlationId: ctx.ids("corr"),
    idempotencyKey: args.idempotencyKey ?? null,
    createdAt: ctx.clock(),
  });
  unwrap(await repo.events.append(event));
}

/**
 * Transition a subscription with optimistic concurrency + audit. Rejects an
 * illegal machine move with a 409. A no-op (`to === current`) still saves the
 * patch (e.g. cancelAtPeriodEnd) but appends no lifecycle event.
 */
export async function transitionSubscription(
  ctx: AppContext,
  sub: WorkspaceSubscription,
  to: SubscriptionStatus,
  patch: Partial<WorkspaceSubscription>,
  meta: { type: BillingEventType; summary: string; detail?: Record<string, unknown> },
): Promise<WorkspaceSubscription> {
  const repo = requireBilling(ctx);
  if (sub.status !== to && !canTransitionSubscription(sub.status, to)) {
    throw new ConflictError(`Illegal subscription transition ${sub.status} → ${to}`);
  }
  const now = ctx.clock();
  const next: WorkspaceSubscription = { ...sub, ...patch, status: to, version: sub.version + 1, updatedAt: now };
  const saved = unwrap(await repo.subscriptions.save(next, sub.version));
  if (sub.status !== to) {
    await appendBillingEvent(ctx, {
      workspaceId: saved.workspaceId,
      clientId: saved.clientId,
      subscriptionId: saved.id,
      type: meta.type,
      summary: meta.summary,
      detail: meta.detail,
    });
  }
  return saved;
}
