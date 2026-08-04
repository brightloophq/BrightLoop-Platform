/* =============================================================================
 * TikTok provider binding (F4.7). OAuth 2.0 (Bearer) auth against the TikTok API v2
 * (Login Kit + Content Posting + Business). TikTok names its client credential
 * `client_key` (handled via the OAuth descriptor's clientIdParam) and comma-joins
 * scopes. Like Slack, TikTok can return HTTP 200 with a non-`ok` `error.code`, so the
 * classifier inspects the body envelope. Video list/query, content-posting publish, and
 * per-video analytics use the v2 endpoints. TikTok has no body-signed webhook of the
 * shape the synchronous port can verify, so it is polling-only. Provider-neutral
 * in/out; no TikTok shape or secret leaks past this boundary.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult,
} from "@brightloop/domain";
import type { AuthContext, SocialCall, SocialProviderBinding } from "./client.js";
import { classifyHttpStatus, type SocialErrorClass } from "./errors.js";
import { arr, obj, optNum, optStr, output, reqStr, scalarNum, scalarStr, type OpInput } from "./helpers.js";
import {
  compact, pagination,
  type SocialAccount, type SocialAnalytics, type SocialPost, type SocialProfile,
} from "./contracts.js";
import { SOCIAL_EVENTS, socialEvent } from "./normalize.js";

const API = "https://open.tiktokapis.com/v2";
const POLL_PROVENANCE = "tiktok:poll";
const PROFILE_FIELDS = "open_id,union_id,display_name,avatar_url,follower_count,profile_deep_link";
const VIDEO_FIELDS = "id,title,create_time,share_url,like_count,comment_count,share_count,view_count";

/** TikTok authorizes with the resolved OAuth token as a Bearer header. */
function authorize(secret: string | null, _config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  return connectorOk({ baseUrl: API, headers: { authorization: `Bearer ${secret}` } });
}

/**
 * TikTok envelopes every response as `{ data, error: { code, message, log_id } }` and
 * can return a non-`ok` code with HTTP 200 (mirrors Slack). Classify from the body
 * envelope first, then fall back to HTTP status.
 */
function classifyTiktok(status: number, body: Record<string, unknown>): SocialErrorClass | null {
  const err = obj(body["error"]);
  const code = optStr(err, "code");
  if (status >= 200 && status < 300) {
    if (code.length === 0 || code === "ok") return null;
    if (code === "access_token_invalid" || code === "access_token_expired") return { category: "authentication", code, reason: "expired" };
    if (code === "scope_not_authorized" || code === "scope_permission_missed") return { category: "authorization", code, reason: "permission_missing" };
    if (code === "rate_limit_exceeded") return { category: "rate_limited", code, reason: "rate_limited" };
    return { category: "config_invalid", code, reason: "configuration_error" };
  }
  return classifyHttpStatus(status, body);
}

/* ---- normalizers (TikTok object → neutral contract) ------------------------ */

function normVideo(o: Record<string, unknown>): Record<string, unknown> {
  const created = scalarNum(o["create_time"]);
  const p: SocialPost = {
    provider: "tiktok", externalId: scalarStr(o["id"]), status: "published",
    message: optStr(o, "title") || undefined, permalink: optStr(o, "share_url") || undefined, mediaType: "video",
    publishedAt: created !== undefined ? new Date(created * 1000).toISOString() : undefined,
  };
  return compact(p);
}
function normVideoStats(o: Record<string, unknown>): Record<string, unknown> {
  const a: SocialAnalytics = {
    provider: "tiktok", subjectExternalId: scalarStr(o["id"]), scope: "post",
    likes: scalarNum(o["like_count"]), comments: scalarNum(o["comment_count"]), shares: scalarNum(o["share_count"]),
    videoViews: scalarNum(o["view_count"]),
  };
  return compact(a);
}

/* ---- operations ------------------------------------------------------------ */

