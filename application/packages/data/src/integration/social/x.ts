/* =============================================================================
 * X (Twitter) provider binding (F4.7). OAuth 2.0 (Bearer) auth against the X API v2.
 * Confidential-client token exchange uses HTTP Basic client auth; the per-request PKCE
 * `code_verifier` X requires is NOT threaded by the synchronous OAuth port (see the
 * F4.7 report's known limitations). Tweets, replies, deletes, recent search, and public
 * metrics use the v2 endpoints; a default author `userId` may be carried as install
 * config. X has no body-signed webhook of the shape the synchronous port can verify, so
 * it is polling-only. Provider-neutral in/out; no X shape or secret leaks past this
 * boundary.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult,
} from "@brightloop/domain";
import type { AuthContext, SocialCall, SocialProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, scalarNum, scalarStr, type OpInput } from "./helpers.js";
import {
  compact, pagination,
  type SocialAnalytics, type SocialPost, type SocialProfile, type SocialSearchResult,
} from "./contracts.js";
import { SOCIAL_EVENTS, socialEvent } from "./normalize.js";

const API = "https://api.twitter.com/2";
const POLL_PROVENANCE = "x:poll";

/** X authorizes with the resolved OAuth token as a Bearer header. */
function authorize(secret: string | null, _config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  return connectorOk({ baseUrl: API, headers: { authorization: `Bearer ${secret}` } });
}

/** Resolve the target author user id from op input, falling back to install config. */
function userId(input: OpInput, conn: OpInput): string {
  return optStr(input, "userId") || optStr(conn, "userId");
}

/* ---- normalizers (X object → neutral contract) ----------------------------- */

function normTweet(o: Record<string, unknown>): Record<string, unknown> {
  const p: SocialPost = {
    provider: "x", externalId: scalarStr(o["id"]), authorExternalId: scalarStr(o["author_id"]) || undefined,
    status: "published", message: optStr(o, "text") || undefined, createdAt: optStr(o, "created_at") || undefined,
  };
  return compact(p);
}
function normMetrics(id: string, o: Record<string, unknown>): Record<string, unknown> {
  const m = obj(o["public_metrics"]);
  const a: SocialAnalytics = {
    provider: "x", subjectExternalId: id, scope: "post",
    likes: scalarNum(m["like_count"]), comments: scalarNum(m["reply_count"]), shares: scalarNum(m["retweet_count"]),
    impressions: scalarNum(m["impression_count"]), engagements: scalarNum(m["quote_count"]),
  };
  return compact(a);
}

/* ---- operations ------------------------------------------------------------ */

