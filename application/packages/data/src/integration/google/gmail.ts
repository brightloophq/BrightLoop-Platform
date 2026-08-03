/* =============================================================================
 * Gmail operations (F4.2). Provider-neutral in/out; Google REST behind callGoogle.
 * ========================================================================== */

import type { CanonicalConnectorEvent, ConnectorResult, OperationOutput, PollResult } from "@brightloop/domain";
import { callGoogle, type GoogleAdapterConfig } from "./client.js";
import { arr, base64UrlMime, optNum, optStr, optStrArr, output, reqStr, type OpInput } from "./helpers.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users";
const mailbox = (conn: OpInput): string => optStr(conn, "userId", "me");

export type GmailHandler = (cfg: GoogleAdapterConfig, token: string | null, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>;

async function send(cfg: GoogleAdapterConfig, token: string | null, input: OpInput, conn: OpInput, extraHeaders: Record<string, string> = {}): Promise<ConnectorResult<OperationOutput>> {
  const to = reqStr(input, "to"); if (!to.ok) return to;
  const raw = base64UrlMime({ To: to.value, Cc: optStr(input, "cc"), Subject: optStr(input, "subject"), ...extraHeaders }, optStr(input, "body"));
  const body: Record<string, unknown> = { raw };
  const threadId = optStr(input, "threadId");
  if (threadId.length > 0) body["threadId"] = threadId;
  const res = await callGoogle(cfg, token, { method: "POST", url: `${BASE}/${mailbox(conn)}/messages/send`, jsonBody: body });
  if (!res.ok) return res;
  return output({ id: optStr(res.value, "id"), threadId: optStr(res.value, "threadId") });
}

export const GMAIL_OPS: Record<string, GmailHandler> = {
  "gmail.send": (cfg, t, input, conn) => send(cfg, t, input, conn),
  "gmail.reply": (cfg, t, input, conn) => {
    const inReplyTo = optStr(input, "inReplyTo");
    return send(cfg, t, input, conn, inReplyTo.length > 0 ? { "In-Reply-To": inReplyTo, References: inReplyTo } : {});
  },
  "gmail.draft": async (cfg, t, input, conn) => {
    const to = reqStr(input, "to"); if (!to.ok) return to;
    const raw = base64UrlMime({ To: to.value, Cc: optStr(input, "cc"), Subject: optStr(input, "subject") }, optStr(input, "body"));
    const res = await callGoogle(cfg, t, { method: "POST", url: `${BASE}/${mailbox(conn)}/drafts`, jsonBody: { message: { raw } } });
    if (!res.ok) return res;
    return output({ id: optStr(res.value, "id") });
  },
  "gmail.messages.get": async (cfg, t, input, conn) => {
    const id = reqStr(input, "messageId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/${mailbox(conn)}/messages/${encodeURIComponent(id.value)}`, query: { format: "metadata" } });
    if (!res.ok) return res;
    return output({ id: optStr(res.value, "id"), threadId: optStr(res.value, "threadId"), snippet: optStr(res.value, "snippet"), labelIds: optStrArr(res.value, "labelIds") });
  },
  "gmail.messages.search": async (cfg, t, input, conn) => {
    const q = reqStr(input, "query"); if (!q.ok) return q;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/${mailbox(conn)}/messages`, query: { q: q.value, maxResults: optNum(input, "maxResults", 25) } });
    if (!res.ok) return res;
    return output({ messages: arr(res.value["messages"]).map((m) => ({ id: optStr(m, "id"), threadId: optStr(m, "threadId") })), resultSizeEstimate: optNum(res.value, "resultSizeEstimate", 0) });
  },
  "gmail.labels.list": async (cfg, t, _input, conn) => {
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/${mailbox(conn)}/labels` });
    if (!res.ok) return res;
    return output({ labels: arr(res.value["labels"]).map((l) => ({ id: optStr(l, "id"), name: optStr(l, "name"), type: optStr(l, "type") })) });
  },
  "gmail.threads.get": async (cfg, t, input, conn) => {
    const id = reqStr(input, "threadId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/${mailbox(conn)}/threads/${encodeURIComponent(id.value)}`, query: { format: "metadata" } });
    if (!res.ok) return res;
    return output({ id: optStr(res.value, "id"), messages: arr(res.value["messages"]).map((m) => ({ id: optStr(m, "id"), snippet: optStr(m, "snippet") })) });
  },
  "gmail.attachments.get": async (cfg, t, input, conn) => {
    const mid = reqStr(input, "messageId"); if (!mid.ok) return mid;
    const aid = reqStr(input, "attachmentId"); if (!aid.ok) return aid;
    const res = await callGoogle(cfg, t, { method: "GET", url: `${BASE}/${mailbox(conn)}/messages/${encodeURIComponent(mid.value)}/attachments/${encodeURIComponent(aid.value)}` });
    if (!res.ok) return res;
    // Return metadata only — attachment bytes are not surfaced in a JSON result.
    return output({ attachmentId: aid.value, size: optNum(res.value, "size", 0) });
  },
  "gmail.archive": async (cfg, t, input, conn) => {
    const id = reqStr(input, "messageId"); if (!id.ok) return id;
    const res = await callGoogle(cfg, t, { method: "POST", url: `${BASE}/${mailbox(conn)}/messages/${encodeURIComponent(id.value)}/modify`, jsonBody: { removeLabelIds: ["INBOX"] } });
    if (!res.ok) return res;
    return output({ id: optStr(res.value, "id"), labelIds: optStrArr(res.value, "labelIds") });
  },
};

/** Poll new messages → canonical `email.received` events. Cursor = newest message id. */
export async function gmailPoll(cfg: GoogleAdapterConfig, token: string | null, conn: OpInput, cursor: string | null, limit: number): Promise<ConnectorResult<PollResult>> {
  const res = await callGoogle(cfg, token, { method: "GET", url: `${BASE}/${mailbox(conn)}/messages`, query: { maxResults: limit, q: "newer_than:7d" } });
  if (!res.ok) return res;
  const stubs = arr(res.value["messages"]);
  const events: CanonicalConnectorEvent[] = stubs.map((m) => ({
    type: "email.received", externalId: optStr(m, "id"), occurredAt: cfg.now(),
    payload: { threadId: optStr(m, "threadId") }, provenance: "google-gmail:poll",
  })).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}