const OPS: Record<string, (call: SocialCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "social.profile.read": async (call) => {
    const r = await call({ method: "GET", path: "/user/info/", query: { fields: PROFILE_FIELDS } });
    if (!r.ok) return r;
    const o = obj(obj(r.value["data"])["user"]);
    const p: SocialProfile = {
      provider: "tiktok", externalId: scalarStr(o["open_id"]), displayName: optStr(o, "display_name") || scalarStr(o["open_id"]),
      avatarUrl: optStr(o, "avatar_url") || undefined, profileUrl: optStr(o, "profile_deep_link") || undefined,
      followerCount: scalarNum(o["follower_count"]),
    };
    return output(compact(p));
  },

  "social.accounts.list": async (call) => {
    const r = await call({ method: "GET", path: "/user/info/", query: { fields: PROFILE_FIELDS } });
    if (!r.ok) return r;
    const o = obj(obj(r.value["data"])["user"]);
    const a: SocialAccount = {
      provider: "tiktok", externalId: scalarStr(o["open_id"]), displayName: optStr(o, "display_name") || scalarStr(o["open_id"]),
      kind: "business", followerCount: scalarNum(o["follower_count"]),
    };
    return output({ results: [compact(a)], pagination: pagination(null, false) });
  },

  "social.posts.list": async (call, input) => {
    const cursor = scalarNum(input["cursor"]);
    const r = await call({ method: "POST", path: "/video/list/", query: { fields: VIDEO_FIELDS }, jsonBody: compact({ max_count: optNum(input, "limit", 20), cursor: cursor !== undefined ? cursor : undefined }) });
    if (!r.ok) return r;
    const data = obj(r.value["data"]);
    const records = arr(data["videos"]);
    const hasMore = data["has_more"] === true;
    const next = hasMore ? scalarStr(data["cursor"]) : null;
    return output({ results: records.map(normVideo), pagination: pagination(next && next.length > 0 ? next : null, hasMore) });
  },
  "social.posts.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "POST", path: "/video/query/", query: { fields: VIDEO_FIELDS }, jsonBody: { filters: { video_ids: [id.value] } } });
    if (!r.ok) return r;
    const first = arr(obj(r.value["data"])["videos"])[0] ?? {};
    return output({ record: normVideo(first) });
  },
  "social.posts.publish": async (call, input) => {
    const title = optStr(input, "message") || optStr(input, "title");
    const videoUrl = reqStr(input, "videoUrl"); if (!videoUrl.ok) return videoUrl;
    const body = {
      post_info: compact({ title, privacy_level: optStr(input, "privacyLevel", "SELF_ONLY") }),
      source_info: { source: "PULL_FROM_URL", video_url: videoUrl.value },
    };
    const r = await call({ method: "POST", path: "/post/publish/video/init/", jsonBody: body });
    if (!r.ok) return r;
    const d = obj(r.value["data"]);
    return output({ id: scalarStr(d["publish_id"]), status: "published", published: true });
  },

  "social.media.upload": async (call, input) => {
    // Initialize an inbox (draft) upload; the returned publish id + upload url carry the
    // content-posting flow. Binary chunk transfer is out of scope for the sync port.
    const body = { source_info: compact({ source: "PULL_FROM_URL", video_url: optStr(input, "videoUrl") || undefined, video_size: optNum(input, "videoSize", 0) || undefined }) };
    const r = await call({ method: "POST", path: "/post/publish/inbox/video/init/", jsonBody: body });
    if (!r.ok) return r;
    const d = obj(r.value["data"]);
    return output({ provider: "tiktok", externalId: scalarStr(d["publish_id"]), uploadUrl: optStr(d, "upload_url") || undefined, mediaType: "video", status: "initialized" });
  },

  "social.analytics.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "POST", path: "/video/query/", query: { fields: VIDEO_FIELDS }, jsonBody: { filters: { video_ids: [id.value] } } });
    if (!r.ok) return r;
    const first = arr(obj(r.value["data"])["videos"])[0] ?? {};
    return output({ record: normVideoStats(first) });
  },

  "social.health": async (call) => {
    const r = await call({ method: "GET", path: "/user/info/", query: { fields: "open_id" } });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "tiktok", accountExternalId: scalarStr(obj(obj(r.value["data"])["user"])["open_id"]) });
  },
};

/* ---- polling --------------------------------------------------------------- */

/** Poll the account's recent videos → canonical post events. Cursor = TikTok cursor. */
async function poll(call: SocialCall, _conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const cur = cursor === null ? undefined : Number.parseInt(cursor, 10);
  const r = await call({ method: "POST", path: "/video/list/", query: { fields: VIDEO_FIELDS }, jsonBody: compact({ max_count: Math.max(1, limit), cursor: cur !== undefined && Number.isFinite(cur) ? cur : undefined }) });
  if (!r.ok) return r;
  const data = obj(r.value["data"]);
  const events: CanonicalConnectorEvent[] = arr(data["videos"]).map((o) => {
    const created = scalarNum(o["create_time"]);
    return socialEvent({ type: SOCIAL_EVENTS.postPublished, externalId: scalarStr(o["id"]), occurredAt: created !== undefined ? new Date(created * 1000).toISOString() : now(), payload: {} }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const hasMore = data["has_more"] === true;
  const nextCursor = hasMore && scalarStr(data["cursor"]).length > 0 ? scalarStr(data["cursor"]) : cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const TIKTOK_BINDING: SocialProviderBinding = {
  connectorId: "tiktok",
  oauth: {
    authorizeEndpoint: "https://www.tiktok.com/v2/auth/authorize/",
    tokenEndpoint: "https://open.tiktokapis.com/v2/oauth/token/",
    tokenAuthStyle: "body",
    clientIdParam: "client_key",
    scopeSeparator: ",",
  },
  classify: classifyTiktok,
  authorize,
  probePath: "/user/info/?fields=open_id",
  ops: OPS,
  poll,
};
