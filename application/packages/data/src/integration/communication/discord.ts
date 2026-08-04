/* =============================================================================
 * Discord provider binding (F4.3). BOT-token authentication (api_key). Maps the
 * NORMALIZED communication.* operations onto the Discord REST API. Several Discord
 * endpoints return a top-level JSON array — handled via `arr(r.value)`.
 * ========================================================================== */

import type { CanonicalConnectorEvent, ConnectorResult, OperationOutput, PollResult } from "@brightloop/domain";
import type { CommCall, CommProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, type OpInput } from "./helpers.js";
import { COMM_EVENTS, messageEvent } from "./normalize.js";

const API = "https://discord.com/api/v10";
const guild = (input: OpInput, conn: OpInput): string => optStr(input, "guildId", optStr(conn, "guildId"));

const OPS: Record<string, (call: CommCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "communication.list_containers": async (call) => {
    const r = await call({ method: "GET", url: `${API}/users/@me/guilds` });
    if (!r.ok) return r;
    return output({ containers: arr(r.value).map((g) => ({ id: optStr(g, "id"), name: optStr(g, "name") })) });
  },
  "communication.list_channels": async (call, input, conn) => {
    const g = guild(input, conn); if (g.length === 0) return missing("guildId");
    const r = await call({ method: "GET", url: `${API}/guilds/${encodeURIComponent(g)}/channels` });
    if (!r.ok) return r;
    return output({ channels: arr(r.value).map((c) => ({ id: optStr(c, "id"), name: optStr(c, "name"), type: optNum(c, "type", 0) })) });
  },
  "communication.list_members": async (call, input, conn) => {
    const g = guild(input, conn); if (g.length === 0) return missing("guildId");
    const r = await call({ method: "GET", url: `${API}/guilds/${encodeURIComponent(g)}/members`, query: { limit: optNum(input, "limit", 100) } });
    if (!r.ok) return r;
    return output({ members: arr(r.value).map((m) => ({ id: optStr(obj(m["user"]), "id"), name: optStr(obj(m["user"]), "username") })) });
  },
  "communication.send_message": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await call({ method: "POST", url: `${API}/channels/${encodeURIComponent(channel.value)}/messages`, jsonBody: { content: text.value } });
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "id"), channelId: optStr(r.value, "channel_id") });
  },
  "communication.reply_message": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const parent = reqStr(input, "threadId"); if (!parent.ok) return parent;
    const text = reqStr(input, "text"); if (!text.ok) return text;
    const r = await call({ method: "POST", url: `${API}/channels/${encodeURIComponent(channel.value)}/messages`, jsonBody: { content: text.value, message_reference: { message_id: parent.value } } });
    if (!r.ok) return r;
    return output({ messageId: optStr(r.value, "id"), threadId: parent.value });
  },
  "communication.read_history": async (call, input) => {
    const channel = reqStr(input, "channelId"); if (!channel.ok) return channel;
    const r = await call({ method: "GET", url: `${API}/channels/${encodeURIComponent(channel.value)}/messages`, query: { limit: optNum(input, "limit", 50) } });
    if (!r.ok) return r;
    return output({ messages: arr(r.value).map((m) => ({ messageId: optStr(m, "id"), authorId: optStr(obj(m["author"]), "id"), text: optStr(m, "content") })) });
  },
};

async function poll(call: CommCall, conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const channel = optStr(conn, "channelId");
  if (channel.length === 0) return { ok: true, value: { events: [], nextCursor: cursor } };
  const r = await call({ method: "GET", url: `${API}/channels/${encodeURIComponent(channel)}/messages`, query: { limit, after: cursor ?? undefined } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value).map((m) => messageEvent({
    externalId: optStr(m, "id"), type: obj(m["message_reference"])["message_id"] !== undefined ? COMM_EVENTS.messageReplied : COMM_EVENTS.messageCreated,
    occurredAt: optStr(m, "timestamp") || now(), channelId: channel, authorId: optStr(obj(m["author"]), "id"),
  }, "discord:poll")).filter((e) => e.externalId.length > 0);
  const nextCursor = events[0]?.externalId ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const DISCORD_BINDING: CommProviderBinding = {
  connectorId: "discord",
  authStyle: "bot",
  // No `oauth` — Discord uses a bot token (api_key), validated directly.
  probeUrl: `${API}/users/@me`,
  classify: (status) => classifyHttpStatus(status),
  ops: OPS,
  poll,
};
