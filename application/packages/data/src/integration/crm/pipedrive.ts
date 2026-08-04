/* =============================================================================
 * Pipedrive provider binding (F4.5). OAuth 2.0 (Bearer) auth against the company's
 * API host (companyDomain carried as install config; defaults to the shared host).
 * Maps the NORMALIZED crm.* operations onto the Pipedrive v1 API. Webhooks are
 * verified structurally (Pipedrive has no body HMAC — see webhook.ts) and translated
 * from `meta.action` + `meta.object` into canonical crm.* events. Provider-neutral
 * in/out; no Pipedrive shape or secret leaks past this boundary.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult, type VerifiedWebhook,
} from "@brightloop/domain";
import type { AuthContext, CrmCall, CrmProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, obj, optNum, optStr, output, reqStr, scalarStr, type OpInput } from "./helpers.js";
import { compact, pagination, type CRMContact, type CRMCompany, type CRMDeal } from "./contracts.js";
import { CRM_EVENTS, crmEvent, eventTypeFor, type CrmEventType, type NormalizedCrmEvent } from "./normalize.js";
import { verifyPipedriveStructural } from "./webhook.js";

const DEFAULT_HOST = "https://api.pipedrive.com/v1";
const PROVENANCE = "pipedrive:webhook";
const POLL_PROVENANCE = "pipedrive:poll";

function apiBase(config: OpInput): string {
  const domain = optStr(config, "companyDomain").trim().replace(/^https?:\/\//i, "").replace(/\..*$/, "");
  return domain.length > 0 ? `https://${domain}.pipedrive.com/api/v1` : DEFAULT_HOST;
}

/** Pipedrive authorizes with the resolved OAuth token + company API host. */
function authorize(secret: string | null, config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  return connectorOk({ baseUrl: apiBase(config), headers: { authorization: `Bearer ${secret}` } });
}

/* ---- shape helpers (Pipedrive returns { success, data, additional_data }) --- */

function firstValue(v: unknown): string {
  if (Array.isArray(v) && v.length > 0) { const o = obj(v[0]); return optStr(o, "value"); }
  return "";
}
function refId(v: unknown): string {
  if (v !== null && typeof v === "object") return scalarStr((v as Record<string, unknown>)["value"]) || scalarStr((v as Record<string, unknown>)["id"]);
  return scalarStr(v);
}
function nextStart(body: Record<string, unknown>): string | null {
  const p = obj(obj(body["additional_data"])["pagination"]);
  if (p["more_items_in_collection"] === true) { const n = optNum(p, "next_start", -1); return n >= 0 ? String(n) : null; }
  return null;
}

/* ---- normalizers ----------------------------------------------------------- */

function normPerson(o: Record<string, unknown>): Record<string, unknown> {
  const c: CRMContact = {
    provider: "pipedrive", externalId: scalarStr(o["id"]), displayName: optStr(o, "name") || scalarStr(o["id"]),
    firstName: optStr(o, "first_name") || undefined, lastName: optStr(o, "last_name") || undefined,
    email: firstValue(o["email"]) || undefined, phone: firstValue(o["phone"]) || undefined,
    companyExternalId: refId(o["org_id"]) || undefined, ownerExternalId: refId(o["owner_id"]) || undefined,
    createdAt: optStr(o, "add_time") || undefined, updatedAt: optStr(o, "update_time") || undefined,
    archived: o["active_flag"] === false,
  };
  return compact(c);
}
function normOrg(o: Record<string, unknown>): Record<string, unknown> {
  const c: CRMCompany = {
    provider: "pipedrive", externalId: scalarStr(o["id"]), displayName: optStr(o, "name") || scalarStr(o["id"]),
    name: optStr(o, "name") || undefined, ownerExternalId: refId(o["owner_id"]) || undefined,
    createdAt: optStr(o, "add_time") || undefined, updatedAt: optStr(o, "update_time") || undefined, archived: o["active_flag"] === false,
  };
  return compact(c);
}
function dealStatus(status: string): CRMDeal["status"] {
  if (status === "won") return "won";
  if (status === "lost" || status === "deleted") return "lost";
  return "open";
}
function normDeal(o: Record<string, unknown>): Record<string, unknown> {
  const value = o["value"];
  const d: CRMDeal = {
    provider: "pipedrive", externalId: scalarStr(o["id"]), displayName: optStr(o, "title") || scalarStr(o["id"]),
    amount: typeof value === "number" && Number.isFinite(value) ? value : undefined, currency: optStr(o, "currency") || undefined,
    stageId: scalarStr(o["stage_id"]) || undefined, pipelineId: scalarStr(o["pipeline_id"]) || undefined,
    status: dealStatus(optStr(o, "status")), ownerExternalId: refId(o["owner_id"]) || undefined,
    contactExternalId: refId(o["person_id"]) || undefined, companyExternalId: refId(o["org_id"]) || undefined,
    createdAt: optStr(o, "add_time") || undefined, updatedAt: optStr(o, "update_time") || undefined, archived: o["active_flag"] === false,
  };
  return compact(d);
}

