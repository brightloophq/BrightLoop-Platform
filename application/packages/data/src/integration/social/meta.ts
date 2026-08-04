/* =============================================================================
 * Meta provider binding (F4.7). OAuth 2.0 (Bearer) auth against the Facebook Graph
 * API, covering Facebook Pages + Instagram Business accounts. Page/account/post ids
 * are supplied as operation input (a default `pageId` / `instagramBusinessId` may be
 * carried as install config). Webhooks are verified by the `X-Hub-Signature-256`
 * HMAC-SHA256 (hex) scheme and translated from `entry[].changes[]` (field + verb) into
 * canonical social.* events. Provider-neutral in/out; no Meta shape or secret leaks
 * past this boundary. Meta is the only social provider with a body-signed webhook the
 * synchronous port can verify offline.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorResult, type OperationOutput, type PollResult, type VerifiedWebhook,
} from "@brightloop/domain";
import type { AuthContext, SocialCall, SocialProviderBinding } from "./client.js";
import { classifyHttpStatus } from "./errors.js";
import { arr, missing, obj, optNum, optStr, output, reqStr, scalarNum, scalarStr, type OpInput } from "./helpers.js";
import {
  compact, pagination,
  type SocialAccount, type SocialAnalytics, type SocialComment, type SocialPage, type SocialPost, type SocialProfile,
} from "./contracts.js";
import { SOCIAL_EVENTS, socialEvent, type SocialEventType, type NormalizedSocialEvent } from "./normalize.js";
import { verifyHmacSha256Hex } from "./webhook.js";

const DEFAULT_VERSION = "v21.0";
const PROVENANCE = "meta:webhook";
const POLL_PROVENANCE = "meta:poll";

function apiBase(config: OpInput): string {
  const v = optStr(config, "apiVersion", DEFAULT_VERSION);
  return `https://graph.facebook.com/${v}`;
}

/** Meta authorizes with the resolved OAuth token as a Bearer header. */
function authorize(secret: string | null, config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  return connectorOk({ baseUrl: apiBase(config), headers: { authorization: `Bearer ${secret}` } });
}

/** Resolve the target Page id from op input, falling back to install config. */
function pageId(input: OpInput, conn: OpInput): string {
  return optStr(input, "pageId") || optStr(conn, "pageId");
}

/* ---- normalizers (Meta object → neutral contract) -------------------------- */

