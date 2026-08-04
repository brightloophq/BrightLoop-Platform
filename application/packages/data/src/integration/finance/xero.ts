/* =============================================================================
 * Xero provider binding (F4.6). OAuth 2.0 (Bearer) auth against the Xero Accounting
 * API. Xero is multi-tenant: the selected `tenantId` is carried as install config and
 * attached as the `Xero-Tenant-Id` header on every call (mirrors the Salesforce
 * instance-URL-as-config pattern). Lists use Xero's page-based REST endpoints with a
 * fixed, safe `order` — no query language is ever accepted. Webhooks are verified by the
 * `x-xero-signature` HMAC-SHA256 (base64) scheme and translated from `events[]`
 * (eventCategory + eventType) into canonical finance.* events. Provider-neutral in/out;
 * no Xero shape or secret leaks past this boundary. Xero refunds are modelled through
 * credit notes / overpayments (a distinct object), so `finance.payments.refund` is not
 * exposed here — a documented normalized-subset asymmetry.
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
import { verifyHmacSha256Base64 } from "./webhook.js";

const API = "https://api.xero.com/api.xro/2.0";
const PAGE_SIZE = 100;
const PROVENANCE = "xero:webhook";
const POLL_PROVENANCE = "xero:poll";

/** Xero authorizes with the resolved OAuth token + the configured tenant id. */
function authorize(secret: string | null, config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  const tenantId = optStr(config, "tenantId");
  if (tenantId.length === 0) return connectorErr("config_invalid", "tenantId is not configured", "no_tenant_id");
  return connectorOk({ baseUrl: API, headers: { authorization: `Bearer ${secret}`, "xero-tenant-id": tenantId } });
}

/* ---- shape helpers --------------------------------------------------------- */

function firstOf(body: Record<string, unknown>, envelope: string): Record<string, unknown> {
  const list = arr(body[envelope]);
  return list.length > 0 ? list[0]! : {};
}
function nextPage(input: OpInput): number {
  const p = Number.parseInt(optStr(input, "cursor"), 10);
  return Number.isFinite(p) && p > 0 ? p : 1;
}
function pageCursor(count: number, page: number): string | null {
  return count >= PAGE_SIZE ? String(page + 1) : null;
}

/* ---- normalizers (Xero object → neutral contract) -------------------------- */

