/* =============================================================================
 * Microsoft Teams provider binding (F4.3). Maps NORMALIZED communication.*
 * operations onto Microsoft Graph. Provider-neutral in/out; HTTP-status classified.
 * ========================================================================== */

import type { CanonicalConnectorEvent, ConnectorResult, OperationOutput, PollResult } from "@brightloop/domain";
import type { CommCall, CommProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, type OpInput } from "./helpers.js";
import { COMM_EVENTS, messageEvent } from "./normalize.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const team = (input: OpInput, conn: OpInput): string => optStr(input, "teamId", optStr(conn, "teamId"));
const channel = (input: OpInput, conn: OpInput): string => optStr(input, "channelId", optStr(conn, "channelId"));
const msgBody = (text: string) => ({ body: { contentType: "text", content: text } });

const OPS: Record<string, (call: CommCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "communication.list_containers": async (call) => {
    const r = await call({ method: "GET", url: `${GRAPH}/me/joinedTeams` });
    if (!r.ok) return r;
    return output({ containers: arr(r.value["value"]).map((t) => ({ id: optStr(t, "id"), name: optStr(t, "displayName") })) });
  },
  "communication.list_channels": async (call, input, conn) => {
    const t = team(input, conn); if (t.length === 0) return missing("teamId");
    const r = await call({ method: "GET", url: `${GRAPH}/teams/${encodeURIComponent(t)}/channels` });
    if (!r.ok) return r;
    return output({ channels: arr(r.value["value"]).map((c) => ({ id: optStr(c, "id"), name: optStr(c, "displayName") })) });
  },
  "communication.list_members": async (call, input, conn) => {
    const t = team(input, conn); if (t.length === 0) return missing("teamId");
    const r = await call({ method: "GET", url: `${GRAPH}/teams/${encodeURIComponent(t)}/members` });
    if (!r.ok) return r;
    return output({ members: arr(r.value["value"]).map((m) => ({ id: optStr(m, "id"), name: optStr(m, "displayName") })) });
  },
  "communication.send_message": async (call, input, conn) => {
    const t = team(input, conn), c = channel(input, conn);
    if (t.length === 0 || c.length === 0) return missing("teamId/channelId");
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await call({ method: "POST", url: `${GRAPH}/teams/${encodeURIComponent(t)}/channels/${encodeURIComponent(c)}/messages`, jsonBody: msgBody(text.value) });
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "id"), channelId: c });
  },
  "communication.reply_message": async (call, input, conn) => {
    const t = team(input, conn), c = channel(input, conn);
    if (t.length === 0 || c.length === 0) return missing("teamId/channelId");
    const parent = reqStr(input, "threadId"); if (!parent.ok) return parent;
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await call({ method: "POST", url: `${GRAPH}/teams/${encodeURIComponent(t)}/channels/${encodeURIComponent(c)}/messages/${encodeURIComponent(parent.value)}/replies`, jsonBody: msgBody(text.value) });
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "id"), threadId: parent.value });
  },
  "communication.read_history": async (call, input, conn) => {
    const t = team(input, conn), c = channel(input, conn);
    if (t.length === 0 || c.length === 0) return missing("teamId/channelId");
    const r = await call({ method: "GET", url: `${GRAPH}/teams/${encodeURIComponent(t)}/channels/${encodeURIComponent(c)}/messages`, query: { $top: optNum(input, "limit", 20) } });
    if (!r.ok) return r;
    return output({ messages: arr(r.value["value"]).map((m) => ({ messageId: optStr(m, "id"), authorId: optStr(obj(obj(m["from"])["user"]), "id"), createdAt: optStr(m, "createdDateTime") })) });
  },
  "communication.meeting_metadata": async (call, input) => {
    const id = reqStr(input, "meetingId"); if (!id.ok) return id;
    const r = await call({ method: "GET", url: `${GRAPH}/me/onlineMeetings/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ id: optStr(r.value, "id"), subject: optStr(r.value, "subject"), startDateTime: optStr(r.value, "startDateTime"), endDateTime: optStr(r.value, "endDateTime") });
  },
};

async function poll(call: CommCall, conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const t = optStr(conn, "teamId"), c = optStr(conn, "channelId");
  if (t.length === 0 || c.length === 0) return { ok: true, value: { events: [], nextCursor: cursor } };
  const r = await call({ method: "GET", url: `${GRAPH}/teams/${encodeURIComponent(t)}/channels/${encodeURIComponent(c)}/messages`, query: { $top: limit } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value["value"]).map((m) => messageEvent({
    externalId: optStr(m, "id"), type: optStr(m, "replyToId").length > 0 ? COMM_EVENTS.messageReplied : COMM_EVENTS.messageCreated,
    occurredAt: optStr(m, "createdDateTime") || now(), channelId: c, authorId: optStr(obj(obj(m["from"])["user"]), "id"),
  }, "microsoft-teams:poll")).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const TEAMS_BINDING: CommProviderBinding = {
  connectorId: "microsoft-teams",
  authStyle: "bearer",
  oauth: {
    authorizeEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopeParam: "scope",
  },
  probeUrl: `${GRAPH}/me`,
  classify: (status) => classifyHttpStatus(status),
  ops: OPS,
  poll,
};