/* ---- operations ------------------------------------------------------------ */

function listOp(path: string, norm: (o: Record<string, unknown>) => Record<string, unknown>) {
  return async (call: CrmCall, input: OpInput) => {
    const r = await call({ method: "GET", path, query: { start: optStr(input, "cursor") || undefined, limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    const cursor = nextStart(r.value);
    return output({ results: arr(r.value["data"]).map(norm), pagination: pagination(cursor, cursor !== null) });
  };
}
function readOp(path: string, norm: (o: Record<string, unknown>) => Record<string, unknown>) {
  return async (call: CrmCall, input: OpInput) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `${path}/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ record: norm(obj(r.value["data"])) });
  };
}
function searchOp(path: string, norm: (o: Record<string, unknown>) => Record<string, unknown>) {
  return async (call: CrmCall, input: OpInput) => {
    const term = reqStr(input, "query"); if (!term.ok) return term;
    const r = await call({ method: "GET", path: `${path}/search`, query: { term: term.value, limit: optNum(input, "limit", 20) } });
    if (!r.ok) return r;
    const items = arr(obj(r.value["data"])["items"]).map((i) => norm(obj(i["item"])));
    return output({ results: items, pagination: pagination(null, false) });
  };
}

const OPS: Record<string, (call: CrmCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "crm.account.read": async (call) => {
    const r = await call({ method: "GET", path: "/users/me" });
    if (!r.ok) return r;
    const d = obj(r.value["data"]);
    return output({ id: scalarStr(d["id"]), name: optStr(d, "name"), email: optStr(d, "email"), companyId: scalarStr(d["company_id"]), companyName: optStr(d, "company_name") });
  },

  "crm.contacts.list": listOp("/persons", normPerson),
  "crm.contacts.read": readOp("/persons", normPerson),
  "crm.contacts.search": searchOp("/persons", normPerson),
  "crm.contacts.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const body = compact({ name: name.value, email: optStr(input, "email") || undefined, phone: optStr(input, "phone") || undefined, org_id: optStr(input, "companyId") || undefined });
    const r = await call({ method: "POST", path: "/persons", jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normPerson(obj(r.value["data"])) });
  },
  "crm.contacts.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const body = compact({ name: optStr(input, "name") || undefined, email: optStr(input, "email") || undefined, phone: optStr(input, "phone") || undefined });
    const r = await call({ method: "PUT", path: `/persons/${encodeURIComponent(id.value)}`, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normPerson(obj(r.value["data"])) });
  },

  "crm.companies.list": listOp("/organizations", normOrg),
  "crm.companies.read": readOp("/organizations", normOrg),
  "crm.companies.search": searchOp("/organizations", normOrg),
  "crm.companies.create": async (call, input) => {
    const name = reqStr(input, "name"); if (!name.ok) return name;
    const r = await call({ method: "POST", path: "/organizations", jsonBody: { name: name.value } });
    if (!r.ok) return r;
    return output({ record: normOrg(obj(r.value["data"])) });
  },
  "crm.companies.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "PUT", path: `/organizations/${encodeURIComponent(id.value)}`, jsonBody: compact({ name: optStr(input, "name") || undefined }) });
    if (!r.ok) return r;
    return output({ record: normOrg(obj(r.value["data"])) });
  },

  "crm.deals.list": listOp("/deals", normDeal),
  "crm.deals.read": readOp("/deals", normDeal),
  "crm.deals.search": searchOp("/deals", normDeal),
  "crm.deals.create": async (call, input) => {
    const title = reqStr(input, "name"); if (!title.ok) return title;
    const value = optNum(input, "amount", NaN);
    const body = compact({ title: title.value, value: Number.isFinite(value) ? value : undefined, currency: optStr(input, "currency") || undefined, person_id: optStr(input, "contactId") || undefined, org_id: optStr(input, "companyId") || undefined, stage_id: optStr(input, "stageId") || undefined });
    const r = await call({ method: "POST", path: "/deals", jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normDeal(obj(r.value["data"])) });
  },
  "crm.deals.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const value = optNum(input, "amount", NaN);
    const r = await call({ method: "PUT", path: `/deals/${encodeURIComponent(id.value)}`, jsonBody: compact({ title: optStr(input, "name") || undefined, value: Number.isFinite(value) ? value : undefined, status: optStr(input, "status") || undefined }) });
    if (!r.ok) return r;
    return output({ record: normDeal(obj(r.value["data"])) });
  },
  "crm.deals.stage.update": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const stage = reqStr(input, "stageId"); if (!stage.ok) return stage;
    const stageId = Number(stage.value);
    const r = await call({ method: "PUT", path: `/deals/${encodeURIComponent(id.value)}`, jsonBody: { stage_id: Number.isFinite(stageId) ? stageId : stage.value } });
    if (!r.ok) return r;
    return output({ record: normDeal(obj(r.value["data"])) });
  },

  "crm.pipelines.list": async (call) => {
    const r = await call({ method: "GET", path: "/pipelines" });
    if (!r.ok) return r;
    return output({ pipelines: arr(r.value["data"]).map((p) => ({ provider: "pipedrive", externalId: scalarStr(p["id"]), displayName: optStr(p, "name") })) });
  },
  "crm.pipeline.stages.list": async (call, input) => {
    const pipelineId = optStr(input, "pipelineId");
    const r = await call({ method: "GET", path: "/stages", query: { pipeline_id: pipelineId.length > 0 ? pipelineId : undefined } });
    if (!r.ok) return r;
    return output({ stages: arr(r.value["data"]).map((s) => compact({ provider: "pipedrive", externalId: scalarStr(s["id"]), displayName: optStr(s, "name"), pipelineExternalId: scalarStr(s["pipeline_id"]), order: optNum(s, "order_nr", 0) })) });
  },
  "crm.activities.list": listOp("/activities", (o) => compact({ provider: "pipedrive", externalId: scalarStr(o["id"]), displayName: optStr(o, "subject") || scalarStr(o["id"]), type: optStr(o, "type") || undefined, done: o["done"] === true, dueDate: optStr(o, "due_date") || undefined, ownerExternalId: refId(o["user_id"]) || undefined, dealExternalId: scalarStr(o["deal_id"]) || undefined, createdAt: optStr(o, "add_time") || undefined })),
  "crm.activity.create": async (call, input) => {
    const subject = reqStr(input, "subject"); if (!subject.ok) return subject;
    const body = compact({ subject: subject.value, type: optStr(input, "type", "task"), due_date: optStr(input, "dueDate") || undefined, deal_id: optStr(input, "dealId") || undefined, person_id: optStr(input, "contactId") || undefined });
    const r = await call({ method: "POST", path: "/activities", jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(obj(r.value["data"])["id"]), subject: subject.value });
  },
  "crm.notes.create": async (call, input) => {
    const content = reqStr(input, "body"); if (!content.ok) return content;
    const dealId = optStr(input, "dealId"); const personId = optStr(input, "contactId");
    if (dealId.length === 0 && personId.length === 0) return connectorErr("validation", "a note requires 'dealId' or 'contactId'", "missing_field");
    const body = compact({ content: content.value, deal_id: dealId.length > 0 ? Number(dealId) : undefined, person_id: personId.length > 0 ? Number(personId) : undefined });
    const r = await call({ method: "POST", path: "/notes", jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(obj(r.value["data"])["id"]) });
  },
  "crm.owners.list": async (call) => {
    const r = await call({ method: "GET", path: "/users" });
    if (!r.ok) return r;
    return output({ owners: arr(r.value["data"]).map((u) => compact({ provider: "pipedrive", externalId: scalarStr(u["id"]), displayName: optStr(u, "name") || optStr(u, "email"), email: optStr(u, "email") || undefined, active: u["active_flag"] === true })) });
  },
  "crm.health": async (call) => {
    const r = await call({ method: "GET", path: "/users/me" });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "pipedrive", userId: scalarStr(obj(r.value["data"])["id"]) });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyPipedriveStructural(rawBody, signature, signingSecret);
  let externalId = "";
  try {
    const meta = obj((JSON.parse(rawBody) as Record<string, unknown>)["meta"]);
    externalId = `${optStr(meta, "object") || optStr(meta, "entity")}-${scalarStr(meta["id"])}-${optStr(meta, "action")}`;
  } catch { externalId = ""; }
  return connectorOk({ valid, externalEventId: externalId.length > 1 ? externalId : "unknown" });
}

/** Map a Pipedrive meta.object + meta.action (+ deltas) to a canonical CRM event. */
export function mapPipedriveEvent(object: string, action: string, current: Record<string, unknown>, previous: Record<string, unknown>): CrmEventType {
  if (object === "person") return eventTypeFor("contact", action === "added" ? "created" : action === "deleted" ? "deleted" : "updated");
  if (object === "organization") return eventTypeFor("company", action === "added" ? "created" : "updated");
  if (object === "deal") {
    if (action === "added") return CRM_EVENTS.dealCreated;
    const status = optStr(current, "status");
    if (status === "won") return CRM_EVENTS.dealWon;
    if (status === "lost") return CRM_EVENTS.dealLost;
    if (scalarStr(current["stage_id"]).length > 0 && scalarStr(current["stage_id"]) !== scalarStr(previous["stage_id"])) return CRM_EVENTS.dealStageChanged;
    return CRM_EVENTS.dealUpdated;
  }
  if (object === "activity") return CRM_EVENTS.activityCreated;
  if (object === "note") return CRM_EVENTS.noteCreated;
  return CRM_EVENTS.eventReceived;
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const meta = obj(body["meta"]);
  const object = optStr(meta, "object") || optStr(meta, "entity");
  const action = optStr(meta, "action");
  const id = scalarStr(meta["id"]) || scalarStr(obj(body["current"])["id"]);
  if (object.length === 0 || id.length === 0) return connectorOk([]);
  const current = obj(body["current"]); const previous = obj(body["previous"]);
  const ev: NormalizedCrmEvent = {
    type: mapPipedriveEvent(object, action, current, previous), externalId: id,
    occurredAt: optStr(current, "update_time") || now(), payload: { object, action },
  };
  return connectorOk([crmEvent(ev, PROVENANCE)]);
}

/** Poll recently-updated deals → canonical deal events. Cursor = pagination next_start. */
async function poll(call: CrmCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const r = await call({ method: "GET", path: "/deals", query: { start: cursor ?? undefined, limit, sort: "update_time DESC" } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value["data"]).map((o) => {
    const status = optStr(o, "status");
    const type = status === "won" ? CRM_EVENTS.dealWon : status === "lost" ? CRM_EVENTS.dealLost : CRM_EVENTS.dealUpdated;
    return crmEvent({ type, externalId: scalarStr(o["id"]), occurredAt: optStr(o, "update_time") || now(), payload: { status, stageId: scalarStr(o["stage_id"]) } }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const nextCursor = nextStart(r.value) ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const PIPEDRIVE_BINDING: CrmProviderBinding = {
  connectorId: "pipedrive",
  oauth: { authorizeEndpoint: "https://oauth.pipedrive.com/oauth/authorize", tokenEndpoint: "https://oauth.pipedrive.com/oauth/token", tokenAuthStyle: "basic" },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/users/me",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};