function normPage(o: Record<string, unknown>): Record<string, unknown> {
  const p: SocialPage = {
    provider: "meta", externalId: scalarStr(o["id"]), displayName: optStr(o, "name") || scalarStr(o["id"]),
    category: optStr(o, "category") || undefined, url: optStr(o, "link") || undefined, followerCount: scalarNum(o["followers_count"]),
  };
  return compact(p);
}
function normIgAccount(o: Record<string, unknown>): Record<string, unknown> {
  const ig = obj(o["instagram_business_account"]);
  const a: SocialAccount = {
    provider: "meta", externalId: scalarStr(ig["id"]), displayName: optStr(ig, "username") || optStr(o, "name") || scalarStr(ig["id"]),
    username: optStr(ig, "username") || undefined, kind: "instagram_business", followerCount: scalarNum(ig["followers_count"]),
  };
  return compact(a);
}
function postStatus(o: Record<string, unknown>): SocialPost["status"] {
  if (o["is_published"] === false) return "draft";
  if (scalarStr(o["scheduled_publish_time"]).length > 0) return "scheduled";
  return "published";
}
function normPost(o: Record<string, unknown>): Record<string, unknown> {
  const p: SocialPost = {
    provider: "meta", externalId: scalarStr(o["id"]), authorExternalId: scalarStr(obj(o["from"])["id"]) || undefined,
    status: postStatus(o), message: optStr(o, "message") || optStr(o, "caption") || undefined,
    permalink: optStr(o, "permalink_url") || undefined, createdAt: optStr(o, "created_time") || undefined,
    updatedAt: optStr(o, "updated_time") || undefined,
  };
  return compact(p);
}
function normComment(o: Record<string, unknown>): Record<string, unknown> {
  const c: SocialComment = {
    provider: "meta", externalId: scalarStr(o["id"]), authorExternalId: scalarStr(obj(o["from"])["id"]) || undefined,
    authorName: optStr(obj(o["from"]), "name") || undefined, message: optStr(o, "message") || undefined,
    parentExternalId: scalarStr(obj(o["parent"])["id"]) || undefined, createdAt: optStr(o, "created_time") || undefined,
  };
  return compact(c);
}
function normInsights(subjectId: string, values: Record<string, unknown>[]): Record<string, unknown> {
  const byName: Record<string, number> = {};
  for (const v of values) {
    const name = optStr(v, "name");
    const points = arr(v["values"]);
    const val = points.length > 0 ? scalarNum(points[0]!["value"]) : undefined;
    if (name.length > 0 && val !== undefined) byName[name] = val;
  }
  const a: SocialAnalytics = {
    provider: "meta", subjectExternalId: subjectId, scope: "post",
    impressions: byName["post_impressions"] ?? byName["impressions"], reach: byName["post_impressions_unique"] ?? byName["reach"],
    engagements: byName["post_engaged_users"] ?? byName["engagement"], likes: byName["post_reactions_like_total"] ?? byName["likes"],
    comments: byName["comments"], shares: byName["shares"], videoViews: byName["post_video_views"] ?? byName["video_views"],
  };
  return compact(a);
}

/* ---- operations ------------------------------------------------------------ */

function nextAfter(body: Record<string, unknown>): string | null {
  const cursors = obj(obj(body["paging"])["cursors"]);
  const after = optStr(cursors, "after");
  return after.length > 0 && optStr(obj(body["paging"]), "next").length > 0 ? after : null;
}

