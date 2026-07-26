/* =============================================================================
 * Collaboration — row ↔ domain mappers (Phase D · Sprint D7).
 *
 * The type-safe boundary between snake_case DB rows and the camelCase
 * collaboration schemas. Row shapes are exercised by the live pgTAP + integration
 * suites; adapters cast through an untyped client, so these mappers are the seam.
 * ========================================================================== */

import type { CollabNotification, InboxItem, Mention, ReadReceipt, Subscription } from "@brightloop/schema";

export function subscriptionRow(s: Subscription): Record<string, unknown> {
  return { id: s.id, user_id: s.userId, workspace_id: s.workspaceId, client_id: s.clientId, target_type: s.targetType, target_id: s.targetId, created_at: s.createdAt };
}
export function toSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: String(row["id"]), userId: String(row["user_id"]), workspaceId: String(row["workspace_id"]),
    clientId: (row["client_id"] as string | null) ?? null, targetType: row["target_type"] as Subscription["targetType"],
    targetId: String(row["target_id"]), createdAt: String(row["created_at"]),
  };
}

export function mentionRow(m: Mention): Record<string, unknown> {
  return { id: m.id, workspace_id: m.workspaceId, client_id: m.clientId, subject_type: m.subjectType, subject_id: m.subjectId, mentioned_user_id: m.mentionedUserId, mentioned_by_user_id: m.mentionedByUserId, note: m.note, created_at: m.createdAt };
}
export function toMention(row: Record<string, unknown>): Mention {
  return {
    id: String(row["id"]), workspaceId: String(row["workspace_id"]), clientId: (row["client_id"] as string | null) ?? null,
    subjectType: row["subject_type"] as Mention["subjectType"], subjectId: String(row["subject_id"]),
    mentionedUserId: String(row["mentioned_user_id"]), mentionedByUserId: String(row["mentioned_by_user_id"]),
    note: (row["note"] as string | null) ?? null, createdAt: String(row["created_at"]),
  };
}

export function notificationRow(n: CollabNotification): Record<string, unknown> {
  return { id: n.id, workspace_id: n.workspaceId, client_id: n.clientId, recipient_user_id: n.recipientUserId, type: n.type, subject_type: n.subjectType, subject_id: n.subjectId, summary: n.summary, source_activity_id: n.sourceActivityId, created_at: n.createdAt };
}
export function toNotification(row: Record<string, unknown>): CollabNotification {
  return {
    id: String(row["id"]), workspaceId: String(row["workspace_id"]), clientId: (row["client_id"] as string | null) ?? null,
    recipientUserId: String(row["recipient_user_id"]), type: row["type"] as CollabNotification["type"],
    subjectType: row["subject_type"] as CollabNotification["subjectType"], subjectId: String(row["subject_id"]),
    summary: String(row["summary"]), sourceActivityId: (row["source_activity_id"] as string | null) ?? null, createdAt: String(row["created_at"]),
  };
}

export function inboxItemRow(i: InboxItem): Record<string, unknown> {
  return { id: i.id, user_id: i.userId, workspace_id: i.workspaceId, client_id: i.clientId, notification_id: i.notificationId, status: i.status, version: i.version, created_at: i.createdAt, updated_at: i.updatedAt };
}
export function toInboxItem(row: Record<string, unknown>): InboxItem {
  return {
    id: String(row["id"]), userId: String(row["user_id"]), workspaceId: String(row["workspace_id"]),
    clientId: (row["client_id"] as string | null) ?? null, notificationId: String(row["notification_id"]),
    status: row["status"] as InboxItem["status"], version: typeof row["version"] === "number" ? (row["version"] as number) : 1,
    createdAt: String(row["created_at"]), updatedAt: String(row["updated_at"]),
  };
}

export function readReceiptRow(r: ReadReceipt): Record<string, unknown> {
  return { id: r.id, user_id: r.userId, entity_type: r.entityType, entity_id: r.entityId, read_at: r.readAt };
}
export function toReadReceipt(row: Record<string, unknown>): ReadReceipt {
  return {
    id: String(row["id"]), userId: String(row["user_id"]), entityType: row["entity_type"] as ReadReceipt["entityType"],
    entityId: String(row["entity_id"]), readAt: String(row["read_at"]),
  };
}
