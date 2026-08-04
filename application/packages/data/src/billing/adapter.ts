/* =============================================================================
 * Supabase Billing repositories (F5).
 *
 * Six adapters (untyped-cast pattern; mappers are the boundary). Account,
 * subscription, invoice and payment-method are versioned roots (optimistic
 * concurrency via `.eq("version", expected)` → null row = conflict); usage
 * events and billing events are append-only with idempotency lookups. RLS scopes
 * every row to its tenant. No provider secret is read or written here.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err,
  mapDatabaseError,
  ok,
  type BillingAccountRepository,
  type BillingEventRepository,
  type BillingInvoiceRepository,
  type BillingPaymentMethodRepository,
  type BillingRepositories,
  type BillingUsageEventRepository,
  type RuntimeResult,
  type WorkspaceSubscriptionRepository,
} from "@brightloop/domain";
import type {
  BillingAccount,
  BillingEvent,
  BillingInvoice,
  BillingPaymentMethod,
  BillingUsageEvent,
  WorkspaceSubscription,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const cast = (c: AuxionSupabaseClient): SupabaseClient => c as unknown as SupabaseClient;
const rec = (r: unknown) => r as Record<string, unknown>;

async function single<T>(
  p: PromiseLike<{ data: unknown; error: unknown }>,
  toDomain: (r: Record<string, unknown>) => T,
  ctx: string,
): Promise<RuntimeResult<T>> {
  const { data, error } = await p;
  if (error) return mapDatabaseError(error as never, ctx);
  return ok("created", toDomain(rec(data)));
}

export class SupabaseBillingAccountRepository implements BillingAccountRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) {
    this.db = cast(c);
  }
  create(r: BillingAccount) {
    return single(this.db.from("billing_account").insert(m.accountRow(r)).select("*").single(), m.toAccount, "billingAccount.create");
  }
  async getById(id: string): Promise<RuntimeResult<BillingAccount | null>> {
    const { data, error } = await this.db.from("billing_account").select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "billingAccount.getById");
    return ok("found", data ? m.toAccount(rec(data)) : null);
  }
  async findByWorkspace(workspaceId: string): Promise<RuntimeResult<BillingAccount | null>> {
    const { data, error } = await this.db.from("billing_account").select("*").eq("workspace_id", workspaceId).maybeSingle();
    if (error) return mapDatabaseError(error, "billingAccount.findByWorkspace");
    return ok("found", data ? m.toAccount(rec(data)) : null);
  }
  async save(next: BillingAccount, expected: number): Promise<RuntimeResult<BillingAccount>> {
    const { data, error } = await this.db.from("billing_account").update(m.accountRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "billingAccount.save");
    if (data === null) return err("conflict", "billingAccount.save: version mismatch");
    return ok("updated", m.toAccount(rec(data)));
  }
}

export class SupabaseWorkspaceSubscriptionRepository implements WorkspaceSubscriptionRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) {
    this.db = cast(c);
  }
  create(r: WorkspaceSubscription) {
    return single(this.db.from("billing_subscription").insert(m.subscriptionRow(r)).select("*").single(), m.toSubscription, "billingSubscription.create");
  }
  async getById(id: string): Promise<RuntimeResult<WorkspaceSubscription | null>> {
    const { data, error } = await this.db.from("billing_subscription").select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "billingSubscription.getById");
    return ok("found", data ? m.toSubscription(rec(data)) : null);
  }
  async findByWorkspace(workspaceId: string): Promise<RuntimeResult<WorkspaceSubscription | null>> {
    const { data, error } = await this.db.from("billing_subscription").select("*").eq("workspace_id", workspaceId).maybeSingle();
    if (error) return mapDatabaseError(error, "billingSubscription.findByWorkspace");
    return ok("found", data ? m.toSubscription(rec(data)) : null);
  }
  async findByAccount(billingAccountId: string): Promise<RuntimeResult<WorkspaceSubscription[]>> {
    const { data, error } = await this.db.from("billing_subscription").select("*").eq("billing_account_id", billingAccountId);
    if (error) return mapDatabaseError(error, "billingSubscription.findByAccount");
    return ok("found", (data ?? []).map((x) => m.toSubscription(rec(x))));
  }
  async save(next: WorkspaceSubscription, expected: number): Promise<RuntimeResult<WorkspaceSubscription>> {
    const { data, error } = await this.db.from("billing_subscription").update(m.subscriptionRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "billingSubscription.save");
    if (data === null) return err("conflict", "billingSubscription.save: version mismatch");
    return ok("updated", m.toSubscription(rec(data)));
  }
}

export class SupabaseBillingInvoiceRepository implements BillingInvoiceRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) {
    this.db = cast(c);
  }
  create(r: BillingInvoice) {
    return single(this.db.from("billing_invoice").insert(m.invoiceRow(r)).select("*").single(), m.toInvoice, "billingInvoice.create");
  }
  async getById(id: string): Promise<RuntimeResult<BillingInvoice | null>> {
    const { data, error } = await this.db.from("billing_invoice").select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "billingInvoice.getById");
    return ok("found", data ? m.toInvoice(rec(data)) : null);
  }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<BillingInvoice | null>> {
    const { data, error } = await this.db.from("billing_invoice").select("*").eq("idempotency_key", key).maybeSingle();
    if (error) return mapDatabaseError(error, "billingInvoice.findByIdempotencyKey");
    return ok("found", data ? m.toInvoice(rec(data)) : null);
  }
  async listByWorkspace(workspaceId: string, limit: number): Promise<RuntimeResult<BillingInvoice[]>> {
    const { data, error } = await this.db.from("billing_invoice").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limit);
    if (error) return mapDatabaseError(error, "billingInvoice.listByWorkspace");
    return ok("found", (data ?? []).map((x) => m.toInvoice(rec(x))));
  }
  async listBySubscription(subscriptionId: string, limit: number): Promise<RuntimeResult<BillingInvoice[]>> {
    const { data, error } = await this.db.from("billing_invoice").select("*").eq("subscription_id", subscriptionId).order("created_at", { ascending: false }).limit(limit);
    if (error) return mapDatabaseError(error, "billingInvoice.listBySubscription");
    return ok("found", (data ?? []).map((x) => m.toInvoice(rec(x))));
  }
  async save(next: BillingInvoice, expected: number): Promise<RuntimeResult<BillingInvoice>> {
    const { data, error } = await this.db.from("billing_invoice").update(m.invoiceRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "billingInvoice.save");
    if (data === null) return err("conflict", "billingInvoice.save: version mismatch");
    return ok("updated", m.toInvoice(rec(data)));
  }
}

export class SupabaseBillingUsageEventRepository implements BillingUsageEventRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) {
    this.db = cast(c);
  }
  append(r: BillingUsageEvent) {
    return single(this.db.from("billing_usage_event").insert(m.usageEventRow(r)).select("*").single(), m.toUsageEvent, "billingUsageEvent.append");
  }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<BillingUsageEvent | null>> {
    const { data, error } = await this.db.from("billing_usage_event").select("*").eq("idempotency_key", key).maybeSingle();
    if (error) return mapDatabaseError(error, "billingUsageEvent.findByIdempotencyKey");
    return ok("found", data ? m.toUsageEvent(rec(data)) : null);
  }
  async listBySubscription(subscriptionId: string, limit: number): Promise<RuntimeResult<BillingUsageEvent[]>> {
    const { data, error } = await this.db.from("billing_usage_event").select("*").eq("subscription_id", subscriptionId).order("occurred_at", { ascending: false }).limit(limit);
    if (error) return mapDatabaseError(error, "billingUsageEvent.listBySubscription");
    return ok("found", (data ?? []).map((x) => m.toUsageEvent(rec(x))));
  }
  async listByWindow(subscriptionId: string, startAt: string, endAt: string): Promise<RuntimeResult<BillingUsageEvent[]>> {
    const { data, error } = await this.db
      .from("billing_usage_event")
      .select("*")
      .eq("subscription_id", subscriptionId)
      .gte("occurred_at", startAt)
      .lt("occurred_at", endAt)
      .order("occurred_at", { ascending: true });
    if (error) return mapDatabaseError(error, "billingUsageEvent.listByWindow");
    return ok("found", (data ?? []).map((x) => m.toUsageEvent(rec(x))));
  }
}

export class SupabaseBillingPaymentMethodRepository implements BillingPaymentMethodRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) {
    this.db = cast(c);
  }
  create(r: BillingPaymentMethod) {
    return single(this.db.from("billing_payment_method").insert(m.paymentMethodRow(r)).select("*").single(), m.toPaymentMethod, "billingPaymentMethod.create");
  }
  async getById(id: string): Promise<RuntimeResult<BillingPaymentMethod | null>> {
    const { data, error } = await this.db.from("billing_payment_method").select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "billingPaymentMethod.getById");
    return ok("found", data ? m.toPaymentMethod(rec(data)) : null);
  }
  async listByAccount(billingAccountId: string): Promise<RuntimeResult<BillingPaymentMethod[]>> {
    const { data, error } = await this.db.from("billing_payment_method").select("*").eq("billing_account_id", billingAccountId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "billingPaymentMethod.listByAccount");
    return ok("found", (data ?? []).map((x) => m.toPaymentMethod(rec(x))));
  }
  async save(next: BillingPaymentMethod, expected: number): Promise<RuntimeResult<BillingPaymentMethod>> {
    const { data, error } = await this.db.from("billing_payment_method").update(m.paymentMethodRow(next)).eq("id", next.id).eq("version", expected).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "billingPaymentMethod.save");
    if (data === null) return err("conflict", "billingPaymentMethod.save: version mismatch");
    return ok("updated", m.toPaymentMethod(rec(data)));
  }
}

export class SupabaseBillingEventRepository implements BillingEventRepository {
  private readonly db: SupabaseClient;
  constructor(c: AuxionSupabaseClient) {
    this.db = cast(c);
  }
  append(r: BillingEvent) {
    return single(this.db.from("billing_event").insert(m.billingEventRow(r)).select("*").single(), m.toBillingEvent, "billingEvent.append");
  }
  async findByIdempotencyKey(key: string): Promise<RuntimeResult<BillingEvent | null>> {
    const { data, error } = await this.db.from("billing_event").select("*").eq("idempotency_key", key).maybeSingle();
    if (error) return mapDatabaseError(error, "billingEvent.findByIdempotencyKey");
    return ok("found", data ? m.toBillingEvent(rec(data)) : null);
  }
  async listBySubscription(subscriptionId: string, limit: number): Promise<RuntimeResult<BillingEvent[]>> {
    const { data, error } = await this.db.from("billing_event").select("*").eq("subscription_id", subscriptionId).order("created_at", { ascending: false }).limit(limit);
    if (error) return mapDatabaseError(error, "billingEvent.listBySubscription");
    return ok("found", (data ?? []).map((x) => m.toBillingEvent(rec(x))));
  }
  async listByWorkspace(workspaceId: string, limit: number): Promise<RuntimeResult<BillingEvent[]>> {
    const { data, error } = await this.db.from("billing_event").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(limit);
    if (error) return mapDatabaseError(error, "billingEvent.listByWorkspace");
    return ok("found", (data ?? []).map((x) => m.toBillingEvent(rec(x))));
  }
}

/** Assemble the billing repository bundle for a request-scoped Supabase client. */
export function createBillingRepositories(c: AuxionSupabaseClient): BillingRepositories {
  return {
    accounts: new SupabaseBillingAccountRepository(c),
    subscriptions: new SupabaseWorkspaceSubscriptionRepository(c),
    invoices: new SupabaseBillingInvoiceRepository(c),
    usage: new SupabaseBillingUsageEventRepository(c),
    paymentMethods: new SupabaseBillingPaymentMethodRepository(c),
    events: new SupabaseBillingEventRepository(c),
  };
}
