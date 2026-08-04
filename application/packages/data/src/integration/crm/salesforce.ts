/* =============================================================================
 * Salesforce provider binding (F4.5). OAuth 2.0 (Bearer) auth against the org's
 * instance URL (My Domain), carried as install config. Maps the NORMALIZED crm.*
 * operations onto the Salesforce REST + Query API. EVERY read goes through the
 * allowlisted `buildSoql` — no raw SOQL is ever accepted from a user or the Copilot,
 * and no object outside the allowlist is reachable. Provider-neutral in/out; no
 * Salesforce shape or secret leaks past this boundary. Salesforce is polling-only
 * (no first-class body-signed webhook).
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult,
} from "@brightloop/domain";
import type { AuthContext, CrmCall, CrmProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, optNum, optStr, output, reqStr, scalarStr, type OpInput } from "./helpers.js";
import { compact, pagination, type CRMContact, type CRMCompany, type CRMDeal } from "./contracts.js";
import { CRM_EVENTS, crmEvent } from "./normalize.js";
import { buildSoql, type SoqlSpec } from "./salesforce-soql.js";

const LOGIN = "https://login.salesforce.com";
const POLL_PROVENANCE = "salesforce:poll";

function apiBase(config: OpInput): string {
  const instance = optStr(config, "instanceUrl").replace(/\/+$/, "");
  const version = optStr(config, "apiVersion", "v59.0");
  return `${instance}/services/data/${version}`;
}

/** Salesforce authorizes with the resolved OAuth token + the configured instance URL. */
function authorize(secret: string | null, config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  const instance = optStr(config, "instanceUrl");
  if (instance.length === 0 || !/^https?:\/\//i.test(instance)) return connectorErr("config_invalid", "instanceUrl is not configured", "no_instance_url");
  return connectorOk({ baseUrl: apiBase(config), headers: { authorization: `Bearer ${secret}` } });
}

/** Run an allowlisted SOQL query, or fail if the spec references anything unlisted. */
async function runQuery(call: CrmCall, spec: SoqlSpec): Promise<ConnectorResult<{ records: Record<string, unknown>[]; nextCursor: string | null }>> {
  const soql = buildSoql(spec);
  if (!soql.ok) return soql;
  const r = await call({ method: "GET", path: "/query", query: { q: soql.value } });
  if (!r.ok) return r;
  const next = optStr(r.value, "nextRecordsUrl");
  return connectorOk({ records: arr(r.value["records"]), nextCursor: next.length > 0 ? next : null });
}

/* ---- normalizers (Salesforce sObject → neutral contract) ------------------- */

function normContact(o: Record<string, unknown>): Record<string, unknown> {
  const first = optStr(o, "FirstName"); const last = optStr(o, "LastName"); const email = optStr(o, "Email");
  const c: CRMContact = {
    provider: "salesforce", externalId: scalarStr(o["Id"]),
    displayName: `${first} ${last}`.trim() || optStr(o, "Name") || email || scalarStr(o["Id"]),
    firstName: first || undefined, lastName: last || undefined, email: email || undefined, phone: optStr(o, "Phone") || undefined,
    companyExternalId: optStr(o, "AccountId") || undefined, ownerExternalId: optStr(o, "OwnerId") || undefined,
    createdAt: optStr(o, "CreatedDate") || undefined, updatedAt: optStr(o, "LastModifiedDate") || undefined, archived: false,
  };
  return compact(c);
}
function normAccount(o: Record<string, unknown>): Record<string, unknown> {
  const c: CRMCompany = {
    provider: "salesforce", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Name") || scalarStr(o["Id"]),
    name: optStr(o, "Name") || undefined, domain: optStr(o, "Website") || undefined, industry: optStr(o, "Industry") || undefined,
    ownerExternalId: optStr(o, "OwnerId") || undefined,
    createdAt: optStr(o, "CreatedDate") || undefined, updatedAt: optStr(o, "LastModifiedDate") || undefined, archived: false,
  };
  return compact(c);
}
function normOpportunity(o: Record<string, unknown>): Record<string, unknown> {
  const amount = o["Amount"];
  const status: CRMDeal["status"] = o["IsWon"] === true ? "won" : o["IsClosed"] === true ? "lost" : "open";
  const d: CRMDeal = {
    provider: "salesforce", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Name") || scalarStr(o["Id"]),
    amount: typeof amount === "number" && Number.isFinite(amount) ? amount : undefined,
    stageName: optStr(o, "StageName") || undefined, status, closeDate: optStr(o, "CloseDate") || undefined,
    companyExternalId: optStr(o, "AccountId") || undefined, ownerExternalId: optStr(o, "OwnerId") || undefined,
    createdAt: optStr(o, "CreatedDate") || undefined, updatedAt: optStr(o, "LastModifiedDate") || undefined, archived: false,
  };
  return compact(d);
}
function normLead(o: Record<string, unknown>): Record<string, unknown> {
  return compact({ provider: "salesforce", externalId: scalarStr(o["Id"]), displayName: `${optStr(o, "FirstName")} ${optStr(o, "LastName")}`.trim() || optStr(o, "Name") || optStr(o, "Email"), email: optStr(o, "Email") || undefined, company: optStr(o, "Company") || undefined, status: optStr(o, "Status") || undefined, ownerExternalId: optStr(o, "OwnerId") || undefined });
}

/* ---- operations ------------------------------------------------------------ */

const OPS: Record<string, (call: CrmCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "crm.account.read": async (call) => {
    const q = await runQuery(call, { object: "Organization", limit: 1 });
    if (!q.ok) return q;
    const o = q.value.records[0] ?? {};
    return output({ id: scalarStr(o["Id"]), name: optStr(o, "Name") });
  },

  "crm.contacts.list": async (call, input) => {
    const q = await runQuery(call, { object: "Contact", orderBy: "LastModifiedDate", orderDir: "DESC", limit: optNum(input, "limit", 50) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normContact), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.contacts.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const q = await runQuery(call, { object: "Contact", whereEquals: { Id: id.value }, limit: 1 });
    if (!q.ok) return q;
    if (q.value.records.length === 0) return connectorErr("validation", "contact not found", "not_found");
    return output({ record: normContact(q.value.records[0]!) });
  },
  "crm.contacts.search": async (call, input) => {
    const term = reqStr(input, "query"); if (!term.ok) return term;
    const q = await runQuery(call, { object: "Contact", whereLike: { fields: ["Name", "Email"], term: term.value }, limit: optNum(input, "limit", 20) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normContact), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.contacts.create": async (call, input) => {
    const last = reqStr(input, "lastName"); if (!last.ok) return last;
    const body = compact({ LastName: last.value, FirstName: optStr(input, "firstName") || undefined, Email: optStr(input, "email") || undefined, Phone: optStr(input, "phone") || undefined });
    const r = await call({ method: "POST", path: "/sobjects/Contact", jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), success: r.value["success"] === true });
  },
  "crm.contacts.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const body = compact({ FirstName: optStr(input, "firstName") || undefined, LastName: optStr(input, "lastName") || undefined, Email: optStr(input, "email") || undefined, Phone: optStr(input, "phone") || undefined });
    const r = await call({ method: "PATCH", path: `/sobjects/Contact/${encodeURIComponent(id.value)}`, jsonBody: body });
    if (!r.ok) return r;
    return output({ id: id.value, updated: true });
  },

  "crm.companies.list": async (call, input) => {
    const q = await runQuery(call, { object: "Account", orderBy: "LastModifiedDate", orderDir: "DESC", limit: optNum(input, "limit", 50) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normAccount), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.companies.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const q = await runQuery(call, { object: "Account", whereEquals: { Id: id.value }, limit: 1 });
    if (!q.ok) return q;
    if (q.value.records.length === 0) return connectorErr("validation", "account not found", "not_found");
    return output({ record: normAccount(q.value.records[0]!) });
  },
  "crm.companies.search": async (call, input) => {
    const term = reqStr(input, "query"); if (!term.ok) return term;
    const q = await runQuery(call, { object: "Account", whereLike: { fields: ["Name"], term: term.value }, limit: optNum(input, "limit", 20) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normAccount), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.companies.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const r = await call({ method: "POST", path: "/sobjects/Account", jsonBody: compact({ Name: name.value, Website: optStr(input, "domain") || undefined, Industry: optStr(input, "industry") || undefined }) });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), success: r.value["success"] === true });
  },
  "crm.companies.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "PATCH", path: `/sobjects/Account/${encodeURIComponent(id.value)}`, jsonBody: compact({ Name: optStr(input, "name") || undefined, Website: optStr(input, "domain") || undefined, Industry: optStr(input, "industry") || undefined }) });
    if (!r.ok) return r;
    return output({ id: id.value, updated: true });
  },

  "crm.leads.list": async (call, input) => {
    const q = await runQuery(call, { object: "Lead", orderBy: "LastModifiedDate", orderDir: "DESC", limit: optNum(input, "limit", 50) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normLead), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.leads.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const q = await runQuery(call, { object: "Lead", whereEquals: { Id: id.value }, limit: 1 });
    if (!q.ok) return q;
    if (q.value.records.length === 0) return connectorErr("validation", "lead not found", "not_found");
    return output({ record: normLead(q.value.records[0]!) });
  },

  "crm.deals.list": async (call, input) => {
    const q = await runQuery(call, { object: "Opportunity", orderBy: "LastModifiedDate", orderDir: "DESC", limit: optNum(input, "limit", 50) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normOpportunity), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.deals.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const q = await runQuery(call, { object: "Opportunity", whereEquals: { Id: id.value }, limit: 1 });
    if (!q.ok) return q;
    if (q.value.records.length === 0) return connectorErr("validation", "opportunity not found", "not_found");
    return output({ record: normOpportunity(q.value.records[0]!) });
  },
  "crm.deals.search": async (call, input) => {
    const term = reqStr(input, "query"); if (!term.ok) return term;
    const q = await runQuery(call, { object: "Opportunity", whereLike: { fields: ["Name"], term: term.value }, limit: optNum(input, "limit", 20) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map(normOpportunity), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.deals.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const stage = reqStr(input, "stageName"); if (!stage.ok) return stage;
    const close = reqStr(input, "closeDate"); if (!close.ok) return close;
    const amount = optNum(input, "amount", NaN);
    const body = compact({ Name: name.value, StageName: stage.value, CloseDate: close.value, Amount: Number.isFinite(amount) ? amount : undefined, AccountId: optStr(input, "companyId") || undefined });
    const r = await call({ method: "POST", path: "/sobjects/Opportunity", jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), success: r.value["success"] === true });
  },
  "crm.deals.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const amount = optNum(input, "amount", NaN);
    const r = await call({ method: "PATCH", path: `/sobjects/Opportunity/${encodeURIComponent(id.value)}`, jsonBody: compact({ Name: optStr(input, "name") || undefined, Amount: Number.isFinite(amount) ? amount : undefined, CloseDate: optStr(input, "closeDate") || undefined }) });
    if (!r.ok) return r;
    return output({ id: id.value, updated: true });
  },
  "crm.deals.stage.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const stage = reqStr(input, "stageName"); if (!stage.ok) return stage;
    const r = await call({ method: "PATCH", path: `/sobjects/Opportunity/${encodeURIComponent(id.value)}`, jsonBody: { StageName: stage.value } });
    if (!r.ok) return r;
    return output({ id: id.value, stageName: stage.value, updated: true });
  },

  "crm.pipelines.list": async () => {
    // Salesforce has no Pipeline object; opportunity stages form one global pipeline.
    return output({ pipelines: [{ provider: "salesforce", externalId: "default", displayName: "Opportunity Pipeline" }] });
  },
  "crm.pipeline.stages.list": async (call) => {
    const q = await runQuery(call, { object: "OpportunityStage", orderBy: "SortOrder", orderDir: "ASC", limit: 200 });
    if (!q.ok) return q;
    return output({ stages: q.value.records.map((s) => compact({ provider: "salesforce", externalId: optStr(s, "MasterLabel"), displayName: optStr(s, "MasterLabel"), pipelineExternalId: "default", order: optNum(s, "SortOrder", 0), probability: optNum(s, "DefaultProbability", 0), isWon: s["IsWon"] === true, isClosed: s["IsClosed"] === true })) });
  },
  "crm.activities.list": async (call, input) => {
    const q = await runQuery(call, { object: "Task", orderBy: "CreatedDate", orderDir: "DESC", limit: optNum(input, "limit", 50) });
    if (!q.ok) return q;
    return output({ results: q.value.records.map((o) => compact({ provider: "salesforce", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Subject") || scalarStr(o["Id"]), type: "task", done: optStr(o, "Status") === "Completed", dueDate: optStr(o, "ActivityDate") || undefined, ownerExternalId: optStr(o, "OwnerId") || undefined, createdAt: optStr(o, "CreatedDate") || undefined })), pagination: pagination(q.value.nextCursor, q.value.nextCursor !== null) });
  },
  "crm.activity.create": async (call, input) => {
    const subject = reqStr(input, "subject"); if (!subject.ok) return subject;
    const r = await call({ method: "POST", path: "/sobjects/Task", jsonBody: compact({ Subject: subject.value, Status: optStr(input, "status") || "Not Started", ActivityDate: optStr(input, "dueDate") || undefined, WhoId: optStr(input, "contactId") || undefined, WhatId: optStr(input, "dealId") || undefined }) });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), success: r.value["success"] === true });
  },
  "crm.notes.create": async (call, input) => {
    const parentId = reqStr(input, "parentId"); if (!parentId.ok) return parentId;
    const body = reqStr(input, "body"); if (!body.ok) return body;
    const r = await call({ method: "POST", path: "/sobjects/Note", jsonBody: { Title: optStr(input, "title", "Note"), Body: body.value, ParentId: parentId.value } });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), success: r.value["success"] === true });
  },
  "crm.owners.list": async (call, input) => {
    const q = await runQuery(call, { object: "User", whereEquals: { IsActive: true }, limit: optNum(input, "limit", 100) });
    if (!q.ok) return q;
    return output({ owners: q.value.records.map((o) => compact({ provider: "salesforce", externalId: scalarStr(o["Id"]), displayName: optStr(o, "Name") || optStr(o, "Email"), email: optStr(o, "Email") || undefined, active: o["IsActive"] === true })) });
  },
  "crm.health": async (call) => {
    const q = await runQuery(call, { object: "Organization", limit: 1 });
    if (!q.ok) return q;
    return output({ healthy: true, provider: "salesforce", orgId: scalarStr((q.value.records[0] ?? {})["Id"]) });
  },
};

/** Poll recently-modified opportunities → canonical deal events. Cursor = newest id. */
async function poll(call: CrmCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const q = await runQuery(call, { object: "Opportunity", orderBy: "LastModifiedDate", orderDir: "DESC", limit });
  if (!q.ok) return q;
  const events: CanonicalConnectorEvent[] = q.value.records.map((o) => {
    const type = o["IsWon"] === true ? CRM_EVENTS.dealWon : o["IsClosed"] === true ? CRM_EVENTS.dealLost : CRM_EVENTS.dealUpdated;
    return crmEvent({ type, externalId: scalarStr(o["Id"]), occurredAt: optStr(o, "LastModifiedDate") || now(), payload: { stageName: optStr(o, "StageName") } }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const SALESFORCE_BINDING: CrmProviderBinding = {
  connectorId: "salesforce",
  oauth: { authorizeEndpoint: `${LOGIN}/services/oauth2/authorize`, tokenEndpoint: `${LOGIN}/services/oauth2/token` },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/query?q=SELECT+Id+FROM+Organization+LIMIT+1",
  ops: OPS,
  poll,
};

// Re-export the allowlist surface for tests + the marketplace's safe-query story.
export { buildSoql, SALESFORCE_SCHEMA } from "./salesforce-soql.js";
