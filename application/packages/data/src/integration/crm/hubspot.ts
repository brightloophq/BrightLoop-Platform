/* =============================================================================
 * HubSpot provider binding (F4.5). OAuth 2.0 (Bearer) auth against api.hubapi.com.
 * Maps the NORMALIZED crm.* operations onto the HubSpot CRM v3 API. Search is built
 * from a safe free-text `query` (never a raw HubSpot filter). Webhooks are verified
 * by the HubSpot v1 body signature and translated from `subscriptionType` into
 * canonical crm.* events. Provider-neutral in/out; no HubSpot shape or secret leaks
 * past this boundary. Only common fields are mapped; extra safe fields survive only
 * inside a bounded `metadata` object.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult, type VerifiedWebhook,
} from "@brightloop/domain";
import type { AuthContext, CrmCall, CrmProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, scalarStr, type OpInput } from "./helpers.js";
import { compact, pagination, type CRMContact, type CRMCompany, type CRMDeal } from "./contracts.js";
import { CRM_EVENTS, crmEvent, type CrmEventType, type NormalizedCrmEvent } from "./normalize.js";
import { verifyHubspotV1 } from "./webhook.js";

const API = "https://api.hubapi.com";
const PROVENANCE = "hubspot:webhook";
const POLL_PROVENANCE = "hubspot:poll";

const CONTACT_PROPS = ["firstname", "lastname", "email", "phone", "company", "hubspot_owner_id"];
const COMPANY_PROPS = ["name", "domain", "industry", "hubspot_owner_id"];
const DEAL_PROPS = ["dealname", "amount", "dealstage", "pipeline", "closedate", "hubspot_owner_id"];

/** HubSpot authorizes with the resolved OAuth access token — a static base URL. */
function authorize(secret: string | null): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  return connectorOk({ baseUrl: API, headers: { authorization: `Bearer ${secret}` } });
}

/* ---- normalizers (HubSpot object shape → neutral contract) ----------------- */

function props(o: Record<string, unknown>): Record<string, unknown> { return obj(o["properties"]); }
function dealStatus(stage: string): CRMDeal["status"] {
  const s = stage.toLowerCase();
  if (s.includes("closedwon")) return "won";
  if (s.includes("closedlost")) return "lost";
  return "open";
}
function normContact(o: Record<string, unknown>): Record<string, unknown> {
  const p = props(o);
  const first = optStr(p, "firstname"); const last = optStr(p, "lastname"); const email = optStr(p, "email");
  const c: CRMContact = {
    provider: "hubspot", externalId: scalarStr(o["id"]),
    displayName: `${first} ${last}`.trim() || email || scalarStr(o["id"]),
    firstName: first || undefined, lastName: last || undefined, email: email || undefined,
    phone: optStr(p, "phone") || undefined, ownerExternalId: optStr(p, "hubspot_owner_id") || undefined,
    createdAt: optStr(o, "createdAt") || undefined, updatedAt: optStr(o, "updatedAt") || undefined,
    archived: o["archived"] === true,
  };
  return compact(c);
}
function normCompany(o: Record<string, unknown>): Record<string, unknown> {
  const p = props(o);
  const c: CRMCompany = {
    provider: "hubspot", externalId: scalarStr(o["id"]), displayName: optStr(p, "name") || scalarStr(o["id"]),
    name: optStr(p, "name") || undefined, domain: optStr(p, "domain") || undefined, industry: optStr(p, "industry") || undefined,
    ownerExternalId: optStr(p, "hubspot_owner_id") || undefined,
    createdAt: optStr(o, "createdAt") || undefined, updatedAt: optStr(o, "updatedAt") || undefined, archived: o["archived"] === true,
  };
  return compact(c);
}
function normDeal(o: Record<string, unknown>): Record<string, unknown> {
  const p = props(o);
  const stage = optStr(p, "dealstage");
  const amountRaw = optStr(p, "amount");
  const d: CRMDeal = {
    provider: "hubspot", externalId: scalarStr(o["id"]), displayName: optStr(p, "dealname") || scalarStr(o["id"]),
    amount: amountRaw.length > 0 && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : undefined,
    stageId: stage || undefined, pipelineId: optStr(p, "pipeline") || undefined, status: dealStatus(stage),
    ownerExternalId: optStr(p, "hubspot_owner_id") || undefined, closeDate: optStr(p, "closedate") || undefined,
    createdAt: optStr(o, "createdAt") || undefined, updatedAt: optStr(o, "updatedAt") || undefined, archived: o["archived"] === true,
  };
  return compact(d);
}
function pagingAfter(body: Record<string, unknown>): string | null {
  const next = obj(obj(body["paging"])["next"]);
  const after = optStr(next, "after");
  return after.length > 0 ? after : null;
}

