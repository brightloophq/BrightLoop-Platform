/* =============================================================================
 * Collaboration use-cases (Phase D · Sprint D7).
 *
 * Subscriptions, internal notes + mentions, event→notification generation, the
 * per-user inbox lifecycle, and read receipts. Notifications are INTERNAL ONLY —
 * generated from events, never delivered externally. Each use-case: authorize
 * against the loaded tenant → pure domain service → persist → (append activity)
 * → DTO. Subscriptions/mentions/notifications are append-only or user-owned;
 * inbox status writes use optimistic concurrency.
 * ========================================================================== */

import {
  buildMention,
  buildReadReceipt,
  buildSubscription,
  generateNotifications,
  isDuplicateSubscription,
  subscriberIds,
  transitionInbox,
} from "@brightloop/domain";
import type { TransformationExecutionRepositories } from "@brightloop/domain";
import type { ActivitySubjectType, InboxStatus, NotificationType, ReadReceiptEntityType, SubscriptionTargetType, TransformationActivity, TransformationActivityType } from "@brightloop/schema";
import {
  authorize,
  requireCollaboration,
  requireExecution,
  MENTION_WRITE_CAP,
  NOTIFICATION_WRITE_CAP,
  SUBSCRIPTION_WRITE_CAP,
  type AppContext,
} from "../context.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { toInboxItemDTO, toMentionDTO, toSubscriptionDTO, type InboxItemDTO, type MentionDTO, type NotificationDTO, type SubscriptionDTO } from "./dto.js";

type Exec = TransformationExecutionRepositories;

/** Append one activity, stamping the acting user (D7 actor attribution). */
async function appendActivity(ctx: AppContext, exec: Exec, a: { workspaceId: string; clientId: string | null; type: TransformationActivityType; subjectType: ActivitySubjectType; subjectId: string; summary: string; commandId: string }): Promise<TransformationActivity> {
  return unwrap(await exec.activities.append({ id: ctx.ids("act"), at: ctx.clock(), actorId: ctx.actor.userId, ...a }));
}

/* ---- subscriptions --------------------------------------------------------- */

export async function subscribe(ctx: AppContext, rawWorkspaceId: unknown, targetType: SubscriptionTargetType, rawTargetId: unknown): Promise<SubscriptionDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const targetId = requireId(rawTargetId, "targetId");
  const exec = requireExecution(ctx);
  const collab = requireCollaboration(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, SUBSCRIPTION_WRITE_CAP, workspace.clientId);

  const existing = unwrap(await collab.subscriptions.listByUser(ctx.actor.userId));
  if (isDuplicateSubscription(existing, ctx.actor.userId, targetType, targetId)) throw new ConflictError("You are already subscribed to this target");

  const subscription = buildSubscription({ id: ctx.ids("sub"), userId: ctx.actor.userId, workspaceId, clientId: workspace.clientId, targetType, targetId, now: ctx.clock() });
  unwrap(await collab.subscriptions.create(subscription));
  await appendActivity(ctx, exec, { workspaceId, clientId: workspace.clientId, type: "user_subscribed", subjectType: "subscription", subjectId: targetId, summary: `Subscribed to ${targetType} ${targetId}.`, commandId: `${subscription.id}:subscribed` });
  return toSubscriptionDTO(subscription);
}

export async function unsubscribe(ctx: AppContext, rawSubscriptionId: unknown): Promise<void> {
  const id = requireId(rawSubscriptionId, "subscriptionId");
  const collab = requireCollaboration(ctx);
  const exec = requireExecution(ctx);
  const subscription = unwrap(await collab.subscriptions.getById(id));
  if (subscription === null) throw new NotFoundError("subscription");
  authorize(ctx.actor, SUBSCRIPTION_WRITE_CAP, subscription.clientId);
  // A user manages only their own subscriptions.
  if (subscription.userId !== ctx.actor.userId) throw new ForbiddenError();
  unwrap(await collab.subscriptions.remove(id));
  await appendActivity(ctx, exec, { workspaceId: subscription.workspaceId, clientId: subscription.clientId, type: "user_unsubscribed", subjectType: "subscription", subjectId: subscription.targetId, summary: `Unsubscribed from ${subscription.targetType} ${subscription.targetId}.`, commandId: `${subscription.id}:unsubscribed` });
}

