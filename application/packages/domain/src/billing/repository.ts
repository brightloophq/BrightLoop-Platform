/* =============================================================================
 * Billing — REPOSITORY PORTS (F5).
 *
 * Account, subscription, invoice and payment-method are versioned roots
 * (optimistic concurrency); usage events and billing events are append-only with
 * idempotency lookups backing replay-safe ingestion. RLS is the tenant boundary.
 * Every method returns a `RuntimeResult` — no raw DB error crosses the port. The
 * port decides NOTHING (no ids, statuses, timestamps, capability, or legality) —
 * that is the application/domain layer's job.
 * ========================================================================== */

import type {
  BillingAccount,
  BillingEvent,
  BillingInvoice,
  BillingPaymentMethod,
  BillingUsageEvent,
  WorkspaceSubscription,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface BillingAccountRepository {
  create(row: BillingAccount): Promise<RuntimeResult<BillingAccount>>;
  getById(id: string): Promise<RuntimeResult<BillingAccount | null>>;
  findByWorkspace(workspaceId: string): Promise<RuntimeResult<BillingAccount | null>>;
  save(next: BillingAccount, expectedVersion: number): Promise<RuntimeResult<BillingAccount>>;
}

export interface WorkspaceSubscriptionRepository {
  create(row: WorkspaceSubscription): Promise<RuntimeResult<WorkspaceSubscription>>;
  getById(id: string): Promise<RuntimeResult<WorkspaceSubscription | null>>;
  findByWorkspace(workspaceId: string): Promise<RuntimeResult<WorkspaceSubscription | null>>;
  findByAccount(billingAccountId: string): Promise<RuntimeResult<WorkspaceSubscription[]>>;
  save(next: WorkspaceSubscription, expectedVersion: number): Promise<RuntimeResult<WorkspaceSubscription>>;
}

export interface BillingInvoiceRepository {
  create(row: BillingInvoice): Promise<RuntimeResult<BillingInvoice>>;
  getById(id: string): Promise<RuntimeResult<BillingInvoice | null>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<BillingInvoice | null>>;
  listByWorkspace(workspaceId: string, limit: number): Promise<RuntimeResult<BillingInvoice[]>>;
  listBySubscription(subscriptionId: string, limit: number): Promise<RuntimeResult<BillingInvoice[]>>;
  save(next: BillingInvoice, expectedVersion: number): Promise<RuntimeResult<BillingInvoice>>;
}

export interface BillingUsageEventRepository {
  append(row: BillingUsageEvent): Promise<RuntimeResult<BillingUsageEvent>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<BillingUsageEvent | null>>;
  listBySubscription(subscriptionId: string, limit: number): Promise<RuntimeResult<BillingUsageEvent[]>>;
  /** Events for a subscription within [startAt, endAt) — the aggregation window. */
  listByWindow(
    subscriptionId: string,
    startAt: string,
    endAt: string,
  ): Promise<RuntimeResult<BillingUsageEvent[]>>;
}

export interface BillingPaymentMethodRepository {
  create(row: BillingPaymentMethod): Promise<RuntimeResult<BillingPaymentMethod>>;
  getById(id: string): Promise<RuntimeResult<BillingPaymentMethod | null>>;
  listByAccount(billingAccountId: string): Promise<RuntimeResult<BillingPaymentMethod[]>>;
  save(next: BillingPaymentMethod, expectedVersion: number): Promise<RuntimeResult<BillingPaymentMethod>>;
}

export interface BillingEventRepository {
  append(row: BillingEvent): Promise<RuntimeResult<BillingEvent>>;
  findByIdempotencyKey(key: string): Promise<RuntimeResult<BillingEvent | null>>;
  listBySubscription(subscriptionId: string, limit: number): Promise<RuntimeResult<BillingEvent[]>>;
  listByWorkspace(workspaceId: string, limit: number): Promise<RuntimeResult<BillingEvent[]>>;
}

/** The aggregate bundle the application layer is wired with. */
export interface BillingRepositories {
  accounts: BillingAccountRepository;
  subscriptions: WorkspaceSubscriptionRepository;
  invoices: BillingInvoiceRepository;
  usage: BillingUsageEventRepository;
  paymentMethods: BillingPaymentMethodRepository;
  events: BillingEventRepository;
}