function invoiceStatus(status: string): FinanceInvoice["status"] {
  const s = status.toUpperCase();
  if (s === "PAID") return "paid";
  if (s === "VOIDED" || s === "DELETED") return "void";
  if (s === "AUTHORISED") return "open";
  return "draft";
}
function normInvoice(o: Record<string, unknown>): Record<string, unknown> {
  const inv: FinanceInvoice = {
    provider: "xero", externalId: scalarStr(o["InvoiceID"]), number: optStr(o, "InvoiceNumber") || undefined,
    customerExternalId: scalarStr(obj(o["Contact"])["ContactID"]) || undefined, status: invoiceStatus(optStr(o, "Status")),
    currency: optStr(o, "CurrencyCode") || undefined, total: scalarNum(o["Total"]), balance: scalarNum(o["AmountDue"]),
    issueDate: optStr(o, "Date") || undefined, dueDate: optStr(o, "DueDate") || undefined, updatedAt: optStr(o, "UpdatedDateUTC") || undefined,
  };
  return compact(inv);
}
function normContact(o: Record<string, unknown>): Record<string, unknown> {
  const phones = arr(o["Phones"]);
  const c: FinanceCustomer = {
    provider: "xero", externalId: scalarStr(o["ContactID"]), displayName: optStr(o, "Name") || scalarStr(o["ContactID"]),
    companyName: optStr(o, "Name") || undefined, email: optStr(o, "EmailAddress") || undefined,
    phone: phones.length > 0 ? optStr(phones[0]!, "PhoneNumber") || undefined : undefined,
    currency: optStr(o, "DefaultCurrency") || undefined, active: optStr(o, "ContactStatus", "ACTIVE") !== "ARCHIVED",
    updatedAt: optStr(o, "UpdatedDateUTC") || undefined,
  };
  return compact(c);
}
function normPayment(o: Record<string, unknown>): Record<string, unknown> {
  const invoice = obj(o["Invoice"]);
  const p: FinancePayment = {
    provider: "xero", externalId: scalarStr(o["PaymentID"]),
    customerExternalId: scalarStr(obj(invoice["Contact"])["ContactID"]) || undefined,
    invoiceExternalId: scalarStr(invoice["InvoiceID"]) || undefined, amount: scalarNum(o["Amount"]),
    reference: optStr(o, "Reference") || undefined, paidDate: optStr(o, "Date") || undefined, updatedAt: optStr(o, "UpdatedDateUTC") || undefined,
  };
  return compact(p);
}
function normBankTxn(o: Record<string, unknown>): Record<string, unknown> {
  const e: FinanceExpense = {
    provider: "xero", externalId: scalarStr(o["BankTransactionID"]), vendorExternalId: scalarStr(obj(o["Contact"])["ContactID"]) || undefined,
    accountExternalId: scalarStr(obj(o["BankAccount"])["AccountID"]) || undefined, amount: scalarNum(o["Total"]),
    currency: optStr(o, "CurrencyCode") || undefined, paymentType: optStr(o, "Type") || undefined,
    reference: optStr(o, "Reference") || undefined, spentDate: optStr(o, "Date") || undefined, updatedAt: optStr(o, "UpdatedDateUTC") || undefined,
  };
  return compact(e);
}
function normAccount(o: Record<string, unknown>): Record<string, unknown> {
  const a: FinanceAccount = {
    provider: "xero", externalId: scalarStr(o["AccountID"]), displayName: optStr(o, "Name") || scalarStr(o["AccountID"]),
    code: optStr(o, "Code") || undefined, type: optStr(o, "Type") || undefined, classification: optStr(o, "Class") || undefined,
    currency: optStr(o, "CurrencyCode") || undefined, active: optStr(o, "Status", "ACTIVE") === "ACTIVE",
  };
  return compact(a);
}
function normItem(o: Record<string, unknown>): Record<string, unknown> {
  const i: FinanceItem = {
    provider: "xero", externalId: scalarStr(o["ItemID"]), displayName: optStr(o, "Name") || optStr(o, "Code") || scalarStr(o["ItemID"]),
    code: optStr(o, "Code") || undefined, unitPrice: scalarNum(obj(o["SalesDetails"])["UnitPrice"]), active: o["IsSold"] !== false,
  };
  return compact(i);
}
function normTaxRate(o: Record<string, unknown>): Record<string, unknown> {
  const t: FinanceTax = {
    provider: "xero", externalId: optStr(o, "TaxType") || optStr(o, "Name"), displayName: optStr(o, "Name") || optStr(o, "TaxType"),
    rate: scalarNum(o["EffectiveRate"]) ?? scalarNum(o["DisplayTaxRate"]), active: optStr(o, "Status", "ACTIVE") === "ACTIVE",
  };
  return compact(t);
}

/* ---- operations ------------------------------------------------------------ */

function listOp(envelope: string, norm: (o: Record<string, unknown>) => Record<string, unknown>, paged = true) {
  return async (call: FinanceCall, input: OpInput) => {
    const page = nextPage(input);
    const query = paged ? { page, order: "UpdatedDateUTC DESC" } : {};
    const r = await call({ method: "GET", path: `/${envelope}`, query });
    if (!r.ok) return r;
    const records = arr(r.value[envelope]);
    const cursor = paged ? pageCursor(records.length, page) : null;
    return output({ results: records.map(norm), pagination: pagination(cursor, cursor !== null) });
  };
}
function readOp(envelope: string, norm: (o: Record<string, unknown>) => Record<string, unknown>) {
  return async (call: FinanceCall, input: OpInput) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/${envelope}/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ record: norm(firstOf(r.value, envelope)) });
  };
}

