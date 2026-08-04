/* =============================================================================
 * LinkedIn provider binding (F4.7). OAuth 2.0 (Bearer) auth against the LinkedIn REST
 * API. Every call carries the `LinkedIn-Version` + `X-Restli-Protocol-Version` headers.
 * Organizations are discovered from the member's ACLs; posts, comments, media, and
 * organization share statistics use the versioned `/rest` endpoints with URNs. A
 * default `organizationId` (URN) may be carried as install config. LinkedIn has no
 * body-signed webhook of the shape the synchronous port can verify, so it is
 * polling-only. Provider-neutral in/out; no LinkedIn shape or secret leaks past this
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
  type SocialAccount, type SocialAnalytics, type SocialComment, type SocialPost, type SocialProfile,
} from "./contracts.js";
import { SOCIAL_EVENTS, socialEvent } from "./normalize.js";

const API = "https://api.linkedin.com";
const DEFAULT_VERSION = "202401";
const POLL_PROVENANCE = "linkedin:poll";

/** LinkedIn authorizes with the resolved OAuth token + fixed protocol/version headers. */
function authorize(secret: string | null, config: OpInput): ConnectorResult<AuthContext> {
  if (secret === null || secret.length === 0) return connectorErr("secret_unavailable", "no access token", "no_token");
  return connectorOk({
    baseUrl: API,
    headers: {
      authorization: `Bearer ${secret}`,
      "linkedin-version": optStr(config, "apiVersion", DEFAULT_VERSION),
      "x-restli-protocol-version": "2.0.0",
    },
  });
}

/** Resolve the target organization URN from op input, falling back to install config. */
function orgUrn(input: OpInput, conn: OpInput): string {
  return optStr(input, "organizationId") || optStr(conn, "organizationId");
}

/* ---- normalizers (LinkedIn object → neutral contract) ---------------------- */

function normOrg(o: Record<string, unknown>): Record<string, unknown> {
  const urn = scalarStr(o["organizationalTarget"]) || scalarStr(o["organization"]) || scalarStr(o["id"]);
  const a: SocialAccount = {
    provider: "linkedin", externalId: urn, displayName: optStr(o, "localizedName") || urn,
    username: optStr(o, "vanityName") || undefined, kind: "organization",
  };
  return compact(a);
}
function postStatus(o: Record<string, unknown>): SocialPost["status"] {
  const s = optStr(o, "lifecycleState").toUpperCase();
  if (s === "DRAFT") return "draft";
  return "published";
}
function epochToIso(v: unknown): string | undefined {
  const ms = scalarNum(v);
  return ms !== undefined ? new Date(ms).toISOString() : undefined;
}
function normPost(o: Record<string, unknown>): Record<string, unknown> {
  const p: SocialPost = {
    provider: "linkedin", externalId: scalarStr(o["id"]), authorExternalId: scalarStr(o["author"]) || undefined,
    status: postStatus(o), message: optStr(o, "commentary") || undefined,
    createdAt: epochToIso(o["createdAt"]),
  };
  return compact(p);
}
function normComment(o: Record<string, unknown>): Record<string, unknown> {
  const msg = obj(o["message"]);
  const c: SocialComment = {
    provider: "linkedin", externalId: scalarStr(o["id"]) || scalarStr(o["$URN"]), authorExternalId: scalarStr(o["actor"]) || undefined,
    message: optStr(msg, "text") || optStr(o, "text") || undefined, parentExternalId: scalarStr(o["parentComment"]) || undefined,
    createdAt: epochToIso(o["created"]),
  };
  return compact(c);
}
function normStats(urn: string, o: Record<string, unknown>): Record<string, unknown> {
  const share = obj(o["totalShareStatistics"]);
  const a: SocialAnalytics = {
    provider: "linkedin", subjectExternalId: urn, scope: "account",
    impressions: scalarNum(share["impressionCount"]), engagements: scalarNum(share["engagement"]),
    likes: scalarNum(share["likeCount"]), comments: scalarNum(share["commentCount"]), shares: scalarNum(share["shareCount"]),
    clicks: scalarNum(share["clickCount"]),
  };
  return compact(a);
}

/* ---- operations ------------------------------------------------------------ */

