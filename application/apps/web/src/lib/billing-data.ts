import "server-only";

/**
 * Billing & Subscription — server data access (Phase F · Sprint F5).
 *
 * The ONLY place the billing UI reaches data, through the same seam as every
 * other surface: `buildAppContext()` → billing application read models. No
 * business logic, no queries — RLS scopes everything to the caller's own org
 * (`null` = unauthenticated). No provider reference / checksum / idempotency key
 * ever appears (the read models are DTO-only).
 */

import { buildAppContext } from "./runtime-api";
import { resolveWorkspaces } from "./workspace-data";
import {
  getBillingOverview,
  listAvailablePlans,
  listBillingHistory,
  listInvoices,
  type BillingEventDTO,
  type BillingOverviewDTO,
  type InvoiceDTO,
  type PlanDTO,
} from "@brightloop/application";

async function wid(): Promise<string | null> {
  return (await resolveWorkspaces())[0]?.id ?? null;
}

export interface BillingPageData {
  workspaceId: string | null;
  overview: BillingOverviewDTO | null;
  invoices: InvoiceDTO[];
  history: BillingEventDTO[];
  plans: PlanDTO[];
}

/** The full billing settings view: subscription, usage, invoices, history, plans. */
export async function loadBilling(): Promise<BillingPageData | null> {
  const ctx = await buildAppContext();
  if (ctx === null) return null;
  const workspaceId = await wid();
  let plans: PlanDTO[] = [];
  try {
    plans = listAvailablePlans(ctx);
  } catch {
    plans = [];
  }
  if (workspaceId === null) {
    return { workspaceId: null, overview: null, invoices: [], history: [], plans };
  }
  const [overview, invoices, history] = await Promise.all([
    getBillingOverview(ctx, workspaceId).catch(() => null),
    listInvoices(ctx, workspaceId, 20).catch(() => [] as InvoiceDTO[]),
    listBillingHistory(ctx, workspaceId, 20).catch(() => [] as BillingEventDTO[]),
  ]);
  return { workspaceId, overview, invoices, history, plans };
}
