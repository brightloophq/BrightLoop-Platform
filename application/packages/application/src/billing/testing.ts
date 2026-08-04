/* =============================================================================
 * Billing — TEST SUPPORT (F5). A deterministic in-memory repository bundle that
 * mirrors adapter semantics (versioned optimistic concurrency; append-only
 * idempotency lookups). Used by the application use-case tests. No DB, no clock.
 * ========================================================================== */

import {
  ok,
  type BillingRepositories,
  type RuntimeResult,
} from "@brightloop/domain";
import type {
  BillingAccount,
  BillingEvent,
  BillingInvoice,
  BillingPaymentMethod,
  BillingUsageEvent,
  WorkspaceSubscription,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

export function createInMemoryBillingRepos(): BillingRepositories {
  const accounts = new Map<string, BillingAccount>();
  const subscriptions = new Map<string, WorkspaceSubscription>();
  const invoices = new Map<string, BillingInvoice>();
  const paymentMethods = new Map<string, BillingPaymentMethod>();
  const usage: BillingUsageEvent[] = [];
  const events: BillingEvent[] = [];

  return {
    accounts: {
      create: async (r) => {
        accounts.set(r.id, r);
        return ok("created", r);
      },
      getById: async (id) => ok("found", accounts.get(id) ?? null),
      findByWorkspace: async (w) => ok("found", [...accounts.values()].find((a) => a.workspaceId === w) ?? null),
      save: async (next, expected) => {
        const cur = accounts.get(next.id);
        if (!cur || cur.version !== expected) return conflict();
        accounts.set(next.id, next);
        return ok("updated", next);
      },
    },
    subscriptions: {
      create: async (r) => {
        subscriptions.set(r.id, r);
        return ok("created", r);
      },
      getById: async (id) => ok("found", subscriptions.get(id) ?? null),
      findByWorkspace: async (w) => ok("found", [...subscriptions.values()].find((s) => s.workspaceId === w) ?? null),
      findByAccount: async (a) => ok("found", [...subscriptions.values()].filter((s) => s.billingAccountId === a)),
      save: async (next, expected) => {
        const cur = subscriptions.get(next.id);
        if (!cur || cur.version !== expected) return conflict();
        subscriptions.set(next.id, next);
        return ok("updated", next);
      },
    },
    invoices: {
      create: async (r) => {
        invoices.set(r.id, r);
        return ok("created", r);
      },
      getById: async (id) => ok("found", invoices.get(id) ?? null),
      findByIdempotencyKey: async (k) => ok("found", [...invoices.values()].find((i) => i.idempotencyKey === k) ?? null),
      listByWorkspace: async (w, limit) =>
        ok(
          "found",
          [...invoices.values()]
            .filter((i) => i.workspaceId === w)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .slice(0, limit),
        ),
      listBySubscription: async (s, limit) =>
        ok(
          "found",
          [...invoices.values()]
            .filter((i) => i.subscriptionId === s)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
            .slice(0, limit),
        ),
      save: async (next, expected) => {
        const cur = invoices.get(next.id);
        if (!cur || cur.version !== expected) return conflict();
        invoices.set(next.id, next);
        return ok("updated", next);
      },
    },
    usage: {
      append: async (r) => {
        usage.push(r);
        return ok("created", r);
      },
      findByIdempotencyKey: async (k) => ok("found", usage.find((u) => u.idempotencyKey === k) ?? null),
      listBySubscription: async (s, limit) =>
        ok("found", usage.filter((u) => u.subscriptionId === s).slice(0, limit)),
      listByWindow: async (s, startAt, endAt) =>
        ok(
          "found",
          usage.filter((u) => u.subscriptionId === s && u.occurredAt >= startAt && u.occurredAt < endAt),
        ),
    },
    paymentMethods: {
      create: async (r) => {
        paymentMethods.set(r.id, r);
        return ok("created", r);
      },
      getById: async (id) => ok("found", paymentMethods.get(id) ?? null),
      listByAccount: async (a) => ok("found", [...paymentMethods.values()].filter((p) => p.billingAccountId === a)),
      save: async (next, expected) => {
        const cur = paymentMethods.get(next.id);
        if (!cur || cur.version !== expected) return conflict();
        paymentMethods.set(next.id, next);
        return ok("updated", next);
      },
    },
    events: {
      append: async (r) => {
        events.push(r);
        return ok("created", r);
      },
      findByIdempotencyKey: async (k) =>
        ok("found", k === null ? null : events.find((e) => e.idempotencyKey === k) ?? null),
      listBySubscription: async (s, limit) =>
        ok(
          "found",
          events.filter((e) => e.subscriptionId === s).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit),
        ),
      listByWorkspace: async (w, limit) =>
        ok(
          "found",
          events.filter((e) => e.workspaceId === w).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit),
        ),
    },
  };
}
