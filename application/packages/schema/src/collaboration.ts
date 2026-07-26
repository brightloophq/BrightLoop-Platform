/* =============================================================================
 * Collaboration (Phase D · Sprint D7) — schema contracts.
 *
 * Operational awareness inside Auxion: subscriptions, mentions, internal-only
 * notifications, a per-user inbox, and generic read receipts. Notifications are
 * generated FROM events; they are never delivered externally. Additive — this
 * file introduces new aggregates and reuses the activity subject taxonomy.
 * ========================================================================== */

import { z } from "zod";
import { activitySubjectTypeSchema } from "./transformation-execution.js";

/* ---- subscriptions --------------------------------------------------------- */

/** What an internal user can watch. A subset of the activity subject taxonomy. */
export const subscriptionTargetTypeSchema = z.enum(["workspace", "initiative", "task", "review", "timeline", "kpi"]);
export type SubscriptionTargetType = z.infer<typeof subscriptionTargetTypeSchema>;

export const subscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  targetType: subscriptionTargetTypeSchema,
  targetId: z.string(),
  createdAt: z.string(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

/* ---- mentions -------------------------------------------------------------- */

export const mentionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  subjectType: activitySubjectTypeSchema,
  subjectId: z.string(),
  mentionedUserId: z.string(),
  mentionedByUserId: z.string(),
  note: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type Mention = z.infer<typeof mentionSchema>;

/* ---- notifications (internal only) ----------------------------------------- */

export const notificationTypeSchema = z.enum(["mention", "assignment", "review", "task", "dependency", "timeline", "kpi", "health"]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** Renamed `Collab*` to avoid colliding with the product-wide `Notification`
 * entity in `entities.ts`; this is the collaboration bounded-context notification. */
export const collabNotificationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  recipientUserId: z.string(),
  type: notificationTypeSchema,
  subjectType: activitySubjectTypeSchema,
  subjectId: z.string(),
  summary: z.string(),
  sourceActivityId: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type CollabNotification = z.infer<typeof collabNotificationSchema>;

/* ---- inbox ----------------------------------------------------------------- */

export const inboxStatusSchema = z.enum(["unread", "read", "archived", "dismissed"]);
export type InboxStatus = z.infer<typeof inboxStatusSchema>;

export const inboxItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable().default(null),
  notificationId: z.string(),
  status: inboxStatusSchema,
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

/* ---- read receipts --------------------------------------------------------- */

export const readReceiptEntityTypeSchema = z.enum(["activity", "mention", "notification"]);
export type ReadReceiptEntityType = z.infer<typeof readReceiptEntityTypeSchema>;

export const readReceiptSchema = z.object({
  id: z.string(),
  userId: z.string(),
  entityType: readReceiptEntityTypeSchema,
  entityId: z.string(),
  readAt: z.string(),
});
export type ReadReceipt = z.infer<typeof readReceiptSchema>;
