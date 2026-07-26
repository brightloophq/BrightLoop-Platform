/* =============================================================================
 * Collaboration DTOs (Phase D · Sprint D7) — the outward boundary.
 * ========================================================================== */

import type { CollabNotification, InboxItem, Mention, ReadReceipt, Subscription, TransformationActivity } from "@brightloop/schema";

export interface SubscriptionDTO {
  id: string;
  userId: string;
  targetType: Subscription["targetType"];
  targetId: string;
  createdAt: string;
}
export function toSubscriptionDTO(s: Subscription): SubscriptionDTO {
  return { id: s.id, userId: s.userId, targetType: s.targetType, targetId: s.targetId, createdAt: s.createdAt };
}

export interface MentionDTO {
  id: string;
  subjectType: Mention["subjectType"];
  subjectId: string;
  mentionedUserId: string;
  mentionedByUserId: string;
  note: string | null;
  createdAt: string;
}
export function toMentionDTO(m: Mention): MentionDTO {
  return { id: m.id, subjectType: m.subjectType, subjectId: m.subjectId, mentionedUserId: m.mentionedUserId, mentionedByUserId: m.mentionedByUserId, note: m.note, createdAt: m.createdAt };
}

export interface NotificationDTO {
  id: string;
  type: CollabNotification["type"];
  subjectType: CollabNotification["subjectType"];
  subjectId: string;
  summary: string;
  sourceActivityId: string | null;
  createdAt: string;
}
export function toNotificationDTO(n: CollabNotification): NotificationDTO {
  return { id: n.id, type: n.type, subjectType: n.subjectType, subjectId: n.subjectId, summary: n.summary, sourceActivityId: n.sourceActivityId, createdAt: n.createdAt };
}

/** An inbox row joined with its notification. */
export interface InboxItemDTO {
  id: string;
  status: InboxItem["status"];
  notification: NotificationDTO | null;
  createdAt: string;
  updatedAt: string;
}
export function toInboxItemDTO(item: InboxItem, notification: CollabNotification | null): InboxItemDTO {
  return { id: item.id, status: item.status, notification: notification ? toNotificationDTO(notification) : null, createdAt: item.createdAt, updatedAt: item.updatedAt };
}

export interface FeedItemDTO {
  id: string;
  type: TransformationActivity["type"];
  subjectType: TransformationActivity["subjectType"];
  subjectId: string;
  summary: string;
  actorId: string | null;
  at: string;
}
export function toFeedItemDTO(a: TransformationActivity): FeedItemDTO {
  return { id: a.id, type: a.type, subjectType: a.subjectType, subjectId: a.subjectId, summary: a.summary, actorId: a.actorId ?? null, at: a.at };
}

export interface FeedPageDTO {
  items: FeedItemDTO[];
  nextCursor: string | null;
}

export interface ReadReceiptDTO {
  id: string;
  entityType: ReadReceipt["entityType"];
  entityId: string;
  readAt: string;
}
export function toReadReceiptDTO(r: ReadReceipt): ReadReceiptDTO {
  return { id: r.id, entityType: r.entityType, entityId: r.entityId, readAt: r.readAt };
}

/** Inbox with unread/total counts (read model). */
export interface InboxSummaryDTO {
  items: InboxItemDTO[];
  unread: number;
  total: number;
}

/** Per-user subscription list (read model). */
export interface SubscriptionSummaryDTO {
  subscriptions: SubscriptionDTO[];
  count: number;
}

/** Notification counts by bucket (read model). */
export interface NotificationSummaryDTO {
  unread: number;
  total: number;
  byType: Record<string, number>;
}