const OPS: Record<string, (call: FinanceCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "finance.company.read": async (call) => {
    const r = await call({ method: "GET", path: "/Organisation" });
    if (!r.ok) return r;
    const o = firstOf(r.value, "Organisations");
    return output({ id: scalarStr(o["OrganisationID"]), displayName: optStr(o, "Name") || scalarStr(o["OrganisationID"]), legalName: optStr(o, "LegalName") || undefined, country: optStr(o, "CountryCode") || undefined, currency: optStr(o, "BaseCurrency") || undefined, fiscalYearStartMonth: optStr(o, "FinancialYearEndMonth") || undefined });
  },

  "finance.accounts.list": listOp("Accounts", normAccount, false),

  "finance.customers.list": listOp("Contacts", normContact),
  "finance.customers.read": readOp("Contacts", normContact),
  "finance.customers.create": async (call, input) => {
    const name = reqStr(input, "displayName"); if (!name.ok) return name;
    const contact = compact({ Name: name.value, EmailAddress: optStr(input, "email") || undefined, Phones: optStr(input, "phone").length > 0 ? [{ PhoneType: "DEFAULT", PhoneNumber: optStr(input, "phone") }] : undefined });
    const r = await call({ method: "POST", path: "/Contacts", jsonBody: { Contacts: [contact] } });
    if (!r.ok) return r;
    return output({ record: normContact(firstOf(r.value, "Contacts")) });
  },

  "finance.invoices.list": listOp("Invoices", normInvoice),
  "finance.invoices.read": readOp("Invoices", normInvoice),
  "finance.invoices.create": async (call, input) => {
    const customerId = reqStr(input, "customerId"); if (!customerId.ok) return customerId;
    const amount = optNum(input, "amount", NaN);
    const line = compact({ Description: optStr(input, "description", "Services"), Quantity: 1, UnitAmount: Number.isFinite(amount) ? amount : 0, AccountCode: optStr(input, "accountCode") || undefined });
    const invoice = compact({ Type: optStr(input, "type", "ACCREC"), Contact: { ContactID: customerId.value }, LineItems: [line], Date: optStr(input, "issueDate") || undefined, DueDate: optStr(input, "dueDate") || undefined, InvoiceNumber: optStr(input, "number") || undefined, Status: optStr(input, "status", "DRAFT") });
    const r = await call({ method: "POST", path: "/Invoices", jsonBody: { Invoices: [invoice] } });
    if (!r.ok) return r;
    return output({ record: normInvoice(firstOf(r.value, "Invoices")) });
  },
  "finance.invoices.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const invoice = compact({ InvoiceID: id.value, DueDate: optStr(input, "dueDate") || undefined, Reference: optStr(input, "reference") || undefined, Status: optStr(input, "status") || undefined });
    const r = await call({ method: "POST", path: `/Invoices/${encodeURIComponent(id.value)}`, jsonBody: { Invoices: [invoice] } });
    if (!r.ok) return r;
    return output({ record: normInvoice(firstOf(r.value, "Invoices")) });
  },

  "finance.payments.list": listOp("Payments", normPayment),
  "finance.payments.read": readOp("Payments", normPayment),
  "finance.payments.create": async (call, input) => {
    const invoiceId = reqStr(input, "invoiceId"); if (!invoiceId.ok) return invoiceId;
    const accountId = reqStr(input, "accountId"); if (!accountId.ok) return accountId;
    const amount = optNum(input, "amount", NaN);
    if (!Number.isFinite(amount)) return missing("amount");
    const payment = compact({ Invoice: { InvoiceID: invoiceId.value }, Account: { AccountID: accountId.value }, Amount: amount, Date: optStr(input, "paidDate") || undefined, Reference: optStr(input, "reference") || undefined });
    const r = await call({ method: "PUT", path: "/Payments", jsonBody: { Payments: [payment] } });
    if (!r.ok) return r;
    return output({ record: normPayment(firstOf(r.value, "Payments")) });
  },

  "finance.expenses.list": async (call, input) => {
    const page = nextPage(input);
    const r = await call({ method: "GET", path: "/BankTransactions", query: { page, where: 'Type=="SPEND"', order: "UpdatedDateUTC DESC" } });
    if (!r.ok) return r;
    const records = arr(r.value["BankTransactions"]);
    const cursor = pageCursor(records.length, page);
    return output({ results: records.map(normBankTxn), pagination: pagination(cursor, cursor !== null) });
  },
  "finance.expenses.read": readOp("BankTransactions", normBankTxn),
  "finance.expenses.create": async (call, input) => {
    const accountId = reqStr(input, "accountId"); if (!accountId.ok) return accountId;
    const amount = optNum(input, "amount", NaN);
    if (!Number.isFinite(amount)) return missing("amount");
    const line = compact({ Description: optStr(input, "description", "Expense"), Quantity: 1, UnitAmount: amount, AccountCode: optStr(input, "accountCode") || undefined });
    const txn = compact({ Type: "SPEND", Contact: optStr(input, "vendorId").length > 0 ? { ContactID: optStr(input, "vendorId") } : { Name: optStr(input, "vendorName", "Expense") }, BankAccount: { AccountID: accountId.value }, LineItems: [line], Date: optStr(input, "spentDate") || undefined, Reference: optStr(input, "reference") || undefined });
    const r = await call({ method: "POST", path: "/BankTransactions", jsonBody: { BankTransactions: [txn] } });
    if (!r.ok) return r;
    return output({ record: normBankTxn(firstOf(r.value, "BankTransactions")) });
  },

  "finance.items.list": listOp("Items", normItem, false),
  "finance.items.read": readOp("Items", normItem),
  "finance.items.create": async (call, input) => {
    const code = reqStr(input, "code"); if (!code.ok) return code;
    const item = compact({ Code: code.value, Name: optStr(input, "name") || undefined, SalesDetails: scalarNum(input["unitPrice"]) !== undefined ? { UnitPrice: scalarNum(input["unitPrice"]) } : undefined });
    const r = await call({ method: "POST", path: "/Items", jsonBody: { Items: [item] } });
    if (!r.ok) return r;
    return output({ record: normItem(firstOf(r.value, "Items")) });
  },

  "finance.taxes.list": listOp("TaxRates", normTaxRate, false),

  "finance.health": async (call) => {
    const r = await call({ method: "GET", path: "/Organisation" });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "xero", companyExternalId: scalarStr(firstOf(r.value, "Organisations")["OrganisationID"]) });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyHmacSha256Base64(rawBody, signature, signingSecret);
  let externalId = "";
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const events = arr(body["events"]);
    const seq = scalarStr(body["lastEventSequence"]);
    if (events.length > 0) externalId = `${optStr(events[0]!, "eventCategory")}-${scalarStr(events[0]!["resourceId"])}-${seq}`;
  } catch { externalId = ""; }
  return connectorOk({ valid, externalEventId: externalId.length > 2 ? externalId : "unknown" });
}

