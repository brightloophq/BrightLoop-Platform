/* =============================================================================
 * Social connectors — canonical Auxion social event vocabulary (F4.7). PURE.
 *
 * Provider event/webhook shapes (Meta `entry[].changes[]`, and polled post/comment
 * deltas from LinkedIn / X / TikTok) are translated into THESE normalized types
 * inside the adapters and NEVER leak outward. Every social connector emits the same
 * vocabulary, so the Execution Runtime / Copilot / Audit see one provider-neutral
 * social event model.
 *
 * Examples (provider shapes stay inside adapters):
 *   Facebook post published    → social.post.published
 *   Instagram comment created  → social.comment.created
 *   LinkedIn organization post → social.post.created
 * ========================================================================== */

import type { CanonicalConnectorEvent } from "@brightloop/domain";

/** The canonical, provider-neutral social event types. */
export const SOCIAL_EVENTS = {
  postCreated: "social.post.created",
  postPublished: "social.post.published",
  postUpdated: "social.post.updated",
  postDeleted: "social.post.deleted",
  commentCreated: "social.comment.created",
  commentReplied: "social.comment.replied",
  mentionReceived: "social.mention.received",
  reactionReceived: "social.reaction.received",
  /** A recognized provider event with no more specific canonical mapping. */
  eventReceived: "social.event.received",
} as const;

export type SocialEventType = (typeof SOCIAL_EVENTS)[keyof typeof SOCIAL_EVENTS];

export interface NormalizedSocialEvent {
  type: SocialEventType;
  externalId: string;
  occurredAt: string;
  /** Bounded, provider-neutral payload — never raw provider body or secrets. */
  payload: Record<string, unknown>;
}

/** Build a canonical connector event from a normalized social event. */
export function socialEvent(e: NormalizedSocialEvent, provenance: string): CanonicalConnectorEvent {
  return { type: e.type, externalId: e.externalId, occurredAt: e.occurredAt, payload: e.payload, provenance };
}

/** Map a normalized entity kind + action onto a canonical social event type. */
export function eventTypeFor(
  entity: "post" | "comment" | "mention" | "reaction",
  action: "created" | "published" | "updated" | "deleted" | "replied",
): SocialEventType {
  if (entity === "post") {
    if (action === "published") return SOCIAL_EVENTS.postPublished;
    if (action === "updated") return SOCIAL_EVENTS.postUpdated;
    if (action === "deleted") return SOCIAL_EVENTS.postDeleted;
    return SOCIAL_EVENTS.postCreated;
  }
  if (entity === "comment") return action === "replied" ? SOCIAL_EVENTS.commentReplied : SOCIAL_EVENTS.commentCreated;
  if (entity === "mention") return SOCIAL_EVENTS.mentionReceived;
  if (entity === "reaction") return SOCIAL_EVENTS.reactionReceived;
  return SOCIAL_EVENTS.eventReceived;
}
