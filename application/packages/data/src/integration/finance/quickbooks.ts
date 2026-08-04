/* =============================================================================
 * QuickBooks Online provider binding (F4.6). OAuth 2.0 (Bearer) auth against the
 * Intuit Accounting API. The company `realmId` + environment (production/sandbox) are
 * carried as install config; the API base is `${host}/v3/company/{realmId}`. EVERY read
 * goes through the allowlisted `buildQboQuery` — no raw QBO query is ever accepted, and
 * no entity outside the allowlist is reachable. Webhooks are verified by the
 * `intuit-signature` HMAC-SHA256 (base64) scheme and translated from
 * `eventNotifications[].dataChangeEvent` into canonical finance.* events.
 * Provider-neutral in/out; no QuickBooks shape or secret leaks past this boundary.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult, type VerifiedWebhook,
} from "@brightloop/domain";
import type { AuthContext, FinanceCall, FinanceProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, scalarNum, scalarStr, type OpInput } from "./helpers.js";
import {
  compact, pagination,
  type FinanceAccount, type FinanceCustomer, type FinanceExpense, type FinanceInvoice, type FinanceItem, type FinancePayment, type FinanceTax,
} from "./contracts.js";
import { FINANCE_EVENTS, financeEvent, type FinanceEventType, type NormalizedFinanceEvent } from "./normalize.js";
import { buildQboQuery, type QboQuerySpec } from "./quickbooks-query.js";
import { verifyHmacSha256Base64 } from "./webhook.js";

const PROD_HOST = "https://quickbooks.api.intuit.com";
const SANDBOX_HOST = "https://sandbox-quickbooks.api.intuit.com";
const MINOR_VERSION = "65";
const PROVENANCE = "quickbooks:webhook";
const POLL_PROVENANCE = "quickbooks:poll";

function host(config: OpInput): string {
  return optStr(config, "environment") === "sandbox" ? SANDBOX_HOST : PROD_HOST;
}
function realm(config: OpInput): string {
  return optStr(config, "realmId");
}

/** QuickBooks authorizes with the resolved OAuth token + configured realmId/environment. */
function authorize(secret: string | null, config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  const realmId = realm(config);
  if (realmId.length === 0) return connectorErr("config_invalid", "realmId is not configured", "no_realm_id");
  return connectorOk({ baseUrl: `${host(config)}/v3/company/${encodeURIComponent(realmId)}`, headers: { authorization: `Bearer ${secret}` } });
}

/** Run an allowlisted query, returning the named entity array + a next-page cursor. */
async function runQuery(call: FinanceCall, entity: string, spec: Omit<QboQuerySpec, "entity">): Promise<ConnectorResult<{ records: Record<string, unknown>[]; nextCursor: string | null }>> {
  const built = buildQboQuery({ entity, ...spec });
  if (!built.ok) return built;
  const r = await call({ method: "GET", path: "/query", query: { query: built.value, minorversion: MINOR_VERSION } });
  if (!r.ok) return r;
  const qr = obj(r.value["QueryResponse"]);
  const records = arr(qr[entity]);
  const start = Math.max(1, Math.trunc(spec.startPosition ?? 1));
  const max = Math.min(Math.max(1, Math.trunc(spec.maxResults ?? 50)), 1000);
  const nextCursor = records.length >= max ? String(start + records.length) : null;
  return connectorOk({ records, nextCursor });
}

/* ---- normalizers (QBO entity → neutral contract) --------------------------- */