/* ---- operations ------------------------------------------------------------ */

function objectOps(object: "contacts" | "companies" | "deals", propsList: string[], norm: (o: Record<string, unknown>) => Record<string, unknown>) {
  const collection = object === "contacts" ? "contacts" : object === "companies" ? "companies" : "deals";
  return {
    list: async (call: CrmCall, input: OpInput) => {
      const r = await call({ method: "GET", path: `/crm/v3/objects/${collection}`, query: { limit: optNum(input, "limit", 50), after: optStr(input, "cursor") || undefined, properties: propsList.join(",") } });
      if (!r.ok) return r;
      const after = pagingAfter(r.value);
      return output({ results: arr(r.value["results"]).map(norm), pagination: pagination(after, after !== null) });
    },
    read: async (call: CrmCall, input: OpInput) => {
      const id = reqStr(input, "id"); if (!id.ok) return id;
      const r = await call({ method: "GET", path: `/crm/v3/objects/${collection}/${encodeURIComponent(id.value)}`, query: { properties: propsList.join(",") } });
      if (!r.ok) return r;
      return output({ record: norm(r.value) });
    },
    search: async (call: CrmCall, input: OpInput) => {
      const q = reqStr(input, "query"); if (!q.ok) return q;
      const r = await call({ method: "POST", path: `/crm/v3/objects/${collection}/search`, jsonBody: { query: q.value, limit: optNum(input, "limit", 20), properties: propsList } });
      if (!r.ok) return r;
      const after = pagingAfter(r.value);
      return output({ results: arr(r.value["results"]).map(norm), pagination: pagination(after, after !== null) });
    },
  };
}

const contactObj = objectOps("contacts", CONTACT_PROPS, normContact);
const companyObj = objectOps("companies", COMPANY_PROPS, normCompany);
const dealObj = objectOps("deals", DEAL_PROPS, normDeal);