/* ---- mentions + internal notes --------------------------------------------- */

/** Map an activity subject to the notification bucket a subscriber ping uses. */
function subjectNotificationType(subjectType: ActivitySubjectType): NotificationType {
  switch (subjectType) {
    case "review": return "review";
    case "task": return "task";
    case "dependency": return "dependency";
    case "timeline": case "milestone": return "timeline";
    case "kpi": return "kpi";
    default: return "mention";
  }
}

/**
 * Add an internal note on a subject and fan it out: mentioned users get a
 * `mention` notification; subscribers of the subject get a subject-typed ping.
 * The note itself is an append-only activity; mentions are append-only records.
 */
export async function createMention(ctx: AppContext, rawWorkspaceId: unknown, subjectType: ActivitySubjectType, rawSubjectId: unknown, rawText: unknown, mentionedUserIds: readonly string[] = []): Promise<{ note: NotificationDTO | null; mentions: MentionDTO[] }> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const subjectId = requireId(rawSubjectId, "subjectId");
  const text = requireString(rawText, "text").trim();
  if (text === "") throw new ValidationError("A note cannot be empty");
  const exec = requireExecution(ctx);
  const collab = requireCollaboration(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, MENTION_WRITE_CAP, workspace.clientId);

  // The note is a first-class activity (subject_type = note), attributed to the actor.
  const activity = await appendActivity(ctx, exec, { workspaceId, clientId: workspace.clientId, type: "note_added", subjectType, subjectId, summary: text, commandId: `${ctx.ids("notecmd")}` });

  // Resolve mentions: explicit ids provided by the caller, minus self, unique.
  const mentioned = [...new Set(mentionedUserIds)].filter((uid) => uid !== ctx.actor.userId);
  const mentions: MentionDTO[] = [];
  for (const uid of mentioned) {
    const mention = buildMention({ id: ctx.ids("mention"), workspaceId, clientId: workspace.clientId, subjectType, subjectId, mentionedUserId: uid, mentionedByUserId: ctx.actor.userId, note: text.slice(0, 400), now: ctx.clock() });
    unwrap(await collab.mentions.append(mention));
    mentions.push(toMentionDTO(mention));
  }
  if (mentioned.length > 0) {
    await appendActivity(ctx, exec, { workspaceId, clientId: workspace.clientId, type: "user_mentioned", subjectType, subjectId, summary: `Mentioned ${mentioned.length} user(s).`, commandId: `${activity.id}:mentioned` });
  }

  // Notify: mentioned users (mention) + subscribers of the subject + workspace watchers.
  const subs = unwrap(await collab.subscriptions.listByWorkspace(workspaceId));
  const subjectSubscribers = subscriberIds(subs, subjectNotificationType(subjectType) === "mention" ? "workspace" : (subjectType as SubscriptionTargetType), subjectId);
  const workspaceSubscribers = subscriberIds(subs, "workspace", workspaceId);
  const recipients = [...new Set([...mentioned, ...subjectSubscribers, ...workspaceSubscribers])];
  const generated = generateNotifications({
    type: "mention", workspaceId, clientId: workspace.clientId, subjectType, subjectId,
    summary: text, actorUserId: ctx.actor.userId, recipientUserIds: recipients, sourceActivityId: activity.id,
    now: ctx.clock(), idFor: (kind) => ctx.ids(kind),
  });
  for (const n of generated.notifications) unwrap(await collab.notifications.append(n));
  for (const item of generated.inboxItems) unwrap(await collab.inbox.create(item));

  return { note: activity ? { id: activity.id, type: "mention", subjectType, subjectId, summary: text.slice(0, 400), sourceActivityId: activity.id, createdAt: activity.at } : null, mentions };
}

/**
 * Generate notifications for an event on a subscribed target (internal). Fans the
 * event to the target's subscribers + the workspace watchers. This is how
 * review/task/timeline/kpi/health events reach the inbox.
 */
