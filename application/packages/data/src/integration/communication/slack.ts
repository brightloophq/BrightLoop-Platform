/* =============================================================================
 * Slack provider binding (F4.3). Maps the NORMALIZED communication.* operations
 * onto the Slack Web API. Provider-neutral in/out. Slack returns HTTP 200 with
 * `{ok:false,error}` — classified via classifySlack.
 * ========================================================================== */

import type { CanonicalConnectorEvent, ConnectorResult, OperationOutput, PollResult } from "@brightloop/domain";
import type { CommCall, CommProviderBinding } from "./client.js";
import { classifySlack } from "./errors.js";
import { arr, obj, optNum, optStr, output, reqStr, type OpInput } from "./helpers.js";
import { COMM_EVENTS, messageEvent } from "./normalize.js";

const API = "https://slack.com/api";

async function postMessage(call: CommCall, channel: string, text: string, threadTs?: string): Promise<ConnectorResult<Record<string, unknown>>> {
  const body: Record<string, unknown> = { channel, text };
  if (threadTs !== undefined && threadTs.length > 0) body["thread_ts"] = threadTs;
  return call({ method: "POST", url: `${API}/chat.postMessage`, jsonBody: body });
}

const OPS: Record<string, (call: CommCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "communication.send_message": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await postMessage(call, channel.value, text.value);
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "ts"), channelId: optStr(r.value, "channel") });
  },
  "communication.reply_message": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const thread = reqStr(input, "threadId"); if (!thread.ok) return thread;
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await postMessage(call, channel.value, text.value, thread.value);
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "ts"), channelId: optStr(r.value, "channel"), threadId: thread.value });
  },
  "communication.edit_message": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const ts = reqStr(input, "messageId"); if (!ts.ok) return ts;
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await call({ method: "POST", url: `${API}/chat.update`, jsonBody: { channel: channel.value, ts: ts.value, text: text.value } });
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "ts"), channelId: optStr(r.value, "channel") });
  },
  "communication.delete_message": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const ts = reqStr(input, "messageId"); if (!ts.ok) return ts;
    const r = await call({ method: "POST", url: `${API}/chat.delete`, jsonBody: { channel: channel.value, ts: ts.value } });
    if (!r.ok) return r;
    return output({ messageId: ts.value, deleted: true });
  },
  "communication.list_channels": async (call, input) => {
    const r = await call({ method: "GET", url: `${API}/conversations.list`, query: { limit: optNum(input, "limit", 100), types: "public_channel,private_channel" } });
    if (!r.ok) return r;
    return output({ channels: arr(r.value["channels"]).map((c) => ({ id: optStr(c, "id"), name: optStr(c, "name"), isPrivate: c["is_private"] === true })) });
  },
  "communication.list_members": async (call, input) => {
    const r = await call({ method: "GET", url: `${API}/users.list`, query: { limit: optNum(input, "limit", 100) } });
    if (!r.ok) return r;
    return output({ members: arr(r.value["members"]).map((m) => ({ id: optStr(m, "id"), name: optStr(m, "name") })) });
  },
  "communication.search_messages": async (call, input) => {
    const q = reqStr(input, "query"); if (!q.ok) return q;
    const r = await call({ method: "GET", url: `${API}/search.messages`, query: { query: q.value, count: optNum(input, "limit", 20) } });
    if (!r.ok) return r;
    return output({ messages: arr(obj(r.value["messages"])["matches"]).map((m) => ({ messageId: optStr(m, "ts"), channelId: optStr(obj(m["channel"]), "id"), text: optStr(m, "text") })) });
  },
  "communication.read_history": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const r = await call({ method: "GET", url: `${API}/conversations.history`, query: { channel: channel.value, limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ messages: arr(r.value["messages"]).map((m) => ({ messageId: optStr(m, "ts"), authorId: optStr(m, "user"), text: optStr(m, "text") })) });
  },
  "communication.list_containers": async (call) => {
    const r = await call({ method: "GET", url: `${API}/auth.test` });
    if (!r.ok) return r;
    return output({ containers: [{ id: optStr(r.value, "team_id"), name: optStr(r.value, "team") }] });
  },
};

async function poll(call: CommCall, conn: OpInput, cursor: string | null, limit: number): Promise<ConnectorResult<PollResult>> {
  const channel = optStr(conn, "channelId");
  if (channel.length === 0) return { ok: true, value: { events: [], nextCursor: cursor } };
  const r = await call({ method: "GET", url: `${API}/conversations.history`, query: { channel, limit, oldest: cursor ?? undefined } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value["messages"]).map((m) => messageEvent({
    externalId: optStr(m, "ts"), type: optStr(m, "thread_ts").length > 0 ? COMM_EVENTS.messageReplied : COMM_EVENTS.messageCreated,
    occurredAt: optStr(m, "ts"), channelId: channel, authorId: optStr(m, "user"),
  }, "slack:poll")).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const SLACK_BINDING: CommProviderBinding = {
  connectorId: "slack",
  authStyle: "bearer",
  oauth: { authorizeEndpoint: "https://slack.com/oauth/v2/authorize", tokenEndpoint: "https://slack.com/api/oauth.v2.access", scopeParam: "scope", accessTokenPath: "access_token" },
  probeUrl: `${API}/auth.test`,
  classify: classifySlack,
  ops: OPS,
  poll,
};