const OPS: Record<string, (call: CrmCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "crm.account.read": async (call) => {
    const r = await call({ method: "GET", path: "/account-info/v3/details" });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["portalId"]), name: optStr(r.value, "companyName") || scalarStr(r.value["portalId"]), timeZone: optStr(r.value, "timeZone"), currency: optStr(r.value, "companyCurrency") });
  },

  "crm.contacts.list": contactObj.list,
  "crm.contacts.read": contactObj.read,
  "crm.contacts.search": contactObj.search,
  "crm.contacts.create": async (call, input) => {
    const properties = compact({ firstname: optStr(input, "firstName") || undefined, lastname: optStr(input, "lastName") || undefined, email: optStr(input, "email") || undefined, phone: optStr(input, "phone") || undefined, company: optStr(input, "company") || undefined });
    if (Object.keys(properties).length === 0) return missing("email");
    const r = await call({ method: "POST", path: "/crm/v3/objects/contacts", jsonBody: { properties } });
    if (!r.ok) return r;
    return output({ record: normContact(r.value) });
  },
  "crm.contacts.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const properties = compact({ firstname: optStr(input, "firstName") || undefined, lastname: optStr(input, "lastName") || undefined, email: optStr(input, "email") || undefined, phone: optStr(input, "phone") || undefined });
    const r = await call({ method: "PATCH", path: `/crm/v3/objects/contacts/${encodeURIComponent(id.value)}`, jsonBody: { properties } });
    if (!r.ok) return r;
    return output({ record: normContact(r.value) });
  },
  "crm.contacts.archive": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "DELETE", path: `/crm/v3/objects/contacts/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ id: id.value, archived: true });
  },

  "crm.companies.list": companyObj.list,
  "crm.companies.read": companyObj.read,
  "crm.companies.search": companyObj.search,
  "crm.companies.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const properties = compact({ name: name.value, domain: optStr(input, "domain") || undefined, industry: optStr(input, "industry") || undefined });
    const r = await call({ method: "POST", path: "/crm/v3/objects/companies", jsonBody: { properties } });
    if (!r.ok) return r;
    return output({ record: normCompany(r.value) });
  },
  "crm.companies.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const properties = compact({ name: optStr(input, "name") || undefined, domain: optStr(input, "domain") || undefined, industry: optStr(input, "industry") || undefined });
    const r = await call({ method: "PATCH", path: `/crm/v3/objects/companies/${encodeURIComponent(id.value)}`, jsonBody: { properties } });
    if (!r.ok) return r;
    return output({ record: normCompany(r.value) });
  },

  "crm.deals.list": dealObj.list,
  "crm.deals.read": dealObj.read,
  "crm.deals.search": dealObj.search,
  "crm.deals.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const properties = compact({ dealname: name.value, amount: optStr(input, "amount") || undefined, dealstage: optStr(input, "stageId") || undefined, pipeline: optStr(input, "pipelineId") || undefined, closedate: optStr(input, "closeDate") || undefined });
    const r = await call({ method: "POST", path: "/crm/v3/objects/deals", jsonBody: { properties } });
    if (!r.ok) return r;
    return output({ record: normDeal(r.value) });
  },
  "crm.deals.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const properties = compact({ dealname: optStr(input, "name") || undefined, amount: optStr(input, "amount") || undefined, closedate: optStr(input, "closeDate") || undefined });
    const r = await call({ method: "PATCH", path: `/crm/v3/objects/deals/${encodeURIComponent(id.value)}`, jsonBody: { properties } });
    if (!r.ok) return r;
    return output({ record: normDeal(r.value) });
  },
  "crm.deals.stage.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const stage = reqStr(input, "stageId"); if (!stage.ok) return stage;
    const r = await call({ method: "PATCH", path: `/crm/v3/objects/deals/${encodeURIComponent(id.value)}`, jsonBody: { properties: { dealstage: stage.value } } });
    if (!r.ok) return r;
    return output({ record: normDeal(r.value) });
  },

  "crm.pipelines.list": async (call) => {
    const r = await call({ method: "GET", path: "/crm/v3/pipelines/deals" });
    if (!r.ok) return r;
    return output({ pipelines: arr(r.value["results"]).map((p) => ({ provider: "hubspot", externalId: scalarStr(p["id"]), displayName: optStr(p, "label") })) });
  },
  "crm.pipeline.stages.list": async (call, input) => {
    const pipelineId = optStr(input, "pipelineId");
    const path = pipelineId.length > 0 ? `/crm/v3/pipelines/deals/${encodeURIComponent(pipelineId)}` : "/crm/v3/pipelines/deals";
    const r = await call({ method: "GET", path });
    if (!r.ok) return r;
    const pipelines = pipelineId.length > 0 ? [r.value] : arr(r.value["results"]);
    const stages = pipelines.flatMap((p) => arr(p["stages"]).map((s) => ({
      provider: "hubspot", externalId: scalarStr(s["id"]), displayName: optStr(s, "label"),
      pipelineExternalId: scalarStr(p["id"]), order: optNum(s, "displayOrder", 0),
      isClosed: obj(s["metadata"])["isClosed"] === "true" || obj(s["metadata"])["isClosed"] === true,
    })));
    return output({ stages });
  },
  "crm.activities.list": async (call, input) => {
    const r = await call({ method: "GET", path: "/crm/v3/objects/tasks", query: { limit: optNum(input, "limit", 50), after: optStr(input, "cursor") || undefined, properties: "hs_task_subject,hs_task_status,hs_timestamp" } });
    if (!r.ok) return r;
    const after = pagingAfter(r.value);
    const activities = arr(r.value["results"]).map((o) => { const p = props(o); return { provider: "hubspot", externalId: scalarStr(o["id"]), displayName: optStr(p, "hs_task_subject") || scalarStr(o["id"]), type: "task", done: optStr(p, "hs_task_status") === "COMPLETED", createdAt: optStr(o, "createdAt") || undefined }; });
    return output({ results: activities, pagination: pagination(after, after !== null) });
  },
  "crm.activity.create": async (call, input) => {
    const subject = reqStr(input, "subject"); if (!subject.ok) return subject;
    const ts = optStr(input, "dueDate") || new Date().toISOString();
    const r = await call({ method: "POST", path: "/crm/v3/objects/tasks", jsonBody: { properties: { hs_task_subject: subject.value, hs_task_body: optStr(input, "body"), hs_timestamp: ts, hs_task_status: "NOT_STARTED" } } });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), subject: subject.value });
  },
  "crm.notes.create": async (call, input) => {
    const body = reqStr(input, "body"); if (!body.ok) return body;
    const ts = optStr(input, "timestamp") || new Date().toISOString();
    const r = await call({ method: "POST", path: "/crm/v3/objects/notes", jsonBody: { properties: { hs_note_body: body.value, hs_timestamp: ts } } });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]) });
  },
  "crm.owners.list": async (call, input) => {
    const r = await call({ method: "GET", path: "/crm/v3/owners", query: { limit: optNum(input, "limit", 100) } });
    if (!r.ok) return r;
    return output({ owners: arr(r.value["results"]).map((o) => ({ provider: "hubspot", externalId: scalarStr(o["id"]), displayName: `${optStr(o, "firstName")} ${optStr(o, "lastName")}`.trim() || optStr(o, "email"), email: optStr(o, "email") || undefined, active: o["archived"] !== true })) });
  },
  "crm.health": async (call) => {
    const r = await call({ method: "GET", path: "/account-info/v3/details" });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "hubspot", portalId: scalarStr(r.value["portalId"]) });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyHubspotV1(rawBody, signature, signingSecret);
  let externalId = "";
  try {
    const parsed = JSON.parse(rawBody);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] !== null && typeof parsed[0] === "object") externalId = scalarStr((parsed[0] as Record<string, unknown>)["eventId"]);
  } catch { externalId = ""; }
  return connectorOk({ valid, externalEventId: externalId.length > 0 ? externalId : "unknown" });
}

/** Map a HubSpot subscriptionType (+ optional changed property) to a canonical type. */
export function mapHubspotSubscription(subscriptionType: string, propertyName: string): CrmEventType {
  const [object, action] = subscriptionType.split(".");
  if (object === "contact") {
    if (action === "creation") return CRM_EVENTS.contactCreated;
    if (action === "deletion") return CRM_EVENTS.contactArchived;
    return CRM_EVENTS.contactUpdated;
  }
  if (object === "company") return action === "creation" ? CRM_EVENTS.companyCreated : CRM_EVENTS.companyUpdated;
  if (object === "deal") {
    if (action === "creation") return CRM_EVENTS.dealCreated;
    if (propertyName === "dealstage") return CRM_EVENTS.dealStageChanged;
    return CRM_EVENTS.dealUpdated;
  }
  return CRM_EVENTS.eventReceived;
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const items = Array.isArray(parsed) ? parsed : [];
  const events: CanonicalConnectorEvent[] = [];
  for (const it of items) {
    if (it === null || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const objectId = scalarStr(o["objectId"]);
    const eventId = scalarStr(o["eventId"]);
    const externalId = eventId || objectId;
    if (externalId.length === 0) continue;
    const occurred = typeof o["occurredAt"] === "number" ? new Date(o["occurredAt"] as number).toISOString() : now();
    const ev: NormalizedCrmEvent = {
      type: mapHubspotSubscription(optStr(o, "subscriptionType"), optStr(o, "propertyName")),
      externalId, occurredAt: occurred, payload: { objectId, propertyName: optStr(o, "propertyName") },
    };
    events.push(crmEvent(ev, PROVENANCE));
  }
  return connectorOk(events);
}

/** Poll recently-modified contacts → canonical contact events. Cursor = newest updatedAt. */
async function poll(call: CrmCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const r = await call({ method: "GET", path: "/crm/v3/objects/contacts", query: { limit, after: cursor ?? undefined, properties: "lastmodifieddate", sorts: "lastmodifieddate" } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value["results"]).map((o) => crmEvent({
    type: CRM_EVENTS.contactUpdated, externalId: scalarStr(o["id"]),
    occurredAt: optStr(o, "updatedAt") || now(), payload: { objectId: scalarStr(o["id"]) },
  }, POLL_PROVENANCE)).filter((e) => e.externalId.length > 0);
  const nextCursor = pagingAfter(r.value) ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const HUBSPOT_BINDING: CrmProviderBinding = {
  connectorId: "hubspot",
  oauth: { authorizeEndpoint: "https://app.hubspot.com/oauth/authorize", tokenEndpoint: `${API}/oauth/v1/token` },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize: (secret) => authorize(secret),
  probePath: "/account-info/v3/details",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};