const OPS: Record<string, (call: SocialCall, input: OpInput, conn: OpInput) => Promise<ConnectorResult<OperationOutput>>> = {
  "social.profile.read": async (call) => {
    const r = await call({ method: "GET", path: "/v2/userinfo" });
    if (!r.ok) return r;
    const o = r.value;
    const p: SocialProfile = {
      provider: "linkedin", externalId: scalarStr(o["sub"]), displayName: optStr(o, "name") || scalarStr(o["sub"]),
      username: optStr(o, "email") || undefined, avatarUrl: optStr(o, "picture") || undefined,
    };
    return output(compact(p));
  },

  "social.accounts.list": async (call) => {
    const r = await call({ method: "GET", path: "/v2/organizationAcls", query: { q: "roleAssignee", role: "ADMINISTRATOR", projection: "(elements*(organizationalTarget,role))" } });
    if (!r.ok) return r;
    const records = arr(r.value["elements"]);
    return output({ results: records.map(normOrg), pagination: pagination(null, false) });
  },

  "social.posts.list": async (call, input, conn) => {
    const urn = orgUrn(input, conn); if (urn.length === 0) return missing("organizationId");
    const start = Number.parseInt(optStr(input, "cursor"), 10);
    const startIndex = Number.isFinite(start) && start > 0 ? start : 0;
    const count = optNum(input, "limit", 25);
    const r = await call({ method: "GET", path: "/rest/posts", query: { q: "author", author: urn, count, start: startIndex } });
    if (!r.ok) return r;
    const records = arr(r.value["elements"]);
    const nextCursor = records.length >= count ? String(startIndex + records.length) : null;
    return output({ results: records.map(normPost), pagination: pagination(nextCursor, nextCursor !== null) });
  },
  "social.posts.read": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "GET", path: `/rest/posts/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ record: normPost(r.value) });
  },
  "social.posts.create": async (call, input, conn) => {
    const urn = orgUrn(input, conn); if (urn.length === 0) return missing("organizationId");
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const body = compact({
      author: urn, commentary: message.value, visibility: optStr(input, "visibility", "PUBLIC"),
      lifecycleState: "PUBLISHED",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: optStr(input, "mediaId").length > 0 ? { media: { id: optStr(input, "mediaId") } } : undefined,
    });
    const r = await call({ method: "POST", path: "/rest/posts", jsonBody: body });
    if (!r.ok) return r;
    const id = optStr(r.value, "id") || scalarStr(obj(r.value["headers"])["x-restli-id"]);
    return output({ id, status: "published", published: true });
  },
  "social.posts.delete": async (call, input) => {
    const id = reqStr(input, "id"); if (!id.ok) return id;
    const r = await call({ method: "DELETE", path: `/rest/posts/${encodeURIComponent(id.value)}` });
    if (!r.ok) return r;
    return output({ id: id.value, deleted: true });
  },

  "social.comments.list": async (call, input) => {
    const postId = reqStr(input, "postId"); if (!postId.ok) return postId;
    const r = await call({ method: "GET", path: `/rest/socialActions/${encodeURIComponent(postId.value)}/comments`, query: { count: optNum(input, "limit", 25) } });
    if (!r.ok) return r;
    const records = arr(r.value["elements"]).map((o) => ({ ...normComment(o), postExternalId: postId.value }));
    return output({ results: records, pagination: pagination(null, false) });
  },
  "social.comments.reply": async (call, input) => {
    const postId = reqStr(input, "postId"); if (!postId.ok) return postId;
    const actor = optStr(input, "actor") || optStr(input, "organizationId");
    const message = reqStr(input, "message"); if (!message.ok) return message;
    const body = compact({ actor: actor || undefined, message: { text: message.value }, parentComment: optStr(input, "commentId") || undefined });
    const r = await call({ method: "POST", path: `/rest/socialActions/${encodeURIComponent(postId.value)}/comments`, jsonBody: body });
    if (!r.ok) return r;
    return output({ id: scalarStr(r.value["id"]) || scalarStr(r.value["$URN"]), replied: true });
  },

  "social.media.upload": async (call, input, conn) => {
    const urn = orgUrn(input, conn); if (urn.length === 0) return missing("organizationId");
    // Initialize an image upload; the returned image URN is attachable to a later post.
    const r = await call({ method: "POST", path: "/rest/images?action=initializeUpload", jsonBody: { initializeUploadRequest: { owner: urn } } });
    if (!r.ok) return r;
    const value = obj(r.value["value"]);
    return output({ provider: "linkedin", externalId: scalarStr(value["image"]), uploadUrl: optStr(value, "uploadUrl") || undefined, mediaType: "image", status: "initialized" });
  },

  "social.analytics.read": async (call, input, conn) => {
    const urn = orgUrn(input, conn); if (urn.length === 0) return missing("organizationId");
    const r = await call({ method: "GET", path: "/rest/organizationalEntityShareStatistics", query: { q: "organizationalEntity", organizationalEntity: urn } });
    if (!r.ok) return r;
    const first = arr(r.value["elements"])[0] ?? {};
    return output({ record: normStats(urn, first) });
  },

  "social.health": async (call) => {
    const r = await call({ method: "GET", path: "/v2/userinfo" });
    if (!r.ok) return r;
    return output({ healthy: true, provider: "linkedin", accountExternalId: scalarStr(r.value["sub"]) });
  },
};

/* ---- polling --------------------------------------------------------------- */

/** Poll an organization's recent posts → canonical post events. Cursor = start index. */
async function poll(call: SocialCall, conn: OpInput, cursor: string | null, limit: number, now: () => string): Promise<ConnectorResult<PollResult>> {
  const urn = optStr(conn, "organizationId");
  if (urn.length === 0) return connectorErr("config_invalid", "organizationId is not configured", "no_org_id");
  const start = cursor === null ? 0 : Number.parseInt(cursor, 10) || 0;
  const count = Math.max(1, limit);
  const r = await call({ method: "GET", path: "/rest/posts", query: { q: "author", author: urn, count, start } });
  if (!r.ok) return r;
  const records = arr(r.value["elements"]);
  const events: CanonicalConnectorEvent[] = records.map((o) =>
    socialEvent({ type: SOCIAL_EVENTS.postCreated, externalId: scalarStr(o["id"]), occurredAt: now(), payload: {} }, POLL_PROVENANCE),
  ).filter((e) => e.externalId.length > 0);
  const nextCursor = records.length >= count ? String(start + records.length) : cursor;
  return { ok: true, value: { events, nextCursor } };
}

export const LINKEDIN_BINDING: SocialProviderBinding = {
  connectorId: "linkedin",
  oauth: {
    authorizeEndpoint: "https://www.linkedin.com/oauth/v2/authorization",
    tokenEndpoint: "https://www.linkedin.com/oauth/v2/accessToken",
    tokenAuthStyle: "body",
  },
  classify: (status, body) => classifyHttpStatus(status, body),
  authorize,
  probePath: "/v2/userinfo",
  ops: OPS,
  poll,
};