const OPS: Record<string, (call: SocialCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "social.profile.read": async (call) => {
    const r = await call({ method: "GET", path: "/me", query: { fields: "id,name,link" } });
    if (!r.ok) return r;
    const o = r.value;
    const p: SocialProfile = { provider: "meta", externalId: scalarStr(o["id"]), displayName: optStr(o, "name") || scalarStr(o["id"]), profileUrl: optStr(o, "link") || undefined };
    return output(compact(p));
  },

  "social.pages.list": async (call) => {
    const r = await call({ method: "GET", path: "/me/accounts", query: { fields: "id,name,category,link,followers_count" } });
    if (!r.ok) return r;
    const records = arr(r.value["data"]);
    const cursor = nextAfter(r.value);
    return output({ results: records.map(normPage), pagination: pagination(cursor, cursor !== null) });
  },

  "social.accounts.list": async (call) => {
    const r = await call({ method: "GET", path: "/me/accounts", query: { fields: "id,name,instagram_business_account{id,username,followers_count}" } });
    if (!r.ok) return r;
    const records = arr(r.value["data"]).filter((o) => scalarStr(obj(o["instagram_business_account"])["id"]).length > 0);
    return output({ results: records.map(normIgAccount), pagination: pagination(null, false) });
  },

  "social.posts.list": async (call, input, conn) => {
    const id = pageId(input, conn); if (id.length === 0) return missing("pageId");
    const after = optStr(input, "cursor");
    const r = await call({ method: "GET", path: `/${encodeURIComponent(id)}/feed`, query: { fields: "id,message,created_time,updated_time,permalink_url,from,is_published", limit: optNum(input, "limit", 25), after: after || undefined } });
    if (!r.ok) return r;
    const records = arr(r.value["data"]);
    const cursor = nextAfter(r.value);
    return output({ results: records.map(normPost), pagination: pagination(cursor, cursor !== null) });
  },
  "social.posts.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/${encodeURIComponent(id.value)}`, query: { fields: "id,message,caption,created_time,updated_time,permalink_url,from,is_published,scheduled_publish_time" } });
    if (!r.ok) return r;
    return output({ record: normPost(r.value) });
  },
  "social.posts.create": async (call, input, conn) => {
    const id = pageId(input, conn); if (id.length === 0) return missing("pageId");
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const body = compact({ message: message.value, link: optStr(input, "link") || undefined, published: true });
    const r = await call({ method: "POST", path: `/${encodeURIComponent(id)}/feed`, jsonBody: body });
    if (!r.ok) return r;
    return output({ record: normPost({ ...r.value, message: message.value, is_published: true }) });
  },
  "social.posts.publish": async (call, input, conn) => {
    const id = pageId(input, conn); if (id.length === 0) return missing("pageId");
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const scheduledAt = optNum(input, "scheduledPublishTime", NaN);
    const scheduled = Number.isFinite(scheduledAt);
    const body = compact({ message: message.value, published: !scheduled, scheduled_publish_time: scheduled ? scheduledAt : undefined, attached_media: undefined, object_attachment: optStr(input, "mediaId") || undefined });
    const r = await call({ method: "POST", path: `/${encodeURIComponent(id)}/feed`, jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), status: scheduled ? "scheduled" : "published", published: !scheduled });
  },
  "social.posts.delete": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "DELETE", path: `/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ id: id.value, deleted: r.value["success"] !== false });
  },

  "social.comments.list": async (call, input) => {
    const postId = reqStr(input, "postId"); if (!postId.ok) return postId;
    const after = optStr(input, "cursor");
    const r = await call({ method: "GET", path: `/${encodeURIComponent(postId.value)}/comments`, query: { fields: "id,message,created_time,from,parent", limit: optNum(input, "limit", 25), after: after || undefined } });
    if (!r.ok) return r;
    const records = arr(r.value["data"]).map((o) => ({ ...normComment(o), postExternalId: postId.value }));
    const cursor = nextAfter(r.value);
    return output({ results: records, pagination: pagination(cursor, cursor !== null) });
  },
  "social.comments.reply": async (call, input) => {
    const target = optStr(input, "commentId") || optStr(input, "postId");
    if (target.length === 0) return missing("commentId");
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const r = await call({ method: "POST", path: `/${encodeURIComponent(target)}/comments`, jsonBody: { message: message.value } });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]), replied: true });
  },

  "social.media.upload": async (call, input, conn) => {
    const id = pageId(input, conn); if (id.length === 0) return missing("pageId");
    const url = reqStr(input, "url"); if (!url.ok) return url;
    // Upload unpublished so the returned media id can be attached to a later post.
    const r = await call({ method: "POST", path: `/${encodeURIComponent(id)}/photos`, jsonBody: compact({ url: url.value, published: false, caption: optStr(input, "caption") || undefined }) });
    if (!r.ok) return r;
    return output({ provider: "meta", externalId: scalarStr(r.value["id"]), mediaType: "photo", status: "uploaded" });
  },

  "social.insights.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const metric = optStr(input, "metric", "post_impressions,post_engaged_users,post_reactions_like_total");
    const r = await call({ method: "GET", path: `/${encodeURIComponent(id.value)}/insights`, query: { metric } });
    if (!r.ok) return r;
    return output({ record: normInsights(id.value, arr(r.value["data"])) });
  },

  "social.health": async (call) => {
    const r = await call({ method: "GET", path: "/me", query: { fields: "id" } });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "meta", accountExternalId: scalarStr(r.value["id"]) });
  },
};

/* ---- webhook verification + translation ---------------------------------- */

function firstChange(rawBody: string): { field: string; verb: string; id: string } | null {
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    for (const entry of arr(body["entry"])) {
      for (const ch of arr(entry["changes"])) {
        const value = obj(ch["value"]);
        const id = scalarStr(value["post_id"]) || scalarStr(value["comment_id"]) || scalarStr(value["media_id"]) || scalarStr(entry["id"]);
        return { field: optStr(ch, "field"), verb: optStr(value, "verb"), id };
      }
    }
  } catch { return null; }
  return null;
}

function verify(rawBody: string, signature: string | null, signingSecret: string | null): ConnectorResult<VerifiedWebhook> {
  const valid = verifyHmacSha256Hex(rawBody, signature, signingSecret);
  const first = firstChange(rawBody);
  const externalId = first !== null && first.id.length > 0 ? `${first.field}-${first.id}-${first.verb || "update"}` : "unknown";
  return connectorOk({ valid, externalEventId: externalId });
}

/** Map a Meta change `field` + `verb` to a canonical social event type. */
export function mapMetaChange(field: string, verb: string): SocialEventType {
  const f = field.toLowerCase(); const v = verb.toLowerCase();
  if (f === "feed" || f === "statuses") {
    if (v === "add") return SOCIAL_EVENTS.postPublished;
    if (v === "edited") return SOCIAL_EVENTS.postUpdated;
    if (v === "remove") return SOCIAL_EVENTS.postDeleted;
  }
  if (f === "comments") return SOCIAL_EVENTS.commentCreated;
  if (f === "mention" || f === "mentions") return SOCIAL_EVENTS.mentionReceived;
  return SOCIAL_EVENTS.eventReceived;
}

function translate(rawBody: string, now: () => string): ConnectorResult<CanonicalConnectorEvent[]> {
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { return connectorErr("validation", "invalid webhook body", "bad_json"); }
  const events: CanonicalConnectorEvent[] = [];
  for (const entry of arr(body["entry"])) {
    const stampMs = scalarNum(entry["time"]);
    const stamp = stampMs !== undefined ? new Date(stampMs * 1000).toISOString() : now();
    for (const ch of arr(entry["changes"])) {
      const field = optStr(ch, "field");
      const value = obj(ch["value"]);
      const verb = optStr(value, "verb");
      const id = scalarStr(value["post_id"]) || scalarStr(value["comment_id"]) || scalarStr(value["media_id"]) || scalarStr(entry["id"]);
      if (field.length === 0 || id.length === 0) continue;
      const ev: NormalizedSocialEvent = { type: mapMetaChange(field, verb), externalId: id, occurredAt: stamp, payload: { field, verb: verb || undefined } };
      events.push(socialEvent(ev, PROVENANCE));
    }
  }
  return connectorOk(events);
}

/** Poll a Page feed → canonical post events. Cursor = Graph API `after` token. */
async function poll(call: SocialCall, conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const id = optStr(conn, "pageId");
  if (id.length === 0) return connectorErr("config_invalid", "pageId is not configured", "no_page_id");
  const r = await call({ method: "GET", path: `/${encodeURIComponent(id)}/feed`, query: { fields: "id,message,created_time,is_published", limit: Math.max(1, limit), after: cursor ?? undefined } });
  if (!r.ok) return r;
  const events: CanonicalConnectorEvent[] = arr(r.value["data"]).map((o) => {
    const type = postStatus(o) === "published" ? SOCIAL_EVENTS.postPublished : SOCIAL_EVENTS.postCreated;
    return socialEvent({ type, externalId: scalarStr(o["id"]), occurredAt: optStr(o, "created_time") || now(), payload: {} }, POLL_PROVENANCE);
  }).filter((e) => e.externalId.length > 0);
  const nextCursor = nextAfter(r.value) ?? cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const META_BINDING: SocialProviderBinding = {
  connectorId: "meta",
  oauth: {
    authorizeEndpoint: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenEndpoint: "https://graph.facebook.com/v21.0/oauth/access_token",
    tokenAuthStyle: "body",
    scopeSeparator: ",",
  },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/me?fields=id",
  ops: OPS,
  poll,
  webhook: { verify, translate },
};
