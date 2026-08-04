/* =============================================================================
 * Social connectors — provider-neutral data contracts (F4.7). PURE.
 *
 * The normalized social value objects every provider maps INTO. Provider-specific
 * field names, ids, and payload shapes are read inside each binding and collapsed onto
 * these bounded, neutral shapes; nothing Meta/LinkedIn/X/TikTok-shaped ever leaves the
 * adapter layer. Common identifiers carry `provider` + `externalId` (the
 * installation/workspace ids are attached by the application layer). Additional safe
 * provider fields survive ONLY inside a bounded `metadata` object.
 *
 * Factories here just assemble the neutral object from already-extracted fields — they
 * perform no provider parsing (that stays in the binding). Undefined fields are dropped
 * so a normalized record never carries empty provider noise.
 * ========================================================================== */

export type SocialProvider = "meta" | "linkedin" | "x" | "tiktok";

/** Cursor-based pagination, normalized across offset/page/next-link providers. */
export interface SocialPagination { nextCursor: string | null; hasMore: boolean }

/** The authenticated user/profile behind the connection. */
export interface SocialProfile {
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  username?: string;
  profileUrl?: string;
  avatarUrl?: string;
  followerCount?: number;
  metadata?: Record<string, unknown>;
}

/** A managed account/handle a post can be published as (IG business, X user, TikTok business). */
export interface SocialAccount {
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  username?: string;
  kind?: string;
  followerCount?: number;
  metadata?: Record<string, unknown>;
}

/** A publishable surface owned by the connection (Facebook Page, LinkedIn Organization). */
export interface SocialPage {
  provider: SocialProvider;
  externalId: string;
  displayName: string;
  category?: string;
  url?: string;
  followerCount?: number;
  metadata?: Record<string, unknown>;
}

/** A post/tweet/share/video. `status` is the normalized draft/scheduled/published lifecycle. */
export interface SocialPost {
  provider: SocialProvider;
  externalId: string;
  authorExternalId?: string;
  status: "draft" | "scheduled" | "published";
  message?: string;
  permalink?: string;
  mediaType?: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SocialComment {
  provider: SocialProvider;
  externalId: string;
  postExternalId?: string;
  parentExternalId?: string;
  authorExternalId?: string;
  authorName?: string;
  message?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

/** A normalized media handle. Binary bytes are NEVER carried — only a provider handle/url. */
export interface SocialMedia {
  provider: SocialProvider;
  externalId: string;
  mediaType?: string;
  url?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

/** A normalized analytics/insights row for a post or account. */
export interface SocialAnalytics {
  provider: SocialProvider;
  subjectExternalId: string;
  scope: "post" | "account";
  impressions?: number;
  reach?: number;
  engagements?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  videoViews?: number;
  periodStart?: string;
  periodEnd?: string;
  metadata?: Record<string, unknown>;
}

export interface SocialHealth {
  healthy: boolean;
  provider: SocialProvider;
  accountExternalId?: string;
}

/** A normalized paginated result set for any list operation. */
export interface SocialSearchResult<T> { results: T[]; pagination: SocialPagination }

/** Strip undefined values so a normalized record carries no empty provider noise. */
export function compact<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) if (v !== undefined) out[k] = v;
  return out;
}

/** Assemble a normalized pagination envelope. */
export function pagination(nextCursor: string | null, hasMore: boolean): SocialPagination {
  return { nextCursor, hasMore };
}