const OPS: Record<string, (call: SocialCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "social.profile.read": async (call) => {
    const r = await call({ method: "GET", path: "/users/me", query: { "user.fields": "id,name,username,profile_image_url,public_metrics" } });
    if (!r.ok) return r;
    const o = obj(r.value["data"]);
    const p: SocialProfile = {
      provider: "x", externalId: scalarStr(o["id"]), displayName: optStr(o, "name") || scalarStr(o["id"]),
      username: optStr(o, "username") || undefined, avatarUrl: optStr(o, "profile_image_url") || undefined,
      followerCount: scalarNum(obj(o["public_metrics"])["followers_count"]),
    };
    return output(compact(p));
  },

  "social.posts.list": async (call, input, conn) => {
    const id = userId(input, conn); if (id.length === 0) return missing("userId");
    const token = optStr(input, "cursor");
    const r = await call({ method: "GET", path: `/users/${encodeURIComponent(id)}/tweets`, query: { max_results: optNum(input, "limit", 25), "tweet.fields": "created_at,author_id", pagination_token: token || undefined } });
    if (!r.ok) return r;
    const records = arr(r.value["data"]);
    const next = optStr(obj(r.value["meta"]), "next_token");
    return output({ results: records.map(normTweet), pagination: pagination(next || null, next.length > 0) });
  },
  "social.posts.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/tweets/${encodeURIComponent(id.value)}`, query: { "tweet.fields": "created_at,author_id,public_metrics" } });
    if (!r.ok) return r;
    return output({ record: normTweet(obj(r.value["data"])) });
  },
  "social.posts.create": async (call, input) => {
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const mediaIds = Array.isArray(input["mediaIds"]) ? (input["mediaIds"] as unknown[]).map(scalarStr).filter((s) => s.length > 0) : [];
    const body = compact({ text: message.value, media: mediaIds.length > 0 ? { media_ids: mediaIds } : undefined });
    const r = await call({ method: "POST", path: "/tweets", jsonBody: body });
    if (!r.ok) return r;
    const d = obj(r.value["data"]);
    return output({ id: scalarStr(d["id"]), status: "published", published: true });
  },
  "social.posts.delete": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "DELETE", path: `/tweets/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ id: id.value, deleted: obj(r.value["data"])["deleted"] !== false });
  },

  "social.comments.reply": async (call, input) => {
    const inReplyTo = reqStr(input, "postId"); if (!inReplyTo.ok) return inReplyTo;
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const body = { text: message.value, reply: { in_reply_to_tweet_id: inReplyTo.value } };
    const r = await call({ method: "POST", path: "/tweets", jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(obj(r.value["data"])["id"]), replied: true });
  },

  "social.media.upload": async (call, input) => {
    // The v2 media handle is initialized here; chunked binary upload is out of scope
    // for the synchronous port (see F4.7 report). Returns the provider media handle.
    const r = await call({ method: "POST", path: "/media/upload/initialize", jsonBody: compact({ media_type: optStr(input, "mediaType", "image/jpeg"), media_category: optStr(input, "mediaCategory") || undefined }) });
    if (!r.ok) return r;
    const d = obj(r.value["data"]);
    return output({ provider: "x", externalId: scalarStr(d["id"]) || scalarStr(d["media_id_string"]), mediaType: optStr(input, "mediaType", "image/jpeg"), status: "initialized" });
  },

  "social.search.read": async (call, input) => {
    const query = reqStr(input, "query"); if (!query.ok) return query;
    const token = optStr(input, "cursor");
    const r = await call({ method: "GET", path: "/tweets/search/recent", query: { query: query.value, max_results: optNum(input, "limit", 25), "tweet.fields": "created_at,author_id", next_token: token || undefined } });
    if (!r.ok) return r;
    const records = arr(r.value["data"]);
    const next = optStr(obj(r.value["meta"]), "next_token");
    const result: SocialSearchResult<Record<string, unknown>> = { results: records.map(normTweet), pagination: pagination(next || null, next.length > 0) };
    return output({ results: result.results, pagination: result.pagination });
  },

  "social.analytics.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/tweets/${encodeURIComponent(id.value)}`, query: { "tweet.fields": "public_metrics" } });
    if (!r.ok) return r;
    return output({ record: normMetrics(id.value, obj(r.value["data"])) });
  },

  "social.health": async (call) => {
    const r = await call({ method: "GET", path: "/users/me", query: { "user.fields": "id" } });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "x", accountExternalId: scalarStr(obj(r.value["data"])["id"]) });
  },
};

/* ---- polling --------------------------------------------------------------- */

/** Poll an author's recent tweets → canonical post events. Cursor = pagination token. */
async function poll(call: SocialCall, conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const id = optStr(conn, "userId");
  if (id.length === 0) return connectorErr("config_invalid", "userId is not configured", "no_user_id");
  const r = await call({ method: "GET", path: `/users/${encodeURIComponent(id)}/tweets`, query: { max_results: Math.max(5, limit), "tweet.fields": "created_at", pagination_token: cursor ?? undefined } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value["data"]).map((o) =>
    socialEvent({ type: SOCIAL_EVENTS.postPublished, externalId: scalarStr(o["id"]), occurredAt: optStr(o, "created_at") || now(), payload: {} }, POLL_PROVENANCE),
  ).filter((e) => e.externalId.length > 0);
  const next = optStr(obj(r.value["meta"]), "next_token");
  return { ok: true, value: { events, nextCursor: next.length > 0 ? next : cursor } };
}

export const X_BINDING: SocialProviderBinding = {
  connectorId: "x",
  oauth: {
    authorizeEndpoint: "https://twitter.com/i/oauth2/authorize",
    tokenEndpoint: "https://api.twitter.com/2/oauth2/token",
    tokenAuthStyle: "basic",
    // PKCE is required by X; the code_challenge is advertised here for completeness.
    // The matching code_verifier is a per-request secret the sync OAuth port does not
    // thread — documented as a known limitation in the F4.7 report.
    extraAuthParams: { code_challenge_method: "plain" },
  },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/users/me",
  ops: OPS,
  poll,
};