function refId(v: unknown): string {
  if (v !== null && typeof v === "object") return scalarStr((v as Record<string, unknown>)["value"]);
  return scalarStr(v);
}
function metaTime(o: Record<string, unknown>, key: "CreateTime" | "LastUpdatedTime"): string | undefined {
  return optStr(obj(o["MetaData"]), key) || undefined;
}
function invoiceStatus(o: Record<string, unknown>): FinanceInvoice["status"] {
  const total = scalarNum(o["TotalAmt"]);
  const balance = scalarNum(o["Balance"]);
  if (balance !== undefined && balance === 0 && total !== undefined && total > 0) return "paid";
  return "open";
}
function normInvoice(o: Record<string, unknown>): Record<string, unknown> {
  const inv: FinanceInvoice = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), number: optStr(o, "DocNumber") || undefined,
    customerExternalId: refId(o["CustomerRef"]) || undefined, status: invoiceStatus(o),
    currency: refId(o["CurrencyRef"]) || undefined, total: scalarNum(o["TotalAmt"]), balance: scalarNum(o["Balance"]),
    issueDate: optStr(o, "TxnDate") || undefined, dueDate: optStr(o, "DueDate") || undefined,
    createdAt: metaTime(o, "CreateTime"), updatedAt: metaTime(o, "LastUpdatedTime"),
  };
  return compact(inv);
}
function normCustomer(o: Record<string, unknown>): Record<string, unknown> {
  const c: FinanceCustomer = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), displayName: optStr(o, "DisplayName") || optStr(o, "CompanyName") || scalarStr(o["Id"]),
    companyName: optStr(o, "CompanyName") || undefined, email: optStr(obj(o["PrimaryEmailAddr"]), "Address") || undefined,
    phone: optStr(obj(o["PrimaryPhone"]), "FreeFormNumber") || undefined, currency: refId(o["CurrencyRef"]) || undefined,
    balance: scalarNum(o["Balance"]), active: o["Active"] !== false,
    createdAt: metaTime(o, "CreateTime"), updatedAt: metaTime(o, "LastUpdatedTime"),
  };
  return compact(c);
}
function linkedInvoice(o: Record<string, unknown>): string | undefined {
  for (const line of arr(o["Line"])) {
    for (const lt of arr(line["LinkedTxn"])) {
      if (optStr(lt, "TxnType") === "Invoice") { const id = scalarStr(lt["TxnId"]); if (id.length > 0) return id; }
    }
  }
  return undefined;
}
function normPayment(o: Record<string, unknown>): Record<string, unknown> {
  const p: FinancePayment = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), customerExternalId: refId(o["CustomerRef"]) || undefined,
    invoiceExternalId: linkedInvoice(o), amount: scalarNum(o["TotalAmt"]), currency: refId(o["CurrencyRef"]) || undefined,
    reference: optStr(o, "PaymentRefNum") || undefined, paidDate: optStr(o, "TxnDate") || undefined,
    createdAt: metaTime(o, "CreateTime"), updatedAt: metaTime(o, "LastUpdatedTime"),
  };
  return compact(p);
}
function normExpense(o: Record<string, unknown>): Record<string, unknown> {
  const e: FinanceExpense = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), vendorExternalId: refId(o["EntityRef"]) || undefined,
    accountExternalId: refId(o["AccountRef"]) || undefined, amount: scalarNum(o["TotalAmt"]), currency: refId(o["CurrencyRef"]) || undefined,
    paymentType: optStr(o, "PaymentType") || undefined, spentDate: optStr(o, "TxnDate") || undefined,
    createdAt: metaTime(o, "CreateTime"), updatedAt: metaTime(o, "LastUpdatedTime"),
  };
  return compact(e);
}
function normAccount(o: Record<string, unknown>): Record<string, unknown> {
  const a: FinanceAccount = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Name") || scalarStr(o["Id"]),
    code: optStr(o, "AcctNum") || undefined, type: optStr(o, "AccountType") || undefined, classification: optStr(o, "Classification") || undefined,
    currency: refId(o["CurrencyRef"]) || undefined, active: o["Active"] !== false,
  };
  return compact(a);
}
function normItem(o: Record<string, unknown>): Record<string, unknown> {
  const i: FinanceItem = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Name") || scalarStr(o["Id"]),
    code: optStr(o, "Sku") || undefined, type: optStr(o, "Type") || undefined, unitPrice: scalarNum(o["UnitPrice"]), active: o["Active"] !== false,
  };
  return compact(i);
}
function normTaxRate(o: Record<string, unknown>): Record<string, unknown> {
  const t: FinanceTax = {
    provider: "quickbooks", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Name") || scalarStr(o["Id"]),
    rate: scalarNum(o["RateValue"]), active: o["Active"] !== false,
  };
  return compact(t);
}

