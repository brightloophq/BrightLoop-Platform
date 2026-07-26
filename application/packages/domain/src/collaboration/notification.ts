/* =============================================================================
 * Notification engine (Phase D · Sprint D7) — PURE, INTERNAL-ONLY.
 *
 * Notifications are GENERATED from events; they are never delivered externally.
 * `generateNotifications` fans a single event out to its recipients (subscribers
 * + mentioned users), builds one notification + one unread inbox item each, and
 * NEVER notifies the actor about their own action. Deterministic; no io.
 * ========================================================================== */

import type { ActivitySubjectType, CollabNotification, InboxItem, NotificationType, TransformationActivityType } from "@brightloop/schema";

/** Map an activity type to the notification bucket, or null if it is not notifiable. */
export function notificationTypeForActivity(activityType: TransformationActivityType): NotificationType | null {
  if (activityType.startsWith("review_")) return "review";
  if (activityType === "task_assigned" || activityType === "task_reassigned") return "assignment";
  if (activityType.startsWith("task_")) return "task";
  if (activityType.startsWith("dependency_")) return "dependency";
  if (activityType.startsWith("timeline_")) return "timeline";
  if (activityType.startsWith("milestone_")) return "timeline";
  if (activityType === "kpi_updated") return "kpi";
  if (activityType === "workspace_health_calculated") return "health";
  if (activityType === "user_mentioned") return "mention";
  return null;
}

export interface GenerateNotificationsInput {
  type: NotificationType;
  workspaceId: string;
  clientId: string | null;
  subjectType: ActivitySubjectType;
  subjectId: string;
  summary: string;
  /** The user who caused the event — never notified about their own action. */
  actorUserId: string;
  /** Candidate recipients (subscribers + mentioned users); de-duped here. */
  recipientUserIds: readonly string[];
  sourceActivityId: string | null;
  now: string;
  /** Deterministic id factory: `(kind, recipientUserId) → id`. */
  idFor: (kind: "notif" | "inbox", recipientUserId: string) => string;
}

export interface GeneratedNotifications {
  notifications: CollabNotification[];
  inboxItems: InboxItem[];
}

/** Fan one event out to one notification + one unread inbox item per recipient. Pure. */
export function generateNotifications(input: GenerateNotificationsInput): GeneratedNotifications {
  const recipients = [...new Set(input.recipientUserIds)].filter((uid) => uid !== input.actorUserId);
  const notifications: CollabNotification[] = [];
  const inboxItems: InboxItem[] = [];
  for (const recipientUserId of recipients) {
    const notificationId = input.idFor("notif", recipientUserId);
    notifications.push({
      id: notificationId,
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      recipientUserId,
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      summary: input.summary.slice(0, 400),
      sourceActivityId: input.sourceActivityId,
      createdAt: input.now,
    });
    inboxItems.push({
      id: input.idFor("inbox", recipientUserId),
      userId: recipientUserId,
      workspaceId: input.workspaceId,
      clientId: input.clientId,
      notificationId,
      status: "unread",
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
  return { notifications, inboxItems };
}