export async function notifyEvent(ctx: AppContext, rawWorkspaceId: unknown, type: NotificationType, targetType: SubscriptionTargetType, subjectType: ActivitySubjectType, rawSubjectId: unknown, summary: string, sourceActivityId: string | null = null): Promise<number> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const subjectId = requireId(rawSubjectId, "subjectId");
  const exec = requireExecution(ctx);
  const collab = requireCollaboration(ctx);
  const workspace = unwrap(await exec.workspaces.getById(workspaceId));
  if (workspace === null) throw new NotFoundError("transformation workspace");
  authorize(ctx.actor, NOTIFICATION_WRITE_CAP, workspace.clientId);

  const subs = unwrap(await collab.subscriptions.listByWorkspace(workspaceId));
  const recipients = [...new Set([...subscriberIds(subs, targetType, subjectId), ...subscriberIds(subs, "workspace", workspaceId)])];
  const generated = generateNotifications({
    type, workspaceId, clientId: workspace.clientId, subjectType, subjectId, summary,
    actorUserId: ctx.actor.userId, recipientUserIds: recipients, sourceActivityId, now: ctx.clock(),
    idFor: (kind) => ctx.ids(kind),
  });
  for (const n of generated.notifications) unwrap(await collab.notifications.append(n));
  for (const item of generated.inboxItems) unwrap(await collab.inbox.create(item));
  return generated.notifications.length;
}

/* ---- inbox lifecycle ------------------------------------------------------- */

async function inboxTransition(ctx: AppContext, rawInboxItemId: unknown, to: InboxStatus): Promise<InboxItemDTO> {
  const id = requireId(rawInboxItemId, "inboxItemId");
  const collab = requireCollaboration(ctx);
  const item = unwrap(await collab.inbox.getById(id));
  if (item === null) throw new NotFoundError("inbox item");
  authorize(ctx.actor, NOTIFICATION_WRITE_CAP, item.clientId);
  if (item.userId !== ctx.actor.userId) throw new ForbiddenError();
  if (item.status === to) {
    const notification = unwrap(await collab.notifications.getById(item.notificationId));
    return toInboxItemDTO(item, notification);
  }
  const outcome = transitionInbox(item, to, ctx.clock());
  if (!outcome.ok) throw new ConflictError(`Cannot move an inbox item from ${item.status} to ${to}`);
  const saved = await collab.inbox.save(outcome.value, item.version);
  if (!saved.ok) {
    if (saved.code === "conflict" || saved.code === "serialization_conflict") throw new ConflictError("The inbox item changed concurrently; reload and retry");
    unwrap(saved);
  }
  const notification = unwrap(await collab.notifications.getById(item.notificationId));
  return toInboxItemDTO(unwrap(saved), notification);
}

export const markRead = (ctx: AppContext, inboxItemId: unknown): Promise<InboxItemDTO> => inboxTransition(ctx, inboxItemId, "read");
export const markUnread = (ctx: AppContext, inboxItemId: unknown): Promise<InboxItemDTO> => inboxTransition(ctx, inboxItemId, "unread");
export const archiveNotification = (ctx: AppContext, inboxItemId: unknown): Promise<InboxItemDTO> => inboxTransition(ctx, inboxItemId, "archived");
export const dismissNotification = (ctx: AppContext, inboxItemId: unknown): Promise<InboxItemDTO> => inboxTransition(ctx, inboxItemId, "dismissed");

/* ---- read receipts (generic entity read tracking) -------------------------- */

export async function markEntityRead(ctx: AppContext, entityType: ReadReceiptEntityType, rawEntityId: unknown): Promise<void> {
  const entityId = requireId(rawEntityId, "entityId");
  const collab = requireCollaboration(ctx);
  authorize(ctx.actor, NOTIFICATION_WRITE_CAP, null);
  const existing = unwrap(await collab.readReceipts.listByUser(ctx.actor.userId));
  if (existing.some((r) => r.entityType === entityType && r.entityId === entityId)) return; // idempotent
  const receipt = buildReadReceipt({ id: ctx.ids("rr"), userId: ctx.actor.userId, entityType, entityId, now: ctx.clock() });
  unwrap(await collab.readReceipts.create(receipt));
}

export async function markEntityUnread(ctx: AppContext, entityType: ReadReceiptEntityType, rawEntityId: unknown): Promise<void> {
  const entityId = requireId(rawEntityId, "entityId");
  const collab = requireCollaboration(ctx);
  authorize(ctx.actor, NOTIFICATION_WRITE_CAP, null);
  unwrap(await collab.readReceipts.removeByEntity(ctx.actor.userId, entityType, entityId));
}