/** Map a Xero eventCategory + eventType to a canonical finance event type. */
export function mapXeroEvent(category: string, type: string): FinanceEventType {
  const cat = category.toUpperCase(); const t = type.toUpperCase();
  if (cat === "INVOICE") return t === "CREATE" ? FINANCE_EVENTS.invoiceCreated : FINANCE_EVENTS.invoiceUpdated;
  if (cat === "CONTACT") return t === "CREATE" ? FINANCE_EVENTS.customerCreated : FINANCE_EVENTS.customerUpdated;
  return FINANCE_EVENTS.eventReceived;
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const events: CanonicalConnectorEvent[] = [];
  for (const e of arr(body["events"])) {
    const resourceId = scalarStr(e["resourceId"]);
    const category = optStr(e, "eventCategory"); const type = optStr(e, "eventType");
    if (resourceId.length === 0 || category.length === 0) continue;
    const ev: NormalizedFinanceEvent = {
      type: mapXeroEvent(category, type), externalId: resourceId,
      occurredAt: optStr(e, "eventDateUtc") || now(), payload: { category, type },
    };
    events.push(financeEvent(ev, PROVENANCE));
  }
  return connectorOk(events);
}

/** Poll recently-updated invoices → canonical invoice events. Cursor = next page. */
async function poll(call: FinanceCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const page = cursor === null ? 1 : Number.parseInt(cursor, 10) || 1;
  const r = await call({ method: "GET", path: "/Invoices", query: { page, order: "UpdatedDateUTC DESC" } });
  if (!r.ok) return r;
  const records = arr(r.value["Invoices"]).slice(0, Math.max(1, limit));
  const events: CanonicalConnectorEvent[] = records.map((o) => {
    const type = invoiceStatus(optStr(o, "Status")) === "paid" ? FINANCE_EVENTS.invoicePaid : FINANCE_EVENTS.invoiceUpdated;
    return financeEvent({ type, externalId: scalarStr(o["InvoiceID"]), occurredAt: optStr(o, "UpdatedDateUTC") || now(), payload: { status: optStr(o, "Status") } }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const nextCursor = pageCursor(arr(r.value["Invoices"]).length, page) ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const XERO_BINDING: FinanceProviderBinding = {
  connectorId: "xero",
  oauth: {
    authorizeEndpoint: "https://login.xero.com/identity/connect/authorize",
    tokenEndpoint: "https://identity.xero.com/connect/token",
    tokenAuthStyle: "basic",
  },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/Organisation",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};