/* ---- operations ------------------------------------------------------------ */

function listQuery(entity: string, norm: (o: Record<string, unknown>) => Record<string, unknown>, orderBy?: string) {
  return async (call: FinanceCall, input: OpInput) => {
    const start = Number.parseInt(optStr(input, "cursor"), 10);
    const q = await runQuery(call, entity, { startPosition: Number.isFinite(start) && start > 0 ? start : 1, maxResults: optNum(input, "limit", 50), orderBy, orderDir: orderBy ? "DESC" : undefined });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(norm), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  };
}
function readEntity(pathSeg: string, envelope: string, norm: (o: Record<string, unknown>) => Record<string, unknown>) {
  return async (call: FinanceCall, input: OpInput) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/${pathSeg}/${encodeURIComponent(id.value)}`, query: { minorversion: MINOR_VERSION } });
    if (!r.ok) return r;
    return output({ record: norm(obj(r.value[envelope])) });
  };
}

const OPS: Record<string, (call: FinanceCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "finance.company.read": async (call, _input, conn) => {
    const realmId = realm(conn);
    const r = await call({ method: "GET", path: `/companyinfo/${encodeURIComponent(realmId)}`, query: { minorversion: MINOR_VERSION } });
    if (!r.ok) return r;
    const c = obj(r.value["CompanyInfo"]);
    return output({ id: scalarStr(c["Id"]) || realmId, displayName: optStr(c, "CompanyName") || realmId, legalName: optStr(c, "LegalName") || undefined, country: optStr(c, "Country") || undefined, currency: refId(c["CurrencyRef"]) || undefined, fiscalYearStartMonth: optStr(c, "FiscalYearStartMonth") || undefined, email: optStr(obj(c["Email"]), "Address") || undefined });
  },

  "finance.accounts.list": listQuery("Account", normAccount),

  "finance.customers.list": listQuery("Customer", normCustomer),
  "finance.customers.read": readEntity("customer", "Customer", normCustomer),
  "finance.customers.create": async (call, input) => {
    const name = reqStr(input, "displayName"); if (!name.ok) return name;
    const body = compact({ DisplayName: name.value, CompanyName: optStr(input, "companyName") || undefined, PrimaryEmailAddr: optStr(input, "email").length > 0 ? { Address: optStr(input, "email") } : undefined, PrimaryPhone: optStr(input, "phone").length > 0 ? { FreeFormNumber: optStr(input, "phone") } : undefined });
    const r = await call({ method: "POST", path: "/customer", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normCustomer(obj(r.value["Customer"])) });
  },

  "finance.invoices.list": listQuery("Invoice", normInvoice, "MetaData.LastUpdatedTime"),
  "finance.invoices.read": readEntity("invoice", "Invoice", normInvoice),
  "finance.invoices.create": async (call, input) => {
    const customerId = reqStr(input, "customerId"); if (!customerId.ok) return customerId;
    const amount = optNum(input, "amount", NaN);
    const itemId = optStr(input, "itemId");
    const line = { Amount: Number.isFinite(amount) ? amount : 0, DetailType: "SalesItemLineDetail", SalesItemLineDetail: compact({ ItemRef: itemId.length > 0 ? { value: itemId } : undefined }) };
    const body = compact({ CustomerRef: { value: customerId.value }, DocNumber: optStr(input, "number") || undefined, TxnDate: optStr(input, "issueDate") || undefined, DueDate: optStr(input, "dueDate") || undefined, Line: [line] });
    const r = await call({ method: "POST", path: "/invoice", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normInvoice(obj(r.value["Invoice"])) });
  },
  "finance.invoices.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const syncToken = reqStr(input, "syncToken"); if (!syncToken.ok) return syncToken;
    // QBO sparse update: Id + SyncToken + sparse:true carry the mutation.
    const body = compact({ Id: id.value, SyncToken: syncToken.value, sparse: true, DocNumber: optStr(input, "number") || undefined, DueDate: optStr(input, "dueDate") || undefined });
    const r = await call({ method: "POST", path: "/invoice", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normInvoice(obj(r.value["Invoice"])) });
  },

  "finance.payments.list": listQuery("Payment", normPayment, "MetaData.LastUpdatedTime"),
  "finance.payments.read": readEntity("payment", "Payment", normPayment),
  "finance.payments.create": async (call, input) => {
    const customerId = reqStr(input, "customerId"); if (!customerId.ok) return customerId;
    const amount = optNum(input, "amount", NaN);
    if (!Number.isFinite(amount)) return missing("amount");
    const invoiceId = optStr(input, "invoiceId");
    const body = compact({ CustomerRef: { value: customerId.value }, TotalAmt: amount, TxnDate: optStr(input, "paidDate") || undefined, PaymentRefNum: optStr(input, "reference") || undefined, Line: invoiceId.length > 0 ? [{ Amount: amount, LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }] }] : undefined });
    const r = await call({ method: "POST", path: "/payment", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normPayment(obj(r.value["Payment"])) });
  },
  "finance.payments.refund": async (call, input) => {
    const customerId = reqStr(input, "customerId"); if (!customerId.ok) return customerId;
    const amount = optNum(input, "amount", NaN);
    if (!Number.isFinite(amount)) return missing("amount");
    const body = compact({ CustomerRef: { value: customerId.value }, TxnDate: optStr(input, "refundDate") || undefined, Line: [{ Amount: amount, DetailType: "SalesItemLineDetail", SalesItemLineDetail: {} }] });
    const r = await call({ method: "POST", path: "/refundreceipt", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    const rr = obj(r.value["RefundReceipt"]);
    return output({ id: scalarStr(rr["Id"]), amount: scalarNum(rr["TotalAmt"]) ?? amount, refunded: true });
  },

  "finance.expenses.list": listQuery("Purchase", normExpense, "MetaData.LastUpdatedTime"),
  "finance.expenses.read": readEntity("purchase", "Purchase", normExpense),
  "finance.expenses.create": async (call, input) => {
    const accountId = reqStr(input, "accountId"); if (!accountId.ok) return accountId;
    const amount = optNum(input, "amount", NaN);
    if (!Number.isFinite(amount)) return missing("amount");
    const body = compact({ AccountRef: { value: accountId.value }, PaymentType: optStr(input, "paymentType", "Cash"), TxnDate: optStr(input, "spentDate") || undefined, EntityRef: optStr(input, "vendorId").length > 0 ? { value: optStr(input, "vendorId") } : undefined, Line: [{ Amount: amount, DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: { AccountRef: { value: accountId.value } } }] });
    const r = await call({ method: "POST", path: "/purchase", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normExpense(obj(r.value["Purchase"])) });
  },

  "finance.items.list": listQuery("Item", normItem),
  "finance.items.read": readEntity("item", "Item", normItem),
  "finance.items.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const body = compact({ Name: name.value, Type: optStr(input, "type", "Service"), Sku: optStr(input, "code") || undefined, UnitPrice: scalarNum(input["unitPrice"]), IncomeAccountRef: optStr(input, "incomeAccountId").length > 0 ? { value: optStr(input, "incomeAccountId") } : undefined });
    const r = await call({ method: "POST", path: "/item", query: { minorversion: MINOR_VERSION }, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normItem(obj(r.value["Item"])) });
  },

  "finance.taxes.list": listQuery("TaxRate", normTaxRate),

  "finance.health": async (call, _input, conn) => {
    const realmId = realm(conn);
    const r = await call({ method: "GET", path: `/companyinfo/${encodeURIComponent(realmId)}`, query: { minorversion: MINOR_VERSION } });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "quickbooks", companyExternalId: scalarStr(obj(r.value["CompanyInfo"])["Id"]) || realmId });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function firstEntity(rawBody: string): { name: string; id: string; operation: string } | null {
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const notes = arr(body["eventNotifications"]);
    for (const n of notes) {
      const entities = arr(obj(n["dataChangeEvent"])["entities"]);
      if (entities.length > 0) return { name: optStr(entities[0]!, "name"), id: scalarStr(entities[0]!["id"]), operation: optStr(entities[0]!, "operation") };
    }
  } catch { return null; }
  return null;
}

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyHmacSha256Base64(rawBody, signature, signingSecret);
  const first = firstEntity(rawBody);
  const externalId = first !== null && first.id.length > 0 ? `${first.name}-${first.id}-${first.operation}` : "unknown";
  return connectorOk({ valid, externalEventId: externalId });
}

/** Map a QuickBooks entity name + operation to a canonical finance event type. */
export function mapQuickbooksEntity(name: string, operation: string): FinanceEventType {
  const op = operation.toLowerCase();
  if (name === "Invoice") {
    if (op === "create") return FINANCE_EVENTS.invoiceCreated;
    if (op === "void" || op === "delete") return FINANCE_EVENTS.invoiceVoided;
    return FINANCE_EVENTS.invoiceUpdated;
  }
  if (name === "Payment") return op === "create" ? FINANCE_EVENTS.paymentCreated : FINANCE_EVENTS.paymentUpdated;
  if (name === "Customer") return op === "create" ? FINANCE_EVENTS.customerCreated : FINANCE_EVENTS.customerUpdated;
  if (name === "Purchase") return FINANCE_EVENTS.expenseCreated;
  if (name === "Item") return FINANCE_EVENTS.itemUpdated;
  return FINANCE_EVENTS.eventReceived;
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const events: CanonicalConnectorEvent[] = [];
  for (const n of arr(body["eventNotifications"])) {
    for (const e of arr(obj(n["dataChangeEvent"])["entities"])) {
      const name = optStr(e, "name"); const id = scalarStr(e["id"]); const operation = optStr(e, "operation");
      if (id.length === 0 || name.length === 0) continue;
      const ev: NormalizedFinanceEvent = {
        type: mapQuickbooksEntity(name, operation), externalId: id,
        occurredAt: optStr(e, "lastUpdated") || now(), payload: { entity: name, operation },
      };
      events.push(financeEvent(ev, PROVENANCE));
    }
  }
  return connectorOk(events);
}

/** Poll recently-modified invoices → canonical invoice events. Cursor = next start position. */
async function poll(call: FinanceCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const start = cursor === null ? 1 : Number.parseInt(cursor, 10) || 1;
  const q = await runQuery(call, "Invoice", { startPosition: start, maxResults: limit, orderBy: "MetaData.LastUpdatedTime", orderDir: "DESC" });
  if (!q.ok) return q;
  const events: CanonicalConnectorEvent[] = q.value.records.map((o) => {
    const type = invoiceStatus(o) === "paid" ? FINANCE_EVENTS.invoicePaid : FINANCE_EVENTS.invoiceUpdated;
    return financeEvent({ type, externalId: scalarStr(o["Id"]), occurredAt: metaTime(o, "LastUpdatedTime") || now(), payload: { balance: scalarNum(o["Balance"]) ?? null } }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const nextCursor = q.value.nextCursor ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const QUICKBOOKS_BINDING: FinanceProviderBinding = {
  connectorId: "quickbooks",
  oauth: {
    authorizeEndpoint: "https://appcenter.intuit.com/connect/oauth2",
    tokenEndpoint: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    tokenAuthStyle: "basic",
  },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/query?query=SELECT%20*%20FROM%20CompanyInfo",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};

// Re-export the allowlist surface for tests + the marketplace's safe-query story.
export { buildQboQuery, QUICKBOOKS_ENTITIES } from "./quickbooks-query.js";
